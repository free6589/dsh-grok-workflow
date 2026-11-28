    // ─── Conversation View: the "进度" tab ──────────────────────────────────────
    //
    // A third tab next to the stock chat and trajectory views. It exists because the
    // stock renderer cannot show what this plugin's own recorder measures: it folds the
    // nine `plugin:grok-workflow/progress/*` records into one run node with rows, and there is no channel
    // for a task-level state (`docs/task-progress-panel.md`, P1-2: BLOCKED upstream).
    //
    // What this tab is, stated so nothing below overclaims:
    //
    // - It reads **only** the records `src/records.ts` writes through its recorder
    //   (`run-start`, `agent-start`, `agent-end`, `summary-final`, `summary-rejected`,
    //   `guardian-start`, `guardian-finding`, `guardian-end`, `run-end`). It writes nothing, sends
    //   nothing, and adds no session event of its own.
    // - It shows a fixed process spine (start → … → end) plus one real node per recorded
    //   `phase`, so every declared row is visible and a run that does not follow the
    //   template still shows what it did.
    // - Its only number is settled rows over declared rows, and both the copy and the
    //   tooltip say so. There is no ETA, no token count, no invented percentage, and a
    //   stage the events never mentioned reads `pending` rather than borrowing a
    //   neighbour's state.
    // - The detail popover resolves seven fields through an explicit ladder
    //   (stage-detail event → child coordination block → not reported) and labels the
    //   source of every row. Today's recorder emits no stage-detail event and no child
    //   text is reachable from a view, so the honest answer is the third rung; the ladder
    //   is implemented and tested so a future producer needs no rewrite.
    //
    // Registration is deliberately defensive: the tab is a bonus on top of the settings
    // page and the chat panel, so a composition without `uiConversation`/`sessions`, or a
    // registry that refuses the definition, costs the tab and nothing else — the settings
    // page says so in its status area (`status.progressMissing` / `status.progressFailed`).

    /** Registered conversation target of the progress view; namespaced so a collision throws. */
    const PROGRESS_TARGET = 'grok-progress'
    /** Node kind contributed by this bundle; namespaced for the same reason. */
    const PROGRESS_KIND = 'grok-progress-run'
    /** View tab id, second on the strip so the 390 px budget keeps it visible. */
    const PROGRESS_VIEW_ID = 'grok-progress'
    // Chat is order 0 and the trajectory view order 10; the host folds the
    // strip by width (visibleViewLimit = max(1, floor((rowWidth - 48) / 120))),
    // so 390 keeps two entries and the third rank folds into the overflow menu.
    // Order 5 puts this tab between the two stock views: one click at 390,
    // the default (null → chat) and every other rank untouched.
    // entry-guard: this entry guards only itself. Its rank is exactly 5
    // (see test/progress-entry.spec.ts); the host strip it joins is snapshotted
    // there, so a host-added view turns that spec red instead of folding us silently.
    const PROGRESS_VIEW_ORDER = 5
    /**
     * The nine progress and Guardian lifecycle records the tab folds; all others are ignored.
     *
     * The names moved house (from `tool-workflow/*` session events to
     * `plugin:grok-workflow/progress/*` plugin records — same facts, a channel the
     * harness never rejects); the semantics did not. `summary-final` belongs on this
     * list and not only in the fold's own special case: an event type the view
     * definition does not match never reaches the tab, so a claim the recorder
     * wrote would be dropped before any folding could see it.
     */
    const PROGRESS_EVENT_TYPES = [
      'plugin:grok-workflow/progress/run-start',
      'plugin:grok-workflow/progress/agent-start',
      'plugin:grok-workflow/progress/agent-end',
      'plugin:grok-workflow/progress/summary-final',
      'plugin:grok-workflow/progress/summary-rejected',
      'plugin:grok-workflow/progress/guardian-start',
      'plugin:grok-workflow/progress/guardian-finding',
      'plugin:grok-workflow/progress/guardian-end',
      'plugin:grok-workflow/progress/run-end',
    ]

    /**
     * The track's fixed spine: the process template of a staged delivery job.
     *
     * It is a template, not a claim: a stage whose token no recorded phase carries stays
     * `pending` and its tooltip says the events did not report it.
     */
    /**
     * The track's spine: this engine's own phases, in the order it runs them.
     *
     * The four work stages are the phase headers `src/naming.ts` emits — `规划` / `执行` /
     * `检查` / `汇总` (`phaseLabel`: plan, execute, verify, synthesize) —
     * plus the plan tasks the engine announces as `任务 n · 标题` (`taskGroupTitle`), which
     * are appended between `执行` and `检查` because that is where the workers run.
     * The final answer is relayed in the turn's own message,
     * never as a workflow child call, so no `回答` event can ever reach this track —
     * the spine does not list a stage no event can fill.
     *
     * A CJK token matches anywhere; a token with Latin letters must sit on word
     * boundaries, or `ui` reads inside `build`, `tag` inside `stage` and `sync` inside
     * `async` — the false hits that made the old spine report stages nobody ran.
     */
    const PROGRESS_STAGES = [
      { key: 'start', tokens: [], edge: true },
      { key: 'plan', tokens: ['规划', 'plan'], edge: false },
      { key: 'execute', tokens: ['执行', 'execute'], edge: false },
      { key: 'verify', tokens: ['检查', '核验', 'verify'], edge: false },
      { key: 'synthesize', tokens: ['汇总', 'synthesize'], edge: false },
      { key: 'end', tokens: [], edge: true },
    ]

    /**
     * The fixed per-task chain, in render order: `执行` → `检查` → `复核`
     * (`worker` → `verifier` → `supervisor`).
     *
     * A task's rows arrive as role calls, so a card can say which gates a task actually
     * reached. The chain is fixed rather than derived from what arrived: a capsule no row
     * reached renders `pending` with a dashed border, because "the verify call never ran"
     * is a fact a reader needs, and a missing capsule would hide it.
     */
    const PROGRESS_CHAIN = [
      { key: 'execute', tokens: ['执行', 'execute', 'worker'] },
      { key: 'check', tokens: ['检查', '核验', 'verify', 'check', 'verifier'] },
      { key: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
    ]

    /**
     * The optional detail payload, kept apart from `PROGRESS_EVENT_TYPES`.
     *
     * It never decides a state; it only adds field values to a node. The recorder does
     * not write it today, so a stream without it renders exactly what it rendered before
     * — but when a stream carries one, the values are used instead of being ignored.
     */
    const PROGRESS_DETAIL_EVENT_TYPE = 'tool-workflow/stage-detail'

    /**
     * The optional event that names the summary draft the run shipped.
     *
     * A chat row's label is fixed at `agent-start`, so "this draft is the final one"
     * arrives as its own fact once the gate has passed a draft. Mirror of
     * `PROGRESS_SUMMARY_FINAL_EVENT_TYPE` in `src/progress-tab.ts`; a stream without
     * it renders exactly what it rendered before.
     */
    const PROGRESS_SUMMARY_FINAL_EVENT_TYPE = 'plugin:grok-workflow/progress/summary-final'
    const PROGRESS_SUMMARY_FINAL_EVENT_TYPE_LEGACY = 'tool-workflow/summary-final'

    /**
     * The optional event that says the gate rejected every draft, and why.
     *
     * The sibling of `summary-final`, never its alternative: a run either handed one
     * draft in or handed none. Mirror of `PROGRESS_SUMMARY_REJECTED_EVENT_TYPE` in
     * `src/progress-tab.ts`; a stream without it renders a rejected run exactly as it
     * rendered before — as a run that handed in nothing.
     */
    const PROGRESS_SUMMARY_REJECTED_EVENT_TYPE = 'plugin:grok-workflow/progress/summary-rejected'
    const PROGRESS_SUMMARY_REJECTED_EVENT_TYPE_LEGACY = 'tool-workflow/summary-rejected'

    /**
     * The numbered summary-draft names, this half's copy of `src/naming.ts`
     * (`synthesisDraft` + `SYNTHESIS_FINAL_MARK`), kept word for word.
     *
     * The host serves this file verbatim, so it cannot import the typed table. The mark is
     * pinned by the bilingual table in `test/i18n-parity.spec.ts` and the rendered name by
     * the final card's own assertion — neither compares back to `src/naming.ts`, so a change
     * to the naming table has to be carried across by hand.
     */
    /**
     * The retired `tool-workflow/*` names for the nine facts above. Old sessions
     * still carry them; the fold and the match below accept both spellings and the
     * replay state always writes the new names. Mirror of `normalizeProgressRecord`
     * in `src/records.ts` — the host serves this file verbatim, so it cannot import
     * that function and the table is carried across by hand.
     */
    const PROGRESS_RECORD_RENAMES = {
      'tool-workflow/run-start': 'plugin:grok-workflow/progress/run-start',
      'tool-workflow/agent-start': 'plugin:grok-workflow/progress/agent-start',
      'tool-workflow/agent-end': 'plugin:grok-workflow/progress/agent-end',
      'tool-workflow/run-end': 'plugin:grok-workflow/progress/run-end',
      'tool-workflow/summary-final': 'plugin:grok-workflow/progress/summary-final',
      'tool-workflow/summary-rejected': 'plugin:grok-workflow/progress/summary-rejected',
      'tool-workflow/guardian-start': 'plugin:grok-workflow/progress/guardian-start',
      'tool-workflow/guardian-finding': 'plugin:grok-workflow/progress/guardian-finding',
      'tool-workflow/guardian-end': 'plugin:grok-workflow/progress/guardian-end',
    }
    function normalizeProgressRecordType(type) {
      return Object.prototype.hasOwnProperty.call(PROGRESS_RECORD_RENAMES, type) ? PROGRESS_RECORD_RENAMES[type] : type
    }

    const PROGRESS_SUMMARY_DRAFTS = {
      zh: { draft: '汇总·第{n}稿', final: '（定稿）' },
      en: { draft: 'Summarize · draft {n}', final: ' (final)' },
    }

    /** One numbered draft name, with or without the shipped-draft mark. */
    function progressSummaryDraftName(draft, language, final) {
      const copy = PROGRESS_SUMMARY_DRAFTS[language]
      return copy.draft.replace('{n}', String(draft)) + (final ? copy.final : '')
    }

    /**
     * Mark the row of the summary draft the run shipped, in place.
     *
     * That draft can have two rows — the first call and its same-draft resubmit — and
     * only the later one landed, so only the row with the highest `order` is marked.
     * A duplicate event, an event that arrives before its rows and a stream with no
     * event at all all render what they rendered before.
     */
    function progressMarkFinalDraft(members, draft) {
      for (const language of ['zh', 'en']) {
        const name = progressSummaryDraftName(draft, language, false)
        let landed
        for (const member of members) {
          if (member.label !== name) continue
          if (landed === undefined || member.order > landed.order) landed = member
        }
        if (landed === undefined) continue
        landed.label = progressSummaryDraftName(draft, language, true)
        return
      }
    }

    /** The seven fields an AGENTS.md coordination block reports, in render order. */
    const PROGRESS_DETAIL_FIELDS = ['workCommit', 'changes', 'testsRun', 'results', 'localRuntimeVerified', 'blockers', 'nextAction']

    /**
     * Every spelling of one field, folded to its canonical key.
     *
     * `AGENTS.md` labels the facts `WORK_COMMIT` / `CHANGES` / `TESTS_RUN` /
     * `TEST_RESULTS` / `LOCAL_RUNTIME_VERIFIED` / `BLOCKERS` / `NEXT_ACTION`; a JSON
     * block writes them in camelCase. Both spell the same seven facts, so a reader sees
     * one row per fact.
     */
    const PROGRESS_DETAIL_ALIASES = {
      workcommit: 'workCommit',
      changes: 'changes',
      change: 'changes',
      testsrun: 'testsRun',
      tests: 'testsRun',
      results: 'results',
      result: 'results',
      testresults: 'results',
      localruntimeverified: 'localRuntimeVerified',
      blockers: 'blockers',
      blocker: 'blockers',
      nextaction: 'nextAction',
      next: 'nextAction',
    }

    /** Fold one written field name (`WORK_COMMIT`, `workCommit`, `next_action`) to its key. */
    function progressDetailField(name) {
      if (typeof name !== 'string') return undefined
      return PROGRESS_DETAIL_ALIASES[name.toLowerCase().replace(/[^a-z0-9]/g, '')]
    }

    /**
     * The five words a run is described by, one per chip state (§19.2).
     *
     * The chip reads the run's own facts, never the size of a plan: `waiting` is an open
     * run that declared nothing yet, `running` is an open run that did, and the three
     * closed states are the engine's `stopReason` — `completed` already means "every task
     * was checked", so `done` claims no more than that.
     */
    const PROGRESS_CHIP_KEY = {
      waiting: 'progress.chip.waiting',
      running: 'progress.chip.running',
      done: 'progress.chip.done',
      failed: 'progress.chip.failed',
      cancelled: 'progress.chip.cancelled',
    }

    /**
     * The word under one step of the list, per step state.
     *
     * `blocked` is a step the run ended over without settling: it did not pass, so it
     * borrows `没过` rather than the grey "still waiting" word that would claim the page is
     * still working on it.
     */
    const PROGRESS_PLAN_KEY = {
      pending: 'progress.plan.waiting',
      doing: 'progress.plan.running',
      done: 'progress.plan.done',
      failed: 'progress.plan.failed',
      blocked: 'progress.plan.failed',
      cancelled: 'progress.plan.cancelled',
    }

    /** The word of one history line, when its own state decides it. */
    const PROGRESS_LOG_STATE_KEY = {
      pending: 'progress.log.running',
      doing: 'progress.log.running',
      done: 'progress.log.done',
      failed: 'progress.log.failed',
      blocked: 'progress.log.failed',
      cancelled: 'progress.log.cancelled',
    }

    /**
     * The word of a finished line, when the role that spoke it decides it.
     *
     * A finished `执行` did the work, a finished `检查` passed it and a finished `复核`
     * approved it: three different verbs, so one `done` word would flatten the log into a
     * column of identical sentences.
     */
    const PROGRESS_LOG_ROLE_KEY = {
      execute: 'progress.log.done',
      check: 'progress.log.passed',
      review: 'progress.log.reviewed',
    }

    /** One empty track, shared so a session with no run keeps one snapshot identity. */
    const EMPTY_PROGRESS_SNAPSHOT = { runs: [], activeRun: undefined }

    /** Narrow an unknown value to a plain record. */
    function progressRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined
    }

    /** Normalize one detail value to display text; empty values count as not reported. */
    function progressFieldText(value) {
      if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed === '' ? undefined : trimmed
      }
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
      if (typeof value === 'boolean') return value ? 'true' : 'false'
      if (Array.isArray(value)) {
        const parts = value.map(progressFieldText).filter((part) => part !== undefined)
        return parts.length === 0 ? undefined : parts.join(' · ')
      }
      return undefined
    }

    /** Read the known detail fields out of one record, canonicalizing the names first. */
    function progressPickFields(source) {
      const fields = {}
      for (const name of Object.keys(source)) {
        const key = progressDetailField(name)
        if (key === undefined || fields[key] !== undefined) continue
        const text = progressFieldText(source[name])
        if (text !== undefined) fields[key] = text
      }
      return fields
    }

    /**
     * Fold recorded events into runs (mirror of `foldProgressRuns` in `src/progress-tab.ts`).
     *
     * Two passes so the fold is order-insensitive: every `run-start` announces a run
     * first, then every other event is applied. Idempotent per event, and an `agent-end`
     * that arrives before its own `agent-start` still settles that row once the start
     * appears. A settlement for a row nobody declared, or an event for a run nobody
     * announced, is dropped: a row means a child call that started.
     */
    function foldProgressEvents(records) {
      const drafts = new Map()
      let index = 0
      for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
        index += 1
        if (normalizeProgressRecordType(record.type) !== 'plugin:grok-workflow/progress/run-start') continue
        const data = progressRecord(record.data) || {}
        const runId = typeof data.runId === 'string' ? data.runId : undefined
        if (runId === undefined || drafts.has(runId)) continue
        drafts.set(runId, {
          runId,
          name: typeof data.name === 'string' ? data.name : '',
          anchorSeq: seq,
          members: [],
          settlements: new Map(),
          details: [],
          startedAt: record.time,
        })
      }
      index = 0
      for (const record of records) {
        const seq = typeof record.seq === 'number' && Number.isFinite(record.seq) ? record.seq : index
        index += 1
        const type = normalizeProgressRecordType(record.type)
        const data = progressRecord(record.data) || {}
        const runId = typeof data.runId === 'string' ? data.runId : undefined
        const isDetail = type === PROGRESS_DETAIL_EVENT_TYPE
        const isSummaryFinal = type === PROGRESS_SUMMARY_FINAL_EVENT_TYPE || type === PROGRESS_SUMMARY_FINAL_EVENT_TYPE_LEGACY
        const isSummaryRejected = type === PROGRESS_SUMMARY_REJECTED_EVENT_TYPE || type === PROGRESS_SUMMARY_REJECTED_EVENT_TYPE_LEGACY
        if (runId === undefined || (!isDetail && !isSummaryFinal && !isSummaryRejected && PROGRESS_EVENT_TYPES.indexOf(type) === -1)) continue
        const draft = drafts.get(runId)
        if (draft === undefined) continue
        if (seq < draft.anchorSeq) draft.anchorSeq = seq
        if (isDetail) {
          const fields = progressPickFields(data)
          const coordinationText = typeof data.coordination === 'string' ? data.coordination : undefined
          // An empty payload is not a report: it would claim the stage was measured and
          // found blank.
          if (Object.keys(fields).length === 0 && coordinationText === undefined) continue
          draft.details.push({
            phase: typeof data.phase === 'string' ? data.phase : undefined,
            fields,
            coordinationText,
          })
          continue
        }
        if (isSummaryFinal) {
          // First valid claim wins: a duplicate is a no-op, and a later claim cannot
          // move the mark off the draft that actually shipped.
          const draftNumber = Number(data.draft)
          if (!Number.isFinite(draftNumber) || Math.trunc(draftNumber) < 1) continue
          if (draft.summaryFinalDraft === undefined) draft.summaryFinalDraft = Math.trunc(draftNumber)
          continue
        }
        if (isSummaryRejected) {
          // The same duplicate rule as `summary-final`, and the same refusal to read a
          // half-fact: a count below one, a stage that is neither word, or no reason at
          // all is dropped rather than rendered as "rejected, for some reason".
          const rejectedDrafts = Number(data.drafts)
          if (!Number.isFinite(rejectedDrafts) || Math.trunc(rejectedDrafts) < 1) continue
          if (data.stage !== 'check' && data.stage !== 'verify') continue
          const rejectedReason = typeof data.reason === 'string' ? data.reason.trim() : ''
          if (rejectedReason === '') continue
          if (draft.summaryRejected === undefined) {
            draft.summaryRejected = { drafts: Math.trunc(rejectedDrafts), stage: data.stage, reason: rejectedReason }
          }
          continue
        }
        if (type === 'plugin:grok-workflow/progress/guardian-start') {
          const previous = draft.guardian
          const budget = Number(data.budgetMs)
          draft.guardian = {
            started: true,
            armed: data.armed === true,
            budgetMs: Number.isFinite(budget) && budget > 0 ? Math.trunc(budget) : 0,
            ended: previous === undefined ? false : previous.ended,
            cancelled: previous === undefined ? false : previous.cancelled,
            findings: previous === undefined ? [] : previous.findings,
          }
          continue
        }
        if (type === 'plugin:grok-workflow/progress/guardian-finding') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          const guardian = draft.guardian || {
            started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
          }
          guardian.findings.push({
            seq: memberSeq,
            label: typeof data.label === 'string' ? data.label : '',
            signal: data.signal === 'heartbeat-loss' ? 'heartbeat-loss' : 'timeout',
            action: data.action === 'rescue' ? 'rescue' : data.action === 'cancel-run' ? 'cancel-run' : 'observe',
            reason: typeof data.reason === 'string' ? data.reason : '',
            atMs: Number.isFinite(data.atMs) ? data.atMs : undefined,
          })
          draft.guardian = guardian
          continue
        }
        if (type === 'plugin:grok-workflow/progress/guardian-end') {
          const previous = draft.guardian || {
            started: false, armed: false, budgetMs: 0, ended: false, cancelled: false, findings: [],
          }
          draft.guardian = { ...previous, ended: true, cancelled: data.cancelled === true }
          continue
        }
        if (type === 'plugin:grok-workflow/progress/agent-start') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          if (draft.members.some((member) => member.seq === memberSeq)) continue
          draft.members.push({
            seq: memberSeq,
            label: typeof data.label === 'string' ? data.label : '',
            phase: typeof data.phase === 'string' ? data.phase : undefined,
            childId: typeof data.childId === 'string' ? data.childId : '',
            order: draft.members.length,
            startedAt: record.time,
          })
          continue
        }
        if (type === 'plugin:grok-workflow/progress/agent-end') {
          const memberSeq = Number(data.seq)
          if (!Number.isFinite(memberSeq)) continue
          // Last settlement wins; repeating one event cannot change it twice.
          draft.settlements.set(memberSeq, typeof data.outcome === 'string' ? data.outcome : 'failed')
          const member = draft.members.find((candidate) => candidate.seq === memberSeq)
          if (member !== undefined) member.endedAt = record.time
          continue
        }
        if (type !== 'plugin:grok-workflow/progress/run-end') continue
        if (draft.stopReason === undefined) {
          draft.stopReason = typeof data.stopReason === 'string' ? data.stopReason : 'error'
          draft.endedAt = record.time
        }
      }
      const runs = []
      for (const draft of drafts.values()) {
        for (const member of draft.members) {
          if (member.outcome === undefined && draft.settlements.has(member.seq)) member.outcome = draft.settlements.get(member.seq)
        }
        if (draft.summaryFinalDraft !== undefined) progressMarkFinalDraft(draft.members, draft.summaryFinalDraft)
        runs.push({
          runId: draft.runId,
          name: draft.name,
          anchorSeq: draft.anchorSeq,
          members: draft.members,
          details: draft.details,
          guardian: draft.guardian,
          startedAt: draft.startedAt,
          endedAt: draft.endedAt,
          stopReason: draft.stopReason,
          summaryFinalDraft: draft.summaryFinalDraft,
          summaryRejected: draft.summaryRejected,
        })
      }
      return runs.sort((left, right) => left.anchorSeq - right.anchorSeq)
    }

    /**
     * The active run: the newest announced one, preferring a still-open run on a tie.
     * @param runs - folded runs.
     * @returns the run to render, or `undefined` when the session has none.
     */
    function selectActiveRun(runs) {
      let best
      for (const run of runs) {
        if (best === undefined) { best = run; continue }
        if (run.anchorSeq > best.anchorSeq) { best = run; continue }
        if (run.anchorSeq === best.anchorSeq && best.stopReason !== undefined && run.stopReason === undefined) best = run
      }
      return best
    }

    /**
     * The label a retry adds, taken back off: `<role>（尝试 2）` / `<role> (attempt 2)` → `<role>`.
     *
     * `naming.ts` `memberLabel` appends the attempt suffix and nothing else, so dropping a
     * trailing bracketed run that carries a digit folds the attempts of one call onto one
     * lane without re-parsing roles here.
     */
    function progressAttemptBaseLabel(label) {
      const text = typeof label === 'string' ? label.trim() : ''
      const match = /^(.*?)\s*[（(][^（()）]*\d[^（()）]*[)）]$/u.exec(text)
      if (match === null) return text
      return (match[1] || '').trim()
    }

    /**
     * The unit one row belongs to: one task's one role call, across its attempts.
     *
     * Same phase and same role lane is the same unit — that is what a retry keeps
     * (`任务 2 · 标题` + `执行` on every attempt), and two tasks differ by their phase, so
     * one task's completion can never mark another task's failure recovered.
     */
    function progressAttemptUnit(member) {
      const phase = member.phase === undefined ? '' : member.phase
      return `${phase}\u0000${progressAttemptBaseLabel(member.label)}`
    }

    /**
     * The rows whose failure a later attempt of the same unit has already replaced.
     *
     * Red means "still broken now", so a failure is current only while nothing later in
     * its own unit settled `completed`. A later attempt still running has not recovered
     * it, and a completion in another unit does not touch it. The row keeps its own mark.
     * @param members - rows aggregated by one node.
     * @returns the `seq` of every recovered failure row.
     */
    function progressRecoveredFailures(members) {
      const recovered = new Set()
      for (const member of members) {
        if (member.outcome !== 'failed') continue
        const unit = progressAttemptUnit(member)
        for (const later of members) {
          if (later.order <= member.order) continue
          if (later.outcome !== 'completed') continue
          if (progressAttemptUnit(later) !== unit) continue
          recovered.add(member.seq)
          break
        }
      }
      return recovered
    }

    /**
     * How many of a node's rows are failing now — recovered history excluded.
     * @param members - rows aggregated by one node.
     * @returns the number of unrecovered failed rows.
     */
    function progressCurrentFailureCount(members) {
      const recovered = progressRecoveredFailures(members)
      let count = 0
      for (const member of members) {
        if (member.outcome === 'failed' && !recovered.has(member.seq)) count += 1
      }
      return count
    }

    /**
     * State of one stage, in the fixed precedence
     * `failed` → `doing` → `done` → `blocked` → `cancelled` → `pending`.
     *
     * `failed` is a *current* failure: a row whose failure a later attempt of the same
     * unit replaced no longer colours the aggregate, because red has to mean "still
     * broken now". The row keeps its own red mark; only the aggregate clears.
     *
     * `blocked` is derived (a run that ended over a row it never settled, or an outcome
     * that is neither a completion nor a cancellation) and the tooltip names the evidence;
     * `cancelled` is the engine's own word, never derived from an absence.
     */
    function progressNodeState(members, ended) {
      const recovered = progressRecoveredFailures(members)
      const current = recovered.size === 0 ? members : members.filter((member) => !recovered.has(member.seq))
      const settled = current.filter((member) => member.outcome !== undefined)
      const unsettled = current.length - settled.length
      if (settled.some((member) => member.outcome === 'failed')) return 'failed'
      if (!ended && unsettled > 0) return 'doing'
      if (settled.length > 0 && settled.length === current.length && settled.every((member) => member.outcome === 'completed')) return 'done'
      if (ended && unsettled > 0) return 'blocked'
      if (settled.some((member) => member.outcome === 'cancelled')) return 'cancelled'
      if (settled.some((member) => member.outcome !== 'completed' && member.outcome !== 'cancelled')) return 'blocked'
      return 'pending'
    }

    /** Why a `blocked` stage reads blocked, so its tooltip can name the evidence. */
    function progressBlockedReason(members, ended) {
      const unsettled = members.length - members.filter((member) => member.outcome !== undefined).length
      return ended && unsettled > 0 ? 'runEndedUnsettled' : 'outcomeUnsettled'
    }

    /** Rows settled over rows declared; absent when nothing was declared. */
    function progressPercent(members) {
      const declared = members.length
      if (declared === 0) return undefined
      const settled = members.filter((member) => member.outcome !== undefined).length
      return { settled, declared, value: Math.round((settled / declared) * 100) }
    }

    /** Whether one character can continue a Latin word (so a token boundary is not here). */
    function progressWordChar(character) {
      return character !== '' && /[a-z0-9_]/i.test(character)
    }

    /**
     * Whether one phase header carries one stage token.
     *
     * A CJK-only token matches anywhere (`规划` in `任务 1 · 规划`); a token with Latin
     * letters must sit on word boundaries, because a loose test reads `ui` inside
     * `build`, `tag` inside `stage`/`target` and `sync` inside `async`.
     */
    function progressPhaseCarriesToken(haystack, token) {
      const needle = token.toLowerCase()
      if (needle === '') return false
      if (!/[a-z0-9]/i.test(needle)) return haystack.indexOf(needle) !== -1
      let from = 0
      for (;;) {
        const at = haystack.indexOf(needle, from)
        if (at === -1) return false
        const before = at === 0 ? '' : haystack.slice(at - 1, at)
        const after = haystack.slice(at + needle.length, at + needle.length + 1)
        if (!progressWordChar(before) && !progressWordChar(after)) return true
        from = at + 1
      }
    }

    /** The first spine stage whose token the phase header carries.
     *
     * Numbered plan tasks (`任务 7 · 标题`) always win over stage tokens: a title
     * that mentions a stage word (`任务 7 · 合并为干净可并发执行计划`) names a plan
     * task, not the `执行` stage. Without this, the extra task lands as a stage
     * row under `规划`. Mirror of `stageForPhase` in `src/progress-tab.ts`.
     */
    function progressStageForPhase(phase) {
      if (progressTaskNumber(phase) !== undefined) return undefined
      const haystack = phase.toLowerCase()
      for (const stage of PROGRESS_STAGES) {
        if (stage.edge) continue
        for (const token of stage.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return stage
        }
      }
      return undefined
    }

    /**
     * Role labels that name a work stage when the phase header does not.
     *
     * A recorded `agent-start` carries the plan-task group title (`任务 1 · 标题`) as the
     * phase of the worker and verifier calls that run inside a task, so matching rows by
     * phase alone left `执行` and `检查` empty and "not reported". These words are role
     * names from `naming.ts`, matched only against a row's label: a task titled
     * `check the build` must not become `检查` because of its own title.
     */
    const PROGRESS_STAGE_ROLE_LABELS = {
      plan: ['规划助手', '规划', 'planner'],
      execute: ['执行', 'execute', 'worker'],
      verify: ['检查', '核验', 'verify', 'check', 'verifier'],
      synthesize: ['汇总助手', '汇总', 'summarize', 'synthesizer'],
    }

    /** The first spine stage whose role label names it, if a label names one. */
    function progressStageForRoleLabel(label) {
      const haystack = label.toLowerCase()
      for (const stage of PROGRESS_STAGES) {
        const labels = PROGRESS_STAGE_ROLE_LABELS[stage.key]
        if (labels === undefined) continue
        for (const token of labels) {
          if (progressPhaseCarriesToken(haystack, token)) return stage
        }
      }
      return undefined
    }

    /** The first chain capsule whose role label names it, if a label names one. */
    function progressChainForLabel(label) {
      const haystack = label.toLowerCase()
      for (const slot of PROGRESS_CHAIN) {
        for (const token of slot.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return slot
        }
      }
      return undefined
    }

    /**
     * The fixed chain of one task card (mirror of `chainOf` in `src/progress-tab.ts`).
     *
     * Three capsules, always all three: an unreached one is part of the answer
     * (`reached: false`, `pending`), never a gap. A row whose label names no capsule stays
     * in the card's `members` and renders after the chain, so no declared row is dropped.
     * @param members - the card's rows, in plan order.
     * @param ended - whether `run-end` was seen, which turns an unsettled capsule into `blocked`.
     * @returns one slot per chain step.
     */
    function progressChainOf(members, ended) {
      const bySlot = new Map()
      for (const member of members) {
        const slot = progressChainForLabel(member.label === undefined ? '' : member.label)
        if (slot === undefined) continue
        const list = bySlot.get(slot.key)
        if (list === undefined) bySlot.set(slot.key, [member])
        else list.push(member)
      }
      return PROGRESS_CHAIN.map((slot) => {
        const rows = bySlot.get(slot.key) === undefined ? [] : bySlot.get(slot.key)
        return {
          key: slot.key,
          members: rows,
          state: rows.length === 0 ? 'pending' : progressNodeState(rows, ended),
          reached: rows.length > 0,
        }
      })
    }

    /**
     * The plan-task position a phase header names (`任务 3 · 标题` → 3, `Task 10 · x` → 10).
     *
     * The number the engine puts in `taskGroupTitle`, read back as a number so `任务 10`
     * sorts after `任务 2` instead of before it.
     * @param phase - the recorded phase header.
     * @returns the position, or undefined when the header names none.
     */
    function progressTaskNumber(phase) {
      if (typeof phase !== 'string') return undefined
      const match = /^\s*(?:任务|task)\s*(\d+)/iu.exec(phase)
      if (match === null) return undefined
      const value = Number(match[1])
      return Number.isInteger(value) && value > 0 ? value : undefined
    }

    /**
     * Whether a recorded phase (or label) names the guardian adjudication call.
     *
     * Anchored on purpose: the guardian card's phase is exactly `Guardian`, while a plan
     * task that merely mentions the guardian in its title (`任务 1 · Guardian 判停`) is
     * still a plan task.
     * @param text - a phase header or a row label.
     * @returns whether this is the guardian card.
     */
    function progressIsGuardianCard(text) {
      if (typeof text !== 'string') return false
      return /^(?:guardian|守卫)/iu.test(text.trim())
    }

    /**
     * Order the task band (mirror of `orderTaskCards` in `src/progress-tab.ts`).
     *
     * 1. numbered cards sort by number, refilling only the slots numbered cards hold;
     * 2. the guardian card sits after the numbered cards;
     * 3. an unnumbered card keeps the position it arrived in.
     * @param cards - the band's cards, in arrival order.
     * @returns the cards in render order.
     */
    function orderProgressTaskCards(cards) {
      const ordered = cards.slice()
      const numbered = ordered
        .map((card, index) => ({ card, index, number: progressTaskNumber(card.phase) }))
        .filter((entry) => entry.number !== undefined)
      numbered.sort((left, right) => left.number - right.number || left.index - right.index)
      numbered.forEach((entry, position) => { ordered[entry.index] = numbered[position].card })
      const guardianAt = ordered.findIndex((card) => progressIsGuardianCard(card.phase))
      const lastNumbered = ordered.reduce((last, card, index) => (progressTaskNumber(card.phase) === undefined ? last : index), -1)
      if (guardianAt !== -1 && lastNumbered !== -1 && guardianAt < lastNumbered) {
        const guardian = ordered.splice(guardianAt, 1)[0]
        if (guardian !== undefined) ordered.splice(lastNumbered, 0, guardian)
      }
      return ordered
    }

    /**
     * Derive the track one run renders (mirror of `deriveTrack` in `src/progress-tab.ts`).
     * @param run - folded run facts, or `undefined`.
     * @param labelFor - copy resolver for the spine's stage labels.
     * @returns the track model, or `undefined` when there is no run.
     */
    function deriveProgressTrack(run, labelFor) {
      if (run === undefined) return undefined
      const ended = run.stopReason !== undefined
      const byStage = new Map()
      const byStagePhases = new Map()
      const evidenceByStage = new Map()
      const extras = []
      const unphased = []
      for (const member of run.members) {
        const phase = member.phase
        if (phase === undefined) { unphased.push(member); continue }
        const stage = progressStageForPhase(phase)
        if (stage === undefined) {
          const existing = extras.find((entry) => entry.phase === phase)
          if (existing === undefined) extras.push({ phase, members: [member] })
          else existing.members.push(member)
          // The row keeps its plan-task node above; this only cross-references it onto
          // the stage whose role ran it, so `执行`/`检查` report what happened.
          const roleStage = progressStageForRoleLabel(member.label === undefined ? '' : member.label)
          if (roleStage !== undefined) {
            const evidence = evidenceByStage.get(roleStage.key)
            if (evidence === undefined) evidenceByStage.set(roleStage.key, [member])
            else evidence.push(member)
          }
          continue
        }
        const list = byStage.get(stage.key)
        if (list === undefined) {
          byStage.set(stage.key, [member])
          byStagePhases.set(stage.key, [phase])
        } else {
          list.push(member)
          const phases = byStagePhases.get(stage.key)
          if (phases.indexOf(phase) === -1) phases.push(phase)
        }
      }
      /** The two ends report the run's own facts, not a member's. */
      const edgeState = (stageKey) => {
        if (stageKey === 'start') return 'done'
        if (!ended) return 'doing'
        if (run.stopReason === 'cancelled') return 'cancelled'
        if (run.stopReason === 'completed') return 'done'
        return 'failed'
      }
      /** Level-1 payloads by the phase they name; a phase-less one is the run's fallback. */
      const detailByPhase = new Map()
      let runDetail
      for (const detail of Array.isArray(run.details) ? run.details : []) {
        if (detail === undefined || detail === null) continue
        if (detail.phase === undefined) { runDetail = detail; continue }
        if (!detailByPhase.has(detail.phase)) detailByPhase.set(detail.phase, detail)
      }
      const detailOf = (phases) => {
        for (const phase of phases) {
          const detail = detailByPhase.get(phase)
          if (detail !== undefined) return detail
        }
        return undefined
      }
      const node = (stage, key, kind, members, phases, label, evidence) => {
        // A stage's own rows are authoritative; its evidence speaks only when it has none.
        const rows = members.length > 0 ? members : (evidence === undefined ? [] : evidence)
        const state = stage !== undefined && stage.edge ? edgeState(stage.key) : progressNodeState(rows, ended)
        const reason = state === 'blocked' ? progressBlockedReason(rows, ended) : undefined
        return {
          key,
          kind,
          label: label !== undefined ? label : (stage === undefined ? key : labelFor(stage.key)),
          state,
          members,
          evidence: evidence === undefined ? [] : evidence,
          phases,
          derived: state === 'blocked',
          reason,
          stageDetail: detailOf(phases),
        }
      }
      /** One task-band card: a plan task, or the guardian call, with its own fixed chain. */
      const cardNode = (card) => {
        const phases = card.phase === '' ? [] : [card.phase]
        const base = node(undefined, `phase:${card.phase}`, 'extra', card.members, phases, card.phase)
        if (progressIsGuardianCard(card.phase)) return { ...base, guardian: true }
        const taskNumber = progressTaskNumber(card.phase)
        return {
          ...base,
          ...taskNumber === undefined ? {} : { taskNumber },
          chain: progressChainOf(card.members, ended),
        }
      }
      const nodes = []
      for (const stage of PROGRESS_STAGES) {
        nodes.push(node(stage, `stage:${stage.key}`, stage.edge ? 'edge' : 'stage', byStage.get(stage.key) || [], byStagePhases.get(stage.key) || [], undefined, evidenceByStage.get(stage.key) || []))
        // Extra phases are real plan tasks (`任务 n · 标题`) announced while the engine
        // executes the plan, so they sit between `执行` and `检查` — the template's work
        // slot. A row that declared no phase still gets a node, so the track and the
        // percentage never count different rows. Numbered tasks sort by number, then the
        // guardian card, then whatever named no number where it arrived.
        if (stage.key === 'execute') {
          const band = extras.slice()
          if (unphased.length > 0) band.push({ phase: '', members: unphased })
          for (const card of orderProgressTaskCards(band)) nodes.push(cardNode(card))
        }
      }
      return {
        runId: run.runId,
        name: run.name,
        ended,
        stopReason: run.stopReason,
        nodes,
        percent: progressPercent(run.members),
        stageDetail: runDetail,
      }
    }

    /**
     * The 1-based attempt a label names (`执行（尝试 2）` → 2), and 1 when it names none.
     *
     * Mirror of `attemptNumberOf` in `src/progress-tab.ts`: one trailing bracketed word
     * that carries a number is the attempt suffix `naming.ts` appends, and nothing else.
     */
    function progressAttemptNumber(label) {
      const text = typeof label === 'string' ? label.trim() : ''
      const match = /[（(][^（()）]*?(\d+)[^（()）]*[)）]$/u.exec(text)
      if (match === null) return 1
      const value = Number(match[1])
      return Number.isInteger(value) && value > 0 ? value : 1
    }

    /**
     * A label with its shipped-draft mark taken off.
     *
     * The mark says what the *row* is (the draft the gate shipped), not what role spoke, so
     * it must not end up in the role column beside the `交卷` word that already says it.
     */
    function progressWithoutFinalMark(text) {
      for (const language of ['zh', 'en']) {
        const mark = PROGRESS_SUMMARY_DRAFTS[language].final
        for (const suffix of [mark, mark.trim()]) {
          if (suffix === '' || text.slice(-suffix.length) !== suffix) continue
          return text.slice(0, text.length - suffix.length).trim()
        }
      }
      return text
    }

    /** The role a log line is spoken as: `执行（尝试 2）` → `执行`, `汇总·第2稿（定稿）` → `汇总·第2稿`. */
    function progressStoryRole(member) {
      return progressWithoutFinalMark(progressAttemptBaseLabel(member.label))
    }

    /**
     * The state of one declared call (mirror of `rowState`).
     *
     * A row is the smallest thing the stream settles, so its state is its own outcome and
     * nothing else: an unsettled row is `doing`, and an outcome that is neither a
     * completion, a cancellation nor a failure stays `blocked` rather than being renamed.
     */
    function progressRowState(member) {
      if (member.outcome === undefined) return 'doing'
      if (member.outcome === 'completed') return 'done'
      if (member.outcome === 'cancelled') return 'cancelled'
      if (member.outcome === 'failed') return 'failed'
      return 'blocked'
    }

    /**
     * One declared call, as the page's own history line.
     *
     * The history and a task row's opened detail read the same declaration, so both take
     * their line from here: a second mapping would let the detail describe a call
     * differently from the log it expands.
     * @param member - one declared call of the run.
     * @param shipped - the row `summary-final` named, when the stream named one.
     * @returns the story's log row for that call.
     */
    function progressStoryLogRow(member, shipped) {
      return {
        seq: member.seq,
        ...member.startedAt === undefined ? {} : { at: member.startedAt },
        role: progressStoryRole(member),
        title: member.phase === undefined ? '' : member.phase,
        state: progressRowState(member),
        ...member === shipped ? { shipped: true } : {},
      }
    }

    /**
     * The row `summary-final` names, read back off the rows the fold already marked.
     *
     * The fold writes the mark onto the row that landed (the highest `order` of that draft
     * name, in whichever language the label was written), so matching the marked name is
     * the same fact rather than a second guess at it. A stream whose rows were never
     * marked — the bare draft name is all it carries — still names its row here.
     */
    function progressShippedRow(members, draft) {
      const latestNamed = (name) => {
        let named
        for (const member of members) {
          if (member.label !== name) continue
          if (named === undefined || member.order > named.order) named = member
        }
        return named
      }
      for (const language of ['zh', 'en']) {
        const marked = latestNamed(progressSummaryDraftName(draft, language, true))
        if (marked !== undefined) return marked
      }
      for (const language of ['zh', 'en']) {
        const bare = latestNamed(progressSummaryDraftName(draft, language, false))
        if (bare !== undefined) return bare
      }
      return undefined
    }

    /**
     * The five legs a call can speak as, in the order they are tried (contract §3).
     *
     * The table is `FLOW_LEG_TOKENS` in `src/progress-tab.ts`, word for word and in the same
     * order, because the two halves are compared through fixtures and not through an import:
     * `execute` → `check` → `review` keeps `PROGRESS_CHAIN`'s own precedence (a word both
     * `check` and `review` could claim lands on the gate it belongs to), the longer word comes
     * first inside a kind so `规划助手` reads as the planner before `规划` is tried, and the
     * bare `plan` is what an English boundary call is called — matched on a word boundary, so
     * it never reads the `plan` inside `planner`.
     */
    const PROGRESS_FLOW_LEGS = [
      { kind: 'plan', tokens: ['规划助手', '规划', 'planner', 'plan'] },
      { kind: 'execute', tokens: ['执行', 'execute', 'worker'] },
      { kind: 'check', tokens: ['检查', '核验', 'check', 'verifier', 'verify'] },
      { kind: 'review', tokens: ['复核', 'review', 'supervisor', 'reviewer'] },
      { kind: 'summarize', tokens: ['汇总助手', '汇总', 'summarize', 'synthesizer'] },
    ]

    /** The word each leg (and each end) is called by on the page. */
    const PROGRESS_FLOW_WORD_KEY = {
      start: 'progress.flow.start',
      plan: 'progress.flow.plan',
      execute: 'progress.flow.execute',
      check: 'progress.flow.check',
      review: 'progress.flow.review',
      summarize: 'progress.flow.summarize',
      end: 'progress.flow.end',
    }

    /**
     * The leg one call speaks as, read off its own **label**.
     *
     * Never off its phase: a phase names the task the call ran inside, so two different legs
     * of one task share a phase. The label is the role word `naming.ts` writes, and it is the
     * only field that says which leg ran.
     * @param label - the call's recorded label.
     * @returns the leg's kind, or `undefined` when the label names none.
     */
    function progressFlowLegOf(label) {
      if (typeof label !== 'string' || label === '') return undefined
      const haystack = label.toLowerCase()
      for (const leg of PROGRESS_FLOW_LEGS) {
        for (const token of leg.tokens) {
          if (progressPhaseCarriesToken(haystack, token)) return leg.kind
        }
      }
      return undefined
    }

    /**
     * The first whole number a label carries: that visit's own number.
     *
     * `规划（第2次）` → 2, `汇总·第2稿` → 2, `执行（尝试 2）` → 2, `执行` → none. A zero is not a
     * visit, so it reads as none and the node falls back to the visit already open.
     * @param label - the call's recorded label.
     * @returns the number, or `undefined` when the label carries none.
     */
    function progressFlowNumber(label) {
      if (typeof label !== 'string') return undefined
      const match = /\d+/u.exec(label)
      if (match === null) return undefined
      const value = Number(match[0])
      return Number.isInteger(value) && value > 0 ? value : undefined
    }

    /**
     * Derive one run's flowchart (mirror of `deriveProgressFlow` in `src/progress-tab.ts`).
     *
     * The page is a walk: a start, one node per leg in the order the calls were declared, and
     * an end. A leg's calls gather under one node until another leg — or the same leg with a
     * different visit number — takes over, so a retry shows as the second node of its leg
     * instead of folding back into the attempt that failed. The guardian's own call is not a
     * leg of the work (its panel is the whole answer), and a call that names no leg stays
     * inside the node the run has already reached rather than vanishing from the page.
     *
     * `at` is the one node the page highlights: the node holding the open call the page is
     * waiting on, else the end once everything settled, else the first broken node of a run
     * that ended broken. A run with nothing declared highlights its start, because the end is
     * a place it has not reached.
     *
     * The field names are the typed half's, verbatim (§2): the host serves this file, so the
     * two copies cannot import each other and `test/client.spec.ts` compares them through the
     * same fixtures.
     * @param run - folded run facts.
     * @returns the flow model.
     */
    function deriveProgressFlow(run) {
      const ended = run.stopReason !== undefined
      const state = !ended
        ? (run.members.length === 0 ? 'waiting' : 'running')
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const start = { key: 'flow:start', kind: 'start', ordinal: 0, state: 'done', members: [] }
      const middle = []
      for (const member of [...run.members].sort((left, right) => left.seq - right.seq)) {
        // The guardian's own call has its own panel: it is not a leg of the work.
        if (progressIsGuardianCard(typeof member.label === 'string' ? member.label : '')) continue
        const kind = progressFlowLegOf(member.label)
        if (kind === undefined) {
          // A declared call that names no leg keeps its place: it belongs to the node the run
          // has already reached, and before any leg exists that node is the start.
          const target = middle.length === 0 ? start : middle[middle.length - 1]
          target.members.push(member)
          continue
        }
        const number = progressFlowNumber(member.label)
        const previous = middle.length === 0 ? undefined : middle[middle.length - 1]
        if (previous !== undefined && previous.kind === kind && (number === undefined || number === previous.ordinal)) {
          previous.members.push(member)
          continue
        }
        const ordinal = number === undefined
          ? (previous !== undefined && previous.kind === kind ? previous.ordinal : 1)
          : number
        middle.push({ key: `flow:${middle.length}:${kind}:${ordinal}`, kind, ordinal, members: [member] })
      }
      const endState = run.stopReason === undefined
        ? 'pending'
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const nodes = [start, ...middle, { key: 'flow:end', kind: 'end', ordinal: 0, state: endState, members: [] }]
      // The parent's colour is read off the whole group *before* the split below, so that
      // handing its numbered rows to task cells cannot change what the leg says about
      // itself: one leg, one state, whatever it walked.
      for (const node of middle) node.state = progressNodeState(node.members, ended)
      // A work leg's rows name the plan task they ran for (`任务 3 · 标题`): those rows hang
      // under the leg as one cell per task, in task order, and the leg keeps only the rows
      // that name no task. A leg whose rows name none keeps exactly the shape it had — no
      // field, not an empty list — because "no plan tasks here" is said by the absence.
      for (const node of middle) {
        if (node.kind !== 'execute' && node.kind !== 'check' && node.kind !== 'review') continue
        const buckets = new Map()
        const loose = []
        for (const member of node.members) {
          const number = progressTaskNumber(member.phase)
          if (number === undefined) { loose.push(member); continue }
          const rows = buckets.get(number)
          if (rows === undefined) buckets.set(number, [member])
          else rows.push(member)
        }
        if (buckets.size === 0) continue
        node.subs = [...buckets.keys()].sort((left, right) => left - right).map((number) => {
          const rows = [...buckets.get(number)].sort((left, right) => left.seq - right.seq)
          const head = rows[0]
          // The title is the phase the recorder wrote, verbatim: it is a plan task's own
          // name, so nothing here shortens, translates or re-words it. A row that carries no
          // phase falls back to its label, and one that carries neither stays empty.
          const title = typeof head.phase === 'string'
            ? head.phase
            : (typeof head.label === 'string' ? head.label : '')
          return {
            key: `${node.key}:t${number}`,
            taskNumber: number,
            title,
            state: progressNodeState(rows, ended),
            members: rows,
          }
        })
        node.members = loose
      }
      // A run whose gate turned every draft back has no `summary-final` row, but the page
      // must still say why. Mirror of `deriveProgressFlow` in `src/progress-tab.ts`: the
      // verdict lands on the summary leg's node — which goes amber by the same `data-state`
      // every other failed node uses — and is read only when that node is opened. A shipped
      // draft wins over a rejected claim: the recorder never writes both, a hand-written
      // stream could, and the page must not deny a draft the run really shipped.
      const rejected = run.summaryFinalDraft === undefined ? run.summaryRejected : undefined
      if (rejected !== undefined) {
        let last = -1
        for (let index = 0; index < nodes.length; index++) if (nodes[index].kind === 'summarize') last = index
        if (last === -1) {
          // A summary that ran inside the parent (`model` strategy) declares no call, so no
          // row named the leg. It still ran, so it gets the node it lacked, with no calls of
          // its own and the verdict on it: `total` gains the step the run really took and
          // `at` stops here, the steps after a failure staying counted and unreached.
          nodes.splice(nodes.length - 1, 0, {
            key: `flow:${middle.length}:summarize:1`,
            kind: 'summarize',
            ordinal: 1,
            state: 'failed',
            members: [],
            rejected,
          })
        } else {
          // The last visit is the one the verdict closed: marking every draft's node would
          // put the reader's place back on the first draft, which is not where the run stopped.
          nodes[last] = { ...nodes[last], state: 'failed', rejected }
        }
      }
      const total = nodes.length
      const open = [...run.members]
        .filter((member) => member.outcome === undefined)
        .sort((left, right) => left.seq - right.seq)[0]
      let at = total
      if (open !== undefined) {
        // The open row is the reader's place, wherever it hangs: on the leg itself, or in
        // one of the task cells under it. The number this yields is unchanged either way.
        const owner = nodes.findIndex((node) => node.members.some((member) => member.seq === open.seq)
          || (node.subs !== undefined && node.subs.some((sub) => sub.members.some((member) => member.seq === open.seq))))
        at = owner === -1 ? total : owner + 1
      } else if (ended) {
        const broken = nodes.findIndex((node) => node.state === 'failed' || node.state === 'blocked')
        at = broken === -1 ? total : broken + 1
      }
      // Nothing declared and nothing ended: the start is where this run is, not the end it
      // has not reached.
      if (middle.length === 0 && !ended) at = 1
      const shipped = run.summaryFinalDraft === undefined ? undefined : progressShippedRow(run.members, run.summaryFinalDraft)
      return {
        state,
        nodes,
        at,
        total,
        remaining: total - at,
        ...run.summaryFinalDraft === undefined || shipped === undefined
          ? {}
          : { final: { draft: run.summaryFinalDraft, seq: shipped.seq } },
      }
    }

    /** The width the panel starts from before it has measured its own column. */
    const PANEL_DEFAULT_WIDTH = 720

    /**
     * The gap between two columns, and between two cards stacked inside one column.
     *
     * The column gap is also where every wire turns: its centre is the one x a fork's or a
     * join's vertical run may occupy, which is what draws the bar over the branches. Every
     * wire changes column by exactly one gap, so no vertical has to cross a card.
     */
    const PANEL_COLUMN_GAP = 48
    const PANEL_SIBLING_GAP = 14
    /** Below this the graph is one column, whatever the labels measure. */
    const PANEL_STACK_WIDTH = 720

    // WHY no JS breakpoint for the opened list any more: both widths share the sheet under
    // the figure, so there is nothing left to pick by width. The stylesheet keeps its own
    // 720 copy for wrapping cards; the list no longer reads it. `matchMedia` is not read
    // anywhere on this page now.

    // A phone's siblings sit closer than two layers do (26 / 30), so one leg's branches read
    // as one branch.

    /**
     * The band under the figure a wire takes when it has to skip a column.
     *
     * A vertical run may only stand in a column gap, and a skipped column offers none — so an
     * edge that jumps a level (a task with nothing recorded under it, say) goes under the
     * whole figure instead of through the cards it passes.
     */
    const PANEL_BYPASS = 10

    /** The width band and the one-row height of each shape the mermaid text can draw. */
    const PANEL_BOX = {
      stadium: { min: 88, max: 120, h: 32 },
      round: { min: 160, max: 240, h: 56 },
      rect: { min: 110, max: 190, h: 30 },
    }

    /**
     * A card that carries a second row is taller than its shape alone says.
     *
     * The second row is one of two things: the six ring lights a task carries (or 验收's five
     * checks), or a capsule's own badge. Either way the height has to be known before the page
     * measured anything, because the wires land on the boxes the defaults stand in for.
     */
    const PANEL_LIGHT_HEIGHT = 56
    const PANEL_BADGE_ROW_HEIGHT = 48

    /**
     * The seven levels the fork is drawn in, left to right: 起点 → 规划 → 任务 → 子任务 →
     * 汇合 → 验收 → 终点.
     *
     * A level is a column of the picture and a step number in the one sentence above it: the
     * headline's `at` is the level the reader stands on, which is why `total` is a constant
     * rather than a count of the calls somebody recorded (contract §26).
     */
    const PANEL_LEVELS = 7

    /** The six lights every task card carries, in the order the operator's brief draws them. */
    const PANEL_RING_KEYS = ['plan', 'execute', 'check', 'review', 'accept', 'summarize']

    /** The five verification lights the acceptance card carries, in reading order. */
    const PANEL_CHECK_KEYS = ['machine', 'model', 'isolated', 'human', 'ledger']

    /**
     * The words that light the three screens no leg word says.
     *
     * `machine` and `model` are read off the leg table (`检查` / `复核`), so only the screens a
     * run reports in its own words need a list of their own: a label or a phase that carries
     * one of these lights that light. A Latin word matches as a prefix, because the runs write
     * `soak` and `reconciliation` beside the Chinese words; a CJK word matches anywhere, the
     * boundary rule `progressPhaseCarriesToken` already applies.
     */
    const PANEL_CHECK_SCREENS = {
      isolated: ['真机', '隔离', 'soak', 'isolated'],
      human: ['人验', '人工', 'human'],
      ledger: ['对账', '核对', 'reconcil'],
    }

    /** Whether one recorded string carries one of these words. */
    function panelScreenCarries(text, tokens) {
      const haystack = typeof text === 'string' ? text.toLowerCase() : ''
      if (haystack === '') return false
      for (const token of tokens) {
        const needle = token.toLowerCase()
        if (!/[a-z0-9]/i.test(needle)) {
          if (haystack.indexOf(needle) !== -1) return true
          continue
        }
        let from = 0
        for (;;) {
          const at = haystack.indexOf(needle, from)
          if (at === -1) break
          if (!progressWordChar(at === 0 ? '' : haystack.slice(at - 1, at))) return true
          from = at + 1
        }
      }
      return false
    }

    /** The word one call speaks as: its leg's word, or its own label when it names no leg. */
    function panelRowWord(row, say) {
      const leg = progressFlowLegOf(row.label)
      if (leg === undefined) return typeof row.label === 'string' ? row.label : ''
      return say(PROGRESS_FLOW_WORD_KEY[leg])
    }

    /** Recorded order: the engine's own sequence, which is the one order every box reads. */
    function panelRecordedOrder(left, right) {
      return left.seq - right.seq
    }

    /**
     * How long one level really took, or `undefined` when the stream cannot say.
     *
     * `max(endedAt) - min(startedAt)` over the level's own rows, and only for a level whose
     * every box settled: a column still being walked has no duration yet, and measuring only
     * the part that settled would make the estimate short in exactly the case a reader wants
     * it. A level that drew no row has nothing to measure.
     * @param nodes - the picture's nodes.
     * @param level - the column to measure.
     * @returns the span in ms, or `undefined`.
     */
    function progressPanelSpan(nodes, level) {
      const inLevel = nodes.filter((node) => node.level === level)
      if (inLevel.length === 0) return undefined
      const rows = []
      for (const node of inLevel) {
        if (node.state !== 'done') return undefined
        for (const row of node.calls) rows.push(row)
      }
      if (rows.length === 0) return undefined
      let first = Infinity
      let last = -Infinity
      for (const row of rows) {
        if (!Number.isFinite(row.startedAt) || !Number.isFinite(row.endedAt)) return undefined
        first = Math.min(first, row.startedAt)
        last = Math.max(last, row.endedAt)
      }
      return last - first
    }

    /** Round a duration to the precision the page prints it at. */
    function progressPanelRounded(ms) {
      // Seconds under a minute: 10 s there is a fifth of the number and reads as a made-up
      // precision, so that band rounds to 5 s instead.
      const seconds = ms / 1000
      const step = seconds < 60 ? 5 : 10
      return Math.round(seconds / step) * step * 1000
    }

    /**
     * The remaining time, from the levels that were actually measured.
     *
     * The mean of the measured level spans times the levels still ahead. No measured level,
     * or nothing left to walk, means no estimate at all: the page says nothing rather than
     * inventing a number, and the visible sentence never says how the number was obtained —
     * only its tooltip does.
     * Why the tooltip says "levels": `basis` counts measured level spans (one per finished
     * column), not finished calls or tasks, so the copy must name the unit the number rests on.
     * @param nodes - the picture's nodes.
     * @param remaining - how many levels are still ahead of the reader.
     * @returns `{ ms, basis }`, or `undefined` when nothing was measured.
     */
    function progressPanelEta(nodes, remaining) {
      if (!(remaining > 0)) return undefined
      const spans = []
      for (let level = 0; level < PANEL_LEVELS; level += 1) {
        const span = progressPanelSpan(nodes, level)
        if (span !== undefined) spans.push(span)
      }
      if (spans.length === 0) return undefined
      const mean = spans.reduce((sum, span) => sum + span, 0) / spans.length
      return { ms: progressPanelRounded(mean * remaining), basis: spans.length }
    }

    /** A duration in one of three shapes: seconds, minutes, hours. */
    function progressPanelDuration(ms, t) {
      const seconds = Math.max(0, Math.round(ms / 1000))
      if (seconds < 60) return t('progress.panel.durationSec', { s: seconds })
      if (seconds < 3600) return t('progress.panel.durationMin', { m: Math.floor(seconds / 60), s: seconds % 60 })
      return t('progress.panel.durationHour', { h: Math.floor(seconds / 3600), m: Math.floor((seconds % 3600) / 60) })
    }

    /**
     * Which try a failed row was, when its label no longer says.
     *
     * `naming.ts` writes the attempt into the label of a *visit* retry (`执行（尝试 2）`), but
     * a retry inside one task keeps the bare role word, so both rows read 1 there. Its place
     * among the rows of the same unit is the honest number in that case: the engine's own
     * order is the count of tries.
     */
    function progressPanelAttempt(members, member) {
      const text = typeof member.label === 'string' ? member.label.trim() : ''
      if (/[（(][^（()）]*?\d+[^（()）]*[)）]$/u.test(text)) return progressAttemptNumber(text)
      const unit = progressAttemptUnit(member)
      let place = 0
      for (const other of [...members].sort((left, right) => left.order - right.order)) {
        if (progressAttemptUnit(other) !== unit) continue
        place += 1
        if (other.seq === member.seq) return place
      }
      return 1
    }

    /**
     * Why the run stopped moving, if it did.
     *
     * A cancelled run is not stuck — the chip already says cancelled — so it yields nothing.
     * Otherwise the first box, in the picture's own order, whose calls still carry an
     * unrecovered failure is where the reader is held; a task card is examined with its own
     * rows and is the more specific answer when it has one. Only when nothing failed does a
     * `blocked` box (a run that ended over a row it never settled) count, and only after that
     * the summary verdict of a gate that turned every draft back.
     * @param run - folded run facts.
     * @param steps - the boxes that hold a whole unit's rows, each with its step number.
     * @returns the stuck verdict, or `undefined` when nothing is stuck.
     */
    function progressPanelStuck(run, steps) {
      if (run.stopReason === 'cancelled') return undefined
      for (const step of steps) {
        const recovered = progressRecoveredFailures(step.node.calls)
        const failed = step.node.calls.find((member) => member.outcome === 'failed' && !recovered.has(member.seq))
        if (failed === undefined) continue
        return {
          nodeId: step.node.id,
          at: step.at,
          kind: 'failed',
          role: progressStoryRole(failed),
          attempt: progressPanelAttempt(step.node.calls, failed),
        }
      }
      for (const step of steps) {
        if (step.node.state !== 'blocked') continue
        return { nodeId: step.node.id, at: step.at, kind: 'blocked' }
      }
      const rejected = steps.find((step) => step.node.rejected !== undefined)
      if (rejected === undefined) return undefined
      return { nodeId: rejected.node.id, at: rejected.at, kind: 'rejected', drafts: rejected.node.rejected.drafts }
    }

    /**
     * The rows the picture owns, in recorded order, with the guardian's own call taken out.
     *
     * The guardian's call is not a leg of the work — it has a panel of its own — and every
     * other row lands in exactly one box's calls, so no declared call can vanish from the
     * figure (contract §26).
     */
    function panelRows(run) {
      const rows = []
      for (const row of run.members) {
        if (progressIsGuardianCard(typeof row.label === 'string' ? row.label : '')) continue
        rows.push(row)
      }
      return rows.sort(panelRecordedOrder)
    }

    /** The one id a task card is drawn with: its plan number, or the one group with none. */
    function panelTaskId(number) {
      return number === undefined ? 'u1' : `t${number}`
    }

    /**
     * Which box every row belongs to.
     *
     * A row that names a leg belongs to that leg: `执行` / `检查` / `复核` rows are the work
     * and hang under a plan task, `规划` rows are the plan, `汇总` rows are the summary. A row
     * that names no leg keeps its place instead of vanishing — before the first work row it is
     * part of the plan, after the last one it is part of the summary, and between two work
     * rows it belongs to the task of the row in front of it, which is the box the run had
     * reached when it declared the call (the rule `deriveProgressFlow` already applies).
     *
     * Work rows group by the plan task their **phase** names — one group per number, in number
     * order, then at most one group for the work that names no number at all. The phase is the
     * grouping fact and never a leg.
     * @param rows - the picture's rows, in recorded order.
     * @returns `{ plan, sum, tasks }`, with `tasks` in drawing order.
     */
    function panelBoxRows(rows) {
      const work = []
      const plan = []
      const sum = []
      for (const row of rows) {
        const leg = progressFlowLegOf(row.label)
        if (leg === 'execute' || leg === 'check' || leg === 'review') work.push(row)
        else if (leg === 'plan') plan.push(row)
        else if (leg === 'summarize') sum.push(row)
      }
      const firstSum = sum.length === 0 ? undefined : sum[0].seq
      // The unlabelled rows behind one work row, by that row's `seq`: they ride in its task.
      const loose = new Map()
      for (const row of rows) {
        if (progressFlowLegOf(row.label) !== undefined) continue
        let ahead
        let behind
        for (const other of work) {
          if (other.seq < row.seq) ahead = other
          else { behind = other; break }
        }
        if (ahead !== undefined && behind !== undefined) {
          const riding = loose.get(ahead.seq)
          if (riding === undefined) loose.set(ahead.seq, [row])
          else riding.push(row)
          continue
        }
        if (behind !== undefined) { plan.push(row); continue }
        if (ahead !== undefined) { sum.push(row); continue }
        // No work row at all: the summary is the only box that can come after anything.
        if (firstSum === undefined || row.seq < firstSum) plan.push(row)
        else sum.push(row)
      }
      const numbered = new Map()
      const unnumbered = []
      for (const row of work) {
        const riding = loose.get(row.seq) === undefined ? [] : loose.get(row.seq)
        const number = progressTaskNumber(row.phase)
        if (number === undefined) { unnumbered.push(row, ...riding); continue }
        const group = numbered.get(number)
        if (group === undefined) numbered.set(number, [row, ...riding])
        else group.push(row, ...riding)
      }
      const tasks = [...numbered.keys()]
        .sort((left, right) => left - right)
        .map((number) => ({ id: panelTaskId(number), number, rows: numbered.get(number).sort(panelRecordedOrder) }))
      if (unnumbered.length > 0) {
        tasks.push({ id: panelTaskId(undefined), number: undefined, rows: unnumbered.sort(panelRecordedOrder) })
      }
      return { plan: plan.sort(panelRecordedOrder), sum: sum.sort(panelRecordedOrder), tasks }
    }

    /**
     * One task card's own name: the phase the recorder wrote, verbatim.
     *
     * A plan task's title is its own name, so nothing here shortens, translates or re-words
     * it; a group that carries no phase at all falls back to the leg word of its first call.
     */
    function panelTaskLabel(rows, say) {
      for (const row of rows) {
        if (typeof row.phase === 'string' && row.phase.trim() !== '') return row.phase
      }
      return panelRowWord(rows[0], say)
    }

    /**
     * The six lights of one task card.
     *
     * The plan light and the summary light are the run's, and every card carries the same
     * pair: those two stages happen once, around the tasks, not inside them. The three work
     * lights are folded from the card's own rows by **label only** — a phase never binds a
     * leg — and the acceptance light is built from the two gates it accepts: a broken gate
     * holds the card whatever the other one says.
     * @param rows - the task's own calls.
     * @param planState - the plan box's state.
     * @param sumState - the summary box's state.
     * @param ended - whether the run stopped.
     * @returns the six lights, in the operator's order.
     */
    function panelRings(rows, planState, sumState, ended) {
      const fold = (leg) => {
        const own = rows.filter((row) => progressFlowLegOf(row.label) === leg)
        return own.length === 0 ? 'pending' : progressNodeState(own, ended)
      }
      const check = fold('check')
      const review = fold('review')
      const accept = check === 'failed' || check === 'blocked' || review === 'failed' || review === 'blocked'
        ? 'failed'
        : check === 'done' && review === 'done'
          ? 'done'
          : check === 'doing' || review === 'doing' ? 'doing' : 'pending'
      const state = {
        plan: planState,
        execute: fold('execute'),
        check,
        review,
        accept,
        summarize: sumState,
      }
      return PANEL_RING_KEYS.map((key) => ({ key, state: state[key] }))
    }

    /**
     * One light of the five verifications, folded over the rows that report it.
     *
     * Only a recorded row lights a light: the page never ticks a verification the stream did
     * not report, so a screen nobody ran stays dark rather than being assumed passed. The
     * order is the contract's — nothing declared is dark, anything still open is `doing`, a
     * set that settled with no failure still current is `done`, and one such failure is
     * `failed`.
     * @param rows - the rows that report this screen.
     * @returns one of the page's five state words.
     */
    function panelCheckState(rows) {
      if (rows.length === 0) return 'pending'
      if (rows.some((row) => row.outcome === undefined)) return 'doing'
      const recovered = progressRecoveredFailures(rows)
      if (rows.some((row) => row.outcome === 'failed' && !recovered.has(row.seq))) return 'failed'
      return 'done'
    }

    /**
     * The five verification lights, read off the run's own rows and nothing else.
     *
     * The machine screen is the check leg and the model screen is the review leg, so those
     * two are read off the leg table. The other three are reported in the run's own words, on
     * a label or a phase, and carry no leg of their own.
     * @param rows - the picture's rows.
     * @returns the five lights, in reading order.
     */
    function panelChecks(rows) {
      const carrying = (tokens) => rows.filter((row) => panelScreenCarries(row.label, tokens) || panelScreenCarries(row.phase, tokens))
      const reported = {
        machine: rows.filter((row) => progressFlowLegOf(row.label) === 'check'),
        model: rows.filter((row) => progressFlowLegOf(row.label) === 'review'),
        isolated: carrying(PANEL_CHECK_SCREENS.isolated),
        human: carrying(PANEL_CHECK_SCREENS.human),
        ledger: carrying(PANEL_CHECK_SCREENS.ledger),
      }
      return PANEL_CHECK_KEYS.map((key) => ({ key, state: panelCheckState(reported[key]) }))
    }

    /**
     * The panel's one model: a left-to-right fork from the start to the end.
     *
     * Seven levels, one per column of the picture — the start, the plan, one card per plan
     * task, one branch per call a task made, the summary, the acceptance and the end — and
     * every box and every wire derived from the run's own recorded rows. Nothing is remembered
     * from an earlier render, so a replanned run draws the tasks it really walked and the
     * picture changes with the events (contract §26).
     *
     * Labels are resolved here, through the reader's own dictionary, because the mermaid text
     * is the structural source of truth and has to carry the words a reader would see.
     * @param run - folded run facts.
     * @param t - translator for the leg words; a task's own title is printed verbatim.
     * @returns the panel model, with `mermaid` filled in from the model it was built from.
     */
    function derivePanelGraph(run, t) {
      const say = typeof t === 'function' ? t : translator(FALLBACK_LOCALE)
      const ended = run.stopReason !== undefined
      const state = !ended
        ? (run.members.length === 0 ? 'waiting' : 'running')
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      // The two ends report the run's own fact. While it is still moving they are a place it
      // has not reached, which is what `pending` says.
      const endState = !ended
        ? 'pending'
        : run.stopReason === 'completed' ? 'done' : run.stopReason === 'cancelled' ? 'cancelled' : 'failed'
      const rows = panelRows(run)
      const boxes = panelBoxRows(rows)
      // A shipped draft wins over a rejected claim: the recorder never writes both, a
      // hand-written stream could, and the page must not deny a draft the run really shipped.
      const rejected = run.summaryFinalDraft === undefined ? run.summaryRejected : undefined
      const planState = boxes.plan.length > 0
        ? progressNodeState(boxes.plan, ended)
        // The task cards are the recorded evidence that a plan ran, so a plan with no call of
        // its own is not "unreached" once there is work under it.
        : boxes.tasks.length > 0 ? 'done' : 'pending'
      const sumState = rejected !== undefined
        ? 'failed'
        : boxes.sum.length > 0
          ? progressNodeState(boxes.sum, ended)
          : ended ? endState : 'pending'
      const checks = panelChecks(rows)
      const tasks = boxes.tasks.map((task) => ({
        id: task.id,
        kind: 'task',
        level: 2,
        label: panelTaskLabel(task.rows, say),
        state: progressNodeState(task.rows, ended),
        current: false,
        calls: task.rows,
        openable: task.rows.length > 0,
        rings: panelRings(task.rows, planState, sumState, ended),
      }))
      // One branch per call a task made, in the task's own order: the k-th call of one leg is
      // the k-th attempt at it, which is what the branch prints past the first.
      const subs = []
      for (const task of boxes.tasks) {
        const seen = new Map()
        for (const row of task.rows) {
          const leg = progressFlowLegOf(row.label)
          const attempt = (seen.has(leg) ? seen.get(leg) : 0) + 1
          seen.set(leg, attempt)
          const word = panelRowWord(row, say)
          subs.push({
            id: `${task.id}_s${row.seq}`,
            kind: 'sub',
            level: 3,
            label: attempt > 1 ? `${word} · ${say('progress.flow.attempt', { n: attempt })}` : word,
            state: progressRowState(row),
            current: false,
            calls: [row],
            openable: true,
            subtask: {
              taskId: task.id,
              ...task.number === undefined ? {} : { taskNumber: task.number },
              seq: row.seq,
              leg,
              attempt,
            },
          })
        }
      }
      const nodes = [
        { id: 'start', kind: 'start', level: 0, label: say('progress.flow.start'), state: 'done', current: false, calls: [], openable: false },
        { id: 'plan', kind: 'plan', level: 1, label: say('progress.flow.plan'), state: planState, current: false, calls: boxes.plan, openable: boxes.plan.length > 0 },
        ...tasks,
        ...subs,
        {
          id: 'sum',
          kind: 'summarize',
          level: 4,
          label: say('progress.flow.summarize'),
          state: sumState,
          current: false,
          calls: boxes.sum,
          // A summary with nothing to declare still has something to say when the gate turned
          // every draft back: the verdict rides in the same opened list.
          openable: boxes.sum.length > 0 || rejected !== undefined,
          ...rejected === undefined ? {} : { rejected },
        },
        { id: 'accept', kind: 'accept', level: 5, label: say('progress.flow.accept'), state: endState, current: false, calls: [], openable: false, checks },
        { id: 'end', kind: 'end', level: 6, label: say('progress.flow.end'), state: endState, current: false, calls: [], openable: false },
      ]
      // The rows one box owns, by `seq`. A branch is written after its task, so the branch is
      // the answer for a row both of them carry: it is one call and says exactly which one is
      // open where the card could only say "somewhere in here".
      const owners = new Map()
      for (const node of nodes) {
        for (const row of node.calls) owners.set(row.seq, node)
      }
      const open = rows.find((row) => row.outcome === undefined)
      let place = open === undefined ? undefined : owners.get(open.seq)
      if (place === undefined && ended) {
        place = nodes.find((node) => node.state === 'failed' || node.state === 'blocked')
      }
      // Nothing declared and nothing ended: the start is where this run is, not the end it has
      // not reached. A run between two calls stands at the end it has not reached either.
      if (place === undefined) place = rows.length === 0 ? nodes[0] : nodes[nodes.length - 1]
      for (const node of nodes) node.current = node.id === place.id
      const edges = [{ from: 'start', to: 'plan', kind: 'chain' }]
      // A run with no task card has nothing between the plan and the summary, and the two
      // places still have to be one picture: a waiting run must not draw as two halves that
      // float apart. With a task card present the fork owns that gap and this edge is not
      // emitted, so the rule "no other edges" still holds.
      if (tasks.length === 0) edges.push({ from: 'plan', to: 'sum', kind: 'chain' })
      for (const task of tasks) edges.push({ from: 'plan', to: task.id, kind: 'fork' })
      for (const task of tasks) {
        const branches = subs.filter((sub) => sub.subtask.taskId === task.id)
        // A task that recorded no call still reaches the summary: its card is the whole of
        // what it walked, and a fork with no branch under it would end in mid-air.
        if (branches.length === 0) edges.push({ from: task.id, to: 'sum', kind: 'join' })
        for (const branch of branches) {
          edges.push({ from: task.id, to: branch.id, kind: 'branch' })
          edges.push({ from: branch.id, to: 'sum', kind: 'join' })
        }
      }
      edges.push({ from: 'sum', to: 'accept', kind: 'chain' }, { from: 'accept', to: 'end', kind: 'chain' })
      const at = place.level + 1
      const total = PANEL_LEVELS
      const remaining = total - at
      const eta = progressPanelEta(nodes, remaining)
      const shipped = run.summaryFinalDraft === undefined ? undefined : progressShippedRow(run.members, run.summaryFinalDraft)
      const graph = {
        state,
        mermaid: '',
        nodes,
        edges,
        checks,
        headline: { at, total, remaining, taskCount: tasks.length, ...eta === undefined ? {} : { eta } },
        at,
        total,
        remaining,
        taskCount: tasks.length,
        // Carried through: the opened call list marks the row the gate shipped, and it has to
        // mark the row the run named rather than a second guess at it.
        ...shipped === undefined ? {} : { final: { draft: run.summaryFinalDraft, seq: shipped.seq } },
      }
      // WHY 顶上句与卡住句同一口径：顶上句的 at 是读者站位（含分支层），卡住句
      // 若只从任务卡读数，同一屏会出现两个步号。失败态仍从整卡读（要看到被替代的重试），
      // 但报数用读者站位那一层的 at；blocked / rejected 直接用分支优先的站位。
      const stuckRaw = progressPanelStuck(run, nodes
        .filter((node) => node.kind !== 'sub')
        .map((node) => ({ node, at: node.level + 1 })))
      const stuck = stuckRaw === undefined ? undefined : { ...stuckRaw, at }
      if (stuck !== undefined) graph.stuck = stuck
      // Filled from the model it was built from, so the text and the picture cannot disagree:
      // the page lays out the parsed text, not this object.
      graph.mermaid = panelMermaid(graph)
      return graph
    }

    /**
     * The one id the text may not spell the way the model does.
     *
     * `end` closes a `subgraph` in mermaid, so a definition line that starts with it is not a
     * node a renderer will read. The end node is therefore written `finish` and read back
     * under the model's own id — the model, the DOM hook and every edge keep saying `end`, and
     * the parser knows no special ids at all: it reads whatever the text says.
     */
    const PANEL_MERMAID_ID = { end: 'finish' }

    /** The id one model node is written as, in the text. */
    function panelMermaidIdFor(id) {
      const named = PANEL_MERMAID_ID[id]
      return named === undefined ? id : named
    }

    /** The model's own id for one id the text carries. */
    function panelModelIdFor(id) {
      for (const model of Object.keys(PANEL_MERMAID_ID)) {
        if (PANEL_MERMAID_ID[model] === id) return model
      }
      return id
    }

    /** An id mermaid accepts: letters, digits and underscores, and nothing else. */
    function panelMermaidId(value) {
      return String(value === undefined || value === null ? '' : value).replace(/[^A-Za-z0-9_]/g, '')
    }

    /** A label as one mermaid line: a quote is escaped, and a line break becomes a space. */
    function panelMermaidLabel(value) {
      return String(value === undefined || value === null ? '' : value).replace(/"/g, '#quot;').replace(/\s*\r?\n\s*/g, ' ')
    }

    /**
     * The kinds the text draws as a stadium: the two ends and the three places the run stands
     * between them. A fork point, a gathering point and the gate a reader has to look at are
     * places, and the shape says so before the words are read.
     */
    const PANEL_MERMAID_STADIUM = new Set(['start', 'plan', 'summarize', 'accept', 'end'])

    /** One node definition, in the shape its kind calls for. */
    function panelMermaidNode(node) {
      const id = panelMermaidId(panelMermaidIdFor(node.id))
      const label = panelMermaidLabel(node.label)
      if (PANEL_MERMAID_STADIUM.has(node.kind)) return `${id}(["${label}"])`
      if (node.kind === 'task') return `${id}("${label}")`
      return `${id}["${label}"]`
    }

    /**
     * The graph as mermaid, which is the structural source of truth for the picture.
     *
     * One node per line, then one edge per line, two-space indented: the page parses this
     * text back and lays the parsed graph out, so the figure a reader sees and the text a
     * reader (or a test) can read cannot drift apart. The fork runs left to right, which is
     * the direction the picture reads in.
     *
     * The lights, the checks and the attempt numbers are decoration and stay out of the text:
     * every box and every wire a reader can see is in it, and nothing else is.
     */
    function panelMermaid(graph) {
      const lines = ['flowchart LR']
      for (const node of graph.nodes) lines.push(`  ${panelMermaidNode(node)}`)
      for (const edge of graph.edges) lines.push(`  ${panelMermaidId(panelMermaidIdFor(edge.from))} --> ${panelMermaidId(panelMermaidIdFor(edge.to))}`)
      return lines.join('\n')
    }

    /** The three shapes this page writes, and what each one means. */
    const PANEL_MERMAID_SHAPES = {
      '([': 'stadium',
      '[': 'rect',
      '(': 'round',
    }

    /**
     * Read the mermaid subset `panelMermaid` writes back into a graph.
     *
     * Only that subset: a `flowchart <dir>` header, `%%` comments, blank lines, the three
     * node shapes and `a --> b` edges. Anything else is ignored rather than guessed at, and
     * an edge naming a node nobody declared is dropped — a route to nowhere is not a step.
     * The header's direction is stored but not obeyed: the panel has one drawing, and it runs
     * left to right whatever the text says. A direction the reader cannot see is exactly the
     * kind of drift this file refuses to have — the text `panelMermaid` writes is `LR`.
     * @param text - the mermaid source.
     * @returns the parsed graph, with `direction` defaulting to `LR`.
     */
    function parsePanelMermaid(text) {
      const parsed = { direction: 'LR', nodes: [], edges: [] }
      const source = String(text === undefined || text === null ? '' : text)
      for (const raw of source.split(/\r?\n/)) {
        const line = raw.trim()
        if (line === '' || line.startsWith('%%')) continue
        const header = /^(?:flowchart|graph)\s+([A-Za-z]+)$/i.exec(line)
        if (header !== null) {
          parsed.direction = header[1]
          continue
        }
        const edge = /^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/.exec(line)
        if (edge !== null) {
          parsed.edges.push({ from: edge[1], to: edge[2] })
          continue
        }
        const node = /^([A-Za-z0-9_]+)\s*(\(\[|\[|\()\s*"([\s\S]*)"\s*(\]\)|\]|\))$/.exec(line)
        if (node === null) continue
        parsed.nodes.push({
          id: node[1],
          label: node[3].replace(/#quot;/g, '"'),
          shape: PANEL_MERMAID_SHAPES[node[2]],
        })
      }
      const declared = new Set(parsed.nodes.map((node) => node.id))
      parsed.edges = parsed.edges.filter((edge) => declared.has(edge.from) && declared.has(edge.to))
      return parsed
    }

    /** A width kept inside the band its shape allows. */
    function panelClampWidth(value, band) {
      return Math.max(band.min, Math.min(band.max, Math.round(value)))
    }

    /**
     * The default box of one node, for the render before anything has been measured.
     *
     * The shape says which of the three cards it is — a capsule (起点, 规划, 汇总, 验收, 终点),
     * a task card, or a sub box — and the width grows with the label inside the band that card
     * allows, so a figure drawn on a host without layout still reads as the fork it is.
     */
    function panelDefaultSize(node) {
      const band = PANEL_BOX[node.shape] === undefined ? PANEL_BOX.rect : PANEL_BOX[node.shape]
      const length = typeof node.label === 'string' ? node.label.length : 0
      const base = node.shape === 'stadium' ? 24 : node.shape === 'round' ? 30 : 24
      const per = node.shape === 'stadium' ? 13 : node.shape === 'round' ? 12 : 11
      return { w: panelClampWidth(base + per * length, band), h: band.h }
    }

    /**
     * One node's box: what the page measured, else the default its shape calls for.
     *
     * `floors` names the cards whose second row is a fact about the model rather than about the
     * text — the ring lights, the checks, a capsule's badge — and gives each the height it
     * needs before the page measured anything: that row is part of the card, not a decoration
     * drawn over it, so the wire has to land on the height a reader will see.
     * @param node - one parsed node.
     * @param sizes - measured boxes by node id.
     * @param floors - the least height of each card that carries a second row, by node id.
     * @returns the box, clamped to the band its shape allows.
     */
    function panelNodeSize(node, sizes, floors) {
      const band = PANEL_BOX[node.shape] === undefined ? PANEL_BOX.rect : PANEL_BOX[node.shape]
      const fallback = panelDefaultSize(node)
      const given = sizes === undefined || sizes === null ? undefined : sizes[node.id]
      const known = given !== undefined && Number.isFinite(given.w) && Number.isFinite(given.h) && given.w > 0 && given.h > 0
      const least = floors !== undefined && floors !== null && floors.has(node.id) ? floors.get(node.id) : fallback.h
      return {
        w: panelClampWidth(known ? given.w : fallback.w, band),
        h: Math.max(known ? Math.round(given.h) : fallback.h, least),
      }
    }

    /**
     * Longest-path columns over the parsed graph: one column per step of the fork.
     *
     * Kahn's order is what makes "longest path" a single pass: every edge into a node is
     * settled before that node is visited. An edge that points backwards — it can only be in
     * a graph somebody typed by hand — is ignored instead of walked, so a cycle costs the
     * layout a misplaced card rather than an endless loop. Nodes keep parse order inside a
     * column, so the branches of one fork read from top to bottom in the order they happened.
     *
     * The text may hold two components: a run that has planned and not yet worked gets no
     * edge from the plan to the summary, because nothing connects them yet. A component is
     * placed to the right of the one before it rather than on top of it, so the summary stands
     * after the part of the run that led to it instead of in the start's own column.
     * @param parsed - the parsed graph.
     * @returns the node ids of each column, left to right.
     */
    function panelLayers(parsed) {
      const parsedAt = new Map(parsed.nodes.map((node, index) => [node.id, index]))
      const next = new Map(parsed.nodes.map((node) => [node.id, []]))
      const both = new Map(parsed.nodes.map((node) => [node.id, []]))
      const incoming = new Map(parsed.nodes.map((node) => [node.id, 0]))
      for (const edge of parsed.edges) {
        next.get(edge.from).push(edge.to)
        both.get(edge.from).push(edge.to)
        both.get(edge.to).push(edge.from)
        incoming.set(edge.to, incoming.get(edge.to) + 1)
      }
      const queue = parsed.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
      const visited = []
      while (queue.length > 0) {
        const id = queue.shift()
        visited.push(id)
        for (const target of next.get(id)) {
          incoming.set(target, incoming.get(target) - 1)
          if (incoming.get(target) === 0) queue.push(target)
        }
      }
      // A cycle leaves nodes unqueued; they keep their parse order after the rest instead of
      // disappearing from the figure.
      for (const node of parsed.nodes) if (visited.indexOf(node.id) === -1) visited.push(node.id)
      const rank = new Map(visited.map((id, index) => [id, index]))
      const depth = new Map(parsed.nodes.map((node) => [node.id, 0]))
      for (const id of visited) {
        for (const target of next.get(id)) {
          if (rank.get(target) <= rank.get(id)) continue
          depth.set(target, Math.max(depth.get(target), depth.get(id) + 1))
        }
      }
      const seen = new Set()
      let floor = 0
      for (const node of parsed.nodes) {
        if (seen.has(node.id)) continue
        const component = []
        const stack = [node.id]
        seen.add(node.id)
        while (stack.length > 0) {
          const id = stack.pop()
          component.push(id)
          for (const other of both.get(id)) {
            if (seen.has(other)) continue
            seen.add(other)
            stack.push(other)
          }
        }
        let first = Infinity
        let last = -Infinity
        for (const id of component) {
          first = Math.min(first, depth.get(id))
          last = Math.max(last, depth.get(id))
        }
        const shift = floor - first
        for (const id of component) depth.set(id, depth.get(id) + shift)
        floor = last + shift + 1
      }
      const layers = []
      for (const id of visited) {
        const at = depth.get(id)
        while (layers.length <= at) layers.push([])
        layers[at].push(id)
      }
      for (const layer of layers) layer.sort((left, right) => parsedAt.get(left) - parsedAt.get(right))
      return layers
    }

    /** A coordinate as mermaid and SVG both want it: two decimals, no trailing zeros. */
    function panelNumber(value) {
      return String(Math.round(value * 100) / 100)
    }

    /** The length of one straight run, for the corner radius that joins it to the next. */
    function panelDistance(from, to) {
      return Math.hypot(to[0] - from[0], to[1] - from[1])
    }

    /**
     * A polyline with every right-angle corner rounded.
     *
     * The radius is the same 8 px the row layout uses, capped at half of the shorter of the
     * two runs it joins: a corner between two 4 px runs gets a 2 px radius instead of a
     * bulge that would redraw the whole turn. Repeated points are dropped first, so a
     * straight run stays one `L`.
     */
    function panelPolyline(input) {
      const points = []
      for (const point of input) {
        const last = points[points.length - 1]
        if (last !== undefined
          && Math.round(last[0] * 100) === Math.round(point[0] * 100)
          && Math.round(last[1] * 100) === Math.round(point[1] * 100)) continue
        points.push(point)
      }
      // A vertex that carries straight on is not a vertex: a stem that runs into the next
      // run on the same axis has to stay one `L`, or every straight wire would be printed as
      // two collinear ones.
      for (let index = points.length - 2; index > 0; index -= 1) {
        const before = points[index - 1]
        const at = points[index]
        const after = points[index + 1]
        const cross = (at[0] - before[0]) * (after[1] - at[1]) - (at[1] - before[1]) * (after[0] - at[0])
        if (cross !== 0) continue
        points.splice(index, 1)
      }
      if (points.length === 0) return ''
      const parts = [`M ${panelNumber(points[0][0])} ${panelNumber(points[0][1])}`]
      // Where the pen is, so a corner that starts where the last one ended does not print a
      // zero-length run between them: two corners 10 px apart are two corners, not three.
      let pen = points[0]
      const lineTo = (point) => {
        if (Math.round(pen[0] * 100) === Math.round(point[0] * 100)
          && Math.round(pen[1] * 100) === Math.round(point[1] * 100)) return
        parts.push(`L ${panelNumber(point[0])} ${panelNumber(point[1])}`)
        pen = point
      }
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        const next = points[index + 1]
        const inLength = panelDistance(previous, current)
        const outLength = next === undefined ? 0 : panelDistance(current, next)
        // Straight on is not a corner: two runs on one axis get one `L`, not a curve between
        // two points that are the same point.
        const cross = (current[0] - previous[0]) * (next === undefined ? 0 : next[1] - current[1])
          - (current[1] - previous[1]) * (next === undefined ? 0 : next[0] - current[0])
        const radius = next === undefined || cross === 0 ? 0 : Math.min(8, inLength / 2, outLength / 2)
        if (!(radius > 0)) {
          lineTo(current)
          continue
        }
        const before = [
          current[0] + ((previous[0] - current[0]) / inLength) * radius,
          current[1] + ((previous[1] - current[1]) / inLength) * radius,
        ]
        const after = [
          current[0] + ((next[0] - current[0]) / outLength) * radius,
          current[1] + ((next[1] - current[1]) / outLength) * radius,
        ]
        lineTo(before)
        parts.push(`Q ${panelNumber(current[0])} ${panelNumber(current[1])} ${panelNumber(after[0])} ${panelNumber(after[1])}`)
        pen = after
      }
      return parts.join(' ')
    }

    /**
     * One wire: out of the source's right edge, into the target's left edge.
     *
     * The run is horizontal, so the shape is always the same — right, across the gap, up or
     * down, in — and the turn happens at the gap's centre. Every wire crossing that gap turns
     * at the same x, which is what draws the bar a fork or a join reads as. Nothing vertical
     * ever stands beside a card, so no wire can cross one.
     *
     * An edge that skips a column has no gap of its own to turn in, so it takes the band under
     * the figure instead: the two turns stay in the gaps on either side of the columns it
     * passes, and the long run is below every card.
     * @param from - the source box.
     * @param to - the target box.
     * @param bypass - the y of the band under the figure.
     * @returns the `d` attribute.
     */
    function panelWirePath(from, to, bypass) {
      const sy = from.y + from.h / 2
      const ty = to.y + to.h / 2
      const sx = from.x + from.w
      const tx = to.x
      const half = PANEL_COLUMN_GAP / 2
      if (to.column === from.column + 1) return panelPolyline([[sx, sy], [sx + half, sy], [sx + half, ty], [tx, ty]])
      return panelPolyline([[sx, sy], [sx + half, sy], [sx + half, bypass], [tx - half, bypass], [tx - half, ty], [tx, ty]])
    }

    /**
     * Lay the parsed graph out: one column per step, left to right, siblings stacked.
     *
     * The fork is the picture, so the direction is fixed: the start is the leftmost column and
     * the end the rightmost, and the columns between them are the plan, the tasks, their
     * subtasks, the summary and the acceptance. A column is as wide as its own widest card and
     * every card in it is drawn at that width, which is what makes the cards of one column
     * share a left edge, a right edge and therefore one bar per fork.
     *
     * A column's cards sit 14 px apart and the column as a whole is centred on the figure's
     * own middle, so a column of nine subtasks and a column holding one capsule share one
     * centre line. Columns sit 48 px apart. The container is never narrower than the space the
     * page gave, and when the flow needs more than that the container is as wide as the flow —
     * the figure around it scrolls, and the page itself never does.
     * @param parsed - the parsed graph.
     * @param sizes - measured boxes by node id; a missing node falls back to its default.
     * @param availableWidth - the column the page has.
     * @param floors - the least height of each card whose second row the model knows about.
     * @returns the container box, every node's box and every edge's path.
     */
    function layoutPanelGraph(parsed, sizes, availableWidth, floors) {
      const width = Number.isFinite(availableWidth) && availableWidth > 0 ? Math.round(availableWidth) : PANEL_DEFAULT_WIDTH
      const sizeOf = new Map(parsed.nodes.map((node) => [node.id, panelNodeSize(node, sizes, floors)]))
      const columns = panelLayers(parsed)
      const columnOf = new Map()
      for (let index = 0; index < columns.length; index += 1) {
        for (const id of columns[index]) columnOf.set(id, index)
      }
      const widths = columns.map((ids) => ids.reduce((widest, id) => Math.max(widest, sizeOf.get(id).w), 0))
      const heights = columns.map((ids) => ids.reduce((sum, id, index) => sum + sizeOf.get(id).h + (index === 0 ? 0 : PANEL_SIBLING_GAP), 0))
      const tallest = heights.reduce((best, height) => Math.max(best, height), 0)
      // A wire that reaches further than the column beside it may not run through the ones it
      // passes, so the figure keeps a band under every card for exactly those.
      const skips = parsed.edges.some((edge) => columnOf.get(edge.to) !== columnOf.get(edge.from) + 1)
      const height = tallest === 0 ? 0 : tallest + (skips ? PANEL_BYPASS + PANEL_SIBLING_GAP : 0)
      const flowWidth = widths.reduce((sum, columnWidth, index) => sum + columnWidth + (index === 0 ? 0 : PANEL_COLUMN_GAP), 0)
      const container = Math.max(width, flowWidth)
      const offset = Math.round((container - flowWidth) / 2)
      const lefts = []
      let cursor = offset
      for (let index = 0; index < columns.length; index += 1) {
        lefts.push(cursor)
        cursor += widths[index] + PANEL_COLUMN_GAP
      }
      const nodes = []
      const boxes = new Map()
      for (let index = 0; index < columns.length; index += 1) {
        // Centred on the figure's middle rather than on the tallest column's top: a capsule
        // alone beside a column of nine subtasks sits on the line the run travels.
        let top = Math.round((tallest - heights[index]) / 2)
        for (const id of columns[index]) {
          const size = sizeOf.get(id)
          const box = { id, x: lefts[index], y: top, w: widths[index], h: size.h, column: index }
          boxes.set(id, box)
          nodes.push(box)
          top += size.h + PANEL_SIBLING_GAP
        }
      }
      const bypass = tallest + PANEL_SIBLING_GAP
      const edges = []
      for (const edge of parsed.edges) {
        const from = boxes.get(edge.from)
        const to = boxes.get(edge.to)
        if (from === undefined || to === undefined) continue
        edges.push({ from: edge.from, to: edge.to, d: panelWirePath(from, to, bypass) })
      }
      return { width: container, height, nodes, edges }
    }

    /**
     * Parse a coordination block out of child-session text.
     *
     * Only an explicit block is accepted: a fenced `grok-coordination` block, or a fenced
     * `json` block carrying the coordination object or at least two of the seven fields.
     * Prose is not structured data, and this function never promotes it into evidence.
     */
    /** One `LABEL: value` line of a coordination block (`WORK_COMMIT: abc1234`). */
    const PROGRESS_COORDINATION_LABEL = /^[ \t>*_`-]*([A-Za-z][A-Za-z_ -]*?)[ \t]*[:：][ \t]*(.*?)[ \t]*$/

    /** Read the labelled form of a block, one fact per line. */
    function progressLabelledFields(body) {
      const fields = {}
      for (const line of body.split(/\r?\n/)) {
        const match = PROGRESS_COORDINATION_LABEL.exec(line)
        if (match === null) continue
        const key = progressDetailField(match[1] || '')
        if (key === undefined || fields[key] !== undefined) continue
        const value = (match[2] || '').replace(/^`+|`+$/g, '').trim()
        if (value !== '') fields[key] = value
      }
      return fields
    }

    /** Read the JSON form of a fenced block, when that fence is one. */
    function progressJsonFields(language, body) {
      if (language !== 'grok-coordination' && language !== 'json') return undefined
      let parsed
      try {
        parsed = JSON.parse(body)
      } catch {
        return undefined
      }
      const record = progressRecord(parsed)
      if (record === undefined) return undefined
      const nested = progressRecord(record.coordination)
      const fields = progressPickFields(nested === undefined ? record : nested)
      const known = Object.keys(fields).length
      if (known === 0) return undefined
      // A generic `json` fence needs the coordination object or two unmistakable fields;
      // prose in a JSON block is not evidence.
      if (nested === undefined && language !== 'grok-coordination' && known < 2) return undefined
      return fields
    }

    /**
     * Parse a coordination block out of stage text.
     *
     * Three shapes are accepted and nothing else: a fenced `json`/`grok-coordination`
     * block with the canonical fields (or a `coordination` object); any fenced block whose
     * body is the `LABEL: value` form `AGENTS.md` prescribes, with at least two known
     * labels; and that same labelled block unfenced, because the coordination protocol is
     * posted as the message body itself. Prose that merely mentions a field is never
     * promoted into evidence.
     */
    function parseProgressCoordination(text) {
      if (typeof text !== 'string' || text === '') return undefined
      const fenced = /```([A-Za-z-]*)[^\n]*\n([\s\S]*?)```/g
      let match
      while ((match = fenced.exec(text)) !== null) {
        const language = (match[1] || '').toLowerCase()
        const body = match[2] || ''
        const fromJson = progressJsonFields(language, body)
        if (fromJson !== undefined) return { fields: fromJson, raw: body.trim() }
        const fromLabels = progressLabelledFields(body)
        if (Object.keys(fromLabels).length >= 2) return { fields: fromLabels, raw: body.trim() }
      }
      const unfenced = progressLabelledFields(text)
      if (Object.keys(unfenced).length >= 2) return { fields: unfenced, raw: text.trim() }
      return undefined
    }

    /**
     * Resolve the seven detail fields, strongest source first
     * (`stage-detail` event → coordination block → not reported).
     * @param sources - available sources.
     * @returns one row per field, plus the copyable block when there was one.
     */
    function progressDetailFor(sources) {
      const input = sources === undefined || sources === null ? {} : sources
      const fromEvent = input.stageDetail === undefined ? undefined : progressPickFields(input.stageDetail)
      const block = parseProgressCoordination(input.coordinationText)
      const fields = []
      for (const key of PROGRESS_DETAIL_FIELDS) {
        const eventValue = fromEvent === undefined ? undefined : fromEvent[key]
        if (eventValue !== undefined) { fields.push({ key, value: eventValue, source: 'stage-detail' }); continue }
        const blockValue = block === undefined ? undefined : block.fields[key]
        if (blockValue !== undefined) { fields.push({ key, value: blockValue, source: 'coordination' }); continue }
        fields.push({ key, source: 'not-reported' })
      }
      return { fields, coordinationRaw: block === undefined ? undefined : block.raw }
    }

    /**
     * Where one node's detail values come from.
     *
     * A view cannot read a child session's text, so the ladder is fed from the only
     * channel in the stream: the run's own `stage-detail` payloads, matched to the node by
     * the phase they name, with a phase-less payload as the run-level fallback. A caller
     * that *can* read a child session passes its source in `injected`, which wins for the
     * level it supplies — wiring a stronger source later needs no UI change.
     */
    function progressDetailSources(track, node, injected) {
      const supplied = injected === undefined || injected === null ? {} : injected
      const own = node === undefined || node === null ? undefined : node.stageDetail
      const source = own === undefined ? (track === undefined || track === null ? undefined : track.stageDetail) : own
      const stageDetail = supplied.stageDetail !== undefined ? supplied.stageDetail : (source === undefined ? undefined : source.fields)
      const coordinationText = supplied.coordinationText !== undefined ? supplied.coordinationText : (source === undefined ? undefined : source.coordinationText)
      return {
        ...stageDetail === undefined ? {} : { stageDetail },
        ...coordinationText === undefined ? {} : { coordinationText },
      }
    }

    /**
     * The page's stylesheet, scoped to `.gw-progress`.
     *
     * Every colour is a `--dsw-alias-*` token (mixed with `color-mix()` where a surface is
     * needed) and every family is a `--dsw-font-*` token, so the page follows the theme,
     * the contrast pass and dark mode instead of freezing a shade. The rules that cannot be
     * inline styles live here: the node row, the breathing current node, the measured wire
     * layer, the reduced-motion stop and the narrow layout.
     *
     * One rule per line is deliberate: a rule that spans lines cannot be read by the guard
     * that every selector is scoped to `.gw-progress`, and `@keyframes` bodies stay on their
     * `@` line for the same reason.
     */
    const PROGRESS_CSS = [
      '.gw-progress { position: relative; box-sizing: border-box; display: flex; flex-direction: column; width: 100%; min-width: 0; color: var(--dsw-alias-label-primary); font-family: var(--dsw-font-family-sans, inherit); font-size: 13px; }',
      // ── header: one title row (the run's name and the five-state chip), one sentence ──
      // The row wraps and the sentence takes a full line of its own, so the header is two
      // rows without a wrapper element standing between the two hooks a reader looks for.
      '.gw-progress-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 10px; padding: 12px 4px 9px; border-bottom: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-run { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-chip { display: inline-flex; align-items: center; gap: 6px; flex: none; height: 24px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--dsw-alias-border-l2, currentColor); background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 12%, transparent); color: var(--dsw-alias-label-secondary, inherit); font-size: 12px; font-weight: 600; white-space: nowrap; }',
      '.gw-progress-chip-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }',
      '.gw-progress-chip[data-state="waiting"] { border-color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-inverse, inherit); }',
      '.gw-progress-chip[data-state="running"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent); color: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-chip[data-state="running"] .gw-progress-chip-dot { animation: gw-progress-pulse 1.7s ease-in-out infinite; }',
      '.gw-progress-chip[data-state="done"] { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent); color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-chip[data-state="failed"], .gw-progress-chip[data-state="cancelled"] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 45%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); color: var(--dsw-alias-state-warn-primary); }',
      // The corner badge: a small square at the header's top right, past the chip, whose
      // face is only the run's state colour. It is the header's toggle: the two detail
      // lines below stay in the DOM for the reader who opened them and for the tests that
      // read them, but collapsed they answer `hidden`, so the page's first screen is the
      // figure instead of two meta sentences.
      '.gw-progress-corner { position: static; flex: none; align-self: center; width: 14px; height: 14px; margin: 0; margin-inline-start: 0; padding: 0; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 3px; background: transparent; cursor: pointer; }',
      '.gw-progress-corner:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }',
      '.gw-progress-corner-fill { position: absolute; inset: 2px; border-radius: 1px; background: var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-corner-fill[data-state="waiting"] { background: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-corner-fill[data-state="running"] { background: var(--dsw-alias-state-business-primary); animation: gw-progress-breathe 1.7s ease-in-out infinite; }',
      '.gw-progress-corner-fill[data-state="done"] { background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-corner-fill[data-state="failed"], .gw-progress-corner-fill[data-state="cancelled"] { background: var(--dsw-alias-state-warn-primary); }',
      // The details wrapper takes the whole row the two sentences shared, and holds
      // everything the badge opens: the two sentences, then the monitor's tiles.
      // It is the header's full-width second row: it always spans the row on its own
      // (`flex-basis: 100%` + `align-self: stretch`), so a narrow inline width on it
      // can never squeeze the tiles into a glyph-wide strip.
      '.gw-progress-details { display: flex; flex-direction: column; gap: 6px; flex: 1 0 100%; align-self: stretch; width: 100%; box-sizing: border-box; min-width: 0; }',
      '.gw-progress-details[hidden] { display: none; }',
      // The one sentence: the same step count the count line used to carry, plus the
      // measured remainder when there is one. It is meta text, so it is 12px.
      '.gw-progress-line { flex: 1 0 100%; min-width: 0; margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }',
      // The second sentence: the same meta line as the step sentence — same size, same
      // colour, same tabular figures — but one count on one line: on a narrow phone a
      // wrapped count reads as two facts, so it holds its line and clips instead.
      '.gw-progress-count { flex: 1 0 100%; min-width: 0; margin: 0; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
      // ── the figure: a scroll box of its own, and the fork drawn inside it ─────────
      // The run is left to right at every width, so the figure scrolls sideways rather than
      // folding into a column: a stacked column would destroy the fork the page is.
      '.gw-progress-figure { box-sizing: border-box; width: 100%; min-width: 0; margin: 14px 0 0; overflow-x: auto; overflow-y: hidden; }',
      // The sheet under the figure owns the scrolled space now; the figure keeps no room for a float.
      '.gw-progress-graph { position: relative; box-sizing: border-box; flex: none; margin: 0 auto; }',
      '.gw-progress-wires { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }',
      '.gw-progress-wires > path { fill: none; stroke: var(--dsw-alias-border-l2, currentColor); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }',
      '.gw-progress-pnodes { position: absolute; inset: 0; margin: 0; padding: 0; list-style: none; }',
      // A node's position and width come from the layout as inline styles; its **height stays
      // auto**, so what the page measures is the box a reader is really looking at.
      '.gw-progress-pnode { position: absolute; box-sizing: border-box; min-width: 0; }',
      // No card is raised: the sheet draws every opened list in the page flow, so no sibling can paint over one.
      // The body is a column of at most two rows: the word, then the row of lights. A card
      // with neither is the same column holding one row, so one box is all three kinds.
      '.gw-progress-pnode-body { box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: stretch; gap: 4px; width: 100%; min-width: 0; max-width: 100%; min-height: 32px; padding: 4px 8px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 10px; background-color: transparent; color: inherit; font: inherit; text-align: left; }',
      '.gw-progress-pnode-main { display: flex; align-items: center; gap: 6px; min-width: 0; }',
      // A node with something to open is a real button; one that is only a mark keeps the
      // same box, so the figure looks the same either way.
      '.gw-progress-pnode-body[type="button"] { cursor: pointer; }',
      '.gw-progress-pnode-body:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }',
      // A task card carries the word and the six ring lights: two rows, and the second one is
      // the row a reader scans for which leg of the six is speaking.
      '.gw-progress-pnode[data-kind="task"] .gw-progress-pnode-body { min-height: 56px; padding: 6px 8px; }',
      // A sub box stands for one recorded call: one row, and the small type of a detail.
      '.gw-progress-pnode[data-kind="sub"] .gw-progress-pnode-body { min-height: 30px; padding: 0 8px; border-radius: 8px; }',
      // The run's five places are capsules, because they are places and not work; 验收 carries
      // the five checks under its word, so it is two rows tall like a task.
      '.gw-progress-pnode[data-kind="start"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="plan"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="summarize"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="accept"] .gw-progress-pnode-body, .gw-progress-pnode[data-kind="end"] .gw-progress-pnode-body { justify-content: center; border-radius: 999px; }',
      '.gw-progress-pnode[data-kind="accept"] .gw-progress-pnode-body { min-height: 56px; }',
      '.gw-progress-pnode-dot { display: inline-block; flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-pnode-word { min-width: 0; flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }',
      '.gw-progress-pnode[data-kind="task"] .gw-progress-pnode-word { font-size: 12px; }',
      '.gw-progress-pnode[data-kind="sub"] .gw-progress-pnode-word { font-size: 11px; font-weight: 500; }',
      '.gw-progress-pnode[data-kind="start"] .gw-progress-pnode-word, .gw-progress-pnode[data-kind="end"] .gw-progress-pnode-word { flex: 0 1 auto; }',
      '.gw-progress-pnode-badge { flex: none; font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); white-space: nowrap; font-variant-numeric: tabular-nums; }',
      // A capsule's badge sits on a row of its own, centred under the word: the word keeps the
      // whole line, so 汇总 is never cut to make room for a draft number.
      '.gw-progress-pnode-detail { display: flex; justify-content: center; align-items: center; min-width: 0; }',
      // ── the lights: six rings on a task, five checks on 验收 ─────────────────────
      // A light is a dot and nothing else: the state is its colour, the word is its tooltip,
      // and the card's own spoken label keeps the sentence a screen reader hears short.
      '.gw-progress-pnode-lights { display: flex; align-items: center; gap: 4px; min-width: 0; flex-wrap: wrap; }',
      '.gw-progress-ring, .gw-progress-check { display: inline-block; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-ring[data-state="done"], .gw-progress-check[data-state="done"] { background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-ring[data-state="doing"], .gw-progress-check[data-state="doing"] { background: var(--dsw-alias-state-business-primary); animation: gw-progress-breathe 1.7s ease-in-out infinite; }',
      // Not reached is the only light with no fill, exactly like the node's own dot.
      '.gw-progress-ring[data-state="pending"], .gw-progress-check[data-state="pending"] { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-ring[data-state="failed"], .gw-progress-ring[data-state="blocked"], .gw-progress-check[data-state="failed"], .gw-progress-check[data-state="blocked"] { background: var(--dsw-alias-state-warn-primary); }',
      // A passed card is green, from its edge to its dot and its word.
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-body { border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-pnode[data-state="done"] .gw-progress-pnode-word { color: var(--dsw-alias-state-success-primary); }',
      // The current card is blue, its dot breathing so the page says where it is even
      // before a reader reads a word.
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-body { border-color: var(--dsw-alias-state-business-primary); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-business-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-business-primary); animation: gw-progress-breathe 1.7s ease-in-out infinite; }',
      '.gw-progress-pnode[data-state="doing"] .gw-progress-pnode-word { color: var(--dsw-alias-state-business-primary); }',
      // Not reached yet: a dashed edge and a hollow dot — the only state with no fill, so
      // "nothing has happened here" reads without relying on colour.
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-body { border-style: dashed; background-image: none; }',
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-dot { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary); }',
      '.gw-progress-pnode[data-state="pending"] .gw-progress-pnode-word { color: var(--dsw-alias-label-secondary, inherit); }',
      // Failed, blocked and cancelled are amber: three ways of saying the run did not get
      // through, and none of them is an error the page can explain.
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-body, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-body, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-body { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 50%, transparent); background-image: linear-gradient(180deg, color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent), color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent)); }',
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-dot, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-dot, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-dot { background: var(--dsw-alias-state-warn-primary); }',
      '.gw-progress-pnode[data-state="failed"] .gw-progress-pnode-word, .gw-progress-pnode[data-state="blocked"] .gw-progress-pnode-word, .gw-progress-pnode[data-state="cancelled"] .gw-progress-pnode-word { color: var(--dsw-alias-state-warn-primary); }',
      // The reader's place gets the ring, whatever state it is in: a failure still holds the
      // run, and the page has to say where that is.
      '.gw-progress-pnode[data-current="true"] .gw-progress-pnode-body { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent); }',
      // The opened calls are rendered by the sheet under the figure at every width: the
      // node keeps no floating box of its own, so no sibling moves and no card is covered.
      // The inset below keeps the retired floating rule readable for history, not for layout.
      // Retired: the node drew no floating box since the sheet took every opened list (see `.gw-progress-sheet .gw-progress-node-calls`). Kept as a comment so history stays readable.
      // The all-rejected verdict rides in that list as plain rows: the summary node has no
      // shipped row to show, so its opened list is where the three facts are read.
      '.gw-progress-node-rejected { margin: 0; padding: 6px 4px; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-node-rejected[data-gw-progress-node-rejected="drafts"] { font-weight: 600; color: var(--dsw-alias-state-warn-primary); }',
      // The slot one call reached: the chain's word, in a capsule of its own.
      '.gw-progress-node-calls [data-gw-progress-task-chain] { flex: none; padding: 1px 6px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; white-space: nowrap; }',
      // ── the opened calls: one sheet under the figure, at every width ────────────
      // The floating list used to hang under its card and land on the neighbour (one open
      // list over 2 cards at desktop, four over 9) — so the list is drawn outside the
      // figure, here, in the panel's own column. Its height is capped so the page always
      // keeps the rest in reach, and it is the one box that scrolls: down, never sideways.
      // WHY one box, not one per width: two boxes means two overlap stories to keep at 0;
      // the sheet already proved 0 against every card and the dock.
      '.gw-progress-sheet { box-sizing: border-box; display: flex; flex: none; flex-direction: column; gap: 6px; min-width: 0; max-height: min(50vh, 240px); overflow-y: auto; margin: 12px 0 0; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 12px; background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-l1, transparent)); }',
      '.gw-progress-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }',
      '.gw-progress-sheet-title { min-width: 0; font-size: 11px; font-weight: 600; letter-spacing: .06em; color: var(--dsw-alias-label-secondary, inherit); }',
      // The one control: a capsule the thumb can hit, and it answers Enter and Space because
      // it is a button, not a mark.
      '.gw-progress-sheet-hide { flex: none; display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 12px; cursor: pointer; }',
      '.gw-progress-sheet-hide:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }',
      '.gw-progress-sheet-group { display: flex; flex-direction: column; gap: 2px; min-width: 0; }',
      '.gw-progress-sheet-node { margin: 0; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }',
      // In the sheet the list is a column of rows in the page's flow, not a box of its own:
      // the sheet already carries the border, the fill and the one scroll.
      '.gw-progress-sheet .gw-progress-node-calls { position: static; max-height: none; overflow-y: visible; margin: 0; padding: 0; list-style: none; border: 0; border-radius: 0; background: none; box-shadow: none; }',
      // The room the sheet is scrolled into: the panel is often barely taller than the screen,
      // so without it the scroll runs out with the list still at the bottom of the column —
      // which is exactly where the shell pins its composer. It is empty, silent, and there
      // only while a list is open.
      '.gw-progress-sheet-room { flex: none; height: 35vh; }',
      // ── a click traces the wires ─────────────────────────────────────────────────
      // The clicked node's own lines step forward and every other line steps back: the
      // figure keeps its structure while the branch a reader asked about reads first.
      '.gw-progress-wires > path[data-trace="active"] { stroke: var(--dsw-alias-state-business-primary); stroke-width: 2; }',
      '.gw-progress-wires > path[data-trace="dim"] { opacity: 0.3; }',
      '.gw-progress-pnode[data-trace="active"] .gw-progress-pnode-body { border-color: var(--dsw-alias-state-business-primary); }',
      // ── the trace legend: five standing words, once a node is opened ─────────────
      // Four short sentences under the figure, only while a trace is lit: what a lit wire,
      // a dimmed wire, the six dots and the five dots each say. Plain text in the page flow,
      // so it wraps on a phone and never covers a card.
      '.gw-progress-legend { box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 10px 4px 0; padding: 0; list-style: none; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); }',
      '.gw-progress-legend-item { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }',
      '.gw-progress-legend-wire { display: inline-block; width: 18px; height: 2px; border-radius: 1px; background: var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-legend-wire[data-trace="active"] { background: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-legend-wire[data-trace="dim"] { opacity: 0.4; }',
      '.gw-progress-legend-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-legend-dot[data-state="pending"] { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-state-idle-primary, var(--dsw-alias-label-primary, Canvas)); }',
      // ── one call line: clock, gate and word ──────────────────────────────────────
      '.gw-progress-log-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; padding: 8px 6px; border-bottom: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      // A list hangs under one card, so a row is only ever as wide as that card — 110 to 240
      // px. The clock, the gate and the verdict share the first line, and a task's title takes
      // a line of its own. Nothing here may be squeezed: a column cell that runs out of room
      // breaks a CJK word between every two characters, which is how a row used to read.
      '.gw-progress-node-calls .gw-progress-log-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; padding: 6px 4px; }',
      // The line box holds the gate capsule and the title; it is flattened so the title can take
      // the row's whole second line while the gate stays beside the clock.
      '.gw-progress-node-calls .gw-progress-log-line { display: contents; }',
      '.gw-progress-node-calls .gw-progress-log-time { flex: none; white-space: nowrap; }',
      '.gw-progress-node-calls .gw-progress-log-role, .gw-progress-node-calls .gw-progress-call-chain { flex: none; white-space: nowrap; }',
      // The verdict sits at the right end of the first line; when that line is too narrow for
      // all four it wraps to the next one whole, which a column cell cannot do.
      '.gw-progress-node-calls .gw-progress-log-word { flex: none; margin-left: auto; white-space: nowrap; }',
      '.gw-progress-node-calls .gw-progress-log-pill { flex: none; }',
      '.gw-progress-node-calls .gw-progress-log-name { order: 1; flex: 1 1 100%; min-width: 0; }',
      '.gw-progress-log-row:last-child { border-bottom: 0; }',
      '.gw-progress-log-time { font-size: 11px; color: var(--dsw-alias-label-secondary, inherit); font-variant-numeric: tabular-nums; }',
      '.gw-progress-log-line { display: flex; align-items: baseline; gap: 6px; min-width: 0; }',
      '.gw-progress-log-role { flex: none; font-size: 13px; font-weight: 600; }',
      '.gw-progress-log-name { min-width: 0; font-size: 13px; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-log-word { flex: none; font-size: 12px; color: var(--dsw-alias-label-secondary, inherit); white-space: nowrap; }',
      '.gw-progress-log-row[data-state="done"] .gw-progress-log-word { color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-log-row[data-state="doing"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 8%, transparent); }',
      '.gw-progress-log-row[data-state="doing"] .gw-progress-log-word { color: var(--dsw-alias-state-business-primary); font-weight: 600; }',
      '.gw-progress-log-row[data-state="failed"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }',
      '.gw-progress-log-row[data-state="blocked"] { border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 10%, transparent); }',
      '.gw-progress-log-row[data-state="failed"] .gw-progress-log-word { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }',
      '.gw-progress-log-row[data-state="blocked"] .gw-progress-log-word { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }',
      '.gw-progress-open { display: inline-flex; align-items: center; height: 22px; margin-left: auto; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 11px; white-space: nowrap; }',
      '.gw-progress-open[type="button"] { cursor: pointer; }',
      '.gw-progress-open[type="button"]:hover { border-color: var(--dsw-alias-state-business-primary); }',
      // ── the stuck line: one sentence, and only while something is stuck ──────────
      '.gw-progress-stuck { margin: 10px 4px 0; font-size: 12px; color: var(--dsw-alias-state-warn-primary); overflow-wrap: anywhere; }',
      // ── the foot: the dock's one button, or nothing ──────────────────────────────
      '.gw-progress-foot { display: flex; flex-direction: column; gap: 8px; margin-top: 18px; padding: 0 4px 4px; border-top: 1px solid var(--dsw-alias-border-l2, currentColor); }',
      '.gw-progress-dock { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding-top: 10px; }',
      '.gw-progress-dock-fill { display: block; width: 100%; height: 40px; border: 0; border-radius: 12px; background: var(--dsw-alias-state-business-primary); color: var(--dsw-alias-label-inverse, inherit); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }',
      '.gw-progress-dock-fill:hover { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 85%, var(--dsw-alias-label-primary, currentColor)); }',
      '.gw-progress-dock-fill:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 3px; }',
      '.gw-progress-filled { margin: 0; text-align: center; font-size: 12px; color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-empty { padding: 14px 4px; color: var(--dsw-alias-label-secondary, inherit); }',
      // ── the Guardian: four tiles inside the opened details ──────────────────────
      // The wide four-tile band is retired: no band stands under the figure on its own, and
      // no second square is drawn. The tiles are part of the details the page's one corner
      // badge opens, and they stand in the page's flow under the header, at the page's own
      // width, so nothing floats over the figure and nothing squeezes a tile into a column
      // of single glyphs. Every old marker (aside, blocks, tiles, findings) stays in the
      // tree for the reader and the specs.
      '.gw-progress-guardian { display: flex; flex-direction: column; gap: 8px; box-sizing: border-box; min-width: 0; margin: 2px 0 0; padding: 11px 14px; border: 1px solid color-mix(in srgb, var(--dsw-alias-state-success-primary) 28%, var(--dsw-alias-border-l2, currentColor)); border-radius: 14px; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian[data-state="active"] { border-color: color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 6%, transparent); }',
      '.gw-progress-guardian[data-state="cancelled"] { border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 38%, var(--dsw-alias-border-l2, currentColor)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent); }',
      // The lane reads as blocks, not as a head plus a list: two tiles a row, and the
      // findings (or the sentence that there are none) across the whole width. Each tile
      // holds at least a thumb-wide column (`minmax(120px, 1fr)`), so a squeezed ancestor
      // wraps whole words instead of stacking one glyph per line.
      '.gw-progress-guardian-blocks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }',
      '.gw-progress-guardian-blocks > * { min-width: 120px; }',
      '.gw-progress-guardian-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l2, currentColor); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 6%, transparent); }',
      '.gw-progress-guardian-block[data-gw-progress-guardian-block="findings"] { grid-column: 1 / -1; padding: 0; border-color: transparent; background: transparent; }',
      '.gw-progress-guardian-block-label { font-size: 10px; font-weight: 600; letter-spacing: .06em; color: var(--dsw-alias-label-secondary, inherit); overflow-wrap: anywhere; }',
      '.gw-progress-guardian-block-value { font-size: 12px; font-weight: 650; color: var(--dsw-alias-label-primary, inherit); overflow-wrap: anywhere; }',
      // The state word keeps the colour it always had, on the tile that now holds it.
      '.gw-progress-guardian[data-state="active"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-business-primary); }',
      '.gw-progress-guardian[data-state="finished"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-success-primary); }',
      '.gw-progress-guardian[data-state="cancelled"] [data-gw-progress-guardian-block="status"] .gw-progress-guardian-block-value { color: var(--dsw-alias-state-warn-primary); }',
      '.gw-progress-guardian-empty { margin: 0; color: var(--dsw-alias-label-secondary, inherit); font-size: 11px; }',
      '.gw-progress-guardian-list { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }',
      '.gw-progress-guardian-list li { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; min-width: 0; padding: 6px 8px; border-inline-start: 3px solid var(--dsw-alias-state-warn-primary, currentColor); border-radius: 7px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 5%, transparent); font-size: 11px; }',
      '.gw-progress-guardian-list li[data-action="rescue"] { border-inline-start-color: var(--dsw-alias-state-success-primary, currentColor); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 5%, transparent); }',
      '.gw-progress-guardian-finding-label { font-weight: 600; }',
      '.gw-progress-guardian-finding-action { color: var(--dsw-alias-label-secondary, inherit); }',
      // ── motion: two decorations, both stoppable ──────────────────────────────────
      '@keyframes gw-progress-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      '@keyframes gw-progress-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }',
      // Motion is decoration here: the card's colour and its spoken state word already say
      // "current", so a reader who asked for less motion loses nothing.
      '@media (prefers-reduced-motion: reduce) {',
      '  .gw-progress-pnode[data-state="doing"] .gw-progress-pnode-dot, .gw-progress-ring[data-state="doing"], .gw-progress-check[data-state="doing"], .gw-progress-chip[data-state="running"] .gw-progress-chip-dot, .gw-progress-corner-fill[data-state="running"] { animation: none; }',
      '}',
      // Under 720px the figure keeps its direction and every row drops to 34px: the cards
      // wrap their word instead of being cut, because a task name on a phone is worth two
      // lines, and nothing is stacked into a column — that would destroy the fork.
      '@media (max-width: 720px) {',
      '  .gw-progress-pnode[data-kind] .gw-progress-pnode-body { min-height: 34px; padding: 4px 8px; }',
      '  .gw-progress-pnode-word { overflow: visible; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }',
      '  .gw-progress-run { white-space: normal; overflow-wrap: anywhere; }',
      '  .gw-progress-count { flex: 1 0 100%; min-width: 0; }',
      '}',
      // Under 480px the dock keeps one full-width button and a call line drops its clock
      // column; the figure still scrolls sideways rather than folding.
      '@media (max-width: 480px) {',
      '  .gw-progress-dock { flex-direction: column; align-items: stretch; }',
      // A list that floats inside a card on a phone has no room for a clock column, so that
      // list drops it. The sheet has the panel's whole width, so it keeps the row it took
      // from the page — clock, verb and tail — on the same two rules it uses everywhere.
      '  .gw-progress-node-calls .gw-progress-log-row { grid-template-columns: minmax(0, 1fr) auto; }',
      '  .gw-progress-node-calls .gw-progress-log-time { display: none; }',
      '  .gw-progress-sheet .gw-progress-log-row { grid-template-columns: 40px minmax(0, 1fr) auto auto; }',
      '  .gw-progress-sheet .gw-progress-log-time { display: inline; }',
      '}',
    ].join('\n')

    /** The one word a chain capsule is called by, when that gate was reached. */
    const PROGRESS_CHAIN_LABEL_KEY = {
      execute: 'progress.chain.execute',
      check: 'progress.chain.check',
      review: 'progress.chain.review',
    }

    /**
     * The word of one call line.
     *
     * The state decides first (a failed line says 没过 whatever role spoke it), then the
     * shipped mark, then the role — a finished `执行`, `检查` and `复核` are three different
     * verbs, so one `done` word would flatten the calls into a column of identical sentences.
     */
    function progressLogWord(row, t) {
      if (row.state !== 'done') return t(PROGRESS_LOG_STATE_KEY[row.state] === undefined ? 'progress.log.done' : PROGRESS_LOG_STATE_KEY[row.state])
      if (row.shipped === true) return t('progress.log.shipped')
      const chain = progressChainForLabel(row.role)
      return t(chain === undefined ? 'progress.log.done' : PROGRESS_LOG_ROLE_KEY[chain.key])
    }

    /**
     * The wall clock of one row's start, as a line prints it (`8:02`).
     *
     * Minutes are padded and hours are not: the column reads as a time, not as a table
     * cell, and a two-digit hour still fits the column.
     */
    function progressClockText(at) {
      const date = new Date(at)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return ''
      return `${hours}:${String(minutes).padStart(2, '0')}`
    }

    /**
     * The one control on a row: opens that child session, and only when the shell can.
     *
     * A capsule the shell cannot open is a plain mark rather than a button, so an
     * unopenable row cannot be clicked into the wrong session.
     * @param childId - the child session the row belongs to, when it has one.
     * @param props - translator, the open gate and the open callback.
     * @returns the capsule element.
     */
    function ProgressOpenPill(childId, props) {
      const label = props.t('progress.member.open')
      const known = typeof childId === 'string' && childId !== ''
      const openable = known && props.canOpen(childId)
      return h(openable ? 'button' : 'span', {
        className: 'gw-progress-open',
        type: openable ? 'button' : undefined,
        'data-gw-progress-open': known ? childId : undefined,
        title: label,
        'aria-label': label,
        onClick: openable ? () => props.openChild(childId) : undefined,
      }, label)
    }

    /**
     * One call, as a line under the node it belongs to.
     *
     * The line is the moment, the gate and the result. The gate is drawn as the chain's own
     * capsule when the call's role names one, because that word *is* the role (`memberLabel`
     * writes exactly those), and a role that names no slot keeps its word instead — a line
     * with a clock and a result and nobody's name would say less than the one it replaces.
     * The task name follows the gate: the node above names the leg, never the task, so this
     * is the only place a reader can see which task the call ran for. When the phase and the
     * role are the same word — a run with no plan tasks logs `规划 规划` — the name says
     * nothing and is dropped.
     * @param row - one story log row.
     * @param props - translator, the open gate and the open callback.
     * @param options - `pill` adds the capsule (only when the shell can open that child),
     *   `childId` names the child, `key` the React key.
     * @returns the row element.
     */
    function ProgressLogRow(row, props, options) {
      const t = props.t
      const slot = progressChainForLabel(typeof row.role === 'string' ? row.role : '')
      const line = []
      if (slot === undefined) {
        line.push(h('span', { key: 'role', className: 'gw-progress-log-role', 'data-gw-progress-log-role': true }, row.role))
      } else {
        line.push(h('span', {
          key: 'chain',
          className: 'gw-progress-call-chain',
          'data-gw-progress-task-chain': true,
        }, t(PROGRESS_CHAIN_LABEL_KEY[slot.key])))
      }
      if (row.title !== '' && row.title !== row.role) {
        line.push(h('span', { key: 'name', className: 'gw-progress-log-name', 'data-gw-progress-log-name': true }, row.title))
      }
      const cells = [
        h('span', { key: 'time', className: 'gw-progress-log-time', 'data-gw-progress-log-time': true },
          typeof row.at === 'number' ? progressClockText(row.at) : ''),
        h('span', { key: 'line', className: 'gw-progress-log-line', 'data-gw-progress-log-line': true }, line),
        h('span', { key: 'word', className: 'gw-progress-log-word', 'data-gw-progress-log-word': true }, progressLogWord(row, t)),
      ]
      if (options.pill === true && props.canOpen(options.childId) === true) {
        cells.push(h('span', { key: 'pill', className: 'gw-progress-log-pill' }, ProgressOpenPill(options.childId, props)))
      }
      return h('li', {
        key: options.key === undefined ? row.seq : options.key,
        className: 'gw-progress-log-row',
        'data-gw-progress-log-row': row.seq,
        'data-state': row.state,
      }, cells)
    }

    /** What a host without layout measured: no width, and every node at its default size. */
    const EMPTY_PANEL_MEASURE = { width: 0, sizes: {} }

    /** The reader's place before the first click: no node open, no wire traced. */
    const EMPTY_PANEL_OPENED = []

    /**
     * Read the real boxes off the page, once per draw.
     *
     * The space the page gave the figure is read from the graph's **parent**, not from the
     * graph itself: the graph's own width is the layout's output, so measuring it there would
     * only ever confirm the number it was given — and the figure is the box that scrolls when
     * the flow is wider than the column. Node heights come back with it: that is what keeps
     * the wires landing on the boxes a reader sees rather than on the defaults a first paint
     * had to guess.
     * @param graph - the `.gw-progress-graph` element, when the host rendered one.
     * @returns the column width and every node's measured box.
     */
    function measureProgressPanel(graph) {
      if (graph === null || graph === undefined) return EMPTY_PANEL_MEASURE
      if (typeof graph.querySelectorAll !== 'function' || typeof graph.getBoundingClientRect !== 'function') return EMPTY_PANEL_MEASURE
      const frameOf = (element) => {
        if (element === null || element === undefined || typeof element.getBoundingClientRect !== 'function') return undefined
        const rect = element.getBoundingClientRect()
        return rect.width > 1 ? rect : undefined
      }
      const host = frameOf(graph.parentElement) === undefined ? frameOf(graph) : frameOf(graph.parentElement)
      const width = host === undefined ? 0 : Math.round(host.width)
      const sizes = {}
      for (const element of Array.from(graph.querySelectorAll('[data-gw-progress-pnode]'))) {
        const id = typeof element.getAttribute === 'function' ? element.getAttribute('data-gw-progress-pnode') : undefined
        if (typeof id !== 'string' || id === '') continue
        if (typeof element.getBoundingClientRect !== 'function') continue
        const rect = element.getBoundingClientRect()
        if (!(rect.width > 1) || !(rect.height > 1)) continue
        sizes[id] = { w: Math.round(rect.width), h: Math.round(rect.height) }
      }
      if (width === 0 && Object.keys(sizes).length === 0) return EMPTY_PANEL_MEASURE
      return { width, sizes }
    }

    /**
     * Whether two measurements are the same draw.
     *
     * The redraw runs after every render and on every resize, so without this comparison a
     * settled page would keep re-rendering itself: an identical measurement has to be a
     * no-op, or the observer would feed its own output back in.
     */
    function samePanelMeasure(left, right) {
      if (left === right) return true
      if (left === undefined || right === undefined) return false
      if (left.width !== right.width) return false
      const one = Object.keys(left.sizes)
      const other = Object.keys(right.sizes)
      if (one.length !== other.length) return false
      for (const id of one) {
        const mine = left.sizes[id]
        const theirs = right.sizes[id]
        if (theirs === undefined || mine.w !== theirs.w || mine.h !== theirs.h) return false
      }
      return true
    }

    /**
     * The badge a card prints beside its word, or `''` when the word says it all.
     *
     * One card carries one: 汇总 says which draft the run actually shipped, because a run may
     * ship a second or a third one and the opened list marks the row it went out on. A task
     * says nothing — a retry inside a task is a second sub box, and that box's own label
     * already numbers it (`· 第 2 遍`) — and so do the five places of the run.
     * @param node - one panel node.
     * @param shipped - the draft number the gate shipped, when the run shipped one.
     * @param t - translator.
     * @returns the badge text, or `''` when this node carries none.
     */
    function progressPanelBadge(node, shipped, t) {
      if (node.kind !== 'summarize') return ''
      if (!Number.isFinite(shipped) || shipped <= 0) return ''
      return t('progress.flow.draft', { n: shipped })
    }

    /**
     * The all-rejected verdict, as rows of the summary node's call list.
     *
     * There is no card for this: the verdict belongs to the step it happened on, so it is
     * read where that step's calls are. Three lines, in the order a reader asks them — how
     * many drafts went in, which gate the last one stopped at, and the gate's own words. The
     * gate is named with the leg word the page already prints for it (`检查` / `复核`), so the
     * verdict adds no vocabulary of its own.
     * @param rejected - the verdict the summary node carries.
     * @param t - translator.
     * @returns one row per fact, in reading order.
     */
    function progressRejectedLines(rejected, t) {
      const gate = t(rejected.stage === 'check' ? 'progress.flow.check' : 'progress.flow.review')
      return [
        ['drafts', t('progress.final.rejected', { n: rejected.drafts })],
        ['stage', t('progress.final.rejectedStage', { stage: gate })],
        ['reason', t('progress.final.rejectedReason', { reason: rejected.reason })],
      ].map(([fact, text]) => h('li', {
        key: 'rejected:' + fact,
        className: 'gw-progress-node-rejected',
        'data-gw-progress-node-rejected': fact,
      }, text))
    }

    /** One edge's identity while the page draws it: the layout carries ids, not objects. */
    function panelEdgeKey(from, to) {
      return `${from}\u0000${to}`
    }

    /**
     * The nodes one traced node lights: itself, and every node it is wired to.
     *
     * The trace owns no data of its own. It is a reading of the edges the figure already
     * draws, so both sets below are derived from `graph.edges` and nothing else — no second
     * description of the run, and no new sentence on the page.
     * @param graph - the panel model.
     * @param traced - the id a click traced, or `undefined` when nothing is traced.
     * @returns every id to mark `active`.
     */
    function panelTraceNodes(graph, traced) {
      const lit = new Set()
      if (traced === undefined) return lit
      lit.add(traced)
      for (const edge of graph.edges) {
        if (edge.from === traced) lit.add(edge.to)
        if (edge.to === traced) lit.add(edge.from)
      }
      return lit
    }

    /**
     * The edges one traced node lights, keyed the way the drawn layout names them.
     *
     * Every other edge of the same figure is dimmed instead, so the picture keeps its
     * structure while the reader's own branch steps forward.
     * @param graph - the panel model.
     * @param traced - the id a click traced, or `undefined` when nothing is traced.
     * @returns the edges to mark `active`.
     */
    function panelTraceEdges(graph, traced) {
      const lit = new Set()
      if (traced === undefined) return lit
      for (const edge of graph.edges) {
        if (edge.from === traced || edge.to === traced) lit.add(panelEdgeKey(edge.from, edge.to))
      }
      return lit
    }

    /** The DOM id of one node's opened call list: the node's own id, reused verbatim. */
    function progressPanelCallsId(id) {
      return `gw-progress-calls-${id}`
    }

    /**
     * One node's opened calls: the rows it declared, then the verdict when it carries one.
     *
     * The list belongs to the node that opened it, and holds the same rows wherever it is
     * drawn: always in the panel's own column under the figure (one sheet at every width),
     * because a floating list over cards lands on the neighbour and the layout will not
     * move a card out of its way (see {@link ProgressPanelSheet}). A row comes from the
     * page's one log line — the same `progressStoryLogRow` any other reading of that call
     * would use — and only the row the gate shipped carries the shipped mark.
     * @param node - one panel node.
     * @param props - translator, the open gate, the opener and the shipped row's `seq`.
     * @returns the list element.
     */
    function ProgressPanelCalls(node, props) {
      const rows = node.calls.map((member) => ProgressLogRow(
        progressStoryLogRow(member, props.shippedSeq !== undefined && member.seq === props.shippedSeq ? member : undefined),
        props,
        { key: `call:${member.seq}`, childId: member.childId, pill: true },
      ))
      // The all-rejected verdict has no card of its own: it belongs to the step it happened
      // on, so it is read where that step's calls are.
      const verdict = node.rejected === undefined ? [] : progressRejectedLines(node.rejected, props.t)
      return h('ol', {
        key: 'calls',
        className: 'gw-progress-node-calls',
        'data-gw-progress-node-calls': node.id,
        id: progressPanelCallsId(node.id),
        'aria-label': props.t('progress.panel.list', { node: node.label }),
      }, [...rows, ...verdict])
    }

    /** The dictionary prefix of each row of lights: the six ring words, the five checks. */
    const PROGRESS_RING_KEY = 'progress.ring.'
    const PROGRESS_CHECK_KEY = 'progress.verify.'

    /**
     * The row of lights one card carries: six rings on a task, five checks on 验收.
     *
     * The opened calls, drawn under the figure instead of on top of it.
     *
     * A node's list used to float out from under its own box and land on the card beside
     * it. So the list leaves the figure altogether and is drawn in the panel's own column,
     * right after the figure — where it can push the page down but never cross a rectangle
     * it did not draw, and where the dock's button stays in front of it rather than under it.
     *
     * Nothing in the list changes with the box that carries it: the same rows from the same
     * renderer, the same verdict lines, the same ids the node's `aria-controls` names. Each
     * opened node is named by the card's own word, because the figure may be out of sight by
     * the time the list is read, and one control puts the whole thing away — the second way
     * into the toggle a node click already owns.
     * @param nodes - the opened nodes that have something to show, in the order they opened.
     * @param props - translator, the row props and the close handler.
     * @param sheetRef - the ref the page scrolls into view when the sheet opens.
     * @returns the sheet element.
     */
    function ProgressPanelSheet(nodes, props, sheetRef) {
      const names = nodes.map((node) => node.label).filter((label) => label !== '').join('、')
      return h('div', {
        className: 'gw-progress-sheet',
        'data-gw-progress-sheet': true,
        role: 'region',
        'aria-label': props.t('progress.panel.calls') + (names === '' ? '' : '：' + names),
        ref: sheetRef,
      },
      h('div', { key: 'head', className: 'gw-progress-sheet-head' },
        h('span', { key: 'title', className: 'gw-progress-sheet-title' }, props.t('progress.panel.calls')),
        h('button', {
          key: 'hide',
          type: 'button',
          className: 'gw-progress-sheet-hide',
          'data-gw-progress-sheet-hide': true,
          onClick: props.onSheetClose,
        }, props.t('progress.panel.collapse'))),
      nodes.map((node) => h('div', { key: `calls:${node.id}`, className: 'gw-progress-sheet-group' },
        h('p', { key: 'node', className: 'gw-progress-sheet-node' }, node.label),
        ProgressPanelCalls(node, props))))
    }

    /**
     * Bring the sheet into the reader's view when it opens.
     *
     * **Not** `block: 'nearest'`: the shell keeps its composer pinned to the bottom of the
     * screen, so a list scrolled to the nearest edge comes to rest exactly behind it — the
     * reader taps a card, the list opens, and nothing looks like it happened. Centring puts
     * the list in the middle of the column the reader is looking at, which leaves the bottom
     * of the screen free at any phone height. The sheet is in the page's flow, so this moves
     * the page and covers nothing.
     *
     * A host without layout passes no box, and a page with no sheet (every wide window) never
     * calls this at all: the guard is what keeps it from being a no-op that still throws.
     * @param box - the sheet element, when the page drew one.
     */
    function progressPanelReveal(box) {
      if (box === undefined || box === null || typeof box.scrollIntoView !== 'function') return
      box.scrollIntoView({ block: 'center' })
    }

    /**
     * The attempt dots of one task node, and the dashed step between a failed try and the
     * one that followed it.
     *
     * The row of lights one card carries: six rings on a task, five checks on 验收.
     * The lights are decoration looked up on the model by node id, not lines of the mermaid
     * text: they say how far a step got of its six legs, not which step it is, and the text is
     * the structure. Each light is one dot in the card's second row, coloured by the same
     * state vocabulary every other dot on the page uses, with its own word as the tooltip. The
     * row is `aria-hidden`, so the card's spoken label stays the one short sentence a screen
     * reader hears.
     * @param node - one panel node.
     * @param t - translator.
     * @returns the lights' row, or `null` when this card carries none.
     */
    function ProgressPanelLights(node, t) {
      const checks = Array.isArray(node.checks) && node.checks.length > 0
      const list = checks ? node.checks : node.rings
      if (!Array.isArray(list) || list.length === 0) return null
      return h('span', {
        key: 'lights',
        className: 'gw-progress-pnode-lights',
        'data-gw-progress-pnode-lights': checks ? 'checks' : 'rings',
        title: t(checks ? 'progress.panel.checks' : 'progress.panel.rings'),
        'aria-hidden': 'true',
      }, list.map((light) => h('span', {
        key: light.key,
        className: checks ? 'gw-progress-check' : 'gw-progress-ring',
        [checks ? 'data-gw-progress-check' : 'data-gw-progress-ring']: light.key,
        'data-state': light.state,
        title: t((checks ? PROGRESS_CHECK_KEY : PROGRESS_RING_KEY) + light.key),
      })))
    }

    /**
     * One card of the figure.
     *
     * The visible text is the step's own word, or a task's title, or a sub box's call, plus
     * the badge when one is due. Under it sits the row of lights: a task's six rings, 验收's
     * five checks. Everything else is colour and a spoken state word — the page adds no
     * sentence to a card.
     *
     * The body is the card's control whenever it has something to open — a real `button`, so
     * Enter and Space reach it — and a plain `div` when it has nothing, which is the same rule
     * the page always had: a mark is not a control. One click does the two readings this page
     * offers: it opens (or closes) the calls, and it lights (or drops) the wires that touch
     * this card. The trace is not a second control, so a card with nothing to open still
     * answers a pointer and gets no button of its own.
     *
     * Where the opened list is drawn depends on the width, and only on that: on the card
     * itself while there is room beside it, in the page's sheet under the figure when there
     * is not (`props.sheet`). The click that opens it is the same click either way, so the
     * card's own behaviour does not change with the window.
     * @param node - one panel node.
     * @param box - its laid-out box; `box.column` is the column the text put it in.
     * @param props - translator, the open and trace state, the handlers and the row props.
     * @returns the node element.
     */
    function ProgressPanelNode(node, box, props) {
      const t = props.t
      const badge = progressPanelBadge(node, props.shippedDraft, t)
      const stateWord = t(PROGRESS_PLAN_KEY[node.state] === undefined ? 'progress.plan.waiting' : PROGRESS_PLAN_KEY[node.state])
      const open = props.opened.indexOf(node.id) !== -1
      const traced = props.tracedNodes.has(node.id)
      const onClick = () => props.onNodeClick(node.id)
      const subtask = node.subtask === undefined || node.subtask === null ? undefined : node.subtask
      const badgeSpan = badge === '' ? null : h('span', {
        key: 'badge',
        className: 'gw-progress-pnode-badge',
        'data-gw-progress-pnode-badge': true,
      }, badge)
      // A capsule keeps its word alone on the line and puts the badge under it: 汇总 and a
      // draft number do not fit one 88 px pill, and a card that cuts its own title to `汇` is
      // worse than a card that is one row taller.
      const capsule = node.kind !== 'task' && node.kind !== 'sub'
      const main = h('span', { key: 'main', className: 'gw-progress-pnode-main' }, [
        h('span', { key: 'dot', className: 'gw-progress-pnode-dot', 'aria-hidden': 'true' }),
        h('span', {
          key: 'word',
          className: 'gw-progress-pnode-word',
          'data-gw-progress-pnode-word': true,
          title: node.label,
        }, node.label),
        capsule ? null : badgeSpan,
      ])
      const detail = capsule && badgeSpan !== null
        ? h('span', { key: 'detail', className: 'gw-progress-pnode-detail' }, badgeSpan)
        : null
      const parts = [main, detail, ProgressPanelLights(node, t)]
      return h('li', {
        key: node.id,
        className: 'gw-progress-pnode',
        'data-gw-progress-pnode': node.id,
        'data-kind': node.kind,
        // The column the text decided, not a number the model guessed at: the figure is laid
        // out from the mermaid source, so the drawn level is the layout's own.
        'data-level': String(box.column),
        'data-state': node.state,
        'data-current': node.current ? 'true' : 'false',
        ...subtask === undefined ? {} : {
          // A branch without a plan number still belongs to a card: `taskId` is `u1`
          // then, so the marker carries the owner instead of vanishing. Without it the
          // DOM names the call but not the card it hangs under.
          'data-task': subtask.taskNumber === undefined ? subtask.taskId : String(subtask.taskNumber),
          'data-subtask': String(subtask.seq),
        },
        ...traced ? { 'data-trace': 'active' } : {},
        // Position and width come from the layout; the height is left to the box, so what
        // the page measures next is what a reader is really looking at.
        style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px` },
        'aria-label': [node.label, badge, stateWord].filter((part) => part !== '').join(' '),
        // A card that carries a button answers the click on that button; a card that does
        // not is still the thing a reader points at, so the trace lives on the mark itself.
        ...node.openable ? {} : { onClick },
      },
      node.openable
        ? h('button', {
          key: 'body',
          type: 'button',
          className: 'gw-progress-pnode-body',
          'data-gw-progress-pnode-open': node.id,
          'aria-expanded': open,
          'aria-controls': progressPanelCallsId(node.id),
          // The affordance is discoverable only where there is a line to read.
          ...props.linked.has(node.id) ? { title: t('progress.panel.trace') } : {},
          onClick,
        }, parts)
        : h('div', { key: 'body', className: 'gw-progress-pnode-body' }, parts),
      // The list is never the node's to draw: it lives in the sheet under the
      // figure, where it cannot land on the card beside this one. The node keeps the two
      // attributes that say what it opened; where that list lives is the page's business.
      // WHY the node draws nothing: the floating box a node used to draw over its own card
      // measured over the neighbour at desktop width (one open list over 2 cards, four over
      // 9). The sheet is in the page flow so it can only push the page down, never across
      // a card — the same box both widths now share.
      open && props.sheet !== true ? ProgressPanelCalls(node, props) : null)
    }

    /**
     * The standing legend of a lit trace: five short sentences under the figure.
     *
     * Only while a node is opened (traced !== undefined): a lit wire is a wire the reader's
     * own click lit, a dimmed wire is one it did not touch, the six dots are a task card's
     * six stages, the five dots are the run's five checks, and a dimmed dot only ever says the event stream has not reached that stage yet — never that it failed. Plain text in the page flow,
     * so a phone wraps it instead of covering a card.
     * @param t - translator.
     * @returns the legend element.
     */
    function ProgressPanelLegend(t) {
      const item = (key, mark) => h('li', { key, className: 'gw-progress-legend-item' }, [mark, h('span', { key: 'word' }, t(key))])
      return h('ul', {
        className: 'gw-progress-legend',
        'data-gw-progress-legend': true,
      }, [
        item('progress.panel.legend.traced', h('span', { key: 'mark', className: 'gw-progress-legend-wire', 'data-trace': 'active', 'aria-hidden': 'true' })),
        item('progress.panel.legend.untraced', h('span', { key: 'mark', className: 'gw-progress-legend-wire', 'data-trace': 'dim', 'aria-hidden': 'true' })),
        item('progress.panel.legend.rings', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'aria-hidden': 'true' })),
        item('progress.panel.legend.checks', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'aria-hidden': 'true' })),
        item('progress.panel.legend.pending', h('span', { key: 'mark', className: 'gw-progress-legend-dot', 'data-state': 'pending', 'aria-hidden': 'true' })),
      ])
    }

    /**
     * The graph itself: the wire layer, and the nodes it is drawn behind.
     *
     * The picture is laid out from the mermaid text the graph carries, so what a reader sees
     * and what any other reader can parse are one graph. The layer is always present, even
     * before anything was measured — an `svg` holding only the arrow head is the honest
     * drawing of "no line was measured yet", and adding the layer later would make the page
     * jump once on a real session. Every wire points: the arrow says which step follows
     * which, and it is drawn in the border token because direction is structure, never state.
     *
     * The figure is wrapped in its own scroll box: the run is left to right at every width, so
     * a phone scrolls the picture instead of folding it into a column — and the page itself
     * never scrolls sideways. The box only grows when a card's calls are open, because the
     * list floats under its card and the clip would otherwise be the one thing that eats it.
     *
     * The graph is also the page's "never mind" target: a click on the empty figure drops the
     * trace, while a click that bubbled up from a card is left to that card.
     * @param graph - the panel model.
     * @param layout - the computed layout of `parsePanelMermaid(graph.mermaid)`.
     * @param graphRef - the ref the measurement reads and the observer watches.
     * @param props - translator, the open and trace state, the handlers and the row props.
     * @returns the graph element.
     */
    function ProgressPanelGraph(graph, layout, graphRef, props, runName) {
      // The picture is laid out from the text, so a parsed id is translated back to the
      // model's own before anything is looked up: the DOM then agrees with the model.
      const boxes = new Map(layout.nodes.map((box) => [panelModelIdFor(box.id), box]))
      const kinds = new Map(graph.edges.map((edge) => [panelEdgeKey(edge.from, edge.to), edge.kind]))
      const nodes = graph.nodes.filter((node) => boxes.has(node.id))
      // A node only carries the trace's tooltip when it has a wire to light.
      const linked = new Set()
      for (const edge of graph.edges) {
        linked.add(edge.from)
        linked.add(edge.to)
      }
      const nodeProps = { ...props, linked }
      return h('div', {
        className: 'gw-progress-figure',
        'data-gw-progress-figure': true,
      },
      h('div', {
        className: 'gw-progress-graph',
        'data-gw-progress-graph': true,
        'data-gw-progress-source': graph.mermaid,
        'aria-label': props.t('progress.panel.graph', { run: runName }),
        role: 'group',
        ref: graphRef,
        style: { width: `${layout.width}px`, height: `${layout.height}px` },
        onClick: props.onBackgroundClick,
      },
      h('svg', {
        className: 'gw-progress-wires',
        'data-gw-progress-wires': true,
        'aria-hidden': 'true',
        viewBox: `0 0 ${layout.width} ${layout.height}`,
      },
      h('defs', { key: 'defs' }, h('marker', {
        id: 'gw-progress-arrow',
        markerWidth: 8,
        markerHeight: 8,
        refX: 7,
        refY: 4,
        orient: 'auto',
        markerUnits: 'userSpaceOnUse',
      }, h('path', { d: 'M0 0 L8 4 L0 8 Z', fill: 'var(--dsw-alias-border-l2, currentColor)' }))),
      layout.edges.map((edge, index) => {
        const from = panelModelIdFor(edge.from)
        const to = panelModelIdFor(edge.to)
        const key = panelEdgeKey(from, to)
        return h('path', {
          key: `edge:${index}`,
          'data-gw-progress-edge': true,
          'data-from': from,
          'data-to': to,
          'data-kind': kinds.get(key),
          // No trace, no mark: an untraced figure says nothing about a reading nobody made.
          ...props.traced === undefined ? {} : { 'data-trace': props.tracedEdges.has(key) ? 'active' : 'dim' },
          'marker-end': 'url(#gw-progress-arrow)',
          d: edge.d,
        })
      })),
      h('ol', { className: 'gw-progress-pnodes', 'data-gw-progress-pnodes': true },
        nodes.map((node) => ProgressPanelNode(node, boxes.get(node.id), nodeProps)))))
    }


    /**
     * The Guardian side lane reports liveness interventions only. It does not
     * infer task quality or retry state from a timeout/rescue finding.
     *
     * The lane is a block grid rather than a head plus a list: the state word, the budget
     * and the number of interventions each get their own tile, and the findings take the
     * full width under them. It carries no copy of its own — every word here is a
     * `progress.guardian.*` key the lane already shipped.
     */
    /**
     * The Guardian: the four tiles the opened details carry.
     *
     * The wide band is retired, and so is the second square it had grown: one corner badge
     * opens the run's details, and the monitor's tiles are part of them. What stays is
     * everything the band said — the same aside marker and state, the same four tiles in the
     * same order, the same words — inside a block that stands in the page's flow, so no card
     * is ever covered and no 14px box squeezes it. The tile vocabulary (blocks, grid,
     * findings) is untouched, so the specs that read it keep reading it.
     * @param guardian - the run's recorded Guardian lifecycle, when the stream wrote one.
     * @param t - translator.
     * @returns the block, or `null` when no monitor was recorded.
     */
    function ProgressGuardianPanel(guardian, t) {
      if (guardian === undefined || guardian === null || guardian.started !== true) return null
      const findings = Array.isArray(guardian.findings) ? guardian.findings : []
      const state = guardian.ended === true
        ? (guardian.cancelled === true ? 'cancelled' : 'finished')
        : (guardian.armed === true ? 'active' : 'disarmed')
      const statusKey = state === 'active'
        ? 'progress.guardian.active'
        : state === 'disarmed'
          ? 'progress.guardian.disarmed'
          : state === 'cancelled'
            ? 'progress.guardian.cancelled'
            : 'progress.guardian.finished'
      const budgetMs = Number(guardian.budgetMs)
      const seconds = Number.isFinite(budgetMs) && budgetMs > 0 ? Math.round(budgetMs / 1000) : 0
      const block = (name, children) => h('div', {
        key: name,
        className: 'gw-progress-guardian-block',
        'data-gw-progress-guardian-block': name,
      }, children)
      return h('aside', {
        className: 'gw-progress-guardian',
        'data-gw-progress-guardian': true,
        'data-state': state,
        'aria-label': t('progress.guardian.title'),
      },
      h('div', { className: 'gw-progress-guardian-blocks', 'data-gw-progress-guardian-blocks': true },
        block('status', [
          h('span', { key: 'label', className: 'gw-progress-guardian-block-label' }, t('progress.guardian.title')),
          h('span', { key: 'value', className: 'gw-progress-guardian-block-value', role: 'status' }, t(statusKey)),
        ]),
        block('budget', h('span', { className: 'gw-progress-guardian-block-value' }, t('progress.guardian.budget', { seconds }))),
        block('count', h('span', { className: 'gw-progress-guardian-block-value' }, t('progress.guardian.count', { count: findings.length }))),
        block('findings', findings.length === 0
          ? h('p', { className: 'gw-progress-guardian-empty' }, t('progress.guardian.empty'))
          : h('ul', { className: 'gw-progress-guardian-list', 'aria-label': t('progress.guardian.count', { count: findings.length }) },
            findings.slice(-4).map((finding, index) => {
              const actionKey = finding.action === 'rescue' ? 'progress.guardian.rescue' : finding.action === 'observe' ? 'progress.guardian.observe' : 'progress.guardian.cancel'
              const label = typeof finding.label === 'string' && finding.label !== '' ? finding.label : '#' + finding.seq
              return h('li', {
                key: 'guardian:' + finding.seq + ':' + (finding.atMs === undefined ? index : finding.atMs),
                'data-action': finding.action === 'rescue' ? 'rescue' : finding.action === 'observe' ? 'observe' : 'cancel-run',
                title: typeof finding.reason === 'string' ? finding.reason : undefined,
              },
              h('span', { className: 'gw-progress-guardian-finding-label' }, label),
              h('span', { className: 'gw-progress-guardian-finding-action' }, t(actionKey)))
            })))))
    }


    /** The step sentence under the title: the step the run is on, and the remainder when measured. */
    function progressPanelHeadline(graph, t) {
      const step = t('progress.panel.step', { at: graph.headline.at, total: graph.headline.total })
      const eta = graph.headline.eta
      if (eta === undefined) return step
      return `${step} · ${t('progress.panel.eta', { time: progressPanelDuration(eta.ms, t) })}`
    }

    /** The task sentence under the step sentence: how many task cards the figure draws, apart from the steps. */
    function progressPanelTaskLine(graph, t) {
      return t('progress.panel.tasks', { count: graph.headline.taskCount })
    }

    /**
     * How the estimate was obtained, as the sentence's tooltip.
     *
     * The visible line never says it: a reader who wants to know what the number rests on
     * asks for it, and a reader who does not is not made to read a method statement under
     * every run. Absent, like the estimate itself, when nothing was measured.
     */
    function progressPanelEtaTitle(graph, t) {
      const eta = graph.headline.eta
      return eta === undefined ? undefined : t('progress.panel.etaBasis', { n: eta.basis })
    }

    /** The stuck line's one sentence, in the shape its verdict calls for. */
    function progressPanelStuckText(stuck, t) {
      if (stuck.kind === 'failed') return t('progress.panel.stuck.failed', { at: stuck.at, role: stuck.role, n: stuck.attempt })
      if (stuck.kind === 'blocked') return t('progress.panel.stuck.blocked', { at: stuck.at })
      return t('progress.panel.stuck.rejected', { at: stuck.at, n: stuck.drafts })
    }

    /**
     * The "进度" view: one task panel.
     *
     * The page is the run, read top to bottom:
     *
     * - the **header**: the run's own name and the five-state chip on one row, and under them
     *   one sentence — which step the run is on, and, when it can be measured, what is left;
     * - the **graph**: every step, every plan task it walked, and the edges between them,
     *   laid out from the mermaid text the container carries;
     * - the **opened calls**: one sheet under the figure at every width (after the figure,
     *   before the stuck line), so an opened list only pushes the page down;
     * - the **stuck line**, and only while the run really is stuck;
     * - the **Guardian** card, when the stream recorded liveness monitoring;
     * - the **dock**: one button that fills the input box, or nothing.
     *
     * The page prints no number the events did not report — no percentage, no pass rate — and
     * the single estimate it does print says in its tooltip what it rests on. Two readings
     * are the reader's own: opening a node's calls, and lighting the wires that touch it.
     * Neither one writes, sends, or fetches anything; the dock's button is the only control
     * that reaches another surface, and it stops at the input box.
     * @param props - slot props.
     * @returns the tab element.
     */
    function ProgressView(props) {
      const t = guardedTranslator(props.t, typeof props.progressT === 'function' ? props.progressT : translator(FALLBACK_LOCALE))
      const snapshot = props.useGrokProgress === undefined ? EMPTY_PROGRESS_SNAPSHOT : props.useGrokProgress((value) => value)
      const run = snapshot === undefined ? undefined : snapshot.activeRun
      // `t` belongs in the dependency list: the leg words and the mermaid text are resolved
      // into the model, so a locale switch has to build a new model or the graph would keep
      // the old language until the run changed.
      const graph = useMemo(() => (run === undefined ? undefined : derivePanelGraph(run, t)), [run, t])
      // The one stateful thing on the page: whether *this* render already filled the box.
      const [filled, setFilled] = useState(false)
      // The other two are the reader's place: which nodes are open, and which node's wires
      // are being read. Both are this page's alone — they survive no reload and say nothing
      // to the session.
      const [opened, setOpened] = useState(EMPTY_PANEL_OPENED)
      const [traced, setTraced] = useState(undefined)
      // The page's one "show the details" toggle: the corner badge opens the run's two
      // sentences and, when the stream recorded a monitor, the Guardian's four tiles with
      // them. It starts closed — the collapsed square is the point of the badge — and the
      // details it opens stand in the page's flow under the header, so nothing floats.
      const [detailsOpen, setDetailsOpen] = useState(false)
      const graphRef = useRef(null)
      const sheetRef = useRef(null)
      const [measure, setMeasure] = useState(EMPTY_PANEL_MEASURE)
      // The list no longer depends on the width: both widths share the sheet under the
      // figure, so there is no breakpoint state to keep in step with the window.
      // WHY removed: `narrow` existed only to pick the box; one box needs no picker.
      // Rotation and resize need no listener for this: the sheet is in the page flow.
      // One draw per render, plus the two things that move the boxes the wires land on: a
      // container resize (a sidebar toggle does not resize the window) and a window resize.
      // An unchanged measurement is not a render, so the observer cannot feed itself.
      useEffect(() => {
        const host = graphRef === null || graphRef === undefined ? undefined : graphRef.current
        const draw = () => {
          const next = measureProgressPanel(host)
          setMeasure((current) => (samePanelMeasure(current, next) ? current : next))
        }
        draw()
        const ResizeObserverFace = globalThis.ResizeObserver
        const observer = host !== null && host !== undefined && typeof ResizeObserverFace === 'function'
          ? new ResizeObserverFace(draw)
          : undefined
        if (observer !== undefined) observer.observe(host)
        const view = globalThis
        if (typeof view.addEventListener === 'function') view.addEventListener('resize', draw)
        return () => {
          if (observer !== undefined) observer.disconnect()
          if (typeof view.removeEventListener === 'function') view.removeEventListener('resize', draw)
        }
      })
      // The sheet is the one box at every width, so no listener has to move the list
      // when the window narrows or widens. The initial reading stays the render's own.

      // The picture is laid out from its own mermaid text, which is why the figure a reader
      // sees and the structure anything else can read cannot disagree. Before the first
      // measurement the default sizes stand in, so a host without layout still renders.
      const parsed = graph === undefined ? undefined : parsePanelMermaid(graph.mermaid)
      // Which cards are two rows tall is a fact about the model, looked up by id: neither the
      // lights nor the shipped draft are in the text, so the layout is told about them instead
      // of reading them off it. The badge's own predicate is the one the card prints it with.
      const floors = new Map()
      if (graph !== undefined) {
        for (const node of graph.nodes) {
          if ((Array.isArray(node.rings) && node.rings.length > 0) || (Array.isArray(node.checks) && node.checks.length > 0)) {
            floors.set(node.id, PANEL_LIGHT_HEIGHT)
            continue
          }
          if (progressPanelBadge(node, graph.final === undefined ? undefined : graph.final.draft, t) === '') continue
          floors.set(node.id, PANEL_BADGE_ROW_HEIGHT)
        }
      }
      const layout = parsed === undefined
        ? undefined
        : layoutPanelGraph(parsed, measure.sizes, measure.width > 0 ? measure.width : PANEL_DEFAULT_WIDTH, floors)
      // One click, two readings: a node that has calls opens (or closes) them, and any node
      // lights (or drops) the wires that touch it — the trace is a way to read the lines the
      // figure already draws, not a second thing to look at.
      const onNodeClick = (id) => {
        setOpened((current) => (current.indexOf(id) === -1 ? [...current, id] : current.filter((entry) => entry !== id)))
        setTraced((current) => (current === id ? undefined : id))
      }
      // The empty part of the figure is the "never mind" target. A click that bubbled up from
      // a node is that node's, so the container only acts when the click landed on itself.
      const onBackgroundClick = (event) => {
        if (event !== undefined && event !== null && event.target !== event.currentTarget) return
        setTraced(undefined)
      }
      // The sheet's one control is the same toggle a node answers: every opened list closes
      // and the trace drops, which is what tapping each of those nodes again would do. A
      // phone reader who scrolled past the card can still put the list away from here.
      const onSheetClose = () => {
        setOpened(EMPTY_PANEL_OPENED)
        setTraced(undefined)
      }
      const panelProps = graph === undefined || layout === undefined ? undefined : {
        t,
        // Where the opened lists are drawn: always in the sheet under the figure.
        // WHY one box for both widths: the floating list that a node draws over its own
        // card lands on the neighbour card at any width where cards sit close together.
        // The narrow sheet already proved itself at 390/360 (intersection 0 with every
        // card and with the dock): reuse it everywhere instead of keeping a second box
        // that only works when the neighbours happen to be far apart. A wide window keeps
        // its three-column layout; only the opened calls move out of the figure.
        sheet: true,
        canOpen: (childId) => typeof props.canOpen === 'function' && props.canOpen(childId) === true,
        openChild: (childId) => {
          if (typeof props.openChild === 'function') props.openChild(childId)
        },
        // The row the gate shipped, by `seq`: the opened list marks it 交卷 and no other row.
        shippedSeq: graph.final === undefined ? undefined : graph.final.seq,
        // …and its draft number, which is the one badge the figure prints (on 汇总).
        shippedDraft: graph.final === undefined ? undefined : graph.final.draft,
        opened,
        traced,
        tracedNodes: panelTraceNodes(graph, traced),
        tracedEdges: panelTraceEdges(graph, traced),
        onNodeClick,
        onBackgroundClick,
        onSheetClose,
      }
      // Only what a reader could open is carried into the sheet: a node that declares nothing
      // has no list, so tapping one asks for lines that do not exist and the sheet stays away.
      const sheetNodes = graph === undefined
        ? []
        : opened
          .map((id) => graph.nodes.find((node) => node.id === id && node.openable))
          .filter((node) => node !== undefined)
      const sheet = panelProps !== undefined && sheetNodes.length > 0
        ? ProgressPanelSheet(sheetNodes, panelProps, sheetRef)
        : null
      // A list that opened below the fold would leave a reader who just tapped a card with
      // nothing to read. The sheet is in the page's flow, so bringing it into view costs no
      // layout and covers nothing.
      useEffect(() => {
        progressPanelReveal(sheetRef === undefined || sheetRef === null ? undefined : sheetRef.current)
      }, [sheetNodes.length])

      // The dock's button is the only thing the `conversation` service is needed for: with no
      // way to write the box, the page offers no button instead of one that would do nothing
      // (§19.4). One state asks for a click: a run that has not started yet is waiting for the
      // reader to say go. A finished run asks for nothing — the clicks it used to want were
      // bookkeeping, and the run is done whether or not anyone confirms it.
      const fillDraft = typeof props.fillDraft === 'function' ? props.fillDraft : undefined
      const dock = graph !== undefined && graph.state === 'waiting' ? 'start' : 'none'
      const dockButton = dock === 'none' || fillDraft === undefined
        ? null
        : h('button', {
          type: 'button',
          className: 'gw-progress-dock-fill',
          'data-gw-progress-dock-fill': true,
          onClick: () => {
            if (fillDraft() === true) setFilled(true)
          },
        }, t('progress.dock.start'))
      const header = graph === undefined ? null : h('header', {
        className: 'gw-progress-bar',
        'data-gw-progress-bar': true,
        // The header is the page's one labelled place: a reader landing here hears whose
        // run this is before the step sentence, the figure and the stuck line.
        'aria-label': run.name,
      },
        h('span', { className: 'gw-progress-run', 'data-gw-progress-run': true, title: run.name }, run.name),
        h('span', {
          className: 'gw-progress-chip',
          'data-gw-progress-chip': graph.state,
          'data-state': graph.state,
          role: 'status',
        },
        h('span', { className: 'gw-progress-chip-dot', 'aria-hidden': 'true' }),
        t(PROGRESS_CHIP_KEY[graph.state] === undefined ? 'progress.chip.running' : PROGRESS_CHIP_KEY[graph.state])),
        h('button', {
          type: 'button',
          className: 'gw-progress-corner',
          'data-gw-progress-corner': true,
          'data-state': graph.state,
          'aria-expanded': detailsOpen,
          'aria-label': t(detailsOpen ? 'progress.badge.details.hide' : 'progress.badge.details.show'),
          title: t(detailsOpen ? 'progress.badge.details.hide' : 'progress.badge.details.show'),
          onClick: () => setDetailsOpen(!detailsOpen),
        },
        h('span', { className: 'gw-progress-corner-fill', 'data-state': graph.state, 'aria-hidden': 'true' })),
        h('div', {
          className: 'gw-progress-details',
          'data-gw-progress-details': true,
          hidden: !detailsOpen,
        },
        h('p', {
          className: 'gw-progress-line',
          'data-gw-progress-line': true,
          title: progressPanelEtaTitle(graph, t),
        }, progressPanelHeadline(graph, t)),
        h('p', {
          className: 'gw-progress-count',
          'data-gw-progress-count': true,
        }, progressPanelTaskLine(graph, t)),
        // The monitor's four tiles are part of the same details: one badge opens
        // everything the page used to print, and the block only exists while it is open.
        ProgressGuardianPanel(run.guardian, t)))
      const stuck = graph === undefined ? undefined : graph.stuck
      return h('section', {
        className: 'gw-progress',
        'data-gw-progress': true,
      },
      // Scoped stylesheet, rendered in the tab's own tree: React removes it when the tab
      // unmounts, and every rule is scoped to `.gw-progress`, so nothing leaks either way.
      h('style', { 'data-gw-progress-css': true }, PROGRESS_CSS),
      graph === undefined
        ? h('div', { className: 'gw-progress-empty', 'data-progress-empty': true }, t('progress.empty.title'))
        : [
          header,
          ProgressPanelGraph(graph, layout, graphRef, panelProps, run.name),
          // The trace legend stands under the figure, only while a trace is lit: five
          // standing words that say what a lit wire, a dimmed wire, the six dots, the
          // five dots and a dimmed dot each mean (dimmed is "not run yet", never failed).
          // Closed, the page says nothing about a reading nobody made.
          panelProps.traced === undefined ? null : ProgressPanelLegend(t),
          // The opened calls come out of the figure and stand here, in the
          // panel's own column: after the figure, so they can only push the page down — never
          // across a card, and never over the dock's button, which follows them.
          sheet,
          // The sentence exists only while something is stuck: an empty box under the graph
          // would say "there is something here" about nothing.
          stuck === undefined
            ? null
            // One sentence, read whole: the live region is atomic so a reader hears the held
            // step and the verdict in one pass, never a fragment of a sentence.
            : h('p', { className: 'gw-progress-stuck', 'data-gw-progress-stuck': true, role: 'status', 'aria-atomic': 'true' },
              progressPanelStuckText(stuck, t)),
          h('footer', { className: 'gw-progress-foot' },
            h('div', { className: 'gw-progress-dock', 'data-gw-progress-dock': true, 'data-state': dock },
              dockButton,
              // The success line exists only after a write the editor accepted: a refused
              // fill says nothing rather than claiming the box was filled.
              filled && dockButton !== null
                ? h('p', { className: 'gw-progress-filled', 'data-gw-progress-filled': true, role: 'status', 'aria-live': 'polite' },
                  t('progress.dock.filled'))
                : null)),
          // Room to scroll the sheet up into. The shell pins its composer over the bottom of
          // this column, and a list that opens at the very end of the content can only move
          // as far as the column can scroll — which, on a run that is barely taller than the
          // screen, is nothing. This is that missing room, and it exists only while the sheet
          // does: it sits after the footer, so no button moves to make it.
          sheet === null
            ? null
            : h('div', { className: 'gw-progress-sheet-room', 'aria-hidden': 'true' }),
        ])
    }

    /**
     * The event definition: one node per run, folded from the four recorded events.
     *
     * `kind` and `target` are registry identities, and they carry this plugin's own
     * prefix on purpose: a second registration of either name collides loudly instead of
     * silently displacing another bundle's view.
     *
     * The fold is a pure replay of the state so far plus the arriving event, so the update
     * path and `foldProgressEvents` cannot disagree about idempotency or order. The state
     * is treated as immutable: a repeated `agent-start` returns the same object, which is
     * what keeps an unrelated session event from producing a new snapshot.
     */
    const progressEventDefinition = {
      kind: PROGRESS_KIND,
      target: PROGRESS_TARGET,
      match: (event) => {
        if (PROGRESS_EVENT_TYPES.indexOf(normalizeProgressRecordType(event.type)) === -1) return null
        const data = progressRecord(event.data)
        const runId = data === undefined || typeof data.runId !== 'string' ? undefined : data.runId
        if (runId === undefined) return null
        return { id: runId, role: normalizeProgressRecordType(event.type) === 'plugin:grok-workflow/progress/run-start' ? 'start' : 'update' }
      },
      start: (_context, match) => {
        const data = progressRecord(match.event.data) || {}
        return {
          runId: typeof data.runId === 'string' ? data.runId : '',
          name: typeof data.name === 'string' ? data.name : '',
          members: [],
          startedAt: match.event.time,
        }
      },
      update: (context, match) => {
        const state = context.state
        const records = [
          { type: 'plugin:grok-workflow/progress/run-start', data: { runId: state.runId, name: state.name }, time: state.startedAt },
          ...state.members.map((member) => ({
            type: 'plugin:grok-workflow/progress/agent-start',
            data: { runId: state.runId, seq: member.seq, label: member.label, phase: member.phase, childId: member.childId },
            time: member.startedAt,
          })),
          ...state.members.filter((member) => member.outcome !== undefined).map((member) => ({
            type: 'plugin:grok-workflow/progress/agent-end',
            data: { runId: state.runId, seq: member.seq, outcome: member.outcome },
            time: member.endedAt,
          })),
          ...(state.guardian?.started === true ? [{
            type: 'plugin:grok-workflow/progress/guardian-start',
            data: { runId: state.runId, armed: state.guardian.armed, budgetMs: state.guardian.budgetMs },
          }] : []),
          ...(state.guardian?.findings ?? []).map((finding) => ({
            type: 'plugin:grok-workflow/progress/guardian-finding',
            data: { runId: state.runId, ...finding },
          })),
          ...(state.guardian?.ended === true ? [{
            type: 'plugin:grok-workflow/progress/guardian-end',
            data: { runId: state.runId, cancelled: state.guardian.cancelled },
          }] : []),
          // The shipped mark is replayed like the guardian's own events: without this line
          // the re-fold below rebuilds the run from its members and the claim evaporates on
          // the very next event — which is the `run-end` that always follows it.
          ...(state.summaryFinalDraft === undefined ? [] : [{
            type: 'plugin:grok-workflow/progress/summary-final',
            data: { runId: state.runId, draft: state.summaryFinalDraft },
          }]),
          // The rejected verdict is replayed for the same reason the shipped mark is:
          // without this line the next event's re-fold drops the only fact that says why
          // this run handed in nothing.
          ...(state.summaryRejected === undefined ? [] : [{
            type: 'plugin:grok-workflow/progress/summary-rejected',
            data: { runId: state.runId, drafts: state.summaryRejected.drafts, stage: state.summaryRejected.stage, reason: state.summaryRejected.reason },
          }]),
          ...(state.stopReason === undefined ? [] : [{ type: 'plugin:grok-workflow/progress/run-end', data: { runId: state.runId, stopReason: state.stopReason }, time: state.endedAt }]),
          { type: match.event.type, data: match.event.data, time: match.event.time },
        ]
        const run = foldProgressEvents(records)[0]
        if (run === undefined) return state
        return {
          runId: run.runId,
          name: run.name,
          members: run.members,
          ...run.guardian === undefined ? {} : { guardian: run.guardian },
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          stopReason: run.stopReason,
          // Carried like the members and the stop reason: the state is re-folded from
          // itself on every later event, so a field left here is a field the next
          // `run-end` erases — which is what turned a shipped draft back into 「没有交稿」.
          ...run.summaryFinalDraft === undefined ? {} : { summaryFinalDraft: run.summaryFinalDraft },
          ...run.summaryRejected === undefined ? {} : { summaryRejected: run.summaryRejected },
        }
      },
      buildViewNode: (context) => {
        const state = context.state
        if (state === undefined) return null
        const start = context.start
        const anchorSeq = start === undefined ? 0 : start.event.seq
        return {
          key: context.key,
          kind: context.kind,
          id: context.id,
          target: PROGRESS_TARGET,
          anchorSeq,
          location: start === undefined ? { kind: 'unresolved' } : start.location,
          data: {
            runId: state.runId,
            name: state.name,
            anchorSeq,
            members: state.members,
            guardian: state.guardian,
            startedAt: state.startedAt,
            endedAt: state.endedAt,
            stopReason: state.stopReason,
            summaryFinalDraft: state.summaryFinalDraft,
            summaryRejected: state.summaryRejected,
          },
        }
      },
    }

    /**
     * The view builder: one snapshot of every run in the session.
     *
     * Identity is the point of `apply`/`replace`: a transaction that changed nothing the
     * track renders returns the *same* snapshot object, so the component's `useMemo` and
     * the store's identity comparison do not fire on an unrelated session event.
     */
    class ProgressSnapshotBuilder {
      constructor() {
        this.nodes = new Map()
        this.signatures = new Map()
        this.current = EMPTY_PROGRESS_SNAPSHOT
        this.empty = EMPTY_PROGRESS_SNAPSHOT
      }

      replace(input) {
        this.nodes.clear()
        this.signatures.clear()
        for (const node of input.nodes) {
          this.nodes.set(node.key, node)
          this.signatures.set(node.key, JSON.stringify(node.data))
        }
        return this.snapshot()
      }

      apply(input) {
        if (input.upserts.length === 0) return this.current
        let changed = false
        for (const node of input.upserts) {
          const signature = JSON.stringify(node.data)
          if (this.signatures.get(node.key) !== signature) {
            changed = true
            this.signatures.set(node.key, signature)
          }
          this.nodes.set(node.key, node)
        }
        if (!changed) return this.current
        return this.snapshot()
      }

      snapshot() {
        const runs = [...this.nodes.values()]
          .map((node) => node.data)
          .sort((left, right) => (left.anchorSeq === right.anchorSeq ? String(left.runId).localeCompare(String(right.runId)) : left.anchorSeq - right.anchorSeq))
        const activeRun = selectActiveRun(runs)
        this.current = activeRun === undefined ? EMPTY_PROGRESS_SNAPSHOT : { runs, activeRun }
        return this.current
      }
    }

    /** The view definition; `target` is the identity a duplicate registration collides on. */
    const progressViewDefinition = {
      target: PROGRESS_TARGET,
      create: () => new ProgressSnapshotBuilder(),
    }

    /**
     * Mount the tab: its two conversation registrations, then its `conversation.view` entry.
     *
     * Everything is wrapped: the tab is an addition, never a precondition, so a refusing
     * registry costs the tab and says so in the settings page's status area instead of
     * failing the plugin's own fiber.
     * @param ctx - the browser plugin context.
     * @param services - `uiConversation` and `sessions` faces.
     * @param i18n - live locale binding.
     * @param status - the settings page's progress-state store.
     * @param workspaceOf - reads the current `uiWorkspace` (it may arrive after the tab).
     * @returns a disposer, or `undefined` when the tab could not be mounted.
     */
    function mountProgress(ctx, services, i18n, status, workspaceOf) {
      const disposers = []
      const disposeAll = () => {
        while (disposers.length > 0) {
          const dispose = disposers.pop()
          try {
            if (typeof dispose === 'function') dispose()
          } catch {
            /* a disposer that throws must not stop the others */
          }
        }
      }
      const fail = (stage, error) => {
        const message = error && error.message ? error.message : String(error)
        disposeAll()
        status.set('failed', message)
        console.warn(`[grok-workflow] the progress tab could not be registered (${stage}: ${message}); the tab stays out and the settings page reports it.`)
        return undefined
      }
      try {
        disposers.push(services.uiConversation.events.register(progressEventDefinition))
        disposers.push(services.uiConversation.views.register(progressViewDefinition))
      } catch (error) {
        return fail('conversation registries', error)
      }
      const sources = new WeakMap()
      /** One subagent address read; `undefined` when the sessions face cannot answer. */
      const addressOf = (childId) => (typeof services.sessions.subagentAddress === 'function' ? services.sessions.subagentAddress(childId) : undefined)
      /**
       * Whether one child session can be opened, decided by the *same* rule the chat panel
       * uses (`panelMemberMode`): a settle-able subagent address whose parent is this
       * session. A row without one stays inert rather than opening the wrong session.
       */
      const modeOf = (sessionId, childId) => {
        const address = addressOf(childId)
        return panelMemberMode(
          address === undefined ? undefined : { parentId: address.parentSessionId },
          address === undefined ? undefined : { mode: address.mode },
          sessionId,
        )
      }
      /**
       * Fill this session's input box with the approval word, and do nothing else.
       *
       * `conversation.input.for(binding.ctx)` is the per-session editor facade, and
       * `binding.ctx` is the session-scoped context it is addressed by — the same context
       * the shell hands its own slots, so the write lands in *this* session's composer.
       * `conversation.send` is deliberately not reachable from here: it would send the
       * message on the reader's behalf, which is the opposite of filling the box (§19.4).
       * @param sessionId - the session the tab was mounted for.
       * @returns whether the draft was written; a refusal is reported, never assumed.
       */
      const fillDraftOf = services.conversation === undefined || services.conversation === null
        || services.conversation.input === undefined || services.conversation.input === null
        || typeof services.conversation.input.for !== 'function'
        ? undefined
        : (sessionId) => {
          const binding = typeof services.sessions.binding === 'function' ? services.sessions.binding(sessionId) : undefined
          const actx = binding === undefined || binding === null ? undefined : binding.ctx
          if (actx === undefined) return false
          try {
            const input = services.conversation.input.for(actx)
            if (input === undefined || input === null || typeof input.setDraft !== 'function') return false
            input.setDraft(i18n.t('progress.dock.fill'))
            return true
          } catch (error) {
            const message = error && error.message ? error.message : String(error)
            console.warn(`[grok-workflow] the progress tab could not fill the input box (${message}); the button reports nothing instead of claiming it did.`)
            return false
          }
        }
      const options = {
        name: 'conversation.view',
        id: PROGRESS_VIEW_ID,
        order: PROGRESS_VIEW_ORDER,
        // A `list` slot in ascending order: no `priority`, which belongs to keyed
        // replacements and would be meaningless (and surprising) here.
        label: () => i18n.t('view.progress'),
        inject: (sessionId) => {
          const binding = typeof services.sessions.binding === 'function' ? services.sessions.binding(sessionId) : undefined
          let source = binding === undefined ? undefined : sources.get(binding)
          if (source === undefined) {
            try {
              const target = services.uiConversation.binding(sessionId).target(PROGRESS_TARGET)
              source = {
                getSnapshot: () => target.getSnapshot() || EMPTY_PROGRESS_SNAPSHOT,
                subscribe: (listener) => target.subscribe(listener),
              }
            } catch (error) {
              // A session the conversation shell cannot bind (a replayed id, a session
              // that closed between the tab mount and this render): the tab renders its
              // empty state instead of throwing inside the shell's own render.
              const message = error && error.message ? error.message : String(error)
              console.warn(`[grok-workflow] the progress tab could not bind session "${sessionId}" (${message}); showing an empty track.`)
              source = {
                getSnapshot: () => EMPTY_PROGRESS_SNAPSHOT,
                subscribe: () => () => {},
              }
            }
            if (binding !== undefined && source !== undefined) sources.set(binding, source)
          }
          return {
            hooks: { grokProgress: source },
            progressT: i18n.t,
            // The dock's one button writes the approval word into this session's composer
            // and stops there (§19.4). Absent when the composition has no `conversation`
            // service: the page then offers the quiet line instead of a dead button.
            ...fillDraftOf === undefined ? {} : { fillDraft: () => fillDraftOf(sessionId) },
            canOpen: (childId) => modeOf(sessionId, childId) !== undefined,
            openChild: (childId) => {
              const mode = modeOf(sessionId, childId)
              if (mode === undefined) return false
              const workspace = workspaceOf()
              if (workspace === undefined) return false
              workspace.openSession({ parentSessionId: sessionId, childSessionId: childId, mode })
              return true
            },
          }
        },
      }
      if (i18n.locale !== undefined) options.locale = NS
      try {
        const dispose = ctx.slots.inject('conversation.view', () => ctx.slots.register(options, ProgressView))
        disposers.push(dispose)
      } catch (error) {
        return fail('view slot', error)
      }
      status.set('mounted')
      return () => {
        disposeAll()
        status.set('unmounted')
      }
    }

    /**
     * A tiny observable holding why the tab is not mounted, read by the settings page.
     *
     * The page is mounted before the tab's services are known, so this is how the two
     * halves talk: `unmounted` (no `uiConversation`, or the face left), `mounted`, and
     * `failed` with the registry's own message.
     */
    function createProgressStatus() {
      let value = 'unmounted'
      let message
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        getMessage: () => message,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next, detail) => {
          if (next === value && detail === message) return
          value = next
          message = detail
          // A snapshot, so a listener that subscribes or unsubscribes during dispatch
          // neither misses this notification nor receives it twice.
          for (const listener of Array.from(listeners)) listener()
        },
      }
    }

    /**
     * The status a page render reads when it was not handed this bundle's store.
     *
     * `unknown` is not a claim about the tab: it means "this caller did not inject the
     * store", so the page renders no note at all instead of accusing the composition of
     * missing a service it may well have.
     */
    const PROGRESS_STATUS_UNKNOWN = {
      getSnapshot: () => 'unknown',
      getMessage: () => undefined,
      subscribe: () => () => {},
    }

