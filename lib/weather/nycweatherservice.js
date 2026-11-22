/**
 * New York City weather data access layer.
 *
 * One free, key-less source (Open-Meteo) is fetched once and normalized into a
 * single snapshot containing the current observation, the hourly forecast and
 * the daily forecast. Every timestamp is resolved against America/New_York and
 * every value is converted into the caller's configured units, so UI code never
 * touches upstream field names, offsets, or unit math.
 *
 * The module is deliberately free of Node-only imports: it uses `fetch`,
 * `AbortController` and `Intl` only, so the same file works in the browser.
 *
 * Interface documentation: see ./nycweatherservice.md next to this file.
 */
/** IANA zone every timestamp in this module is expressed in. */
export const NYC_TIMEZONE = 'America/New_York';
/** City center used for the upstream request (Open-Meteo snaps to its grid). */
export const NYC_COORDINATES = { latitude: 40.7128, longitude: -74.006 };
export const NYC_WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
export const NYC_WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo (CC BY 4.0)';
export const DEFAULT_WEATHER_UNITS = {
    temperature: 'celsius',
    windSpeed: 'kmh',
    precipitation: 'mm',
};
const TEMPERATURE_LABELS = {
    celsius: '°C',
    fahrenheit: '°F',
};
const WIND_SPEED_LABELS = {
    kmh: 'km/h',
    mph: 'mph',
    ms: 'm/s',
    kn: 'kn',
};
const PRECIPITATION_LABELS = {
    mm: 'mm',
    inch: 'in',
};
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_FORECAST_DAYS = 7;
const DEFAULT_HOURLY_HOURS = 48;
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
const RETRY_BACKOFF_MS = 300;
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
// ---------------------------------------------------------------------------
// Time zone handling
// ---------------------------------------------------------------------------
const formatterCache = new Map();
function zoneFormatter(timeZone) {
    const cached = formatterCache.get(timeZone);
    if (cached)
        return cached;
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
}
function wallClock(epochMs, timeZone) {
    const parts = zoneFormatter(timeZone).formatToParts(new Date(epochMs));
    const values = {};
    for (const part of parts) {
        if (part.type !== 'literal')
            values[part.type] = Number(part.value);
    }
    return {
        year: values.year ?? 1970,
        month: values.month ?? 1,
        day: values.day ?? 1,
        hour: values.hour ?? 0,
        minute: values.minute ?? 0,
        second: values.second ?? 0,
    };
}
/** Milliseconds to add to an instant to obtain its wall clock read as UTC. */
function offsetMsAt(epochMs, timeZone) {
    const wholeSecond = Math.floor(epochMs / 1000) * 1000;
    const clock = wallClock(wholeSecond, timeZone);
    const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
    return asUtc - wholeSecond;
}
/**
 * Convert a New York wall-clock reading, expressed as if it were UTC
 * milliseconds, into the matching absolute instant. The two passes handle DST
 * transitions: the offset is looked up again at the candidate instant.
 */
function instantFromWallClock(wallMs, timeZone) {
    let candidate = wallMs - offsetMsAt(wallMs, timeZone);
    candidate = wallMs - offsetMsAt(candidate, timeZone);
    return candidate;
}
function pad(value, width = 2) {
    return String(value).padStart(width, '0');
}
function formatOffset(offsetMs) {
    const sign = offsetMs < 0 ? '-' : '+';
    const totalMinutes = Math.round(Math.abs(offsetMs) / MINUTE_MS);
    return `${sign}${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
}
function zonedTimestamp(epochMs, timeZone) {
    const offset = offsetMsAt(epochMs, timeZone);
    const clock = wallClock(epochMs, timeZone);
    const local = `${clock.year}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}`;
    return {
        epochMs,
        iso: `${local}:${pad(clock.second)}${formatOffset(offset)}`,
        local,
        date: `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`,
        timeZone: NYC_TIMEZONE,
    };
}
const API_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
/**
 * Parse an Open-Meteo local timestamp (`2026-11-22T04:00` or `2026-11-22`) that
 * carries no offset. Returns `null` when the text is not a valid wall clock.
 */
function parseApiTime(value, timeZone) {
    if (typeof value !== 'string')
        return null;
    const match = API_TIME_RE.exec(value.trim());
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] === undefined ? 0 : Number(match[4]);
    const minute = match[5] === undefined ? 0 : Number(match[5]);
    const second = match[6] === undefined ? 0 : Number(match[6]);
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59)
        return null;
    const wallMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const check = new Date(wallMs);
    // Reject impossible dates such as 2026-02-31 (Date.UTC rolls them over).
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day)
        return null;
    return zonedTimestamp(instantFromWallClock(wallMs, timeZone), timeZone);
}
function dateKey(epochMs, timeZone) {
    const clock = wallClock(epochMs, timeZone);
    return `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
}
// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------
function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
export function convertTemperature(celsius, unit) {
    return round(unit === 'fahrenheit' ? (celsius * 9) / 5 + 32 : celsius, 1);
}
export function convertWindSpeed(kmh, unit) {
    const converted = unit === 'mph' ? kmh / 1.609344 : unit === 'ms' ? kmh / 3.6 : unit === 'kn' ? kmh / 1.852 : kmh;
    return round(converted, 1);
}
export function convertPrecipitation(mm, unit) {
    return round(unit === 'inch' ? mm / 25.4 : mm, 2);
}
function convertNumber(value, convert) {
    return value === null ? null : convert(value);
}
const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'];
const WIND_SPEED_UNITS = ['kmh', 'mph', 'ms', 'kn'];
const PRECIPITATION_UNITS = ['mm', 'inch'];
function resolveUnits(base, override) {
    const merged = { ...base, ...override };
    if (!TEMPERATURE_UNITS.includes(merged.temperature)) {
        throw new RangeError(`Unsupported temperature unit: ${String(merged.temperature)}`);
    }
    if (!WIND_SPEED_UNITS.includes(merged.windSpeed)) {
        throw new RangeError(`Unsupported wind speed unit: ${String(merged.windSpeed)}`);
    }
    if (!PRECIPITATION_UNITS.includes(merged.precipitation)) {
        throw new RangeError(`Unsupported precipitation unit: ${String(merged.precipitation)}`);
    }
    return merged;
}
function unitLabelsFor(units) {
    return {
        temperature: TEMPERATURE_LABELS[units.temperature],
        windSpeed: WIND_SPEED_LABELS[units.windSpeed],
        precipitation: PRECIPITATION_LABELS[units.precipitation],
    };
}
const WMO_CONDITIONS = {
    0: { group: 'clear', description: 'Clear sky', descriptionZh: '晴', emoji: '☀️' },
    1: { group: 'clear', description: 'Mainly clear', descriptionZh: '大部晴朗', emoji: '🌤️' },
    2: { group: 'cloudy', description: 'Partly cloudy', descriptionZh: '局部多云', emoji: '⛅' },
    3: { group: 'cloudy', description: 'Overcast', descriptionZh: '阴', emoji: '☁️' },
    45: { group: 'fog', description: 'Fog', descriptionZh: '雾', emoji: '🌫️' },
    48: { group: 'fog', description: 'Depositing rime fog', descriptionZh: '雾凇', emoji: '🌫️' },
    51: { group: 'drizzle', description: 'Light drizzle', descriptionZh: '小毛毛雨', emoji: '🌦️' },
    53: { group: 'drizzle', description: 'Moderate drizzle', descriptionZh: '毛毛雨', emoji: '🌦️' },
    55: { group: 'drizzle', description: 'Dense drizzle', descriptionZh: '强毛毛雨', emoji: '🌧️' },
    56: { group: 'drizzle', description: 'Light freezing drizzle', descriptionZh: '轻冻毛毛雨', emoji: '🌧️' },
    57: { group: 'drizzle', description: 'Dense freezing drizzle', descriptionZh: '强冻毛毛雨', emoji: '🌧️' },
    61: { group: 'rain', description: 'Slight rain', descriptionZh: '小雨', emoji: '🌦️' },
    63: { group: 'rain', description: 'Moderate rain', descriptionZh: '中雨', emoji: '🌧️' },
    65: { group: 'rain', description: 'Heavy rain', descriptionZh: '大雨', emoji: '🌧️' },
    66: { group: 'rain', description: 'Light freezing rain', descriptionZh: '轻冻雨', emoji: '🌧️' },
    67: { group: 'rain', description: 'Heavy freezing rain', descriptionZh: '强冻雨', emoji: '🌧️' },
    71: { group: 'snow', description: 'Slight snow', descriptionZh: '小雪', emoji: '❄️' },
    73: { group: 'snow', description: 'Moderate snow', descriptionZh: '中雪', emoji: '❄️' },
    75: { group: 'snow', description: 'Heavy snow', descriptionZh: '大雪', emoji: '❄️' },
    77: { group: 'snow', description: 'Snow grains', descriptionZh: '雪粒', emoji: '🌨️' },
    80: { group: 'rain', description: 'Slight rain showers', descriptionZh: '小阵雨', emoji: '🌦️' },
    81: { group: 'rain', description: 'Moderate rain showers', descriptionZh: '中阵雨', emoji: '🌧️' },
    82: { group: 'rain', description: 'Violent rain showers', descriptionZh: '强阵雨', emoji: '🌧️' },
    85: { group: 'snow', description: 'Slight snow showers', descriptionZh: '小阵雪', emoji: '🌨️' },
    86: { group: 'snow', description: 'Heavy snow showers', descriptionZh: '大阵雪', emoji: '🌨️' },
    95: { group: 'thunderstorm', description: 'Thunderstorm', descriptionZh: '雷暴', emoji: '⛈️' },
    96: {
        group: 'thunderstorm',
        description: 'Thunderstorm with slight hail',
        descriptionZh: '雷暴伴小冰雹',
        emoji: '⛈️',
    },
    99: {
        group: 'thunderstorm',
        description: 'Thunderstorm with heavy hail',
        descriptionZh: '雷暴伴大冰雹',
        emoji: '⛈️',
    },
};
const UNKNOWN_CONDITION = {
    code: null,
    group: 'unknown',
    description: 'Unknown conditions',
    descriptionZh: '未知天气',
    emoji: '❓',
};
export function describeWeatherCode(code) {
    if (code === null)
        return UNKNOWN_CONDITION;
    const definition = WMO_CONDITIONS[code];
    if (!definition)
        return { ...UNKNOWN_CONDITION, code };
    return { code, ...definition };
}
// ---------------------------------------------------------------------------
// Upstream payload parsing
// ---------------------------------------------------------------------------
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function numberOrNull(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function numbersFrom(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return Array.isArray(value) ? value : null;
}
function stringsFrom(record, key) {
    if (!record)
        return null;
    const value = record[key];
    return Array.isArray(value) ? value : null;
}
function numberAt(values, index) {
    if (!values)
        return null;
    return numberOrNull(values[index]);
}
function stringAt(values, index) {
    if (!values)
        return null;
    const value = values[index];
    return typeof value === 'string' ? value : null;
}
class PayloadError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PayloadError';
    }
}
function parseCurrent(raw, context, warnings) {
    if (!raw) {
        warnings.push({ code: 'missing-current', message: 'Upstream response has no current observation.' });
        return null;
    }
    const time = parseApiTime(raw.time, NYC_TIMEZONE);
    if (!time) {
        warnings.push({ code: 'missing-current', message: 'Current observation has no usable timestamp.' });
        return null;
    }
    const { units } = context;
    const temperature = numberOrNull(raw.temperature_2m);
    const requiredCurrentFields = [
        ['temperature_2m', raw.temperature_2m],
        ['relative_humidity_2m', raw.relative_humidity_2m],
        ['apparent_temperature', raw.apparent_temperature],
        ['wind_speed_10m', raw.wind_speed_10m],
        ['weather_code', raw.weather_code],
    ];
    const missing = [...requiredCurrentFields]
        .filter(([, value]) => numberOrNull(value) === null)
        .map(([name]) => name);
    if (missing.length > 0) {
        warnings.push({
            code: 'partial-current',
            message: `Current observation is missing ${missing.join(', ')}.`,
        });
    }
    const weatherCode = numberOrNull(raw.weather_code);
    const isDayRaw = numberOrNull(raw.is_day);
    const convertT = (value) => convertNumber(value, (input) => convertTemperature(input, units.temperature));
    const convertW = (value) => convertNumber(value, (input) => convertWindSpeed(input, units.windSpeed));
    return {
        time,
        isDay: isDayRaw === null ? null : isDayRaw === 1,
        temperature: convertT(temperature),
        apparentTemperature: convertT(numberOrNull(raw.apparent_temperature)),
        relativeHumidity: numberOrNull(raw.relative_humidity_2m),
        precipitation: convertNumber(numberOrNull(raw.precipitation), (input) => convertPrecipitation(input, units.precipitation)),
        cloudCover: numberOrNull(raw.cloud_cover),
        pressure: numberOrNull(raw.pressure_msl),
        visibility: numberOrNull(raw.visibility),
        uvIndex: numberOrNull(raw.uv_index),
        weatherCode,
        condition: describeWeatherCode(weatherCode),
        windSpeed: convertW(numberOrNull(raw.wind_speed_10m)),
        windDirection: numberOrNull(raw.wind_direction_10m),
        windGust: convertW(numberOrNull(raw.wind_gusts_10m)),
    };
}
function parseHourly(raw, context, warnings) {
    if (!raw) {
        warnings.push({ code: 'missing-hourly', message: 'Upstream response has no hourly forecast.' });
        return [];
    }
    const times = stringsFrom(raw, 'time');
    if (!times || times.length === 0) {
        warnings.push({ code: 'missing-hourly', message: 'Hourly forecast has no timestamps.' });
        return [];
    }
    const temperatures = numbersFrom(raw, 'temperature_2m');
    const missingFields = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'weather_code', 'wind_speed_10m']
        .filter((key) => numbersFrom(raw, key) === null);
    if (missingFields.length > 0) {
        warnings.push({
            code: 'partial-hourly',
            message: `Hourly forecast is missing ${missingFields.join(', ')}.`,
        });
    }
    if (temperatures && temperatures.length !== times.length) {
        warnings.push({
            code: 'partial-hourly',
            message: `Hourly series length mismatch (time=${times.length}, temperature_2m=${temperatures.length}).`,
        });
    }
    const { units } = context;
    const points = [];
    for (let index = 0; index < times.length; index += 1) {
        const time = parseApiTime(times[index], NYC_TIMEZONE);
        if (!time) {
            warnings.push({
                code: 'partial-hourly',
                message: `Hourly entry ${index} has an unusable timestamp; it was skipped.`,
            });
            continue;
        }
        const weatherCode = numberAt(numbersFrom(raw, 'weather_code'), index);
        const wind = numberAt(numbersFrom(raw, 'wind_speed_10m'), index);
        const gust = numberAt(numbersFrom(raw, 'wind_gusts_10m'), index);
        const precipitation = numberAt(numbersFrom(raw, 'precipitation'), index);
        const isDayRaw = numberAt(numbersFrom(raw, 'is_day'), index);
        points.push({
            time,
            isDay: isDayRaw === null ? null : isDayRaw === 1,
            temperature: convertNumber(numberAt(temperatures, index), (input) => convertTemperature(input, units.temperature)),
            apparentTemperature: convertNumber(numberAt(numbersFrom(raw, 'apparent_temperature'), index), (input) => convertTemperature(input, units.temperature)),
            relativeHumidity: numberAt(numbersFrom(raw, 'relative_humidity_2m'), index),
            precipitationProbability: numberAt(numbersFrom(raw, 'precipitation_probability'), index),
            precipitation: convertNumber(precipitation, (input) => convertPrecipitation(input, units.precipitation)),
            cloudCover: numberAt(numbersFrom(raw, 'cloud_cover'), index),
            uvIndex: numberAt(numbersFrom(raw, 'uv_index'), index),
            weatherCode,
            condition: describeWeatherCode(weatherCode),
            windSpeed: convertNumber(wind, (input) => convertWindSpeed(input, units.windSpeed)),
            windDirection: numberAt(numbersFrom(raw, 'wind_direction_10m'), index),
            windGust: convertNumber(gust, (input) => convertWindSpeed(input, units.windSpeed)),
        });
    }
    return points;
}
function parseDaily(raw, context, warnings) {
    if (!raw) {
        warnings.push({ code: 'missing-daily', message: 'Upstream response has no daily forecast.' });
        return [];
    }
    const times = stringsFrom(raw, 'time');
    if (!times || times.length === 0) {
        warnings.push({ code: 'missing-daily', message: 'Daily forecast has no dates.' });
        return [];
    }
    const missingFields = ['weather_code', 'temperature_2m_max', 'temperature_2m_min', 'sunrise', 'sunset']
        .filter((key) => raw[key] === undefined || raw[key] === null);
    if (missingFields.length > 0) {
        warnings.push({
            code: 'partial-daily',
            message: `Daily forecast is missing ${missingFields.join(', ')}.`,
        });
    }
    const { units } = context;
    const days = [];
    for (let index = 0; index < times.length; index += 1) {
        const rawDate = typeof times[index] === 'string' ? times[index] : null;
        const time = parseApiTime(rawDate, NYC_TIMEZONE);
        if (!time || rawDate === null || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
            warnings.push({
                code: 'partial-daily',
                message: `Daily entry ${index} has an unusable date; it was skipped.`,
            });
            continue;
        }
        const weatherCode = numberAt(numbersFrom(raw, 'weather_code'), index);
        const temperatureMax = numberAt(numbersFrom(raw, 'temperature_2m_max'), index);
        const temperatureMin = numberAt(numbersFrom(raw, 'temperature_2m_min'), index);
        const precipitationSum = numberAt(numbersFrom(raw, 'precipitation_sum'), index);
        const windMax = numberAt(numbersFrom(raw, 'wind_speed_10m_max'), index);
        const gustMax = numberAt(numbersFrom(raw, 'wind_gusts_10m_max'), index);
        const [yearText, monthText, dayText] = rawDate.split('-');
        const weekday = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText))).getUTCDay();
        const sunrise = parseApiTime(stringAt(stringsFrom(raw, 'sunrise'), index), NYC_TIMEZONE);
        const sunset = parseApiTime(stringAt(stringsFrom(raw, 'sunset'), index), NYC_TIMEZONE);
        days.push({
            date: rawDate,
            weekday,
            time,
            weatherCode,
            condition: describeWeatherCode(weatherCode),
            temperatureMax: convertNumber(temperatureMax, (input) => convertTemperature(input, units.temperature)),
            temperatureMin: convertNumber(temperatureMin, (input) => convertTemperature(input, units.temperature)),
            apparentTemperatureMax: convertNumber(numberAt(numbersFrom(raw, 'apparent_temperature_max'), index), (input) => convertTemperature(input, units.temperature)),
            apparentTemperatureMin: convertNumber(numberAt(numbersFrom(raw, 'apparent_temperature_min'), index), (input) => convertTemperature(input, units.temperature)),
            precipitationProbabilityMax: numberAt(numbersFrom(raw, 'precipitation_probability_max'), index),
            precipitationSum: convertNumber(precipitationSum, (input) => convertPrecipitation(input, units.precipitation)),
            windSpeedMax: convertNumber(windMax, (input) => convertWindSpeed(input, units.windSpeed)),
            windGustMax: convertNumber(gustMax, (input) => convertWindSpeed(input, units.windSpeed)),
            windDirectionDominant: numberAt(numbersFrom(raw, 'wind_direction_10m_dominant'), index),
            uvIndexMax: numberAt(numbersFrom(raw, 'uv_index_max'), index),
            sunrise,
            sunset,
        });
    }
    return days;
}
function parsePayload(payload, context) {
    const raw = asRecord(payload);
    if (!raw)
        throw new PayloadError('Weather response is not a JSON object.');
    const warnings = [];
    const upstreamZone = typeof raw.timezone === 'string' ? raw.timezone : null;
    if (upstreamZone !== null && upstreamZone !== NYC_TIMEZONE) {
        warnings.push({
            code: 'timezone-mismatch',
            message: `Upstream reported timezone ${upstreamZone}; timestamps are interpreted as ${NYC_TIMEZONE}.`,
        });
    }
    const current = parseCurrent(asRecord(raw.current), context, warnings);
    let hourly = parseHourly(asRecord(raw.hourly), context, warnings);
    let daily = parseDaily(asRecord(raw.daily), context, warnings);
    if (current === null && hourly.length === 0 && daily.length === 0) {
        throw new PayloadError('Weather response contains no usable current, hourly, or daily data.');
    }
    // The UI wants "from now on", not the hours that already passed today.
    const anchorMs = current?.time.epochMs ?? context.nowMs;
    const hourCutoff = Math.floor(anchorMs / HOUR_MS) * HOUR_MS;
    hourly = hourly.filter((point) => point.time.epochMs >= hourCutoff).slice(0, context.hourlyHours);
    if (hourly.length === 0) {
        warnings.push({ code: 'no-hourly-window', message: 'Hourly forecast has no entries in the requested window.' });
    }
    const today = current?.time.date ?? dateKey(context.nowMs, NYC_TIMEZONE);
    daily = daily.filter((point) => point.date >= today).slice(0, context.forecastDays);
    if (daily.length === 0) {
        warnings.push({ code: 'missing-daily', message: 'Daily forecast has no entries from today onward.' });
    }
    const snapshot = {
        status: warnings.length === 0 ? 'live' : 'partial',
        stale: false,
        location: {
            name: 'New York City',
            latitude: NYC_COORDINATES.latitude,
            longitude: NYC_COORDINATES.longitude,
            timeZone: NYC_TIMEZONE,
        },
        fetchedAt: zonedTimestamp(context.nowMs, NYC_TIMEZONE),
        timeZone: NYC_TIMEZONE,
        units: context.units,
        unitLabels: unitLabelsFor(context.units),
        current,
        hourly,
        daily,
        warnings,
        source: {
            provider: 'open-meteo',
            endpoint: context.endpoint,
            attribution: NYC_WEATHER_ATTRIBUTION,
        },
    };
    return { snapshot };
}
// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
class WeatherRequestError extends Error {
    failure;
    constructor(failure) {
        super(failure.message);
        this.name = 'WeatherRequestError';
        this.failure = failure;
    }
}
function makeFailure(code, message, options) {
    return {
        code,
        message,
        retryable: options.retryable,
        attempts: options.attempts,
        status: options.status ?? null,
        url: options.url,
    };
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function requestJson(url, options) {
    const attemptsAllowed = options.retries + 1;
    for (let attempt = 1; attempt <= attemptsAllowed; attempt += 1) {
        if (options.signal?.aborted) {
            throw new WeatherRequestError(makeFailure('aborted', 'Weather request was aborted by the caller.', {
                retryable: false,
                attempts: attempt - 1,
                url,
            }));
        }
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, options.timeoutMs);
        const onAbort = () => controller.abort();
        options.signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const response = await options.fetchImpl(url, {
                method: 'GET',
                headers: { accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                const final = attempt === attemptsAllowed;
                const retryable = response.status === 429 || response.status >= 500 || response.status === 408;
                // Drain the error body so the connection can be reused on a retry.
                await response.text().catch(() => '');
                if (final || !retryable) {
                    throw new WeatherRequestError(makeFailure(response.status === 429 ? 'rate-limited' : 'http', `Weather request failed with HTTP ${response.status}.`, { retryable, attempts: attempt, status: response.status, url }));
                }
            }
            else {
                const body = await response.text();
                try {
                    return JSON.parse(body);
                }
                catch {
                    throw new WeatherRequestError(makeFailure('parse', 'Weather response was not valid JSON.', {
                        retryable: false,
                        attempts: attempt,
                        status: response.status,
                        url,
                    }));
                }
            }
        }
        catch (error) {
            if (error instanceof WeatherRequestError) {
                if (!error.failure.retryable || attempt === attemptsAllowed)
                    throw error;
            }
            else if (timedOut) {
                const final = attempt === attemptsAllowed;
                const next = makeFailure('timeout', `Weather request timed out after ${options.timeoutMs} ms.`, { retryable: true, attempts: attempt, url });
                if (final)
                    throw new WeatherRequestError(next);
            }
            else if (options.signal?.aborted) {
                throw new WeatherRequestError(makeFailure('aborted', 'Weather request was aborted by the caller.', {
                    retryable: false,
                    attempts: attempt,
                    url,
                }));
            }
            else {
                const final = attempt === attemptsAllowed;
                const next = makeFailure('network', `Weather request failed: ${error instanceof Error ? error.message : 'unknown network error'}.`, { retryable: true, attempts: attempt, url });
                if (final)
                    throw new WeatherRequestError(next);
            }
        }
        finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
        }
        await delay(RETRY_BACKOFF_MS * attempt);
    }
    // The loop always returns or throws; this keeps TypeScript's control flow happy.
    throw new WeatherRequestError(makeFailure('internal', 'Weather request ended without a result.', {
        retryable: false,
        attempts: attemptsAllowed,
        url,
    }));
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function clampInteger(value, fallback, min, max) {
    if (value === undefined || !Number.isFinite(value))
        return fallback;
    return clamp(Math.round(value), min, max);
}
// ---------------------------------------------------------------------------
// Snapshot helpers
// ---------------------------------------------------------------------------
function unavailableSnapshot(units, nowMs, endpoint, errorCode) {
    return {
        status: 'unavailable',
        stale: false,
        location: {
            name: 'New York City',
            latitude: NYC_COORDINATES.latitude,
            longitude: NYC_COORDINATES.longitude,
            timeZone: NYC_TIMEZONE,
        },
        fetchedAt: zonedTimestamp(nowMs, NYC_TIMEZONE),
        timeZone: NYC_TIMEZONE,
        units,
        unitLabels: unitLabelsFor(units),
        current: null,
        hourly: [],
        daily: [],
        warnings: [
            {
                code: 'request-failed',
                message: `No weather data is available (${errorCode}); render an empty or error state and offer a retry.`,
            },
        ],
        source: {
            provider: 'open-meteo',
            endpoint,
            attribution: NYC_WEATHER_ATTRIBUTION,
        },
    };
}
function staleSnapshot(cached, units, error) {
    return {
        ...cached,
        status: 'stale',
        stale: true,
        units,
        unitLabels: unitLabelsFor(units),
        warnings: [
            ...cached.warnings,
            {
                code: 'stale-cache',
                message: `Serving cached weather from ${cached.fetchedAt.iso} because the latest request failed (${error.code}).`,
            },
        ],
    };
}
function cacheKey(units, forecastDays, hourlyHours) {
    return JSON.stringify([units.temperature, units.windSpeed, units.precipitation, forecastDays, hourlyHours]);
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class NycWeatherService {
    #defaultUnits;
    #cacheTtlMs;
    #endpoint;
    #timeoutMs;
    #retries;
    #fetchImpl;
    #now;
    #cache = null;
    #inflight = null;
    constructor(options = {}) {
        this.#defaultUnits = resolveUnits(DEFAULT_WEATHER_UNITS, options.units);
        this.#cacheTtlMs = options.cacheTtlMs === undefined ? DEFAULT_CACHE_TTL_MS : Math.max(0, options.cacheTtlMs);
        this.#endpoint = options.endpoint ?? NYC_WEATHER_ENDPOINT;
        this.#timeoutMs = clampInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1, 30_000);
        this.#retries = clampInteger(options.retries, DEFAULT_RETRIES, 0, 2);
        this.#fetchImpl = options.fetchImpl ?? fetch;
        this.#now = options.now ?? Date.now;
    }
    /** The three feeds in one structured snapshot (cached when possible). */
    async getWeather(request = {}) {
        const units = resolveUnits(this.#defaultUnits, request.units);
        const forecastDays = clampInteger(request.forecastDays, DEFAULT_FORECAST_DAYS, 1, 16);
        const hourlyHours = clampInteger(request.hourlyHours, DEFAULT_HOURLY_HOURS, 1, 168);
        const timeoutMs = clampInteger(request.timeoutMs, this.#timeoutMs, 1, 30_000);
        const retries = clampInteger(request.retries, this.#retries, 0, 2);
        const key = cacheKey(units, forecastDays, hourlyHours);
        const nowMs = this.#now();
        if (!request.forceRefresh && this.#cache && this.#cache.key === key && this.#cache.expiresAt > nowMs) {
            return { ok: true, snapshot: this.#cache.snapshot, fromCache: true };
        }
        if (this.#inflight && this.#inflight.key === key && !request.forceRefresh) {
            return this.#inflight.promise;
        }
        const promise = this.#load({ key, units, forecastDays, hourlyHours, timeoutMs, retries, signal: request.signal, nowMs });
        this.#inflight = { key, promise };
        try {
            return await promise;
        }
        finally {
            if (this.#inflight?.promise === promise)
                this.#inflight = null;
        }
    }
    async #load(input) {
        const url = this.#buildUrl(input.forecastDays);
        try {
            const payload = await requestJson(url, {
                fetchImpl: this.#fetchImpl,
                timeoutMs: input.timeoutMs,
                retries: input.retries,
                signal: input.signal,
            });
            const parsed = parsePayload(payload, {
                units: input.units,
                forecastDays: input.forecastDays,
                hourlyHours: input.hourlyHours,
                nowMs: input.nowMs,
                endpoint: this.#endpoint,
            });
            if (this.#cacheTtlMs > 0 && parsed.snapshot.status === 'live') {
                this.#cache = {
                    key: input.key,
                    snapshot: parsed.snapshot,
                    expiresAt: input.nowMs + this.#cacheTtlMs,
                };
            }
            return { ok: true, snapshot: parsed.snapshot, fromCache: false };
        }
        catch (error) {
            const errorInfo = error instanceof WeatherRequestError
                ? error.failure
                : error instanceof PayloadError
                    ? makeFailure('parse', error.message, { retryable: false, attempts: 0, url })
                    : makeFailure('internal', error instanceof Error ? error.message : 'Unknown weather error.', {
                        retryable: false,
                        attempts: 0,
                        url,
                    });
            const fallback = this.#cache
                ? staleSnapshot(this.#cache.snapshot, input.units, errorInfo)
                : unavailableSnapshot(input.units, input.nowMs, this.#endpoint, errorInfo.code);
            return { ok: false, error: errorInfo, fallback };
        }
    }
    #buildUrl(forecastDays) {
        const url = new URL(this.#endpoint);
        const params = url.searchParams;
        params.set('latitude', String(NYC_COORDINATES.latitude));
        params.set('longitude', String(NYC_COORDINATES.longitude));
        params.set('current', [
            'temperature_2m',
            'relative_humidity_2m',
            'apparent_temperature',
            'is_day',
            'precipitation',
            'weather_code',
            'cloud_cover',
            'pressure_msl',
            'visibility',
            'wind_speed_10m',
            'wind_direction_10m',
            'wind_gusts_10m',
            'uv_index',
        ].join(','));
        params.set('hourly', [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'precipitation_probability',
            'precipitation',
            'weather_code',
            'cloud_cover',
            'wind_speed_10m',
            'wind_direction_10m',
            'wind_gusts_10m',
            'is_day',
            'uv_index',
        ].join(','));
        params.set('daily', [
            'weather_code',
            'temperature_2m_max',
            'temperature_2m_min',
            'apparent_temperature_max',
            'apparent_temperature_min',
            'sunrise',
            'sunset',
            'uv_index_max',
            'precipitation_sum',
            'precipitation_probability_max',
            'wind_speed_10m_max',
            'wind_gusts_10m_max',
            'wind_direction_10m_dominant',
        ].join(','));
        // The upstream units stay fixed (metric) so all conversion happens in one
        // place and a unit change never alters which fields the API returns.
        params.set('timezone', NYC_TIMEZONE);
        params.set('forecast_days', String(forecastDays));
        params.set('temperature_unit', 'celsius');
        params.set('wind_speed_unit', 'kmh');
        params.set('precipitation_unit', 'mm');
        return url.toString();
    }
    async getCurrent(request = {}) {
        const result = await this.getWeather(request);
        const snapshot = result.ok ? result.snapshot : result.fallback;
        return result.ok
            ? { ok: true, data: snapshot.current, snapshot }
            : { ok: false, error: result.error, data: snapshot.current, snapshot };
    }
    async getHourly(request = {}) {
        const result = await this.getWeather(request);
        const snapshot = result.ok ? result.snapshot : result.fallback;
        return result.ok
            ? { ok: true, data: snapshot.hourly, snapshot }
            : { ok: false, error: result.error, data: snapshot.hourly, snapshot };
    }
    async getDaily(request = {}) {
        const result = await this.getWeather(request);
        const snapshot = result.ok ? result.snapshot : result.fallback;
        return result.ok
            ? { ok: true, data: snapshot.daily, snapshot }
            : { ok: false, error: result.error, data: snapshot.daily, snapshot };
    }
    /** Drop the cached snapshot, e.g. after the UI's manual refresh button. */
    clearCache() {
        this.#cache = null;
    }
    /** Units that per-call requests inherit when they pass no override. */
    get defaultUnits() {
        return { ...this.#defaultUnits };
    }
}
export function createNycWeatherService(options = {}) {
    return new NycWeatherService(options);
}
/** Shared instance behind the module-level convenience functions. */
export const nycWeatherService = new NycWeatherService();
export function getNycWeather(request = {}) {
    return nycWeatherService.getWeather(request);
}
export function getNycCurrent(request = {}) {
    return nycWeatherService.getCurrent(request);
}
export function getNycHourly(request = {}) {
    return nycWeatherService.getHourly(request);
}
export function getNycDaily(request = {}) {
    return nycWeatherService.getDaily(request);
}
export function clearNycWeatherCache() {
    nycWeatherService.clearCache();
}
//# sourceMappingURL=nycweatherservice.js.map