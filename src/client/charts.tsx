/**
 * Chart components: GitHub-style heatmap, stacked daily bar chart, and the
 * model-usage donut with three aggregation modes. All hand-drawn SVG/div (no
 * chart library), theme-driven through CSS classes, series colors
 * theme-independent. The trend and donut measure their container so every
 * chart fills the settings column exactly (no fixed pixel minimums).
 * @module dsh-usage-lens/client/charts
 */

import {
  createElement,
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { DailyRow, SourceTotal } from '../types.ts'
import { formatDateShort, formatExact, formatTokens } from './format.ts'
import { t } from './locales.ts'
import css from './usage-lens.module.css'

/** Series palette (theme-independent, fixed order). */
export const SERIES_PALETTE = ['#4F7DF3', '#34C48A', '#A06BFF', '#E55555', '#F5A623', '#2AC6DE', '#F25CC1', '#8B93A7']

/**
 * Provider ring palette — deliberately disjoint from the model palette above
 * (warm/earthy tones) so an outer provider segment never reuses a model color.
 */
export const PROVIDER_PALETTE = ['#E0A63C', '#CE6B8E', '#C08457', '#A65E5E', '#D18052', '#B08A5E', '#C9A24B', '#8C6E5A']

/** Display name for a source/model/provider ('unknown' → localized label). */
function displayName(name: string): string {
  return name === 'unknown' ? t('unknown') : name
}

/** One series descriptor (a model or provider at the current level). */
export interface LevelSeries {
  key: string
  label: string
  tokens: number
}

/** 0..4 heat level for a token count relative to the range max. */
export function heatLevel(tokens: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (tokens <= 0 || max <= 0) return 0
  const r = tokens / max
  const level = Math.ceil(4 * Math.sqrt(r))
  return Math.min(4, Math.max(1, level)) as 1 | 2 | 3 | 4
}

/** Round a max up to a readable axis ceiling (1/2/5 × 10^n). */
export function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const base = 10 ** exp
  const unit = value / base
  const nice = unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10
  return nice * base
}

/** Measure a container's client width (re-measures on resize). */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (el === null) return
    const measure = (): void => setWidth(el.clientWidth)
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(el)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return [ref, width]
}

/** Heatmap row index for `dayOfWeek` (1 = Mon … 7 = Sun): Sun = 0 … Sat = 6. */
export function heatmapRowIndex(dayOfWeek: number): number {
  return dayOfWeek % 7
}

/**
 * Build the 7 heatmap rows (Sunday first, Saturday last) with leading blanks
 * for the first week and each row padded to the same column count so the grid
 * is rectangular — today lands in the last (rightmost) column.
 */
export function heatmapRows(daily: readonly DailyRow[]): Array<Array<DailyRow | null>> {
  if (daily.length === 0) return [[], [], [], [], [], [], []]
  const leading = heatmapRowIndex(daily[0]!.dayOfWeek)
  const cells: Array<DailyRow | null> = [...Array.from({ length: leading }, () => null), ...daily]
  const columnCount = Math.ceil(cells.length / 7)
  const rows: Array<Array<DailyRow | null>> = Array.from({ length: 7 }, () => [])
  for (let i = 0; i < cells.length; i++) rows[i % 7]!.push(cells[i]!)
  for (const row of rows) while (row.length < columnCount) row.push(null)
  return rows
}

/** GitHub-style per-day activity heatmap (Sunday-first, many square cells). */
export function Heatmap({ daily, lessLabel, moreLabel }: {
  daily: readonly DailyRow[]
  lessLabel: string
  moreLabel: string
}): ReactNode {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ date: string; tokens: number; turns: number; x: number; y: number } | null>(null)
  const max = useMemo(() => Math.max(0, ...daily.map(row => row.tokens)), [daily])
  const rows = useMemo(() => heatmapRows(daily), [daily])
  const columnCount = Math.max(1, rows[0]?.length ?? 0)
  const GAP = 3
  // Square cell size that fills the measured width (clamped to stay small).
  const cellSize = width <= 0
    ? 12
    : Math.min(16, Math.max(8, (width - (columnCount - 1) * GAP) / columnCount))
  const cellStyle = { width: cellSize, height: cellSize }
  const clampX = (x: number): number => Math.min(Math.max(x, 90), width - 90)
  return createElement('div', { ref, className: css.heatmapWrap },
    createElement('div', { className: css.heatmapGrid },
      rows.map((row, rowIndex) => createElement('div', { key: rowIndex, className: css.hmRow },
        row.map((cell, colIndex) => {
          if (cell === null) {
            return createElement('div', { key: `${rowIndex}-${colIndex}`, className: `${css.hmCell} ${css.hmEmpty}`.trim(), style: cellStyle })
          }
          const level = heatLevel(cell.tokens, max)
          return createElement('div', {
            key: `${rowIndex}-${colIndex}`,
            className: `${css.hmCell} ${css[`level${level}`] ?? ''}`.trim(),
            style: cellStyle,
            onMouseEnter: (event: MouseEvent) => {
              const wrap = ref.current
              if (wrap === null) return
              const wrapRect = wrap.getBoundingClientRect()
              const cellRect = (event.currentTarget as HTMLElement).getBoundingClientRect()
              setHover({
                date: cell.date,
                tokens: cell.tokens,
                turns: cell.turns,
                x: cellRect.left + cellRect.width / 2 - wrapRect.left,
                y: cellRect.top + cellRect.height / 2 - wrapRect.top,
              })
            },
            onMouseLeave: () => setHover(null),
          })
        }),
      )),
    ),
    hover === null ? null : createElement('div', {
      className: css.hmTooltip,
      style: { left: clampX(hover.x), top: hover.y, transform: 'translate(-50%, calc(-100% - 8px))' },
    },
      createElement('div', null,
        `${formatDateShort(hover.date)}：${formatTokens(hover.tokens)} ${t('tokensUnit')} · ${hover.turns} ${t('rounds')}`),
    ),
    createElement('div', { className: css.heatmapLegend },
      createElement('span', null, lessLabel),
      createElement('span', { className: css.hmSwatch }),
      createElement('span', { className: `${css.hmSwatch} ${css.l1}` }),
      createElement('span', { className: `${css.hmSwatch} ${css.l2}` }),
      createElement('span', { className: `${css.hmSwatch} ${css.l3}` }),
      createElement('span', { className: `${css.hmSwatch} ${css.l4}` }),
      createElement('span', null, moreLabel),
    ),
  )
}

/** Stacked per-day bar chart that fills its container width, with hover detail. */
export function TrendChart({
  daily,
  series,
  colorOf,
  groupOf,
  unitLabel,
}: {
  daily: readonly DailyRow[]
  series: readonly LevelSeries[]
  colorOf: (key: string) => string
  /** Map a per-day source row to the current level's series key. */
  groupOf: (source: SourceTotal) => string
  unitLabel: string
}): ReactNode {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState<{ dayIndex: number; cx: number } | null>(null)
  // Measure the tooltip so we can shift it inward at the chart edges instead
  // of letting it spill past the settings column.
  const tipRef = useRef<HTMLDivElement | null>(null)
  const [tipWidth, setTipWidth] = useState(0)
  useLayoutEffect(() => {
    const w = tipRef.current?.offsetWidth
    if (typeof w === 'number' && w > 0 && w !== tipWidth) setTipWidth(w)
  })

  const yMax = useMemo(() => niceCeil(Math.max(0, ...daily.map(row => row.tokens))), [daily])
  const stacked = useMemo(() => daily.map((row) => {
    const byKey = new Map<string, number>()
    for (const source of row.sources) byKey.set(groupOf(source), (byKey.get(groupOf(source)) ?? 0) + source.tokens)
    return series.map((s) => ({ key: s.key, tokens: byKey.get(s.key) ?? 0 }))
  }), [daily, series, groupOf])
  const labelOf = useMemo(() => new Map(series.map(s => [s.key, s.label])), [series])

  const PAD_L = 26
  const PAD_R = 26
  const PAD_T = 12
  const PAD_B = 26
  const PLOT_H = 200
  const height = PAD_T + PLOT_H + PAD_B
  const plotW = Math.max(1, width - PAD_L - PAD_R)
  const colW = plotW / Math.max(1, daily.length)
  // Narrow the bars for wide columns (7-day view) so bars don't touch.
  const barW = Math.max(2, colW > 40 ? colW * 0.55 : colW - 2)
  const labelStep = Math.max(1, Math.ceil(daily.length / 7))
  const yOf = (tokens: number): number => PAD_T + PLOT_H - (yMax === 0 ? 0 : (tokens / yMax) * PLOT_H)
  // Keep edge date labels fully inside the SVG (labels are ~40px wide).
  const clampLabelX = (x: number): number => Math.min(Math.max(x, 24), width - 24)
  // Clamp the tooltip center so the whole tooltip fits inside the chart.
  const tipHalf = (tipWidth || 280) / 2
  const clampTooltipX = (x: number): number => Math.min(Math.max(x, tipHalf + 8), width - tipHalf - 8)

  const tooltip = hover === null ? null : (daily[hover.dayIndex] ?? null)
  const tooltipSeries = hover === null ? null : (stacked[hover.dayIndex] ?? null)

  return createElement('div', { ref, className: css.trendChart },
    width === 0 ? null : createElement(Fragment, null,
      createElement('svg', {
        className: css.trendSvg,
        viewBox: `0 0 ${width} ${height}`,
        width: '100%',
        height,
      },
        daily.map((row, index) => {
          let acc = 0
          return createElement('g', { key: row.date },
            stacked[index]!.map((segment) => {
              const top = yOf(acc + segment.tokens)
              const bottom = yOf(acc)
              acc += segment.tokens
              return createElement('rect', {
                key: segment.key,
                className: css.trendBar,
                x: PAD_L + index * colW,
                y: top,
                width: barW,
                height: Math.max(0, bottom - top),
                rx: Math.min(2, barW / 3),
                fill: colorOf(segment.key),
              })
            }),
            createElement('rect', {
              className: css.trendColumn,
              x: PAD_L + index * colW,
              y: PAD_T,
              width: colW,
              height: PLOT_H,
              fill: 'transparent',
              onMouseEnter: () => setHover({ dayIndex: index, cx: PAD_L + index * colW + colW / 2 }),
              onMouseLeave: () => setHover(null),
            }),
          )
        }),
        createElement('line', { className: css.trendAxis, x1: PAD_L, y1: yOf(0), x2: width - PAD_R, y2: yOf(0) }),
        daily.map((row, index) => {
          if (index % labelStep !== 0 && index !== daily.length - 1) return null
          return createElement('text', {
            key: row.date,
            className: css.trendLabel,
            x: clampLabelX(PAD_L + index * colW + colW / 2),
            y: height - 8,
            textAnchor: 'middle',
          }, formatDateShort(row.date))
        }),
      ),
      tooltip !== null && tooltipSeries !== null
        ? createElement('div', {
          ref: tipRef,
          className: css.trendTooltip,
          style: { left: clampTooltipX(hover!.cx), top: 8, transform: 'translateX(-50%)' },
        },
          createElement('div', { className: css.ttHeader },
            createElement('span', { className: css.ttDate }, formatDateShort(tooltip.date)),
            createElement('span', { className: css.ttTotalTokens }, `${formatTokens(tooltip.tokens)} ${unitLabel}`.trim()),
          ),
          tooltipSeries.map((segment) => segment.tokens > 0
            ? createElement('div', { key: segment.key, className: css.ttRow },
              createElement('span', { className: css.ttDot, style: { background: colorOf(segment.key) } }),
              createElement('span', { className: css.ttName }, labelOf.get(segment.key) ?? segment.key),
              createElement('span', { className: css.ttTokens }, formatExact(segment.tokens)),
            )
            : null),
        )
        : null,
    ),
  )
}

/** The three donut aggregation modes. */
export type DonutMode = 'summary' | 'provider' | 'model'

interface ProviderGroup {
  name: string
  tokens: number
  models: Array<{ model: string; tokens: number }>
}

interface ModelTotal {
  model: string
  tokens: number
}

/** Group sources by provider (models inside) and by flat model, sorted desc. */
function useGroups(sources: readonly SourceTotal[]): { providers: ProviderGroup[]; models: ModelTotal[]; total: number } {
  return useMemo(() => {
    const byProvider = new Map<string, Map<string, number>>()
    for (const source of sources) {
      const models = byProvider.get(source.provider) ?? new Map<string, number>()
      models.set(source.model, (models.get(source.model) ?? 0) + source.tokens)
      byProvider.set(source.provider, models)
    }
    const providers: ProviderGroup[] = [...byProvider.entries()].map(([name, modelMap]) => {
      const models = [...modelMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([model, tokens]) => ({ model, tokens }))
      const tokens = models.reduce((sum, m) => sum + m.tokens, 0)
      return { name, tokens, models }
    }).sort((a, b) => b.tokens - a.tokens)

    const modelMap = new Map<string, number>()
    for (const source of sources) modelMap.set(source.model, (modelMap.get(source.model) ?? 0) + source.tokens)
    const models: ModelTotal[] = [...modelMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([model, tokens]) => ({ model, tokens }))

    const total = providers.reduce((sum, p) => sum + p.tokens, 0)
    return { providers, models, total }
  }, [sources])
}

/** Donut chart with a center total and a right-side, scrollable legend table. */
export function DonutChart({
  sources,
  mode,
  unitLabel,
  modelColorOf,
  providerColorOf,
  onSelectProvider,
  onSelectModel,
}: {
  sources: readonly SourceTotal[]
  mode: DonutMode
  unitLabel: string
  modelColorOf: (model: string) => string
  providerColorOf: (provider: string) => string
  onSelectProvider: (provider: string) => void
  onSelectModel: (model: string) => void
}): ReactNode {
  const { providers, models, total } = useGroups(sources)

  const SIZE = 176
  const C = SIZE / 2
  const INNER_R = 54
  const INNER_STROKE = 26
  const OUTER_R = 76
  const OUTER_STROKE = 10
  const INNER_CIRC = 2 * Math.PI * INNER_R
  const OUTER_CIRC = 2 * Math.PI * OUTER_R
  // Arc-length gap (px along the stroke) between provider groups. Subtracted
  // from the stroke dasharray so angles stay true — it never consumes pie %.
  const GROUP_GAP_PX = 3

  interface RingArc { key: string; start: number; frac: number; color: string; gapPx: number; onClick?: () => void }
  const inner: RingArc[] = []
  const outer: RingArc[] = []
  let acc = 0
  if (mode === 'summary') {
    // Outer ring: one segment per provider; inner ring: the provider's models.
    // `acc` stays the true cumulative fraction (sums to exactly 1); gaps are
    // realized by shortening the slice dash, not by shifting angles.
    for (const provider of providers) {
      outer.push({
        key: `p-${provider.name}`,
        start: acc,
        frac: total > 0 ? provider.tokens / total : 0,
        color: providerColorOf(provider.name),
        gapPx: GROUP_GAP_PX,
        onClick: () => onSelectProvider(provider.name),
      })
      provider.models.forEach((model, modelIndex) => {
        const frac = total > 0 ? model.tokens / total : 0
        if (frac > 0) {
          inner.push({
            key: `${provider.name}\u0000${model.model}`,
            start: acc,
            frac,
            color: modelColorOf(model.model),
            // Gap only at the provider boundary (last model of the group);
            // models within a provider stay adjacent.
            gapPx: modelIndex === provider.models.length - 1 && total > 0 ? GROUP_GAP_PX : 0,
            onClick: () => onSelectModel(model.model),
          })
        }
        acc += frac
      })
    }
  } else if (mode === 'provider') {
    for (const provider of providers) {
      const frac = total > 0 ? provider.tokens / total : 0
      if (frac > 0) inner.push({ key: provider.name, start: acc, frac, color: providerColorOf(provider.name), gapPx: 0 })
      acc += frac
    }
  } else {
    for (const model of models) {
      const frac = total > 0 ? model.tokens / total : 0
      if (frac > 0) inner.push({ key: model.model, start: acc, frac, color: modelColorOf(model.model), gapPx: 0 })
      acc += frac
    }
  }

  const tableRows = (): ReactNode => {
    const share = (tokens: number): string => (total > 0 ? `${Math.round((tokens / total) * 100)}%` : '0%')
    if (mode === 'summary') {
      return providers.map((provider) => createElement('div', { key: provider.name, className: css.tableGroup },
        createElement('button', {
          type: 'button',
          className: css.tableProvider,
          onClick: () => onSelectProvider(provider.name),
          title: displayName(provider.name),
        }, displayName(provider.name)),
        createElement('div', { className: css.tableModels },
          provider.models.map((model) => createElement('div', {
            key: model.model,
            className: css.tableModelRow,
            onClick: () => onSelectModel(model.model),
          },
            createElement('span', { className: css.legendDot, style: { background: modelColorOf(model.model) } }),
            createElement('span', { className: css.tableName, title: displayName(model.model) }, displayName(model.model)),
            createElement('span', { className: css.tableTokens }, `${formatTokens(model.tokens)}${unitLabel}`),
            createElement('span', { className: css.tableShare }, share(model.tokens)),
          )),
        ),
      ))
    }
    if (mode === 'provider') {
      return providers.map((provider) => createElement('div', {
        key: provider.name,
        className: css.tableFlatRow,
        onClick: () => onSelectProvider(provider.name),
      },
        createElement('span', { className: css.legendDot, style: { background: providerColorOf(provider.name) } }),
        createElement('span', { className: css.tableName, title: displayName(provider.name) }, displayName(provider.name)),
        createElement('span', { className: css.tableTokens }, `${formatTokens(provider.tokens)}${unitLabel}`),
        createElement('span', { className: css.tableShare }, share(provider.tokens)),
      ))
    }
    return models.map((model) => createElement('div', {
      key: model.model,
      className: css.tableFlatRow,
      onClick: () => onSelectModel(model.model),
    },
      createElement('span', { className: css.legendDot, style: { background: modelColorOf(model.model) } }),
      createElement('span', { className: css.tableName, title: displayName(model.model) }, displayName(model.model)),
      createElement('span', { className: css.tableTokens }, `${formatTokens(model.tokens)}${unitLabel}`),
      createElement('span', { className: css.tableShare }, share(model.tokens)),
    ))
  }

  return createElement('div', { className: css.donutLayout },
    createElement('svg', { className: css.donutSvg, viewBox: `0 0 ${SIZE} ${SIZE}` },
      createElement('circle', { cx: C, cy: C, r: INNER_R, fill: 'none', stroke: 'var(--ul-hover)', strokeWidth: INNER_STROKE }),
      inner.map(({ key, start, frac, color, gapPx, onClick }) => createElement('circle', {
        key,
        cx: C,
        cy: C,
        r: INNER_R,
        fill: 'none',
        stroke: color,
        strokeWidth: INNER_STROKE,
        strokeDasharray: `${Math.max(0, frac * INNER_CIRC - gapPx)} ${INNER_CIRC}`,
        strokeDashoffset: -(start * INNER_CIRC),
        transform: `rotate(-90 ${C} ${C})`,
        className: `${css.donutArc}${onClick === undefined ? '' : ` ${css.donutSlice}`}`,
        onClick,
      })),
      mode === 'summary'
        ? createElement(Fragment, null,
          createElement('circle', { cx: C, cy: C, r: OUTER_R, fill: 'none', stroke: 'var(--ul-hover)', strokeWidth: OUTER_STROKE }),
          outer.map(({ key, start, frac, color, gapPx, onClick }) => createElement('circle', {
            key,
            cx: C,
            cy: C,
            r: OUTER_R,
            fill: 'none',
            stroke: color,
            strokeWidth: OUTER_STROKE,
            strokeDasharray: `${Math.max(0, frac * OUTER_CIRC - gapPx)} ${OUTER_CIRC}`,
            strokeDashoffset: -(start * OUTER_CIRC),
            transform: `rotate(-90 ${C} ${C})`,
            className: `${css.donutArc}${onClick === undefined ? '' : ` ${css.donutSlice}`}`,
            onClick,
          })),
        )
        : null,
      createElement('text', { className: css.donutCenter, x: C, y: C - 2, dominantBaseline: 'middle' }, formatTokens(total)),
      createElement('text', { className: css.donutCenterUnit, x: C, y: C + 14, dominantBaseline: 'middle' }, unitLabel),
    ),
    createElement('div', { className: css.donutTable }, tableRows()),
  )
}
