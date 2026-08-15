/**
 * Locale wiring: dictionaries under the `usageLens` namespace + the module
 * translate helper. The component tree subscribes to the locale service so a
 * language switch re-renders with fresh copy.
 * @module dsh-usage-lens/client/locales
 */

import type { UsageLensLocaleService } from './context.ts'

export const LOCALE_NS = 'usageLens'

export const zh: Record<string, string> = {
  nav: '用量统计',
  title: '使用统计',
  range7: '最近7天',
  range30: '最近30天',
  tokens: 'tokens 用量',
  sessions: '会话数量',
  messages: '消息数量',
  activeDays: '活跃天数',
  streak: '当前连续天数',
  topModel: '最常用模型',
  share: '占比',
  heatmap: '活跃热力图',
  less: '较少',
  more: '较多',
  trend: '按天 Token 趋势',
  usage: '模型用量',
  summary: '汇总',
  provider: '厂商',
  model: '模型',
  rounds: '轮',
  tokensUnit: 'tokens',
  unknown: '未知',
  loadFailed: '用量数据加载失败',
  refresh: '重试',
  empty: '该时间范围内暂无用量数据',
}

export const en: Record<string, string> = {
  nav: 'Usage',
  title: 'Usage Statistics',
  range7: 'Last 7 days',
  range30: 'Last 30 days',
  tokens: 'Total tokens',
  sessions: 'Sessions',
  messages: 'Messages',
  activeDays: 'Active days',
  streak: 'Current streak',
  topModel: 'Top model',
  share: 'Share',
  heatmap: 'Activity heatmap',
  less: 'Less',
  more: 'More',
  trend: 'Daily token trend',
  usage: 'Model usage',
  summary: 'Summary',
  provider: 'Provider',
  model: 'Model',
  rounds: 'rounds',
  tokensUnit: 'tokens',
  unknown: 'Unknown',
  loadFailed: 'Failed to load usage data',
  refresh: 'Retry',
  empty: 'No usage data in this range',
}

let activeLocale = 'zh'
let dict = zh
let subscribed = false

/** Bind the module state to the locale service (idempotent). */
export function attachLocale(service: UsageLensLocaleService): void {
  if (subscribed) return
  subscribed = true
  const sync = (): void => {
    const active = service.getSnapshot().active
    activeLocale = active === 'en' ? 'en' : 'zh'
    dict = activeLocale === 'en' ? en : zh
  }
  sync()
  service.subscribe(sync)
}

/** Translate one dictionary key. */
export function t(key: string): string {
  return dict[key] ?? key
}

/** The active locale ('zh' | 'en') — components subscribe for re-render. */
export function activeLocaleOf(): string {
  return activeLocale
}

/** Subscribe the caller to locale flips; returns the disposer. */
export function subscribeLocale(service: UsageLensLocaleService, fn: () => void): () => void {
  const off = service.subscribe(fn)
  return off
}
