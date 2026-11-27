import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const SOURCE = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')
describe('pixel-sweep: retired float leaves no rule', () => {
  it('no absolute float for an opened list', () => {
    expect(SOURCE).not.toContain('.gw-progress-node-calls { position: absolute')
  })
  it('no 250px room inside the figure for the float', () => {
    expect(SOURCE).not.toContain('padding-bottom: 250px')
  })
  it('no card raise for the float', () => {
    expect(SOURCE).not.toContain('.gw-progress-pnode[data-open="true"] { z-index: 4')
  })
})
