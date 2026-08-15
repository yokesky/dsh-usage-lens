/**
 * Client half of dsh-usage-lens: registers the Usage section in the DSH
 * Settings shell and wires the locale dictionaries. The section renders the
 * four-block usage dashboard from the plugin's fenced `/usage-lens/api` route.
 * @module dsh-usage-lens/client
 */

import { createElement } from 'react'
import type { Context } from './context.ts'
import { attachLocale, LOCALE_NS, t, zh, en } from './locales.ts'
import { UsageLensSection } from './section.tsx'

/** Services required before mounting (provided by the client runtime). */
export const inject = ['slots', 'locale']

/**
 * Client plugin body.
 * @param ctx - the client cordis context (slots, locale).
 */
export function apply(ctx: Context): void {
  attachLocale(ctx.locale)
  ctx.effect(() => {
    const offZh = ctx.locale.register(LOCALE_NS, 'zh', zh)
    const offEn = ctx.locale.register(LOCALE_NS, 'en', en)
    return () => { offZh(); offEn() }
  }, 'dsh-usage-lens: dictionaries')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage-lens',
    order: 20,
    label: () => t('nav'),
    inject: () => ({ locale: ctx.locale }),
  }, UsageLensSection))
}
