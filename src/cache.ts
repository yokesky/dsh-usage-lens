/**
 * Incremental fold cache: per-session-file fold states persisted as JSON,
 * refreshed by stat fingerprint (size + mtime) so unchanged logs are never
 * re-decompressed. Appends are folded from the last persisted event seq.
 * @module dsh-usage-lens/cache
 */

import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { FoldState } from './types.ts'
import { createFoldState, foldUnknownEvents } from './fold.ts'
import { decompressSessionLog, parseLogLines } from './zstd.ts'
import { discoverSessionLogs, SESSION_LOG_NAME } from './scan-sessions.ts'

export const CACHE_VERSION = 2

/** One cached session artifact: fingerprint + folded state + fold cursor. */
export interface SessionCacheEntry {
  size: number
  mtimeMs: number
  lastSeq: number
  folded: FoldState
}

/** Cache file shape (plain JSON, atomic writes). */
export interface CacheFile {
  version: number
  sessions: Record<string, SessionCacheEntry>
}

export function createCacheFile(): CacheFile {
  return { version: CACHE_VERSION, sessions: {} }
}

/** Read the cache file; a missing or corrupt file starts fresh. */
export async function loadCacheFile(path: string): Promise<CacheFile> {
  try {
    const text = await readFile(path, 'utf8')
    const parsed: unknown = JSON.parse(text)
    if (parsed !== null && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>
      if (record.version === CACHE_VERSION && typeof record.sessions === 'object' && record.sessions !== null) {
        return { version: CACHE_VERSION, sessions: record.sessions as Record<string, SessionCacheEntry> }
      }
    }
  } catch {
    // Missing or corrupt: fresh cache.
  }
  return createCacheFile()
}

/** Atomically persist the cache (tmp + rename). */
export async function saveCacheFile(path: string, cache: CacheFile): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  await writeFile(tmp, JSON.stringify(cache), 'utf8')
  await rename(tmp, path)
}

/**
 * Refresh the cache against the current sessions tree.
 *
 * - Unchanged fingerprint (size + mtimeMs): entry reused untouched.
 * - Changed/added file: decompress once, fold events with seq > lastSeq
 *   (full fold when the file shrank — a rewrite, not an append).
 * - Removed file: entry dropped.
 *
 * @returns the refreshed cache (mutates the input cache in place).
 */
export async function refreshCache(cache: CacheFile, sessionsRoot: string): Promise<CacheFile> {
  const paths = await discoverSessionLogs(sessionsRoot)
  const seen = new Set<string>()

  for (const path of paths) {
    seen.add(path)
    const prior = cache.sessions[path]
    const entry = await foldArtifact(path, prior)
    if (entry === null) continue // Unreadable: keep any previous entry.
    cache.sessions[path] = entry
  }

  for (const path of Object.keys(cache.sessions)) {
    if (!seen.has(path)) delete cache.sessions[path]
  }
  return cache
}

/**
 * Fold one artifact path incrementally over its prior entry. Returns null
 * when the artifact cannot be read or decoded (prior entry is preserved by
 * the caller). When the fingerprint matches the prior entry exactly, the
 * prior entry is returned as-is without any read.
 */
export async function foldArtifact(path: string, prior?: SessionCacheEntry): Promise<SessionCacheEntry | null> {
  let info
  try {
    info = await stat(path)
  } catch {
    return null
  }
  if (prior !== undefined && prior.size === info.size && prior.mtimeMs === info.mtimeMs) {
    return prior
  }
  let text: string
  try {
    text = decompressSessionLog(await readFile(path))
  } catch {
    return null
  }
  const events = parseLogLines(text)
  const folded = prior !== undefined && info.size >= prior.size ? prior.folded : createFoldState()
  const resume = prior !== undefined && info.size >= prior.size ? prior.lastSeq : -1
  foldUnknownEvents(folded, events, resume)
  let lastSeq = resume
  for (const ev of events) {
    const seq = (ev as { seq?: unknown }).seq
    if (typeof seq === 'number' && seq > lastSeq) lastSeq = seq
  }
  return { size: info.size, mtimeMs: info.mtimeMs, lastSeq, folded }
}

export { SESSION_LOG_NAME }
