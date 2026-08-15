/**
 * The usage-lens settings section: title bar + range switch, the six info
 * cards, the activity heatmap (fixed 280-day window), the stacked daily trend
 * (fills width, model-level), and the model-usage donut with three aggregation
 * modes (汇总 / 厂商 / 模型). All blocks render from one `PanelData` payload.
 * @module dsh-usage-lens/client/section
 */

import { createElement, Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PanelData, SourceTotal } from '../types.ts'
import { api } from './api.ts'
import { DonutChart, Heatmap, PROVIDER_PALETTE, SERIES_PALETTE, TrendChart, type DonutMode, type LevelSeries } from './charts.tsx'
import { subscribeLocale, t } from './locales.ts'
import type { UsageLensLocaleService } from './context.ts'
import { formatTokens } from './format.ts'
import css from './usage-lens.module.css'

/** The settings-section props: the shell's `close` plus the inject face. */
export interface UsageLensSectionProps {
  close: () => void
  /** Provided through the slot registration's inject face. */
  locale: UsageLensLocaleService
}

/** Icons for the six cards (inline, theme-independent strokes). */
const ICONS = {
  tokens: 'M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14l-3-2-2 2-3-2-2 2-2-2z',
  sessions: 'M3 7l9 6 9-6-9-5z M3 7v10l9 6 9-6V7',
  messages: 'M21 12a8 8 0 0 1-8 8H5l-2 2V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z',
  activeDays: 'M12 3a9 9 0 1 0 9 9h-9z',
  streak: 'M13 3L4 14h6l-1 7 9-11h-6z',
  topModel: 'M12 2l2.4 6.2L21 9l-5 4.4L17.5 20 12 16.5 6.5 20 8 13.4 3 9l6.6-.8z',
}

/** Aggregate sources by one key (model or provider), totals desc. */
function seriesOf(sources: readonly SourceTotal[], keyOf: (source: SourceTotal) => string): LevelSeries[] {
  const byKey = new Map<string, number>()
  for (const source of sources) byKey.set(keyOf(source), (byKey.get(keyOf(source)) ?? 0) + source.tokens)
  return [...byKey.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, tokens]) => ({ key, label: key === 'unknown' ? t('unknown') : key, tokens }))
}

/** Stable palette color map for a series list. */
function colorMap(series: readonly LevelSeries[], palette: readonly string[]): Map<string, string> {
  const map = new Map<string, string>()
  series.forEach((item, index) => map.set(item.key, palette[index % palette.length]!))
  return map
}

export function UsageLensSection({ locale }: UsageLensSectionProps): ReactNode {
  const [rangeDays, setRangeDays] = useState<7 | 30>(7)
  const [refreshKey, setRefreshKey] = useState(0)
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<DonutMode>('summary')
  const [trendLevel, setTrendLevel] = useState<'model' | 'provider'>('model')
  const [, setLocaleTick] = useState(0)

  // Fetch on mount, range switch, and retry.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api.panel(rangeDays, controller.signal)
      .then((panel) => setData(panel))
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [rangeDays, refreshKey])

  // Re-render on locale flips (copy + number units).
  useEffect(() => subscribeLocale(locale, () => setLocaleTick(tick => tick + 1)), [locale])

  const modelSeries = useMemo(() => (data === null ? [] : seriesOf(data.sources, source => source.model)), [data])
  const providerSeries = useMemo(() => (data === null ? [] : seriesOf(data.sources, source => source.provider)), [data])
  const modelColorMap = useMemo(() => colorMap(modelSeries, SERIES_PALETTE), [modelSeries])
  const providerColorMap = useMemo(() => colorMap(providerSeries, PROVIDER_PALETTE), [providerSeries])
  const modelColorOf = (key: string): string => modelColorMap.get(key) ?? SERIES_PALETTE[0]!
  const providerColorOf = (key: string): string => providerColorMap.get(key) ?? PROVIDER_PALETTE[0]!
  const unitLabel = t('tokensUnit')

  // Trend aggregation level (厂商 / 模型), default 模型.
  const trendSeries = trendLevel === 'model' ? modelSeries : providerSeries
  const trendColorOf = trendLevel === 'model' ? modelColorOf : providerColorOf
  const trendGroupOf = useCallback(
    (source: SourceTotal): string => (trendLevel === 'model' ? source.model : source.provider),
    [trendLevel],
  )

  const card = (label: string, value: string, valueClass: string | undefined, sub: string | null, icon: string, key: string): ReactNode =>
    createElement('div', { className: css.card, key },
      createElement('div', { className: css.cardLabel },
        createElement('svg', { className: css.cardIcon, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          createElement('path', { d: icon }),
        ),
        createElement('span', null, label),
      ),
      createElement('div', { className: valueClass }, value),
      sub === null ? null : createElement('div', { className: css.cardSub }, sub),
    )

  const cards: ReactNode[] = data === null ? [] : (() => {
    const top = data.totals.topModel
    return [
      card(t('tokens'), formatTokens(data.totals.tokens), css.cardValue, null, ICONS.tokens, 'tokens'),
      card(t('sessions'), String(data.totals.sessions), css.cardValue, null, ICONS.sessions, 'sessions'),
      card(t('messages'), String(data.totals.messages), css.cardValue, null, ICONS.messages, 'messages'),
      card(t('activeDays'), String(data.totals.activeDays), css.cardValue, null, ICONS.activeDays, 'active'),
      card(t('streak'), String(data.totals.streakDays), css.cardValue, null, ICONS.streak, 'streak'),
      card(t('topModel'), top.name === '' ? '—' : top.name, css.cardValueModel, top.name === '' ? null : `${t('share')} ${top.share}%`, ICONS.topModel, 'top'),
    ]
  })()

  const empty = data !== null && data.totals.tokens === 0
  const legend = createElement('div', { className: css.legend },
    trendSeries.map(item => createElement('div', { key: item.key, className: css.legendItem },
      createElement('span', { className: css.legendDot, style: { background: trendColorOf(item.key) } }),
      createElement('span', null, item.label),
    )),
  )

  const modeSwitch = (current: DonutMode): ReactNode =>
    createElement('div', { className: css.rangeSwitch },
      (['summary', 'provider', 'model'] as const).map(option => createElement('button', {
        key: option,
        type: 'button',
        className: `${css.rangeBtn} ${current === option ? css.active : ''}`.trim(),
        onClick: () => setMode(option),
      }, t(option))),
    )

  return createElement('div', { className: css.panel },
    createElement('div', { className: css.header },
      createElement('div', { className: css.title }, t('title')),
      createElement('div', { className: css.rangeSwitch },
        ([7, 30] as const).map(days => createElement('button', {
          key: days,
          type: 'button',
          className: `${css.rangeBtn} ${rangeDays === days ? css.active : ''}`.trim(),
          onClick: () => setRangeDays(days),
        }, days === 7 ? t('range7') : t('range30'))),
      ),
    ),
    error !== null
      ? createElement('div', { className: css.errorBar },
        createElement('span', null, `${t('loadFailed')}: ${error}`),
        createElement('button', {
          type: 'button',
          className: css.errorRetry,
          onClick: () => setRefreshKey(key => key + 1),
        }, t('refresh')),
      )
      : null,
    loading && data === null ? createElement('div', { className: css.loading }, '…') : null,
    data === null ? null : createElement(Fragment, null,
      createElement('div', { className: css.cards }, cards),
      createElement('div', { className: css.block },
        createElement('div', { className: css.blockTitleRow },
          createElement('div', { className: css.blockTitle }, t('heatmap')),
        ),
        empty
          ? createElement('div', { className: css.empty }, t('empty'))
          : createElement(Heatmap, { daily: data.heatmap, lessLabel: t('less'), moreLabel: t('more') }),
      ),
      createElement('div', { className: css.block },
        createElement('div', { className: css.blockTitleRow },
          createElement('div', { className: css.blockTitle }, t('trend')),
          createElement('div', { className: css.rangeSwitch },
            (['model', 'provider'] as const).map(option => createElement('button', {
              key: option,
              type: 'button',
              className: `${css.rangeBtn} ${trendLevel === option ? css.active : ''}`.trim(),
              onClick: () => setTrendLevel(option),
            }, t(option))),
          ),
        ),
        empty
          ? createElement('div', { className: css.empty }, t('empty'))
          : createElement(Fragment, null,
            createElement(TrendChart, { daily: data.daily, series: trendSeries, colorOf: trendColorOf, groupOf: trendGroupOf, unitLabel }),
            legend,
          ),
      ),
      createElement('div', { className: css.block },
        createElement('div', { className: css.blockTitleRow },
          createElement('div', { className: css.blockTitle }, t('usage')),
          modeSwitch(mode),
        ),
        empty
          ? createElement('div', { className: css.empty }, t('empty'))
          : createElement(DonutChart, {
            sources: data.sources,
            mode,
            unitLabel,
            modelColorOf,
            providerColorOf,
            onSelectProvider: () => setMode('provider'),
            onSelectModel: () => setMode('model'),
          }),
      ),
    ),
  )
}
