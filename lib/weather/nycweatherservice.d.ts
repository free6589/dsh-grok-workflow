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
export declare const NYC_TIMEZONE: "America/New_York";
/** City center used for the upstream request (Open-Meteo snaps to its grid). */
export declare const NYC_COORDINATES: {
    readonly latitude: 40.7128;
    readonly longitude: -74.006;
};
export declare const NYC_WEATHER_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export declare const NYC_WEATHER_ATTRIBUTION = "Weather data by Open-Meteo (CC BY 4.0)";
export type TemperatureUnit = 'celsius' | 'fahrenheit';
export type WindSpeedUnit = 'kmh' | 'mph' | 'ms' | 'kn';
export type PrecipitationUnit = 'mm' | 'inch';
export interface WeatherUnits {
    temperature: TemperatureUnit;
    windSpeed: WindSpeedUnit;
    precipitation: PrecipitationUnit;
}
export interface WeatherUnitLabels {
    temperature: '°C' | '°F';
    windSpeed: 'km/h' | 'mph' | 'm/s' | 'kn';
    precipitation: 'mm' | 'in';
}
export declare const DEFAULT_WEATHER_UNITS: WeatherUnits;
/** A timestamp resolved to both an absolute instant and New York wall time. */
export interface ZonedTimestamp {
    /** Milliseconds since the Unix epoch (UTC). */
    epochMs: number;
    /** ISO-8601 with the America/New_York UTC offset, e.g. `2026-11-22T04:00:00-05:00`. */
    iso: string;
    /** New York wall-clock time without offset, e.g. `2026-11-22T04:00`. */
    local: string;
    /** New York calendar date, e.g. `2026-11-22`. */
    date: string;
    /** Always {@link NYC_TIMEZONE}; kept on the value so consumers need no global. */
    timeZone: typeof NYC_TIMEZONE;
}
export type WeatherConditionGroup = 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm' | 'unknown';
/** WMO weather code translated into something a UI can render directly. */
export interface WeatherCondition {
    /** Raw WMO code; `null` when the upstream value was missing. */
    code: number | null;
    group: WeatherConditionGroup;
    description: string;
    descriptionZh: string;
    emoji: string;
}
export interface CurrentWeather {
    time: ZonedTimestamp;
    isDay: boolean | null;
    temperature: number | null;
    apparentTemperature: number | null;
    relativeHumidity: number | null;
    precipitation: number | null;
    cloudCover: number | null;
    pressure: number | null;
    visibility: number | null;
    uvIndex: number | null;
    weatherCode: number | null;
    condition: WeatherCondition;
    windSpeed: number | null;
    windDirection: number | null;
    windGust: number | null;
}
export interface HourlyPoint {
    time: ZonedTimestamp;
    isDay: boolean | null;
    temperature: number | null;
    apparentTemperature: number | null;
    relativeHumidity: number | null;
    precipitationProbability: number | null;
    precipitation: number | null;
    cloudCover: number | null;
    uvIndex: number | null;
    weatherCode: number | null;
    condition: WeatherCondition;
    windSpeed: number | null;
    windDirection: number | null;
    windGust: number | null;
}
export interface DailyPoint {
    /** New York calendar date, `YYYY-MM-DD`. */
    date: string;
    /** Day of week in New York, 0 = Sunday. */
    weekday: number;
    /** Local midnight of {@link date}. */
    time: ZonedTimestamp;
    weatherCode: number | null;
    condition: WeatherCondition;
    temperatureMax: number | null;
    temperatureMin: number | null;
    apparentTemperatureMax: number | null;
    apparentTemperatureMin: number | null;
    precipitationProbabilityMax: number | null;
    precipitationSum: number | null;
    windSpeedMax: number | null;
    windGustMax: number | null;
    windDirectionDominant: number | null;
    uvIndexMax: number | null;
    sunrise: ZonedTimestamp | null;
    sunset: ZonedTimestamp | null;
}
export interface WeatherLocation {
    name: string;
    latitude: number;
    longitude: number;
    timeZone: typeof NYC_TIMEZONE;
}
export interface WeatherSource {
    provider: 'open-meteo';
    endpoint: string;
    attribution: string;
}
/**
 * - `live`        all three feeds parsed from a fresh upstream response
 * - `partial`     at least one feed is usable, at least one field/section is missing
 * - `stale`       cached snapshot served because the current request failed
 * - `unavailable` no data at all (empty feeds, `current: null`)
 */
export type WeatherStatus = 'live' | 'partial' | 'stale' | 'unavailable';
export type WeatherWarningCode = 'missing-current' | 'missing-hourly' | 'missing-daily' | 'partial-current' | 'partial-hourly' | 'partial-daily' | 'timezone-mismatch' | 'no-hourly-window' | 'stale-cache' | 'request-failed';
export interface WeatherWarning {
    code: WeatherWarningCode;
    message: string;
}
export interface WeatherSnapshot {
    status: WeatherStatus;
    /** True only when `status === 'stale'`. */
    stale: boolean;
    location: WeatherLocation;
    /** When this snapshot was built, in New York time. */
    fetchedAt: ZonedTimestamp;
    timeZone: typeof NYC_TIMEZONE;
    units: WeatherUnits;
    unitLabels: WeatherUnitLabels;
    current: CurrentWeather | null;
    hourly: HourlyPoint[];
    daily: DailyPoint[];
    warnings: WeatherWarning[];
    source: WeatherSource;
}
export type WeatherFailureCode = 'network' | 'timeout' | 'aborted' | 'http' | 'rate-limited' | 'parse' | 'internal';
export interface WeatherFailure {
    code: WeatherFailureCode;
    message: string;
    /** Whether retrying the same request can plausibly succeed. */
    retryable: boolean;
    /** Number of upstream attempts made, including the first one. */
    attempts: number;
    /** HTTP status when a response was received, otherwise `null`. */
    status: number | null;
    url: string;
}
export type WeatherResponse = {
    ok: true;
    snapshot: WeatherSnapshot;
    fromCache: boolean;
} | {
    ok: false;
    error: WeatherFailure;
    fallback: WeatherSnapshot;
};
/**
 * Result of one of the three specialized getters.
 * `data: null` (or an empty array) means that feed was unavailable; `snapshot`
 * always carries the same warnings/status so the UI can render one notice.
 */
export type FeedResponse<T> = {
    ok: true;
    data: T | null;
    snapshot: WeatherSnapshot;
} | {
    ok: false;
    error: WeatherFailure;
    data: T | null;
    snapshot: WeatherSnapshot;
};
/** Per-call overrides. All fields are optional. */
export interface NycWeatherRequest {
    units?: Partial<WeatherUnits>;
    /** 1..16, defaults to 7. */
    forecastDays?: number;
    /** 1..168, defaults to 48; only affects the returned window, not the request. */
    hourlyHours?: number;
    /** 1..30_000 ms, defaults to 8_000. */
    timeoutMs?: number;
    /** 0..2 retries after the first attempt, defaults to 1. */
    retries?: number;
    /** Bypass the cache for this call. */
    forceRefresh?: boolean;
    signal?: AbortSignal;
}
export interface NycWeatherServiceOptions {
    /** Default units; per-call `units` merges over these. */
    units?: Partial<WeatherUnits>;
    /** Successful-snapshot cache TTL, defaults to 10 minutes. `0` disables caching. */
    cacheTtlMs?: number;
    /** Override the endpoint (tests, proxies); defaults to {@link NYC_WEATHER_ENDPOINT}. */
    endpoint?: string;
    /** Default request timeout in ms, 1..30_000. */
    timeoutMs?: number;
    /** Default retry count, 0..2. */
    retries?: number;
    /** Injectable fetch implementation; defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    /** Injectable clock in epoch ms; defaults to `Date.now`. */
    now?: () => number;
}
export declare function convertTemperature(celsius: number, unit: TemperatureUnit): number;
export declare function convertWindSpeed(kmh: number, unit: WindSpeedUnit): number;
export declare function convertPrecipitation(mm: number, unit: PrecipitationUnit): number;
export declare function describeWeatherCode(code: number | null): WeatherCondition;
export declare class NycWeatherService {
    #private;
    constructor(options?: NycWeatherServiceOptions);
    /** The three feeds in one structured snapshot (cached when possible). */
    getWeather(request?: NycWeatherRequest): Promise<WeatherResponse>;
    getCurrent(request?: NycWeatherRequest): Promise<FeedResponse<CurrentWeather>>;
    getHourly(request?: NycWeatherRequest): Promise<FeedResponse<HourlyPoint[]>>;
    getDaily(request?: NycWeatherRequest): Promise<FeedResponse<DailyPoint[]>>;
    /** Drop the cached snapshot, e.g. after the UI's manual refresh button. */
    clearCache(): void;
    /** Units that per-call requests inherit when they pass no override. */
    get defaultUnits(): WeatherUnits;
}
export declare function createNycWeatherService(options?: NycWeatherServiceOptions): NycWeatherService;
/** Shared instance behind the module-level convenience functions. */
export declare const nycWeatherService: NycWeatherService;
export declare function getNycWeather(request?: NycWeatherRequest): Promise<WeatherResponse>;
export declare function getNycCurrent(request?: NycWeatherRequest): Promise<FeedResponse<CurrentWeather>>;
export declare function getNycHourly(request?: NycWeatherRequest): Promise<FeedResponse<HourlyPoint[]>>;
export declare function getNycDaily(request?: NycWeatherRequest): Promise<FeedResponse<DailyPoint[]>>;
export declare function clearNycWeatherCache(): void;
//# sourceMappingURL=nycweatherservice.d.ts.map