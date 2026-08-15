/**
 * Client-side structural service mirrors (slots / locale), same containment
 * strategy as dsh-better-sidebar: third-party bundles cannot rely on the
 * upstream augmentations reaching their Context, so only the slices this
 * plugin touches are restated.
 * @module dsh-usage-lens/client/context
 */

import type { Context } from '@deepseek-ai/cordis'

/** The client locale service face (@deepseek-ai/dsh-client-locale). */
export interface UsageLensLocaleService {
  /** Current immutable locale snapshot (`active` is 'zh' | 'en' today). */
  getSnapshot(): { active: string }
  /** Subscribe to snapshot changes (locale switch or dictionary registration). */
  subscribe(fn: () => void): () => void
  /** Register one locale's dictionary for a namespace; returns the disposer. */
  register(ns: string, locale: string, dict: Record<string, string>): () => void
}

/** Registration options passed to `ctx.slots.register` (subset of the real options). */
export interface UsageLensSlotRegisterOptions {
  name: string
  key?: string
  id?: string
  order?: number
  label?: string | (() => string)
  locale?: string
  registrant?: string
  /** Business-face factory; args depend on the slot scope. */
  inject?: (...args: unknown[]) => Record<string, unknown>
  children?: Record<string, unknown>
}

/** The client slots service face (register returns the disposer). */
export interface UsageLensSlotsService {
  register(options: UsageLensSlotRegisterOptions, component: unknown): () => void
  /** Run a callback for each declaration lifetime of a slot (a no-op while
   *  the slot is undeclared). */
  inject(key: string, callback: () => () => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    slots: UsageLensSlotsService
    locale: UsageLensLocaleService
  }
}

export type { Context }
