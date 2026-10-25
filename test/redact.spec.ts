import { describe, expect, it } from 'vitest'
import { redactDeep, redactError, redactSecrets } from '../src/redact.js'

const fake = (...parts: string[]) => parts.join('')

describe('credential redaction', () => {
  it('redacts known API key and token shapes', () => {
    const input = [
      `key ${fake('sk-proj-', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      `github ${fake('ghp_', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      `slack ${fake('xoxb-', '123456789012-', 'abcdefghijkl')}`,
      `aws ${fake('AKIA', 'ABCDEFGH', 'IJKLMNOP')}`,
      `google ${fake('AIza', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
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
})
