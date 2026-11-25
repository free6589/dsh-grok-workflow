// Verification rig (not product code): rewrite the cloned profile so this soak
// measures the verifier leg's refusal corridor and nothing else.
//
//   node pin-config.mjs <cordis.patch.yml>
//
// 1. Drops `mode: triage` — a key this build removed, which would otherwise
//    refuse the load (D-155).
// 2. Pins agent-default-model, all five roles and guardianModel to a route this
//    machine can actually serve. The clone keeps the live profile's agent2api
//    rows; this shell has no AGENT2API_API_KEY, so nothing may stay there.
// 3. Adds provider `authprobe`: the same model as bifrost-responses, but its
//    baseURL is the local 401-once proxy. ONLY the verifier role is put on it —
//    every other leg stays direct. That is the whole experiment: the judge's
//    route refuses the first call, everything else is untouched.
import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node pin-config.mjs <cordis.patch.yml>')
  process.exit(2)
}
const raw = readFileSync(file, 'utf8')
const MODEL = 'opencode-go/muse-spark-1.3-contributor'
const DIRECT = 'bifrost-responses'

let text = raw

// 1. the removed key (only inside the grok-workflow block)
const MODE = '\n    mode: triage\n'
if (!text.includes(MODE)) throw new Error('mode: triage line not found where expected')
text = text.replace(MODE, '\n')

// 2. agent-default-model
const AGENT_OLD = '- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: agent2api\n    model: deepseek-v4.1-flash\n'
const AGENT_NEW = `- id: agent-default-model\n  name: "@deepseek-ai/dsh-agent-default-model"\n  config:\n    provider: ${DIRECT}\n    model: ${MODEL}\n`
if (!text.includes(AGENT_OLD)) throw new Error('agent-default-model block not found')
text = text.replace(AGENT_OLD, AGENT_NEW)

// 3. add the authprobe provider, modelled on bifrost-responses
const ANCHOR = '      bifrost-responses:\n'
if (!text.includes(ANCHOR)) throw new Error('bifrost-responses provider not found')
const PROBE = [
  '      authprobe:',
  '        displayName: Refusal-once probe',
  '        api: openai-responses',
  '        baseURL: http://127.0.0.1:18190/openai/v1',
  '        apiKeyEnv: BIFROST_VIRTUAL_KEY',
  '        reasoning: high',
  '        models:',
  `          - id: ${MODEL}`,
  '            name: muse-spark-1.3(probe)',
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
text = text.replace(ANCHOR, PROBE + ANCHOR)

// 4. roles: everything direct except the judge
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
        - provider: authprobe
          model: ${MODEL}
      synthesizer:
        - provider: ${DIRECT}
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

// 5. the subagent picker list may still name agent2api rows; add this route so a
//    child's own model selection has a provider that answers on this machine.
const PICK_OLD = `    allowedModels:
      - provider: agent2api
        model: deepseek-v4.1-flash
`
if (!text.includes(PICK_OLD)) throw new Error('allowedModels block not found')
text = text.replace(PICK_OLD, `    allowedModels:\n      - provider: ${DIRECT}\n        model: ${MODEL}\n`)

writeFileSync(file, text)
console.log('pinned: agent-default-model + 5 roles + guardianModel; verifier -> authprobe')
