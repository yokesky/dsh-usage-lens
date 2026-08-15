/**
 * Shared wire/domain types for dsh-usage-lens.
 *
 * These types cross the host/client boundary as plain JSON (the plugin's own
 * fenced HTTP API). Keep them free of live runtime objects.
 * @module dsh-usage-lens/types
 */

/** Provider-reported token buckets, disjoint counts (dsh llm semantics). */
export interface UsageBuckets {
  /** Un-cached prompt tokens. */
  uncachedInput: number
  /** Completion tokens. */
  output: number
  /** Cache-read prompt tokens. */
  cacheRead: number
  /** Cache-write prompt tokens. */
  cacheWrite: number
}

/** One usage sample's attribution + day, retained for replacement accounting. */
export interface StepUsage {
  buckets: UsageBuckets
  /** Provider from the assembled message source ('unknown' when missing). */
  provider: string
  /** Model from the assembled message source ('unknown' when missing). */
  model: string
  /** Local date (YYYY-MM-DD) of the LATEST sample for this step. */
  day: string
}

/** One local calendar day bucket inside one session fold. */
export interface DayBucket {
  /** Total tokens (four buckets summed) on this day, this session. */
  tokens: number
  /** Tokens per source key (`provider\u0000model`). */
  sources: Record<string, number>
  /** Surface messages (user + assistant) on this day, this session. */
  messages: number
  /** Distinct turns carrying a closed step (`step/end`) on this day. */
  turns: number
}

/**
 * Incremental fold state for ONE session log file. Plain JSON by design —
 * persisted in the usage-lens cache and resumed from the last folded seq.
 * The `stepUsages` table is what makes dsh's replacement semantics exact:
 * a later sample for the same (turn, step) replaces (not adds to) the
 * earlier one, including its day and source attribution.
 */
export interface FoldState {
  /** Cumulative four-bucket totals over every distinct step. */
  totals: UsageBuckets
  /** Latest usage sample per `turn:step` (replacement table). */
  stepUsages: Record<string, StepUsage>
  /** Local-date buckets (tokens per source + messages + turns). */
  days: Record<string, DayBucket>
  /** Whether any usage sample ever landed in this session. */
  hasUsage: boolean
  /** Turn number of the last counted `step/end` (turn dedup across folds). */
  lastTurn: number | null
}

/** One source (provider\u0000model) aggregate row. */
export interface SourceTotal {
  provider: string
  model: string
  tokens: number
}

/** One day row of the trend/heatmap feed. */
export interface DailyRow {
  /** Local date YYYY-MM-DD. */
  date: string
  /** Day of week, 1 = Monday … 7 = Sunday (heatmap rows). */
  dayOfWeek: number
  tokens: number
  /** Per-source tokens this day (series for the stacked chart). */
  sources: SourceTotal[]
  /** Surface messages this day. */
  messages: number
  /** Distinct turns (轮) with a closed step this day. */
  turns: number
}

/** The panel payload served by `POST /usage-lens/api/panel`. */
export interface PanelData {
  rangeDays: 7 | 30
  /** Epoch ms when the host answered. */
  generatedAt: number
  totals: {
    tokens: number
    sessions: number
    messages: number
    activeDays: number
    streakDays: number
    /** Most-used model over the range (name '' when no data). */
    topModel: { name: string; tokens: number; share: number }
  }
  /** Per-day rows for the selected range (today + N previous days). */
  daily: DailyRow[]
  /** Fixed 31-day feed for the activity heatmap (independent of the range). */
  heatmap: DailyRow[]
  /** Aggregate per-source totals over the range (pie legend feed). */
  sources: SourceTotal[]
}

/** API wire envelope. */
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string } }

/** Source composite key separator (provider/model are free strings). */
export const SOURCE_SEP = '\u0000'

/** Compose the sources map key. */
export function sourceKey(provider: string, model: string): string {
  return provider + SOURCE_SEP + model
}

/** Split a source key; missing halves read as '' (unknown). */
export function splitSourceKey(key: string): { provider: string; model: string } {
  const sep = key.indexOf(SOURCE_SEP)
  if (sep === -1) return { provider: key, model: '' }
  return { provider: key.slice(0, sep), model: key.slice(sep + SOURCE_SEP.length) }
}

/** Sum the four buckets. */
export function bucketTotal(buckets: UsageBuckets): number {
  return buckets.uncachedInput + buckets.output + buckets.cacheRead + buckets.cacheWrite
}
