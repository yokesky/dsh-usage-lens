/**
 * Discovery of session log artifacts under `$DSH_HOME/sessions/`.
 *
 * The layout nests one directory per working directory (cwd slug), each
 * holding `session-<uuid>/session.jsonl.zstd`. Discovery is recursive, skips
 * symlinked directories (cycle safety), and returns absolute artifact paths.
 * @module dsh-usage-lens/scan-sessions
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Name of the session artifact inside one session directory. */
export const SESSION_LOG_NAME = 'session.jsonl.zstd'

/** Recursively collect every `session.jsonl.zstd` under `root`. */
export async function discoverSessionLogs(root: string): Promise<string[]> {
  const found: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // Unreadable directory: skip (the deployment may rotate roots).
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
      } else if (entry.isFile() && entry.name === SESSION_LOG_NAME) {
        found.push(full)
      }
    }
  }
  await walk(root)
  return found.sort()
}
