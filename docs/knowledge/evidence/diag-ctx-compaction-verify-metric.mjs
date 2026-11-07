// Deterministic replay of session-3361cd6e through the installed token meter and
// the compaction threshold formula. Read-only: decompresses the session archive
// in memory, never writes session data.
import { execFileSync } from 'node:child_process';
const M = '/home/fish/.local/share/mise/installs/node/26.8.1/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-token-meter/lib/index.js';
const { default: TokenMeter } = await import(M);
const SESSION = '/home/fish/dsh-layerfs/sessions/--home-fish-projects_mine-dsh-grok-workflow--/session-3361cd6e-ff7e-41a0-b086-cb1c72f6341a/session.v4.jsonl.zstd';

const raw = execFileSync('zstd', ['-dc', SESSION], { maxBuffer: 512 * 1024 * 1024 })
  .toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => typeof e.seq === 'number');

function newMeter() {
  const m = Object.create(TokenMeter.prototype);
  m.states = new WeakMap();
  m.ctx = { get: () => undefined };
  return m;
}
function sessionOf(list) {
  const bySeq = new Map(list.map(e => [e.seq, e]));
  const max = Math.max(...list.map(e => e.seq));
  return { seq: max + 1, eventAt: s => bySeq.get(Number(s)) };
}

// (1) raw replay, exactly as compaction-basic calls it
let rawErr = null;
try { newMeter().measure(sessionOf(raw)); } catch (e) { rawErr = e.message; }
console.log('STEP 1  raw measure()          :', rawErr === null ? 'ok' : 'THROWS -> ' + rawErr);

// (2) orphan assistant/message events (no open step/start..step/end pair)
let open = null; const orphans = [];
for (const e of raw) {
  if (e.type === 'step/start') open = [e.data.turn, e.data.step];
  else if (e.type === 'step/end' || e.type === 'turn/end') open = null;
  else if (e.type === 'assistant/message') {
    const d = e.data;
    if (open === null || open[0] !== d.turn || open[1] !== d.step) orphans.push({ seq: e.seq, turn: d.turn, step: d.step, source: (d.message?.source ?? {}) });
  }
}
console.log('STEP 2  orphan assistant events:', JSON.stringify(orphans));

// (3) repaired replay (orphans removed, seqs renumbered) -> what the meter would report
const kept = raw.filter(e => !orphans.some(o => o.seq === e.seq)).map((e, i) => ({ ...e, seq: i }));
const r = newMeter().measure(sessionOf(kept));
console.log('STEP 3  repaired measure()     : totalTokens=%d (baseline.kind=%s, surfaceTokens=%d, nodes=%d)',
  r.totalTokens, r.baseline.kind, r.surfaceTokens, r.nodes.length);

// (4) threshold the running route produces (contextWindow 1e6, maxTokens 32000, defaults)
const DEFAULT_THRESHOLD_RATIO = 0.8, DEFAULT_HEADROOM = 65536;
const contextWindow = 1000000, reserved = 32000;
const messageBudget = contextWindow - reserved;
const pressureBudget = messageBudget - DEFAULT_HEADROOM;
const thresholdTokens = Math.floor(Math.min(contextWindow * DEFAULT_THRESHOLD_RATIO, pressureBudget));
console.log('STEP 4  thresholdTokens        : %d (0.8*%d vs window-reserved-headroom=%d)', thresholdTokens, contextWindow, pressureBudget);
console.log('STEP 5  verdict                : totalTokens %d %s threshold %d', r.totalTokens, r.totalTokens >= thresholdTokens ? '>=' : '<', thresholdTokens);
