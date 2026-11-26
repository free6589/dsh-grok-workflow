// Verification rig (not product code): rewrite one cloned profile so the soak
// measures exactly one failure state and nothing else.
//
//   node pin-config.mjs <cordis.patch.yml> <amber|failed|cancelled>
//
// Every scenario gets the same four edits, each anchored and asserted:
//   1. drop `mode: triage` — a key this build removed; leaving it refuses the load;
//   2. pin agent-default-model, all five roles and guardianModel to a route this
//      shell can actually serve (this machine has BIFROST_VIRTUAL_KEY, no
//      AGENT2API_API_KEY);
//   3. pin the subagent picker list to the same route;
//   4. move ONE leg onto a local proxy:
//        amber     → synthesizer goes to the summary-draft proxy (127.0.0.1:18191),
//                    every draft it writes carries a citation the gate must reject;
//        failed    → verifier goes to the always-refusing proxy (127.0.0.1:18190),
//                    the run cannot pass its judge and ends FAILED;
//        cancelled → no proxy at all: this state is produced by the reader's stop.
import { readFileSync, writeFileSync } from 'node:fs'

const [file, scenario] = process.argv.slice(2)
if (!file || !scenario) {
  console.error('usage: node pin-config.mjs <cordis.patch.yml> <amber|failed|cancelled>')
  process.exit(2)
}
if (!['amber', 'failed', 'cancelled'].includes(scenario)) throw new Error(`unknown scenario ${scenario}`)

const MODEL = 'opencode-go/muse-spark-1.3-contributor'
const DIRECT = 'bifrost-responses'
let text = readFileSync(file, 'utf8')

// 1. the removed key
const MODE = '\n    mode: triage\n'
if (!text.includes(MODE)) throw new Error('mode: triage line not found where expected')
text = text.replace(MODE, '\n')

// 2. agent-default-model
const AGENT_OLD = '- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: agent2api\n    model: deepseek-v4.1-flash\n    reasoningEffort: high\n'
const AGENT_NEW = `- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: ${DIRECT}\n    model: ${MODEL}\n    reasoningEffort: high\n`
if (!text.includes(AGENT_OLD)) throw new Error('agent-default-model block not found')
text = text.replace(AGENT_OLD, AGENT_NEW)

// 3. the proxy provider, only for the scenario that needs one
const probe = scenario === 'amber'
  ? { id: 'summaryprobe', port: 18191, display: 'Summary-draft probe' }
  : scenario === 'failed'
    ? { id: 'judgeprobe', port: 18190, display: 'Always-refusing judge' }
    : undefined
if (probe !== undefined) {
  const ANCHOR = '      bifrost-responses:\n'
  if (!text.includes(ANCHOR)) throw new Error('bifrost-responses provider not found')
  const block = [
    `      ${probe.id}:`,
    `        displayName: ${probe.display}`,
    '        api: openai-responses',
    `        baseURL: http://127.0.0.1:${probe.port}/openai/v1`,
    '        apiKeyEnv: BIFROST_VIRTUAL_KEY',
    '        reasoning: high',
    '        models:',
    `          - id: ${MODEL}`,
    `            name: muse-spark-1.3(${probe.id})`,
    '            maxTokens: 100000',
    '            input:',
    '              - text',
    '            reasoningEfforts:',
    '              off: null',
    '              minimal: minimal',
    '              low: low',
    '              medium: medium',
    '              high: high',
    '              xhigh: xhigh',
    '              max: max',
    '            contextWindow: 500000',
    '',
  ].join('\n')
  text = text.replace(ANCHOR, block + ANCHOR)
}

// 4. the five roles, one of which may be moved onto the proxy
const synthesizer = probe?.id === 'summaryprobe' ? probe.id : DIRECT
const verifier = probe?.id === 'judgeprobe' ? probe.id : DIRECT
const ROLES_OLD = `    roles:
      planner:
        - provider: bifrost-responses
          model: ${MODEL}
      worker:
        - provider: agent2api
          model: deepseek-v4.1-flash
        - provider: agent2api
          model: glm-5.3-flash
      verifier:
        - provider: agent2api
          model: deepseek-v4.1-flash
      synthesizer:
        - provider: bifrost-responses
          model: ${MODEL}
      supervisor:
        - provider: agent2api
          model: deepseek-v4.1-flash
    guardianModel:
      provider: agent2api
      model: deepseek-v4.1-flash
`
const ROLES_NEW = `    roles:
      planner:
        - provider: ${DIRECT}
          model: ${MODEL}
      worker:
        - provider: ${DIRECT}
          model: ${MODEL}
      verifier:
        - provider: ${verifier}
          model: ${MODEL}
      synthesizer:
        - provider: ${synthesizer}
          model: ${MODEL}
      supervisor:
        - provider: ${DIRECT}
          model: ${MODEL}
    guardianModel:
      provider: ${DIRECT}
      model: ${MODEL}
`
if (!text.includes(ROLES_OLD)) throw new Error('roles block not found as expected')
text = text.replace(ROLES_OLD, ROLES_NEW)

// 5. the subagent picker list: three agent2api rows this shell cannot serve
const PICK_OLD = `    allowedModels:
      - provider: agent2api
        model: deepseek-v4.1-flash
      - provider: agent2api
        model: scnet
      - provider: agent2api
        model: glm-5.3-flash
`
const PICK_NEW = `    allowedModels:
      - provider: ${DIRECT}
        model: ${MODEL}
`
if (!text.includes(PICK_OLD)) throw new Error('allowedModels block not found')
text = text.replace(PICK_OLD, PICK_NEW)

// Assert the result really says what the soak is going to claim.
const leftovers = text.split('\n').filter((line) => /provider: agent2api/.test(line))
if (leftovers.length > 0) throw new Error(`agent2api still referenced ${leftovers.length} time(s)`)
if (/mode: triage/.test(text)) throw new Error('mode: triage survived')

writeFileSync(file, text)
console.log(`pinned: agent-default-model + 5 roles + guardianModel + picker; verifier -> ${verifier}; synthesizer -> ${synthesizer}`)
