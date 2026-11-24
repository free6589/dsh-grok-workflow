// Verification rig (not product code). Writes the soak overlay for one build.
//   node gen-overlay.mjs <abs path to build's lib/index.js> <out.yml> [model]
// The provider points at the machine's own gateway on 127.0.0.1:18088 and reads
// its key from BIFROST_VIRTUAL_KEY in the process environment (never a file).
import { writeFileSync } from 'node:fs'

const [libEntry, out, modelArg] = process.argv.slice(2)
if (!libEntry || !out) {
  console.error('usage: node gen-overlay.mjs <lib/index.js> <out.yml> [model]')
  process.exit(2)
}
const MODEL = modelArg ?? 'wb/cn:deepseek-v4.1-flash'

const provider = `      soak-live:
        displayName: Soak live (machine gateway, direct)
        api: openai-completions
        baseURL: http://127.0.0.1:18088/openai/v1
        apiKeyEnv: BIFROST_VIRTUAL_KEY
        compat:
          supportsDeveloperRole: false
          supportsStore: false
        models:
          - id: ${MODEL}
            name: soak live
            contextWindow: 500000
            maxTokens: 65536`

const roles = ['planner', 'worker', 'verifier', 'supervisor', 'synthesizer']
  .map((role) => `          ${role}:\n            - provider: soak-live\n              model: ${MODEL}`)
  .join('\n')

writeFileSync(out, `# Soak overlay — build under test: ${libEntry}
- id: llm-deepseek
  name: '@deepseek-ai/dsh-llm-deepseek-api-key'
  disabled: true
- id: llm-deepseek-account
  name: '@deepseek-ai/dsh-llm-deepseek-account'
  disabled: true

- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
${provider}

- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: soak-live
    model: ${MODEL}

- id: workflow-ptc
  name: '@deepseek-ai/dsh-workflow-ptc'
  config:
    provider: spawn
  disabled: false

- insert:
    - id: grok-workflow
      name: ${libEntry}
      config:
        mode: full
        grokDefault: 'on'
        maxConcurrency: 2
        timeoutMs: 1200000
        childTimeoutMs: 420000
        loopEnabled: false
        roles:
${roles}
`)
console.log(`${out}: lib=${libEntry} model=${MODEL}`)
