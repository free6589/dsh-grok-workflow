/**
 * Upstream evidence hand-off between the waves of one plan.
 *
 * A downstream task declares `dependsOn`, and the scheduler only starts it when
 * every dependency verified (S2b). Verification alone is not enough to build on:
 * the downstream child has to receive what the upstream actually produced, or it
 * would be working from a task title and a guess. This module builds that block
 * and, together with the scheduler, enforces the hard half of S4 — a downstream
 * task whose dependency carries no evidence at all is failed instead of being
 * run against nothing.
 *
 * "Evidence" here is deliberately narrower than "the upstream said it was done".
 * A verified upstream whose execution carries only a prose summary produced no
 * artifact: the summary is the child's own account, and `AGENTS.md` says a
 * child's self-report is not verification. Such an upstream satisfies its own
 * acceptance criteria (the report's answer-only path) but cannot hand anything
 * downstream, so the dependents are failed rather than fed a self-report.
 *
 * The generated workflow script cannot import host code, so `upstreamDigestSource()`
 * renders this one implementation (and its limits) into script-realm JS, the same
 * way `shardsSource()` and `namingSource()` do. The function below must therefore
 * stay self-contained: no module-level references, no optional chaining, no
 * template literals, no arrow functions closing over outer scope.
 */

/** Budget for the upstream block. Bounds mirror the script realm, pinned by test/upstream.spec.ts. */
export const UPSTREAM_LIMITS = {
  /** One dependency's block: the whole point is a summary, not a transcript. */
  perTaskChars: 2000,
  /** Every dependency of one task together (S3's double budget, wired into one prompt). */
  totalChars: 12000,
  /** Items copied per kind, so one verbose child cannot crowd out the others. */
  items: 4,
} as const

/** One dependency's verified execution, as the scheduler can observe it. */
export interface UpstreamEvidenceSource {
  readonly id: string
  readonly summary: string
  readonly deliverables?: readonly { readonly description: string, readonly locator: string }[]
  readonly evidence?: readonly { readonly claim: string, readonly source: string }[]
  readonly filesChanged?: readonly string[]
  readonly testsRun?: readonly { readonly command: string, readonly status: string, readonly detail?: string }[]
}

/** What the downstream receives: the block to embed, and the dependencies with nothing to hand over. */
export interface UpstreamDigest {
  readonly text: string
  readonly missing: readonly string[]
}

/** The first line of the block, so a reader (and a test) can find it in a prompt. */
export const UPSTREAM_HEADER = 'UPSTREAM EVIDENCE (produced by tasks this run already verified; build on it, and never treat it as evidence for your own acceptance criteria):'

/**
 * Build the upstream block for one task.
 *
 * Every declared dependency gets a fair share of the total budget rather than the
 * first ones taking all of it: a truncated block for the last dependency would
 * look like "that upstream had nothing", which is the state this module exists to
 * report as `missing`, not to fabricate. Only real artifacts count as usable —
 * a summary alone is a self-report, so it lands in `missing`.
 * @param entries - verified dependencies of this task, in declaration order.
 * @param declared - every id the task declares in `dependsOn`.
 * @param limits - budget, passed in because the script realm has no imports.
 * @returns the block (empty when nothing is usable) and the ids with no evidence.
 */
export function upstreamDigest(
  entries: readonly UpstreamEvidenceSource[],
  declared: readonly string[],
  limits: { readonly perTaskChars: number, readonly totalChars: number, readonly items: number },
): UpstreamDigest {
  const maxItems = Math.max(1, Math.floor(limits.items))

  function clip(value: unknown, max: number): string {
    const text = typeof value === 'string' ? value.trim() : ''
    if (text.length <= max) return text
    return text.slice(0, Math.max(0, max - 3)) + '...'
  }

  function hasArtifact(entry: UpstreamEvidenceSource): boolean {
    const deliverables = Array.isArray(entry.deliverables) ? entry.deliverables : []
    const evidence = Array.isArray(entry.evidence) ? entry.evidence : []
    const files = Array.isArray(entry.filesChanged) ? entry.filesChanged : []
    const tests = Array.isArray(entry.testsRun) ? entry.testsRun : []
    for (let i = 0; i < deliverables.length; i += 1) {
      const item = deliverables[i]
      if (item && clip(item.description, 10) !== '' && clip(item.locator, 10) !== '') return true
    }
    for (let i = 0; i < evidence.length; i += 1) {
      const item = evidence[i]
      if (item && clip(item.claim, 10) !== '' && clip(item.source, 10) !== '') return true
    }
    for (let i = 0; i < files.length; i += 1) {
      if (clip(files[i], 10) !== '') return true
    }
    for (let i = 0; i < tests.length; i += 1) {
      const item = tests[i]
      if (item && item.status === 'passed' && clip(item.command, 10) !== '') return true
    }
    return false
  }

  function blockOf(entry: UpstreamEvidenceSource, budget: number): string {
    const lines: string[] = []
    const summary = clip(entry.summary, 600)
    lines.push('task ' + entry.id + ': ' + (summary === '' ? '(no summary)' : summary))
    const deliverables = Array.isArray(entry.deliverables) ? entry.deliverables : []
    for (let i = 0; i < deliverables.length && i < maxItems; i += 1) {
      const item = deliverables[i]
      if (!item) continue
      const description = clip(item.description, 200)
      const locator = clip(item.locator, 240)
      if (description === '' || locator === '') continue
      lines.push('  - deliverable: ' + description + ' -- ' + locator)
    }
    const evidence = Array.isArray(entry.evidence) ? entry.evidence : []
    for (let i = 0; i < evidence.length && i < maxItems; i += 1) {
      const item = evidence[i]
      if (!item) continue
      const claim = clip(item.claim, 200)
      const source = clip(item.source, 240)
      if (claim === '' || source === '') continue
      lines.push('  - evidence: ' + claim + ' -- ' + source)
    }
    const files = Array.isArray(entry.filesChanged) ? entry.filesChanged : []
    for (let i = 0; i < files.length && i < maxItems; i += 1) {
      const file = clip(files[i], 240)
      if (file !== '') lines.push('  - changed: ' + file)
    }
    const tests = Array.isArray(entry.testsRun) ? entry.testsRun : []
    for (let i = 0; i < tests.length && i < maxItems; i += 1) {
      const item = tests[i]
      if (!item || item.status !== 'passed') continue
      const command = clip(item.command, 240)
      if (command !== '') lines.push('  - ran: ' + command + ' (passed)')
    }
    return clip(lines.join('\n'), budget)
  }

  const usable: UpstreamEvidenceSource[] = []
  const missing: string[] = []
  for (let d = 0; d < declared.length; d += 1) {
    const id = declared[d]
    if (id === undefined) continue
    let found: UpstreamEvidenceSource | undefined
    for (let e = 0; e < entries.length; e += 1) {
      const candidate = entries[e]
      if (candidate !== undefined && candidate.id === id) { found = candidate; break }
    }
    if (found === undefined || !hasArtifact(found)) { missing.push(id); continue }
    usable.push(found)
  }
  if (usable.length === 0) return { text: '', missing }

  const headerRoom = Math.max(0, Math.floor(limits.totalChars) - UPSTREAM_HEADER.length - 1)
  // Fair share: every usable dependency gets the same ceiling, so the block for the
  // last one is not the one that disappears.
  const share = Math.max(1, Math.min(Math.floor(limits.perTaskChars), Math.floor(headerRoom / usable.length)))
  const lines: string[] = [UPSTREAM_HEADER]
  for (let i = 0; i < usable.length; i += 1) {
    const entry = usable[i]
    if (entry !== undefined) lines.push(blockOf(entry, share))
  }
  return { text: lines.join('\n'), missing }
}

/**
 * Render the block builder above into script-realm JS source.
 * @returns the `UPSTREAM_HEADER`, `UPSTREAM_LIMITS` and `upstreamDigest` declarations.
 */
export function upstreamDigestSource(): string {
  return [
    `const UPSTREAM_HEADER = ${JSON.stringify(UPSTREAM_HEADER)};`,
    `const UPSTREAM_LIMITS = ${JSON.stringify(UPSTREAM_LIMITS)};`,
    `const upstreamDigest = ${upstreamDigest.toString()};`,
  ].join('\n')
}