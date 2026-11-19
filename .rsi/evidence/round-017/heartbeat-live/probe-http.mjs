// HTTP driver for the isolated instance: exchanges the launch token for the browser
// session cookie once, then issues one POST. Neither the token nor the cookie is ever
// printed; only the request line (redacted) and the response body are.
import { readFileSync, writeFileSync } from 'node:fs'

const EV = '/home/fish/projects_mine/dsh-grok-workflow/.rsi/evidence/round-017/heartbeat-live'
const BASE = `http://127.0.0.1:${process.env.PORT ?? '3271'}`
const JAR = `${EV}/instance/.cookies.json`

const readJar = () => {
  try {
    return JSON.parse(readFileSync(JAR, 'utf8'))
  } catch {
    return {}
  }
}

async function login() {
  const token = readFileSync(`${EV}/instance/.token`, 'utf8').trim()
  const response = await fetch(`${BASE}/?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  const raw = response.headers.getSetCookie?.() ?? []
  const jar = {}
  for (const cookie of raw) {
    const pair = cookie.split(';')[0]
    const at = pair.indexOf('=')
    if (at > 0) jar[pair.slice(0, at).trim()] = pair.slice(at + 1).trim()
  }
  writeFileSync(JAR, `${JSON.stringify(jar)}\n`)
  return { status: response.status, cookies: Object.keys(jar).length }
}

async function post(path, body) {
  let jar = readJar()
  if (Object.keys(jar).length === 0) {
    const jumped = await login()
    console.log(`# login exchange: HTTP ${jumped.status}, cookies=${jumped.cookies}`)
    jar = readJar()
  }
  const cookie = Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ')
  const started = Date.now()
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie, origin: BASE },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  console.log(`POST ${path} ${JSON.stringify(body)}`)
  console.log(`-> HTTP ${response.status} in ${Date.now() - started} ms`)
  console.log(text)
}

const [command, path, json] = process.argv.slice(2)
if (command === 'login') {
  console.log(JSON.stringify(await login()))
} else if (command === 'post') {
  await post(path, json === undefined ? {} : JSON.parse(json))
} else {
  console.error('usage: probe-http.mjs login | post <path> <json>')
  process.exitCode = 2
}
