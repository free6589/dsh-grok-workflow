import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    env: {
      // `runWorkflow` archives every round it runs, so without a fixed location the
      // suite would append to the operator's real `$DSH_HOME/memory/grok-workflow`.
      // A scratch directory keeps the test suite deterministic and side-effect free
      // outside the workspace; a test that needs its own location sets the variable.
      GROK_WORKFLOW_MEMORY_DIR: process.env.GROK_WORKFLOW_MEMORY_DIR ?? join(tmpdir(), 'dsh-grok-workflow-test-memory'),
    },
  },
})
