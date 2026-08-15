/**
 * Structural types for the cordis services this plugin consumes, plus the
 * Context augmentation. A third-party plugin resolves outside the DSH
 * monorepo's single cordis instance, so the upstream `declare module`
 * augmentations do not reach this Context — the members below mirror the
 * actual runtime shapes this plugin touches (the same containment strategy as
 * dsh-better-sidebar's context-types).
 * @module dsh-usage-lens/context-types
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'

/** One named webserver route (mirror of the host-webserver WebRoute). */
export interface UsageLensWebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

/** The webServer service face this plugin uses. */
export interface UsageLensWebServer {
  register(route: UsageLensWebRoute): () => void
}

/** One loader entry's options slice (the connection row's resolved config). */
export interface UsageLensLoaderEntry {
  options: { name: string; config?: unknown }
}

/** The loader face used to read the connection row's trustedHosts config. */
export interface UsageLensLoader {
  entries(): Iterable<UsageLensLoaderEntry>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: UsageLensWebServer
    loader: UsageLensLoader
    /** Register a lifecycle callback (DSH-vendored cordis): runs at plugin
     *  activation; its returned cleanup runs at disposal. */
    effect(fn: () => void | (() => void), label?: string): void
  }
}

export type { Context }
