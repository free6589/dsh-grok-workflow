import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { redactDeep, redactError, redactSecrets, REDACTION_RULES } from '../src/redact.js'
import { WORKFLOW_SCRIPT } from '../src/script.js'

const fake = (...parts: string[]) => parts.join('')

describe('credential redaction', () => {
  it('redacts known API key and token shapes', () => {
    const input = [
      `key ${fake('sk-proj-', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      `github ${fake('ghp_', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      `slack ${fake('xoxb-', '123456789012-', 'abcdefghijkl')}`,
      `aws ${fake('AKIA', 'ABCDEFGH', 'IJKLMNOP')}`,
      `google ${fake('AIza', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
    `github fine-grained ${fake('github_pat_', '11ABCDEFG0123456789_', 'abcdefghijklmnopqrstuvwxyz')}`,
    `aws session ${fake('ASIA', 'ABCDEFGH', 'IJKLMNOP')}`,
    `google oauth ${fake('ya29.', 'a0AfH6SMBexampleTokenValue', '1234567890')}`,
    'Cookie: session=abc123; theme=dark',
    'Set-Cookie: sid=abc123; HttpOnly',
    '{"password":"abc\\"CANARY-7f3a9c","note":"keep"}',
    '{"token":1234567890,"note":"keep"}',
    '{"session":"opaque-session-id","credentials":"opaque"}',
      `Authorization: Bearer ${fake('abcdefghijklmnopqrstuvwxyz', '.1234567890')}`,
      'https://example.test/callback?token=super-secret-token&ok=1',
      'api_key = "my-production-secret"',
      'https://user:password@example.test/path',
      `jwt ${fake('eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.signature12345')}`,
    ].join('\n')
    const output = redactSecrets(input)
    expect(output).not.toContain('sk-proj-')
    expect(output).not.toContain('ghp_')
    expect(output).not.toContain('xoxb-')
    expect(output).not.toContain('AKIA')
    expect(output).not.toContain('AIza')
    expect(output).not.toContain('super-secret-token')
    expect(output).not.toContain('my-production-secret')
    expect(output).not.toContain('password@example.test')
    expect(output).not.toContain('signature12345')
    expect(output).toContain('[REDACTED]')
  })

  it('redacts private key blocks and preserves non-secret prose', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----'
    const output = redactSecrets(`Before\n${key}\nAfter: document the workflow and test it.`)
    expect(output).toContain('[REDACTED PRIVATE KEY]')
    expect(output).toContain('After: document the workflow and test it.')
    expect(output).not.toContain('MIIEvQIBADANBg')
  })

  it('redacts compound environment-variable assignments', () => {
    const output = redactSecrets(
      'OPENAI_API_KEY=custom-secret GITHUB_TOKEN=custom-secret DATABASE_PASSWORD=custom-secret',
    )
    expect(output).not.toContain('custom-secret')
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(3)
  })

  it('redacts access/private/secret keys and Stripe underscore tokens', () => {
    const awsSecret = fake('not-a-real-', 'secret')
    const appKey = fake('not-a-real-', 'private-key')
    const stripe = fake('sk_live_', 'NOT_A_REAL_SECRET_VALUE')
    const output = redactSecrets([
      `AWS_SECRET_ACCESS_KEY=${awsSecret}`,
      `APP_PRIVATE_KEY=${appKey}`,
      `STRIPE_SECRET_KEY=${stripe}`,
      `AWS_ACCESS_KEY_ID=${fake('AKIA', 'ABCDEFGH', 'IJKLMNOP')}`,
    ].join('\n'))
    expect(output).not.toContain(awsSecret)
    expect(output).not.toContain(appKey)
    expect(output).not.toContain(stripe)
    expect(output).not.toContain('AKIA')
    expect(output.match(/\[REDACTED/g)?.length).toBeGreaterThanOrEqual(4)
  })

  it('redacts userinfo in non-HTTP URIs without touching ordinary text', () => {
    const password = fake('FAKE_DB_', 'PASSWORD')
    const input = [
      `postgres://demo_user:${password}@example.test:5432/app`,
      `mongodb+srv://demo_user:${password}@example.test/app`,
      `redis://demo_user:${password}@example.test:6379/0`,
      `redis://:${password}@example.test:6379/1`,
      'Connect to example.test:5432 with user demo_user.',
      'The password policy has 12 characters.',
    ].join('\n')
    const output = redactSecrets(input)
    expect(output).not.toContain(password)
    expect(output).toContain('postgres://[REDACTED]@example.test:5432/app')
    expect(output).toContain('mongodb+srv://[REDACTED]@example.test/app')
    expect(output).toContain('redis://[REDACTED]@example.test:6379/0')
    expect(output).toContain('redis://[REDACTED]@example.test:6379/1')
    expect(output).toContain('Connect to example.test:5432 with user demo_user.')
    expect(output).toContain('The password policy has 12 characters.')
  })

  it('redacts GitLab and npm token prefixes', () => {
    const gitlab = fake('glpat-', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY')
    const npm = fake('npm_', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY')
    const output = redactSecrets(`failed with ${gitlab} and ${npm}`)
    expect(output).not.toContain(gitlab)
    expect(output).not.toContain(npm)
    expect(output).toContain('[REDACTED GITLAB TOKEN]')
    expect(output).toContain('[REDACTED NPM TOKEN]')
  })

  it('does not redact ordinary words or numbers', () => {
    const input = 'The password policy has 12 characters; tokenization is not a token. maxRetries = 1.'
    expect(redactSecrets(input)).toBe(input)
  })

  it('redacts recursively without mutating the source', () => {
    const stripe = fake('sk_live_', 'NOT_A_REAL_SECRET_VALUE')
    const source = {
      message: `failed with ${fake('sk-proj-', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      nested: ['Bearer abcdefghijklmnopqrstuvwxyz', { note: 'api_key=abcdefghijk' }],
      stripe: `STRIPE_SECRET_KEY=${stripe}`,
    }
    const output = redactDeep(source)
    expect(output.message).toContain('[REDACTED API KEY]')
    expect(output.nested[0]).toContain('[REDACTED]')
    expect((output.nested[1] as { note: string }).note).toContain('[REDACTED]')
    expect(output.stripe).not.toContain(stripe)
    expect(source.message).toContain('sk-proj-')
  })

  it('redacts database URLs and scoped tokens recursively', () => {
    const password = fake('FAKE_DB_', 'PASSWORD')
    const gitlab = fake('glpat-', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY')
    const npm = fake('npm_', 'FAKE_VALUE_FOR_REDACTION_TEST_ONLY')
    const source = {
      message: `connect failed: postgres://demo_user:${password}@example.test:5432/app`,
      tokens: [gitlab, { value: npm }],
    }
    const output = redactDeep(source)
    expect(output.message).not.toContain(password)
    expect(output.message).toContain('postgres://[REDACTED]@example.test:5432/app')
    expect(output.tokens[0]).toContain('[REDACTED GITLAB TOKEN]')
    expect((output.tokens[1] as { value: string }).value).toContain('[REDACTED NPM TOKEN]')
    expect(output.tokens.join(' ')).not.toContain('glpat-')
    expect(source.message).toContain(password)
  })

  it('renders errors without leaking secrets', () => {
    expect(redactError(new Error('token=abcdefghijk failed'))).toContain('[REDACTED]')
    expect(redactError('plain failure')).toBe('plain failure')
  })

  it('redacts Azure SAS signatures', () => {
    const signature = fake('FAKE', 'SIGNATURE', 'VALUE')
    const output = redactSecrets([
      `https://acct.blob.core.windows.net/c/blob?sig=${signature}&se=2026-01-01`,
      `https://acct.blob.core.windows.net/c/blob?signature=${signature}`,
      `https://acct.queue.core.windows.net/q?sharedaccesssignature=${signature}`,
    ].join('\n'))
    expect(output).not.toContain(signature)
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(3)
    // The non-secret query parameters must survive.
    expect(output).toContain('se=2026-01-01')
    expect(output).toContain('https://acct.blob.core.windows.net/c/blob?sig=')
  })

  it('redacts Basic authorization in header and JSON form', () => {
    const credentials = fake('dXNlcj', 'pwRkZXI=', 'ZmFrZQ==')
    const output = redactSecrets([
      `Authorization: Basic ${credentials}`,
      `{"headers":{"authorization":"Basic ${credentials}"}}`,
      `authorization=Basic ${credentials}`,
    ].join('\n'))
    expect(output).not.toContain(credentials)
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(3)
    expect(output).toContain('Authorization: Basic [REDACTED]')
    expect(output).toContain('"Basic [REDACTED]"')
  })
})

/**
 * P2-02 (round 5): shapes the earlier rules missed, plus two false positives
 * that rewrote non-secret code and already-redacted placeholders.
 */
describe('redaction shapes the earlier rules missed', () => {
  it('redacts a Cookie header inside a quoted shell argument', () => {
    const output = redactSecrets([
      `curl -H 'Cookie: PHPSESSID=abc123def456' https://example.test`,
      `curl --header 'Cookie: sid=abc123def456; theme=dark' https://example.test`,
      `curl -H "Cookie: PHPSESSID=abc123def456" https://example.test`,
    ].join('\n'))
    expect(output).not.toContain('abc123def456')
    expect(output).toContain("curl -H 'Cookie: [REDACTED]' https://example.test")
    expect(output).toContain('curl --header \'Cookie: [REDACTED]\' https://example.test')
    expect(output).toContain('curl -H "Cookie: [REDACTED]" https://example.test')
  })

  it('redacts presigned URL signatures from S3, GCS and generic gateways', () => {
    const signature = fake('FAKE', 'SIGNATURE', 'VALUE')
    const output = redactSecrets([
      `https://bucket.s3.amazonaws.com/o?X-Amz-Signature=${signature}&X-Amz-Expires=900`,
      `https://storage.googleapis.com/o?X-Goog-Signature=${signature}&X-Goog-Expires=900`,
      `https://api.example.test/v1/object?auth=${signature}`,
    ].join('\n'))
    expect(output).not.toContain(signature)
    expect(output).toContain('X-Amz-Expires=900')
    expect(output).toContain('X-Goog-Expires=900')
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(3)
  })

  it('redacts PGP armored private keys', () => {
    const body = fake('lQOYBF', 'fakeArmoredBody')
    const armored = [
      '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      'Version: GnuPG v2',
      '',
      body,
      '-----END PGP PRIVATE KEY BLOCK-----',
    ].join('\n')
    const output = redactSecrets(`before\n${armored}\nafter`)
    expect(output).toContain('[REDACTED PRIVATE KEY]')
    expect(output).not.toContain(body)
    expect(output).toContain('after')
  })

  it('keeps the rest of the line and an already-redacted placeholder intact', () => {
    // `;user=app` used to be swallowed by an unterminated env value.
    expect(redactSecrets('db_pass=hunter2;user=app')).toBe('db_pass=[REDACTED];user=app')
    expect(redactSecrets('db_pass=hunter2&user=app')).toBe('db_pass=[REDACTED]&user=app')
    // Re-redacting a placeholder used to produce `[REDACTED] AWS ACCESS KEY]`.
    expect(redactSecrets('X-Amz-Credential=[REDACTED AWS ACCESS KEY]&x=1'))
      .toBe('X-Amz-Credential=[REDACTED AWS ACCESS KEY]&x=1')
  })

  it('does not rewrite non-secret code that mentions a secret-like name', () => {
    const code = [
      'const token = await refreshToken()',
      'if (password == null) return',
      'const same = config.password === expected',
      'const value = getSecret()',
    ]
    for (const line of code) expect(redactSecrets(line)).toBe(line)
  })

  it('redacts short values for the secret-key spellings the env rule lacked', () => {
    expect(redactSecrets('SECRET_KEY=x')).toBe('SECRET_KEY=[REDACTED]')
    expect(redactSecrets('PRIVATE_TOKEN=y')).toBe('PRIVATE_TOKEN=[REDACTED]')
  })

  it('redacts header-style credential keys by name in deep copies', () => {
    expect(redactDeep({ 'x-api-key': 'opaque', secretKey: 'opaque', tokenCount: 7 })).toEqual({
      'x-api-key': '[REDACTED]',
      secretKey: '[REDACTED]',
      tokenCount: 7,
    })
  })
})

/**
 * Pull the workflow script's own prompt redactor out of the generated source so
 * the host list (src/redact.ts) and the in-sandbox copy are compared directly.
 * The script cannot import host code, so this parity test is what keeps the
 * generated mirror faithful to the single source of truth.
 */
function scriptRedactPromptText(): (value: string) => string {
  const start = WORKFLOW_SCRIPT.indexOf('function redactPromptText(value) {')
  expect(start).toBeGreaterThan(-1)
  const end = WORKFLOW_SCRIPT.indexOf('\n}\n', start)
  expect(end).toBeGreaterThan(start)
  const source = WORKFLOW_SCRIPT.slice(start, end + 3)
  const context = vm.createContext({})
  return vm.runInContext(`(() => { ${source}; return redactPromptText })()`, context) as (value: string) => string
}

describe('JSON, header and placeholder redaction', () => {
  it('redacts a quoted JSON secret and keeps the JSON valid', () => {
    const input = '{"token":"Sup3rSecretValue123","note":"keep me"}'
    const output = redactSecrets(input)
    expect(output).not.toContain('Sup3rSecretValue123')
    expect(output).toContain('"note":"keep me"')
    expect(JSON.parse(output)).toEqual({ token: '[REDACTED]', note: 'keep me' })
  })

  it('redacts sensitive values by JSON key name without touching other keys', () => {
    const source = {
      token: 'Sup3rSecretValue123',
      nested: { password: 'hunter2' },
      session: { id: 'opaque-session-id' },
      note: 'keep me',
      tokenCount: 42,
    }
    const output = redactDeep(source)
    expect(output.token).toBe('[REDACTED]')
    expect(output.nested.password).toBe('[REDACTED]')
    expect(output.session).toBe('[REDACTED]')
    expect(output.note).toBe('keep me')
    expect(output.tokenCount).toBe(42)
    // The source object is not mutated.
    expect(source.token).toBe('Sup3rSecretValue123')
  })

  it('redacts db_pass, Cookie, fine-grained GitHub, ASIA and Google OAuth values', () => {
    const input = [
      'db_pass=hunter2',
      'Cookie: session=abc123def456; theme=dark',
      `github_pat_${'11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'}`,
      'ASIAIOSFODNN7EXAMPLE',
      'ya29.a0AfH6SMBexampleTokenValue1234567890',
    ].join('\n')
    const output = redactSecrets(input)
    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('abc123def456')
    expect(output).not.toContain('github_pat_')
    expect(output).not.toContain('ASIA')
    expect(output).not.toContain('ya29.')
    expect(output).toContain('db_pass=[REDACTED]')
    expect(output).toContain('Cookie: [REDACTED]')
  })

  it('redacts JSON secrets that contain escaped quotes and keeps the JSON valid', () => {
    const cases = [
      '{"password":"abc\\"CANARY-7f3a9c","note":"keep"}',
      '{"password":"CANARY-7f3a9c\\"x"}',
      '{"token":"line1\\nCANARY-7f3a9c","note":"keep"}',
    ]
    for (const input of cases) {
      const output = redactSecrets(input)
      expect(output).not.toContain('CANARY-7f3a9c')
      expect(() => JSON.parse(output)).not.toThrow()
    }
    expect(JSON.parse(redactSecrets(cases[0]!))).toEqual({ password: '[REDACTED]', note: 'keep' })
  })

  it('redacts numeric JSON secrets without breaking JSON', () => {
    const input = '{"token":1234567890,"note":"keep"}'
    const output = redactSecrets(input)
    expect(JSON.parse(output)).toEqual({ token: '[REDACTED]', note: 'keep' })
  })

  it('redacts short env-style values and camelCase keys', () => {
    expect(redactSecrets('password=12345')).toBe('password=[REDACTED]')
    expect(redactSecrets('api_key=short')).toBe('api_key=[REDACTED]')
    expect(redactSecrets('API_KEY=x')).toBe('API_KEY=[REDACTED]')
    expect(redactSecrets('pwd=a')).toBe('pwd=[REDACTED]')
    expect(redactSecrets('password=ab')).toBe('password=[REDACTED]')
    expect(redactSecrets('{"accessToken":"abc","refreshToken":"def","sessionId":"ghi","tokenCount":42}'))
      .toBe('{"accessToken":"[REDACTED]","refreshToken":"[REDACTED]","sessionId":"[REDACTED]","tokenCount":42}')
    expect(redactDeep({
      accessToken: 'x',
      refreshToken: 'y',
      sessionId: 'z',
      tokenCount: 1,
      secretary: 'keep',
    })).toEqual({
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      sessionId: '[REDACTED]',
      tokenCount: 1,
      secretary: 'keep',
    })
  })

  it('redacts session/credentials keys, indented Cookie headers and keeps non-secret words', () => {
    expect(redactSecrets('{"session":"opaque-session-id","credentials":"opaque"}'))
      .toBe('{"session":"[REDACTED]","credentials":"[REDACTED]"}')
    expect(redactSecrets('  Cookie: session=abc123; theme=dark')).toBe('  Cookie: [REDACTED]')
    expect(redactSecrets('password = 12345')).toBe('password = [REDACTED]')
    expect(redactSecrets('password: required')).toBe('password: required')
  })

  it('redacts passphrase/pwd keys and values', () => {
    expect(redactSecrets('passphrase=hunter2')).toBe('passphrase=[REDACTED]')
    expect(redactSecrets('pwd=s3cret-value')).toBe('pwd=[REDACTED]')
    expect(redactDeep({ passphrase: 'hunter2', pwd: 's3cret', secretary: 'keep' })).toEqual({
      passphrase: '[REDACTED]',
      pwd: '[REDACTED]',
      secretary: 'keep',
    })
  })

  it('preserves ordinary prose that merely mentions a secret-like word', () => {
    const input = [
      'the token: count is 3',
      'The password policy has 12 characters.',
      'Rotate the secret before Friday.',
    ].join('\n')
    expect(redactSecrets(input)).toBe(input)
  })

  it('keeps an adversarial 100 KB input under a measured time bound', () => {
    // Regression: unbounded `(?:[A-Za-z0-9]+[_-])*` took ~19 s on this input.
    const input = 'a_'.repeat(50_000)
    const started = performance.now()
    redactSecrets(input)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(1_000)
  })
})

describe('prompt redaction parity', () => {
  const corpus = [
    `key ${fake('sk-proj-', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
    `github ${fake('ghp_', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
    `gitlab ${fake('glpat-', 'abcdefghijklmnopqrstuvwxyz')}`,
    `npm ${fake('npm_', 'abcdefghijklmnopqrstuvwxyz')}`,
    `slack ${fake('xoxb-', '123456789012-', 'abcdefghijkl')}`,
    `aws ${fake('AKIA', 'ABCDEFGH', 'IJKLMNOP')}`,
    `google ${fake('AIza', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
    `Authorization: Bearer ${fake('abcdefghijklmnopqrstuvwxyz', '.1234567890')}`,
    `Authorization: Basic ${fake('dXNlcj', 'pwRkZXI=', 'ZmFrZQ==')}`,
    `{"authorization":"Basic ${fake('dXNlcj', 'pwRkZXI=', 'ZmFrZQ==')}"}`,
    'https://example.test/callback?token=super-secret-token&ok=1',
    'https://acct.blob.core.windows.net/c/blob?sig=FAKESIGNATURE&se=2026-01-01',
    'https://acct.blob.core.windows.net/c/blob?sharedaccesssignature=FAKESIGNATURE',
    'api_key = "my-production-secret"',
    'OPENAI_API_KEY=custom-secret',
    'DATABASE_PASSWORD=custom-secret',
    'https://user:password@example.test/path',
    `jwt ${fake('eyJhbGciOiJIUzI1NiJ9', '.eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.signature12345')}`,
    '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----',
    '-----BEGIN PGP PRIVATE KEY BLOCK-----\nlQOYBFfakeArmoredBody\n-----END PGP PRIVATE KEY BLOCK-----',
    `curl -H 'Cookie: PHPSESSID=abc123def456' https://example.test`,
    'https://bucket.s3.amazonaws.com/o?X-Amz-Signature=FAKESIGNATUREVALUE&X-Amz-Expires=900',
    'https://storage.googleapis.com/o?X-Goog-Signature=FAKESIGNATUREVALUE',
    'https://api.example.test/v1/object?auth=FAKESIGNATUREVALUE',
    'db_pass=hunter2;user=app',
    'const token = await refreshToken()',
    'plain prose about a workflow with 42 tasks and no secrets',
    'the token count is 3 and the key insight is spacing',
  ]

  it('applies the same rules in the generated script as on the host', () => {
    const inScript = scriptRedactPromptText()
    for (const value of corpus) {
      expect(inScript(value)).toBe(redactSecrets(value))
    }
  })

  it('exposes every rule to the generated script', () => {
    const inScript = scriptRedactPromptText()
    // Each rule must actually fire inside the script realm, not just on the host.
    for (const rule of REDACTION_RULES) {
      const sample = corpus.find(value => redactSecrets(value) !== value && rule.pattern.test(value))
      if (sample === undefined) continue
      rule.pattern.lastIndex = 0
      expect(inScript(sample)).not.toBe(sample)
    }
  })
})

/**
 * The README security bullet and `docs/ARCHITECTURE.md` name the credential families this
 * module covers. That list is prose, so it can rot silently when a rule is removed or a
 * family is renamed — the failure mode rounds 3 and 4 fixed for the configuration surface.
 * This test binds the two documents to the families a reader is promised; it does not
 * prove the rules still fire (the cases above do that).
 */
describe('documentation names the covered credential families', () => {
  const families = [
    'PRIVATE KEY',
    'PGP',
    'JWT',
    'Bearer',
    'Basic',
    'Cookie',
    'Set-Cookie',
    'X-Amz-Signature',
    'X-Goog-Signature',
    'userinfo',
  ]
  const docs = ['README.md', 'README.zh-CN.md', 'docs/ARCHITECTURE.md']

  it('keeps every family named in both READMEs and the architecture doc', () => {
    for (const doc of docs) {
      const text = readFileSync(new URL(`../${doc}`, import.meta.url), 'utf8')
      for (const family of families) {
        expect(text, `${doc} no longer names the redacted family ${family}`).toContain(family)
      }
    }
  })
})
