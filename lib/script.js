/**
 * Workflow script assembly (moved from the monolithic `src/script.ts`).
 *
 * This module is a **re-export shell**: every symbol historically imported
 * from `./script.js` keeps working unchanged. The guest-script fragments live
 * in `src/script-parts/*.ts` (one function per block); this file only assembles
 * them and re-exports the host-side helpers.
 */
export { SUMMARY_MAX_ATTEMPTS, PLANNER_LEG_CALLS, redactionRulesSource } from './script-parts/params.js';
export { routeBudgetFor, maxTotalAgentsFor, buildWorkflowRequest, assembleWorkflowScript } from './script-parts/main.js';
import { WORKFLOW_SCRIPT as ASSEMBLED } from './script-parts/assemble.js';
export const WORKFLOW_SCRIPT = ASSEMBLED;
//# sourceMappingURL=script.js.map