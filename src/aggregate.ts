/**
 * Range aggregation over per-session fold states → the panel payload.
 *
 * Pure function of (states, rangeDays, now): the cache layer owns folding;
 * this layer answers range queries. All day boundaries use the host-local
 * calendar (same `dayKeyOf` as the fold).
 * @module dsh-usage-lens/aggregate
 */

import { splitSourceKey, type DailyRow, type FoldState, type PanelData, type SourceTotal } from './types.ts'
import { dayKeyOf } from './fold.ts'

/** Range options supported by the panel. */
export type RangeDays = 7 | 30

/** Fixed heatmap window: today + 279 preceding days (≈ 40 week columns). */
export const HEATMAP_WINDOW_DAYS = 280

export function isRangeDays(value: unknown): value is RangeDays {
  return value === 7 || value === 30
}

/** Local date key of "now minus offset days" (offset 0 = today).
 *
 * Uses calendar-day arithmetic instead of fixed 86_400_000 ms steps so the
 * local date stays correct across DST transitions. */
export function dayKeyOffset(now: number, offsetDays: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - offsetDays)
  return dayKeyOf(d.getTime())
}

/** The fixed 280-day heatmap window, oldest → newest (today last). */
export function heatmapDayKeys(now: number): string[] {
  const keys: string[] = []
  for (let offset = HEATMAP_WINDOW_DAYS - 1; offset >= 0; offset--) {
    keys.push(dayKeyOffset(now, offset))
  }
  return keys
}

/** Day-of-week of a date key, 1 = Monday … 7 = Sunday. */
export function dayOfWeekOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number)
  const jsDay = new Date(y!, m! - 1, d!).getDay()
  return jsDay === 0 ? 7 : jsDay
}

/**
 * The ordered date keys of a range ending today: today plus `rangeDays`
 * preceding days, oldest → newest (so `最近N天` renders `N + 1` columns).
 */
export function rangeDayKeys(now: number, rangeDays: RangeDays): string[] {
  const keys: string[] = []
  for (let offset = rangeDays; offset >= 0; offset--) {
    keys.push(dayKeyOffset(now, offset))
  }
  return keys
}

/** Aggregate the fold states of every session file into a panel payload. */
export function aggregate(states: readonly FoldState[], rangeDays: RangeDays, now: number): PanelData {
  const heatmapKeys = heatmapDayKeys(now) // fixed 280-day heatmap window
  const days = rangeDayKeys(now, rangeDays) // today + N preceding days
  const rangeSet = new Set(days)

  // Per-day rollups across sessions (stable key order by first appearance).
  const perDay = new Map<string, { tokens: number; messages: number; turns: number; sources: Map<string, number> }>()
  for (const key of heatmapKeys) {
    perDay.set(key, { tokens: 0, messages: 0, turns: 0, sources: new Map() })
  }
  // Range-wide source totals.
  const sourceTotals = new Map<string, number>()
  let sessions = 0
  let activeDays = 0
  let tokens = 0
  let messages = 0

  for (const state of states) {
    let sessionActive = false
    for (const [day, bucket] of Object.entries(state.days)) {
      const row = perDay.get(day)
      if (row === undefined) continue
      row.tokens += bucket.tokens
      row.messages += bucket.messages
      row.turns += bucket.turns
      for (const [source, amount] of Object.entries(bucket.sources)) {
        if (amount === 0) continue
        row.sources.set(source, (row.sources.get(source) ?? 0) + amount)
        if (rangeSet.has(day)) sourceTotals.set(source, (sourceTotals.get(source) ?? 0) + amount)
      }
      if (bucket.tokens > 0 && rangeSet.has(day)) sessionActive = true
    }
    if (sessionActive) sessions += 1
  }

  for (const key of days) {
    const row = perDay.get(key)!
    tokens += row.tokens
    messages += row.messages
    if (row.tokens > 0) activeDays += 1
  }

  // Current streak over the fixed heatmap window (range-independent), ending
  // today; an in-progress today without usage does not break the streak.
  let streak = 0
  let cursor = heatmapKeys.length - 1
  if (perDay.get(heatmapKeys[cursor]!)!.tokens === 0) cursor -= 1
  while (cursor >= 0 && perDay.get(heatmapKeys[cursor]!)!.tokens > 0) {
    streak += 1
    cursor -= 1
  }

  const toDailyRow = (key: string): DailyRow => {
    const row = perDay.get(key)!
    const sources: SourceTotal[] = []
    for (const [source, amount] of row.sources) {
      const { provider, model } = splitSourceKey(source)
      sources.push({ provider, model, tokens: amount })
    }
    sources.sort((a, b) => b.tokens - a.tokens)
    return { date: key, dayOfWeek: dayOfWeekOf(key), tokens: row.tokens, sources, messages: row.messages, turns: row.turns }
  }

  const daily: DailyRow[] = days.map(toDailyRow)
  const heatmap: DailyRow[] = heatmapKeys.map(toDailyRow)

  const sources: SourceTotal[] = []
  for (const [source, amount] of sourceTotals) {
    const { provider, model } = splitSourceKey(source)
    sources.push({ provider, model, tokens: amount })
  }
  sources.sort((a, b) => b.tokens - a.tokens)

  let topModel: { name: string; tokens: number; share: number } = { name: '', tokens: 0, share: 0 }
  if (sources.length > 0) {
    const byModel = new Map<string, number>()
    for (const source of sources) {
      byModel.set(source.model, (byModel.get(source.model) ?? 0) + source.tokens)
    }
    let bestName = ''
    let bestTokens = 0
    for (const [name, amount] of byModel) {
      if (amount > bestTokens) {
        bestTokens = amount
        bestName = name
      }
    }
    topModel = {
      name: bestName,
      tokens: bestTokens,
      share: tokens > 0 ? Math.round((bestTokens / tokens) * 100) : 0,
    }
  }

  return {
    rangeDays,
    generatedAt: now,
    totals: { tokens, sessions, messages, activeDays, streakDays: streak, topModel },
    daily,
    heatmap,
    sources,
  }
}
