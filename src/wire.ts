/**
 * Wire helpers for the plugin's HTTP routes: JSON body read, JSON response
 * write, and the {ok, value|error} envelope.
 * @module dsh-usage-lens/wire
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ApiResult } from './types.ts'

export class UsageLensError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

/** Read and parse the JSON request body (cap 1 MiB). */
export function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 1024 * 1024) {
        reject(new UsageLensError('payload-too-large', 'request body exceeds 1 MiB', 413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (size === 0) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new UsageLensError('bad-json', 'invalid JSON body', 400))
      }
    })
    req.on('error', (error) => {
      reject(new UsageLensError('network', error.message, 400))
    })
  })
}

/** Write a JSON response. */
export function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

/** Write the success envelope. */
export function writeOk(res: ServerResponse, value: unknown): void {
  writeJson(res, 200, { ok: true, value } satisfies ApiResult<unknown>)
}

/** Write the failure envelope (UsageLensError → its status, else 500). */
export function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof UsageLensError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}
