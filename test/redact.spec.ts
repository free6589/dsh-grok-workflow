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

  it('does not redact ordinary words or numbers', () => {
    const input = 'The password policy has 12 characters; tokenization is not a token. maxRetries = 1.'
    expect(redactSecrets(input)).toBe(input)
  })

  it('redacts recursively without mutating the source', () => {
    const source = {
      message: `failed with ${fake('sk-proj-', 'abcdefghijklmnopqrstuvwxyz', '0123456789')}`,
      nested: ['Bearer abcdefghijklmnopqrstuvwxyz', { note: 'api_key=abcdefghijk' }],
    }
    const output = redactDeep(source)
    expect(output.message).toContain('[REDACTED API KEY]')
    expect(output.nested[0]).toContain('[REDACTED]')
    expect((output.nested[1] as { note: string }).note).toContain('[REDACTED]')
    expect(source.message).toContain('sk-proj-')
  })

  it('renders errors without leaking secrets', () => {
    expect(redactError(new Error('token=abcdefghijk failed'))).toContain('[REDACTED]')
    expect(redactError('plain failure')).toBe('plain failure')
  })
})
