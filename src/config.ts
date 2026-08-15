/**
 * Plugin configuration. Tunables a deployment may set in cordis.yml; the
 * schema carries the defaults, so a bare `name: dsh-usage-lens` row works.
 * @module dsh-usage-lens/config
 */

import Schema from 'schemastery'
import { join } from 'node:path'

export interface UsageLensConfig {
  /** Sessions root override; defaults to `$DSH_HOME/sessions`. */
  sessionsRoot?: string
  /** Cache file path; defaults to `$DSH_HOME/storages/usage-lens/cache.json`. */
  cacheFile?: string
}

export const Config: Schema<UsageLensConfig> = Schema.object({
  sessionsRoot: Schema.string().description('Sessions root override (default: $DSH_HOME/sessions)'),
  cacheFile: Schema.string().description('Cache file path (default: $DSH_HOME/storages/usage-lens/cache.json)'),
})

/** Resolve the effective config (direct callers; the Loader validates rows). */
export function resolveUsageLensConfig(config?: UsageLensConfig): Required<Pick<UsageLensConfig, 'sessionsRoot' | 'cacheFile'>> {
  const home = process.env.DSH_HOME ?? ''
  return {
    sessionsRoot: config?.sessionsRoot ?? (home === '' ? '' : join(home, 'sessions')),
    cacheFile: config?.cacheFile ?? (home === '' ? '' : join(home, 'storages', 'usage-lens', 'cache.json')),
  }
}
