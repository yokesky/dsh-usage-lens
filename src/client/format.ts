/**
 * Number formatting for the panel (zh units 万/亿, en K/M/B).
 * @module dsh-usage-lens/client/format
 */

import { activeLocaleOf } from './locales.ts'

/** Trim trailing zeros after the decimal point. */
function trimZero(value: string): string {
  return value.replace(/\.0$/, '')
}

/** One-decimal rounding, trailing zero trimmed. */
function oneDecimal(value: number): string {
  return trimZero(value.toFixed(1))
}

/** Format a token count with locale units (zh: 万/亿; en: K/M/B). */
export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  const zhMode = activeLocaleOf() === 'zh'
  if (zhMode) {
    if (value >= 1e8) return `${oneDecimal(value / 1e8)}亿`
    if (value >= 1e4) return `${oneDecimal(value / 1e4)}万`
  } else {
    if (value >= 1e9) return `${oneDecimal(value / 1e9)}B`
    if (value >= 1e6) return `${oneDecimal(value / 1e6)}M`
    if (value >= 1e3) return `${oneDecimal(value / 1e3)}K`
  }
  return String(Math.round(value))
}

/** Exact integer with thousands separators (1,234,567). */
export function formatExact(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '0'
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** Short date label from a YYYY-MM-DD key: 'M月D日' (zh) / 'M/D' (en). */
export function formatDateShort(key: string): string {
  const [, m, d] = key.split('-')
  const month = Number(m)
  const day = Number(d)
  if (activeLocaleOf() === 'zh') return `${month}月${day}日`
  return `${month}/${day}`
}
