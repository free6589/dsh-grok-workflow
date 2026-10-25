import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const script = join(root, 'scripts/watch-issues.sh')
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('issue watcher', () => {
  it('baselines existing issues and emits a prompt for a new comment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dshgw-watch-'))
    tempDirs.push(dir)
    const bin = join(dir, 'bin')
    const data = join(dir, 'data')
    const state = join(dir, 'state')
    mkdirSync(bin, { recursive: true })
    mkdirSync(data, { recursive: true })
    mkdirSync(state, { recursive: true })

    const fakeGh = join(bin, 'gh')
    writeFileSync(fakeGh, `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "issue" && "\${2:-}" == "list" ]]; then
  cat "\${FIXTURE_DIR:?}/list-\${PHASE:-1}.json"
elif [[ "\${1:-}" == "api" ]]; then
  cat "\${FIXTURE_DIR:?}/comments-\${PHASE:-1}.json"
else
  echo "unexpected gh args: $*" >&2
  exit 64
fi
`)
    chmodSync(fakeGh, 0o755)

    writeFileSync(join(data, 'list-1.json'), JSON.stringify([{
      number: 1,
      title: 'Fixture issue',
      url: 'https://github.com/free6589/dsh-grok-workflow/issues/1',
      updatedAt: '2026-10-25T00:00:00Z',
      comments: [],
    }]))
    writeFileSync(join(data, 'list-2.json'), JSON.stringify([{
      number: 1,
      title: 'Fixture issue',
      url: 'https://github.com/free6589/dsh-grok-workflow/issues/1',
      updatedAt: '2026-10-25T00:01:00Z',
      comments: [{ id: 11 }],
    }]))
    writeFileSync(join(data, 'comments-1.json'), '[]\n')
    writeFileSync(join(data, 'comments-2.json'), JSON.stringify([[
      {
        id: 11,
        body: 'New review comment',
        created_at: '2026-10-25T00:01:00Z',
        html_url: 'https://github.com/free6589/dsh-grok-workflow/issues/1#issuecomment-11',
        user: { login: 'free6589' },
      },
    ]]))

    const env = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      FIXTURE_DIR: data,
      WATCH_STATE_DIR: state,
      WATCH_WAKE_MODE: 'noop',
    }
    execFileSync('bash', [script, '--once'], { cwd: root, env, encoding: 'utf8' })
    expect(existsSync(join(state, 'state.json'))).toBe(true)
    expect(readFileSync(join(state, 'watch.log'), 'utf8')).toContain('baseline created')

    execFileSync('bash', [script, '--once'], { cwd: root, env: { ...env, PHASE: '2' }, encoding: 'utf8' })
    const archive = join(state, 'archive')
    const promptFile = readdirSync(archive).find(name => name.endsWith('.txt'))
    expect(promptFile).toBeDefined()
    const prompt = readFileSync(join(archive, promptFile!), 'utf8')
    expect(prompt).toContain('NEW COMMENTS on #1')
    expect(prompt).toContain('New review comment')
  })
})
