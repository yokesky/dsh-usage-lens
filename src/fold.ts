/**
 * Incremental fold of session-log events into usage-lens fold state.
 *
 * Semantics mirror dsh's `tokenUsageProjectionDefinition`
 * (packages/llm/token-meter/src/usage-projection.ts): usage reports are keyed
 * by (turn, step); a later sample REPLACES the earlier one — four buckets,
 * day attribution, and source attribution all move to the new sample — and
 * the per-step final values accumulate into the totals. Usage chunks provide
 * an early sample that survives a cancelled step (no assembled message);
 * the assembled message provides the final sample. Provider/model attribution
 * comes from `message.source` on the message event ('' = unknown).
 * @module dsh-usage-lens/fold
 */

import { sourceKey, bucketTotal, type FoldState, type UsageBuckets } from './types.ts'

/** Provider-reported usage record as it appears on events (optional fields). */
export interface UsageRecord {
  inputTokens?: unknown
  outputTokens?: unknown
  cacheReadTokens?: unknown
  cacheWriteTokens?: unknown
}

/** The session event slices the fold reads (structural, unknown-tolerant). */
export interface FoldEvent {
  type: string
  seq?: number
  time?: unknown
  data?: unknown
}

/** Guard a token field the way the dsh projection guards outputTokens. */
function tokenField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

/** Build buckets from an event usage record (invalid fields read as 0). */
export function bucketsFromUsage(usage: UsageRecord | null | undefined): UsageBuckets {
  if (usage === null || typeof usage !== 'object') return { uncachedInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  return {
    uncachedInput: tokenField(usage.inputTokens),
    output: tokenField(usage.outputTokens),
    cacheRead: tokenField(usage.cacheReadTokens),
    cacheWrite: tokenField(usage.cacheWriteTokens),
  }
}

/** Whether a usage record carries any countable tokens. */
export function hasAnyTokens(buckets: UsageBuckets): boolean {
  return bucketTotal(buckets) > 0
}

/** Local date key (YYYY-MM-DD) of an epoch-ms timestamp, host timezone. */
export function dayKeyOf(time: number): string {
  const d = new Date(time)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function createFoldState(): FoldState {
  return { totals: { uncachedInput: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, stepUsages: {}, days: {}, hasUsage: false, lastTurn: null }
}

function ensureDay(state: FoldState, day: string): void {
  if (state.days[day] === undefined) {
    state.days[day] = { tokens: 0, sources: {}, messages: 0, turns: 0 }
  }
}

/** Add a signed bucket delta to a day bucket under one source key. */
function adjustDay(
  state: FoldState,
  day: string,
  source: string,
  delta: number,
  messagesDelta: number,
): void {
  ensureDay(state, day)
  const bucket = state.days[day]!
  bucket.tokens += delta
  if (delta !== 0) {
    bucket.sources[source] = (bucket.sources[source] ?? 0) + delta
    if (bucket.sources[source] === 0) delete bucket.sources[source]
  }
  bucket.messages += messagesDelta
}

/**
 * Fold one event into the state. Returns the SAME reference when the event is
 * irrelevant, so callers can cheaply skip unchanged files. Mutates `state`
 * (callers own the instance — per-file fold states are private per cache run).
 */
export function foldEvent(state: FoldState, event: FoldEvent): FoldState {
  const time = typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : 0
  if (time <= 0) return state
  const day = dayKeyOf(time)
  const data = (event.data ?? {}) as Record<string, unknown>

  if (event.type === 'user/message') {
    adjustDay(state, day, '', 0, 1)
    return state
  }

  if (event.type === 'assistant/message') {
    adjustDay(state, day, '', 0, 1)
    const usage = (data.usage ?? undefined) as UsageRecord | undefined
    if (usage === undefined) return state
    const turn = data.turn
    const step = data.step
    if (typeof turn !== 'number' || typeof step !== 'number') return state
    const source = (data.message as { source?: { provider?: unknown; model?: unknown } } | undefined)?.source
    const provider = typeof source?.provider === 'string' && source.provider !== '' ? source.provider : 'unknown'
    const model = typeof source?.model === 'string' && source.model !== '' ? source.model : 'unknown'
    return applySample(state, `${turn}:${step}`, bucketsFromUsage(usage), provider, model, day)
  }

  if (event.type === 'assistant/chunk') {
    const chunk = (data.chunk ?? undefined) as { type?: unknown; usage?: unknown } | undefined
    if (chunk?.type !== 'usage') return state
    const turn = data.turn
    const step = data.step
    if (typeof turn !== 'number' || typeof step !== 'number') return state
    return applySample(state, `${turn}:${step}`, bucketsFromUsage(chunk.usage as UsageRecord | undefined), 'unknown', 'unknown', day)
  }

  // Turn counting (轮), mirroring dsh's `session-stats` projection: a turn is
  // a distinct turn number carrying at least one closed step (`step/end`).
  // `lastTurn` dedups across appends; the turn is attributed to the day of
  // its first counted `step/end`.
  if (event.type === 'step/end') {
    const turn = data.turn
    if (typeof turn === 'number' && turn !== state.lastTurn) {
      state.lastTurn = turn
      ensureDay(state, day)
      state.days[day]!.turns += 1
    }
    return state
  }

  return state
}

/**
 * Apply one usage sample with replacement semantics: subtract the previous
 * sample of the same (turn, step) — from totals, its old day bucket, and its
 * old source key — then add the new one under the new day and source.
 */
function applySample(
  state: FoldState,
  key: string,
  buckets: UsageBuckets,
  provider: string,
  model: string,
  day: string,
): FoldState {
  const previous = state.stepUsages[key]
  const total = bucketTotal(buckets)
  const previousTotal = previous === undefined ? 0 : bucketTotal(previous.buckets)

  if (previous !== undefined) {
    // Remove the old sample from its day + source attribution.
    const oldSource = sourceKey(previous.provider, previous.model)
    adjustDay(state, previous.day, oldSource, -previousTotal, 0)
    for (const field of ['uncachedInput', 'output', 'cacheRead', 'cacheWrite'] as const) {
      state.totals[field] -= previous.buckets[field]
    }
  }
  if (total > 0) {
    adjustDay(state, day, sourceKey(provider, model), total, 0)
  }
  for (const field of ['uncachedInput', 'output', 'cacheRead', 'cacheWrite'] as const) {
    state.totals[field] += buckets[field]
  }
  state.stepUsages[key] = { buckets, provider, model, day }
  if (total > 0) state.hasUsage = true
  return state
}

/** Fold a batch of events (already sliced after the persisted seq). */
export function foldEvents(state: FoldState, events: FoldEvent[]): FoldState {
  for (const event of events) foldEvent(state, event)
  return state
}

/** Fold parsed unknown events, resuming after `resumeSeq` (events are seq-ordered). */
export function foldUnknownEvents(state: FoldState, events: unknown[], resumeSeq: number): FoldState {
  for (const ev of events) {
    const record = ev as FoldEvent
    const seq = record.seq
    if (typeof seq === 'number' && seq > resumeSeq) foldEvent(state, record)
  }
  return state
}
