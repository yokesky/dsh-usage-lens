/**
 * dsh-usage-lens host half: the fenced `/usage-lens/api` JSON route.
 *
 * One method, `panel`, refreshes the incremental fold cache over
 * `$DSH_HOME/sessions/` and answers the aggregated dashboard payload. Every
 * request passes the same browser-trust fence as the /api gateway
 * (Host-header loopback or the connection row's trustedHosts, read live from
 * the loader) so a cross-site page can never reach the route.
 *
 * The fold semantics mirror dsh's token-usage projection: per (turn, step)
 * the LAST usage sample wins, and provider/model attribution comes from the
 * assembled message source. Aggregates are cached as JSON under
 * `$DSH_HOME/storages/usage-lens/cache.json` with stat-fingerprint
 * incremental refreshes (unchanged logs are never re-decompressed).
 *
 * @module dsh-usage-lens
 */

import type { Context } from './context-types.ts'
import { Config, resolveUsageLensConfig, type UsageLensConfig } from './config.ts'
import { UsageLensPanel, fileStore, type PanelRequest } from './api.ts'
import { isTrustedApiRequest } from './trust-fence.ts'
import { readJsonBody, UsageLensError, writeError, writeJson, writeOk } from './wire.ts'

export { Config }
export type { UsageLensConfig }
export { UsageLensPanel, fileStore } from './api.ts'
export type { UsageLensStore, PanelRequest } from './api.ts'

/** Plugin identity for cordis.yml rows. */
export const name = '@yokesky/dsh-usage-lens'

/** Services required before mounting: the webserver routes and the loader's connection row. */
export const inject = ['webServer', 'loader']

/** The connection row's resolved trustedHosts (live read; the /api fence's own list). */
function trustedHostsOf(ctx: Context): string[] {
  for (const entry of ctx.loader.entries()) {
    if (entry.options.name === 'connection') {
      const config = entry.options.config as { trustedHosts?: string[] } | undefined
      return config?.trustedHosts ?? []
    }
  }
  return []
}

/** Plugin body. */
export function apply(ctx: Context, config?: UsageLensConfig): void {
  const resolved = resolveUsageLensConfig(config)
  if (resolved.sessionsRoot === '' || resolved.cacheFile === '') {
    throw new Error('dsh-usage-lens: DSH_HOME is unset and no sessionsRoot/cacheFile config was provided')
  }
  // Read the connection row's trustedHosts live on every request so config
  // changes are honored without a plugin reload (matches the /api fence).
  const fence = (req: Parameters<typeof isTrustedApiRequest>[0]): boolean => isTrustedApiRequest(req, trustedHostsOf(ctx))
  const panel = new UsageLensPanel(fileStore(resolved.sessionsRoot, resolved.cacheFile))

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/usage-lens/api',
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method-error', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/usage-lens/api/') ? pathname.slice('/usage-lens/api/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new UsageLensError('not-found', 'unknown usage-lens API method', 404))
        return
      }
      try {
        const payload = await readJsonBody(req)
        if (method === 'panel') {
          const request = (payload ?? {}) as PanelRequest
          writeOk(res, await panel.panel(request))
          return
        }
        writeError(res, new UsageLensError('not-found', `unknown usage-lens API method "${method}"`, 404))
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dsh-usage-lens: /usage-lens/api routes')
}
