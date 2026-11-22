/** Public surface of the taskboard module; see `./store.js` for semantics. */
export {
  TASKBOARD_LIMITS,
  TASKBOARD_SCHEMA,
  TASKBOARD_STORE_FILE,
  TaskBoard,
  TaskboardError,
  assertTaskRecord,
  openTaskboard,
  type CloseOptions,
  type CreateTaskInput,
  type TaskboardErrorCode,
  type TaskRecord,
  type TaskSnapshot,
  type TaskStatus,
} from './store.js'
