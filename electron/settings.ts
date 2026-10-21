/**
 * App settings.
 *
 * Stored in Electron's userData directory — deliberately OUTSIDE the vault so
 * that opening a vault never writes into it. The only thing Slate writes
 * inside a vault is the hidden ".slate" folder (see vault.ts).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types.js'

const SETTINGS_FILE = 'settings.json'

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

/** Read settings, falling back to defaults for anything missing or invalid. */
export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Write settings atomically. */
export async function writeSettings(settings: AppSettings): Promise<void> {
  const file = settingsPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), 'utf8')
  await fs.rename(tmp, file)
}
