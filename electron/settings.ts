/**
 * App settings.
 *
 * Stored in Electron's userData directory — deliberately OUTSIDE the vault so
 * that opening a vault never writes into it. Spindle never adds a folder or a
 * file of its own to a vault (see vault.ts).
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { DEFAULT_SETTINGS, type AppSettings } from '../src/shared/types.js'

const SETTINGS_FILE = 'settings.json'

/**
 * Directories this app has used before, oldest first.
 *
 * The userData folder is named after the app, so renaming the app would
 * otherwise leave the old settings behind and start from the defaults.
 */
const LEGACY_USER_DATA_DIRS = ['slate']

/**
 * Folder names that were renamed along with the app.
 *
 * A settings file may point at a vault inside one of these, so the path is
 * rewritten on the way over.
 */
const RENAMED_FOLDERS: Record<string, string> = {
  'Slate Sample Vault': 'Spindle Sample Vault',
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

/** Rewrite a path that points into a folder we renamed. */
function rewriteRenamedPath(value: string): string {
  for (const [from, to] of Object.entries(RENAMED_FOLDERS)) {
    if (value.endsWith(`/${from}`)) return `${value.slice(0, value.length - from.length)}${to}`
  }
  return value
}

/**
 * Copy settings from a previous install, if this one has none yet.
 *
 * The first run after a rename finds an empty userData folder and the old
 * one, so the settings carry over instead of silently resetting.
 */
async function migrateLegacySettings(): Promise<void> {
  const target = settingsPath()
  try {
    await fs.access(target)
    return // We already have settings; nothing to migrate.
  } catch {
    // No settings file yet — look for an older one.
  }

  const userData = app.getPath('userData')
  for (const legacy of LEGACY_USER_DATA_DIRS) {
    const source = path.join(path.dirname(userData), legacy, SETTINGS_FILE)
    try {
      const raw = await fs.readFile(source, 'utf8')
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      if (typeof parsed.lastVaultPath === 'string') {
        parsed.lastVaultPath = rewriteRenamedPath(parsed.lastVaultPath)
      }
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, JSON.stringify(parsed, null, 2), 'utf8')
      console.log(`[settings] migrated from ${legacy}`)
      return
    } catch {
      // Not there, or unreadable; try the next one.
    }
  }
}

/** Read settings, falling back to defaults for anything missing or invalid. */
export async function readSettings(): Promise<AppSettings> {
  await migrateLegacySettings()
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
