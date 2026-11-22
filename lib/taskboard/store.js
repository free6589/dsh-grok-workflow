/**
 * Durable task board: the truth layer for two-level team management.
 *
 * Model (aligns with the dsh-agent-team shared task board):
 *
 * - The dispatcher (upper level) creates rows: id, title, and `blocked_by`
 *   dependency wiring. Workers (lower level) only move rows through the
 *   state machine. What is on disk decides who owns what — never memory.
 * - Task ids are globally unique per board; creating a duplicate id fails.
 * - Every mutation goes through compare-and-swap on `version`: the caller
 *   passes the version it read, the board applies the change only when the
 *   stored version still matches, and a mismatch fails with
 *   `TaskboardError('version-conflict')` carrying both versions. There is no
 *   last-writer-wins anywhere.
 * - State machine: `pending → in_progress → completed | failed | blocked`;
 *   `blocked → pending` requeues a task; `failed → pending` retries it;
 *   `completed` rows are immutable and reject every mutation.
 * - Dependencies: `blocked_by` lists predecessor ids. `claim` (and
 *   `requeue` back into `pending` when the task was `blocked`/`failed`)
 *   refuses while any predecessor is missing or not `completed`, with
 *   `TaskboardError('dependency-blocked')` naming the unmet ids.
 * - Every row — id, title, status, owner, blocked_by, version, timestamps,
 *   detail — is persisted to `store.jsonl`. Reopening the same directory
 *   recovers all of it, so a restart loses nothing.
 *
 * Durability (same idea as `src/checkpoint/writer.ts`, taskboard-local):
 * the whole board (one JSON object per line, each carrying the schema tag
 * and a sha-256 checksum over its canonical payload) is serialized, written
 * to a hidden `*.tmp` file in the board directory with an fsync, and only
 * then renamed over `store.jsonl`. A reader therefore never sees a
 * half-written store, and a failed write leaves the previous store intact.
 * Lines whose checksum no longer matches are refused on open.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { assertTaskRecord, TASKBOARD_LIMITS, TASKBOARD_SCHEMA, TASKBOARD_STORE_FILE, } from './types.js';
export { TASKBOARD_LIMITS, TASKBOARD_SCHEMA, TASKBOARD_STORE_FILE } from './types.js';
export { assertTaskRecord } from './types.js';
/** Error thrown by every `TaskBoard` failure, with a stable `code`. */
export class TaskboardError extends Error {
    code;
    /** The version the caller passed as its CAS guard, when relevant. */
    expectedVersion;
    /** The version actually stored, when relevant. */
    actualVersion;
    /** Dependency ids that are missing or not completed, for `dependency-blocked`. */
    unmet;
    constructor(code, message, extra) {
        super(message);
        this.name = 'TaskboardError';
        this.code = code;
        this.expectedVersion = extra?.expectedVersion;
        this.actualVersion = extra?.actualVersion;
        this.unmet = extra?.unmet;
    }
}
/** Sort object keys so the checksum is reproducible offline. */
function canonicalJson(value) {
    if (value === null || value === undefined)
        return 'null';
    if (typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}
function checksumOf(task) {
    return createHash('sha256').update(canonicalJson(task), 'utf8').digest('hex');
}
function checkId(id) {
    if (id === '' || id.length > TASKBOARD_LIMITS.idChars) {
        throw new TaskboardError('invalid-input', `task id must be 1..${TASKBOARD_LIMITS.idChars} characters`);
    }
}
function checkTitle(title) {
    if (title === '' || title.length > TASKBOARD_LIMITS.titleChars) {
        throw new TaskboardError('invalid-input', `task title must be 1..${TASKBOARD_LIMITS.titleChars} characters`);
    }
}
function checkOwner(owner) {
    if (owner === '' || owner.length > TASKBOARD_LIMITS.ownerChars) {
        throw new TaskboardError('invalid-input', `task owner must be 1..${TASKBOARD_LIMITS.ownerChars} characters`);
    }
}
function checkDetail(detail) {
    if (detail.length > TASKBOARD_LIMITS.detailChars) {
        throw new TaskboardError('invalid-input', `task detail must be at most ${TASKBOARD_LIMITS.detailChars} characters`);
    }
}
function checkBlockedBy(blockedBy) {
    if (blockedBy.length > TASKBOARD_LIMITS.blockedByItems) {
        throw new TaskboardError('invalid-input', `task blocked_by must hold at most ${TASKBOARD_LIMITS.blockedByItems} ids`);
    }
    const seen = new Set();
    const out = [];
    for (const entry of blockedBy) {
        checkId(entry);
        if (!seen.has(entry)) {
            seen.add(entry);
            out.push(entry);
        }
    }
    return out;
}
function nowIso() {
    return new Date().toISOString();
}
function clone(task) {
    return { ...task, blocked_by: [...task.blocked_by] };
}
function parseLine(line, lineNo) {
    let parsed;
    try {
        parsed = JSON.parse(line);
    }
    catch {
        throw new TaskboardError('integrity', `store.jsonl line ${lineNo} is not valid JSON`);
    }
    if (typeof parsed !== 'object' || parsed === null) {
        throw new TaskboardError('integrity', `store.jsonl line ${lineNo} is not an object`);
    }
    const envelope = parsed;
    if (envelope['schema'] !== TASKBOARD_SCHEMA) {
        throw new TaskboardError('integrity', `store.jsonl line ${lineNo} carries an unknown schema`);
    }
    if (typeof envelope['checksum'] !== 'string') {
        throw new TaskboardError('integrity', `store.jsonl line ${lineNo} carries no checksum`);
    }
    const task = assertTaskRecord(envelope['task']);
    if (checksumOf(task) !== envelope['checksum']) {
        throw new TaskboardError('integrity', `store.jsonl line ${lineNo} fails its checksum (task ${task.id})`);
    }
    return task;
}
/**
 * One durable board: one directory, one `store.jsonl`, every mutation
 * persisted before it returns. Use `openTaskboard` to create or reopen;
 * every instance holds its own in-memory copy, so concurrent handles to
 * the same directory must re-read (via `reload`) to observe each other.
 */
export class TaskBoard {
    dir;
    file;
    tasks = new Map();
    constructor(dir) {
        this.dir = dir;
        this.file = join(dir, TASKBOARD_STORE_FILE);
    }
    /** Open the board at `dir`, creating it (empty) when no store exists. */
    static async open(dir) {
        const board = new TaskBoard(dir);
        await board.load();
        return board;
    }
    /** Directory holding `store.jsonl`. */
    get directory() {
        return this.dir;
    }
    /** Number of rows on the board. */
    get size() {
        return this.tasks.size;
    }
    /** Re-read `store.jsonl`, discarding unpersisted local state. */
    async reload() {
        await this.load();
    }
    /** Read one row; throws `not-found` for an unknown id. The result is a copy. */
    get(id) {
        const task = this.tasks.get(id);
        if (task === undefined)
            throw new TaskboardError('not-found', `unknown task: ${id}`);
        return clone(task);
    }
    /** List every row, sorted by id. Each entry is a copy. */
    list() {
        return [...this.tasks.values()].sort((left, right) => (left.id < right.id ? -1 : 1)).map(clone);
    }
    /**
     * Create one `pending`, unowned row. The id must be globally unique on
     * this board; a duplicate fails with `duplicate-id` and changes nothing.
     */
    async create(input) {
        checkId(input.id);
        checkTitle(input.title);
        const blockedBy = checkBlockedBy(input.blocked_by ?? []);
        if (blockedBy.includes(input.id)) {
            throw new TaskboardError('invalid-input', `task ${input.id} cannot depend on itself`);
        }
        if (this.tasks.has(input.id)) {
            throw new TaskboardError('duplicate-id', `task id already exists: ${input.id}`);
        }
        if (this.tasks.size + 1 > TASKBOARD_LIMITS.maxTasks) {
            throw new TaskboardError('too-large', `board holds at most ${TASKBOARD_LIMITS.maxTasks} tasks`);
        }
        const stamped = nowIso();
        const task = {
            id: input.id,
            title: input.title,
            status: 'pending',
            owner: null,
            blocked_by: blockedBy,
            version: 1,
            createdAt: stamped,
            updatedAt: stamped,
            detail: null,
        };
        this.tasks.set(task.id, task);
        try {
            await this.persist();
        }
        catch (error) {
            this.tasks.delete(task.id);
            throw error;
        }
        return clone(task);
    }
    /**
     * Claim a `pending` row: assign `owner` and move it to `in_progress`.
     * Refuses while any `blocked_by` predecessor is missing or not
     * `completed` (`dependency-blocked`), and refuses a stale CAS guard
     * (`version-conflict`).
     */
    async claim(id, owner, expectedVersion) {
        checkOwner(owner);
        return this.mutate(id, expectedVersion, (task) => {
            if (task.status !== 'pending') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot be claimed from status ${task.status}`);
            }
            this.requireDependencies(task);
            return { ...task, status: 'in_progress', owner };
        });
    }
    /** Mark an `in_progress` row `completed`. Completed rows are immutable. */
    async complete(id, expectedVersion) {
        return this.mutate(id, expectedVersion, (task) => {
            if (task.status !== 'in_progress') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot complete from status ${task.status}`);
            }
            return { ...task, status: 'completed' };
        });
    }
    /** Mark an `in_progress` row `failed`, optionally recording why. */
    async fail(id, options) {
        if (options?.detail !== undefined)
            checkDetail(options.detail);
        return this.mutate(id, options?.expectedVersion, (task) => {
            if (task.status !== 'in_progress') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot fail from status ${task.status}`);
            }
            return { ...task, status: 'failed', detail: options?.detail ?? task.detail };
        });
    }
    /** Mark an `in_progress` row `blocked`, optionally recording why. */
    async blockTask(id, options) {
        if (options?.detail !== undefined)
            checkDetail(options.detail);
        return this.mutate(id, options?.expectedVersion, (task) => {
            if (task.status !== 'in_progress') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot block from status ${task.status}`);
            }
            return { ...task, status: 'blocked', detail: options?.detail ?? task.detail };
        });
    }
    /**
     * Return a `blocked` or `failed` row to `pending` so it can be
     * reassigned. `completed` rows are immutable and refuse this with
     * `immutable`; claiming the requeued row re-checks dependencies.
     */
    async requeue(id, expectedVersion) {
        return this.mutate(id, expectedVersion, (task) => {
            if (task.status === 'completed') {
                throw new TaskboardError('immutable', `task ${id} is completed and cannot change`);
            }
            if (task.status !== 'blocked' && task.status !== 'failed') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot be requeued from status ${task.status}`);
            }
            return { ...task, status: 'pending', owner: null };
        });
    }
    /**
     * Change one `pending` row's owner without starting it (dispatcher
     * pre-assignment). Refuses while dependencies are unmet.
     */
    async assign(id, owner, expectedVersion) {
        checkOwner(owner);
        return this.mutate(id, expectedVersion, (task) => {
            if (task.status === 'completed') {
                throw new TaskboardError('immutable', `task ${id} is completed and cannot change`);
            }
            if (task.status !== 'pending') {
                throw new TaskboardError('invalid-transition', `task ${id} cannot be assigned from status ${task.status}`);
            }
            this.requireDependencies(task);
            return { ...task, owner };
        });
    }
    /**
     * Replace one `pending` row's dependency list. Completed rows refuse
     * with `immutable`; re-claiming afterwards re-checks the new wiring.
     */
    async setDependencies(id, blockedBy, expectedVersion) {
        const next = checkBlockedBy(blockedBy);
        if (next.includes(id)) {
            throw new TaskboardError('invalid-input', `task ${id} cannot depend on itself`);
        }
        return this.mutate(id, expectedVersion, (task) => {
            if (task.status === 'completed') {
                throw new TaskboardError('immutable', `task ${id} is completed and cannot change`);
            }
            return { ...task, blocked_by: next };
        });
    }
    requireDependencies(task) {
        const unmet = task.blocked_by.filter((dep) => {
            const predecessor = this.tasks.get(dep);
            return predecessor === undefined || predecessor.status !== 'completed';
        });
        if (unmet.length > 0) {
            throw new TaskboardError('dependency-blocked', `task ${task.id} waits on unfinished predecessors: ${unmet.join(', ')}`, { unmet });
        }
    }
    async mutate(id, expectedVersion, next) {
        const current = this.tasks.get(id);
        if (current === undefined)
            throw new TaskboardError('not-found', `unknown task: ${id}`);
        if (current.status === 'completed') {
            throw new TaskboardError('immutable', `task ${id} is completed and cannot change`);
        }
        if (expectedVersion !== undefined && current.version !== expectedVersion) {
            throw new TaskboardError('version-conflict', `task ${id} changed underneath you: expected version ${expectedVersion}, stored version ${current.version}`, { expectedVersion, actualVersion: current.version });
        }
        const updated = { ...next(current), version: current.version + 1, updatedAt: nowIso() };
        this.tasks.set(id, updated);
        try {
            await this.persist();
        }
        catch (error) {
            this.tasks.set(id, current);
            throw error;
        }
        return clone(updated);
    }
    async load() {
        let info;
        try {
            info = await stat(this.file);
        }
        catch (error) {
            if (error?.code === 'ENOENT') {
                this.tasks.clear();
                return;
            }
            throw new TaskboardError('io', `taskboard stat failed: ${describe(error)}`);
        }
        if (!info.isFile())
            throw new TaskboardError('io', `taskboard path is not a regular file: ${this.file}`);
        if (info.size > TASKBOARD_LIMITS.maxBytes) {
            throw new TaskboardError('too-large', `taskboard store is ${info.size} bytes, above the ${TASKBOARD_LIMITS.maxBytes} bound`);
        }
        let text;
        try {
            text = await readFile(this.file, 'utf8');
        }
        catch (error) {
            throw new TaskboardError('io', `taskboard read failed: ${describe(error)}`);
        }
        const next = new Map();
        const lines = text.split('\n');
        lines.forEach((line, index) => {
            if (line.trim() === '')
                return;
            const task = parseLine(line, index + 1);
            if (next.has(task.id))
                throw new TaskboardError('integrity', `store.jsonl holds task ${task.id} twice`);
            next.set(task.id, task);
        });
        if (next.size > TASKBOARD_LIMITS.maxTasks) {
            throw new TaskboardError('too-large', `taskboard store holds more than ${TASKBOARD_LIMITS.maxTasks} tasks`);
        }
        this.tasks.clear();
        for (const [id, task] of next)
            this.tasks.set(id, task);
    }
    /**
     * Serialize the whole board (one checksummed JSON object per line) and
     * swap it over `store.jsonl` atomically: hidden `*.tmp` write, fsync,
     * then rename. A failed write leaves the previous store intact.
     */
    async persist() {
        const rows = [...this.tasks.values()]
            .sort((left, right) => (left.id < right.id ? -1 : 1))
            .map((task) => ({ schema: TASKBOARD_SCHEMA, checksum: checksumOf(task), task }));
        const file = rows.length === 0 ? '' : `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
        const fileBytes = Buffer.byteLength(file, 'utf8');
        if (fileBytes > TASKBOARD_LIMITS.maxBytes) {
            throw new TaskboardError('too-large', `taskboard store would be ${fileBytes} bytes, above the ${TASKBOARD_LIMITS.maxBytes} bound`);
        }
        const dir = dirname(this.file);
        const tmp = join(dir, `.${basename(this.file)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`);
        try {
            await mkdir(dir, { recursive: true });
            const handle = await open(tmp, 'w');
            try {
                await handle.writeFile(file, 'utf8');
                await handle.sync();
            }
            finally {
                await handle.close();
            }
        }
        catch (error) {
            await rm(tmp, { force: true }).catch(() => undefined);
            throw new TaskboardError('io', `taskboard temporary write failed: ${describe(error)}`);
        }
        try {
            await rename(tmp, this.file);
        }
        catch (error) {
            await rm(tmp, { force: true }).catch(() => undefined);
            throw new TaskboardError('io', `taskboard rename failed: ${describe(error)}`);
        }
        try {
            const dirHandle = await open(dir, 'r');
            try {
                await dirHandle.sync();
            }
            finally {
                await dirHandle.close();
            }
        }
        catch {
            // The rename already landed; directory fsync is best-effort on
            // platforms that refuse to open a directory.
        }
    }
}
/** Open (or create) the board at `dir`. Reopening recovers every row. */
export async function openTaskboard(dir) {
    return TaskBoard.open(dir);
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=store.js.map