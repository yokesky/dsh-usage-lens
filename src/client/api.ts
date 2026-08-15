/**
 * Typed fetch wrapper over the plugin's fenced JSON API.
 * @module dsh-usage-lens/client/api
 */

import type { PanelData } from '../types.ts'

/** One wire failure. */
export class UsageLensApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(method: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/usage-lens/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
  } catch (error) {
    throw new UsageLensApiError('network', error instanceof Error ? error.message : String(error))
  }
  const parsed: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } | null
    = await response.json().catch(() => null)
  if (!response.ok || parsed === null || parsed.ok !== true || parsed.value === undefined) {
    throw new UsageLensApiError(
      parsed?.error?.code ?? 'http',
      parsed?.error?.message ?? `HTTP ${response.status}`,
    )
  }
  return parsed.value as T
}

/** The usage-lens API surface. */
export const api = {
  panel: (rangeDays: 7 | 30, signal?: AbortSignal) =>
    call<PanelData>('panel', { rangeDays }, signal),
}
