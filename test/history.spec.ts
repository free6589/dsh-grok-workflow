import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { collectHistory, composeObjective, renderHistory } from '../src/history.js'

function user(text: string, kind: 'user' | 'grok-workflow' = 'user'): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind } as never }) as Message
}

function assistant(text: string): Message {
  return createAssistantMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'model', provider: 'p', model: 'm' } as never,
  }) as Message
}

describe('gate history forwarding', () => {
  it('returns nothing when the bounds are zero', () => {
    const messages = [user('hello')]
    expect(renderHistory(messages, { turns: 0, chars: 100 })).toBe('')
    expect(renderHistory(messages, { turns: 2, chars: 0 })).toBe('')
  })

  it('renders the most recent exchange with role labels', () => {
    const rendered = renderHistory([user('first question'), assistant('first answer'), user('second question'), assistant('second answer')], { turns: 1, chars: 1_000 })
    expect(rendered).toContain('Conversation so far (context only):')
    expect(rendered).toContain('User: second question')
    expect(rendered).toContain('Assistant: second answer')
    expect(rendered).not.toContain('first question')
  })

  it('keeps the newest messages when the budget is tight', () => {
    const long = 'x'.repeat(500)
    const rendered = renderHistory([user(long), assistant(long), user('newest')], { turns: 3, chars: 200 })
    expect(rendered).toContain('newest')
    expect(rendered.length).toBeLessThan(400)
  })

  it('skips the plugin relay message so the previous report is not replayed twice', () => {
    const relay = user('mandatory workflow report body', 'grok-workflow')
    const rendered = renderHistory([relay, assistant('reported body')], { turns: 2, chars: 1_000 })
    expect(rendered).not.toContain('mandatory workflow report body')
    expect(rendered).toContain('reported body')
  })

  it('skips messages without text content', () => {
    const empty = createUserMessage({ content: [], source: { kind: 'user' } }) as Message
    expect(renderHistory([empty, user('only text')], { turns: 2, chars: 1_000 })).toContain('only text')
  })

  it('redacts secrets found in forwarded history', () => {
    const rendered = renderHistory([user('api key sk-abcdef0123456789abcdef')], { turns: 1, chars: 1_000 })
    expect(rendered).not.toContain('sk-abcdef0123456789abcdef')
  })

  it('survives a session without a derivation API', () => {
    expect(collectHistory(undefined, { turns: 2, chars: 100 })).toBe('')
    expect(collectHistory({ deriveMessages: () => { throw new Error('nope') } } as never, { turns: 2, chars: 100 })).toBe('')
  })

  it('composes history and request within the objective limit', () => {
    const composed = composeObjective('Conversation so far (context only):\nUser: earlier', 'now do it', 4_000)
    expect(composed).toContain('Conversation so far')
    expect(composed).toContain('Current request:\nnow do it')
  })

  it('drops history when the remaining room is useless', () => {
    const history = 'h'.repeat(500)
    const request = 'x'.repeat(3_980)
    const composed = composeObjective(history, request, 4_000)
    expect(composed).toBe(`Current request:\n${request}`)
  })

  it('reports an unbuildable request instead of truncating it silently', () => {
    expect(composeObjective('', 'x'.repeat(4_001), 4_000)).toBeUndefined()
  })

  it('truncates history to the remaining budget', () => {
    const composed = composeObjective('h'.repeat(1_000), 'r'.repeat(3_500), 4_000)
    expect(composed).toBeDefined()
    expect(composed!.length).toBeLessThanOrEqual(4_000)
    expect(composed).toContain('Current request:')
  })
})
