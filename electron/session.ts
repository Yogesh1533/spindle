/**
 * The tab session: which notes were open, and in which pane.
 *
 * Stored in Electron's userData directory — deliberately OUTSIDE the vault,
 * like the settings, so that remembering what was open never writes into
 * somebody's folder of notes. There is one session per vault, keyed by the
 * vault's path.
 *
 * The point of it is that a renderer reload — with Cmd+R, or after a crash —
 * comes back with the same notes open instead of an empty editor.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { TabSession } from '../src/shared/types.js'

const SESSIONS_FILE = 'sessions.json'

function sessionsPath(): string {
  return path.join(app.getPath('userData'), SESSIONS_FILE)
}

/** Read every stored session. */
async function readAll(): Promise<Record<string, TabSession>> {
  try {
    const raw = await fs.readFile(sessionsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, TabSession>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    // No file yet, or it is unreadable — start from nothing.
    return {}
  }
}

/** The session for one vault, or null if it has never been saved. */
export async function readSession(root: string): Promise<TabSession | null> {
  const all = await readAll()
  return all[root] ?? null
}

/** Save the session for one vault, leaving the other vaults alone. */
export async function writeSession(root: string, session: TabSession): Promise<void> {
  const all = await readAll()
  all[root] = session
  await fs.mkdir(path.dirname(sessionsPath()), { recursive: true })
  const tmp = `${sessionsPath()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(all, null, 2), 'utf8')
  await fs.rename(tmp, sessionsPath())
}
