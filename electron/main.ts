/**
 * Electron main process.
 *
 * Owns the window, the vault, the index and the file watcher. The renderer
 * talks to all of it through the typed IPC contract in src/shared/ipc-contract.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC } from '../src/shared/ipc-contract.js'
import { createResolver, rewriteLinkTargets } from '../src/shared/links.js'
import type { AppSettings, FileChangeEvent, SearchResult } from '../src/shared/types.js'
import { VaultIndexer, type IndexSnapshot } from './indexer.js'
import { readSettings, writeSettings } from './settings.js'
import {
  createFolder,
  createNote,
  exists,
  readFile,
  readTree,
  removePath,
  renamePath,
  uniqueNotePath,
  validateVault,
  writeFile,
} from './vault.js'
import { VaultWatcher } from './watcher.js'

const __dirname_ = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let indexer = new VaultIndexer()
let currentRoot: string | null = null
let settings: AppSettings = { ...(await readSettings()) }

const watcher = new VaultWatcher(
  (event) => {
    void handleFileChange(event)
  },
  (error) => {
    console.error('[watcher]', error)
  }
)

/** Broadcast the current index snapshot to the renderer. */
function pushIndex(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.onIndexUpdated, indexer.snapshot())
}

function pushSettings(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(IPC.onSettingsChanged, settings)
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e21' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname_, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const devServer = process.env.VITE_DEV_SERVER_URL
  if (devServer) {
    void mainWindow.loadURL(devServer)
  } else {
    void mainWindow.loadFile(path.join(__dirname_, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external links in the system browser, never in the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------

async function openVault(root: string): Promise<{ ok: boolean; error?: string }> {
  const check = await validateVault(root)
  if (!check.ok) return { ok: false, error: check.error }

  currentRoot = root
  await indexer.build(root)
  await watcher.start(root)

  settings = { ...settings, lastVaultPath: root }
  await writeSettings(settings)

  mainWindow?.webContents.send(IPC.onVaultChanged, root)
  pushIndex()
  pushSettings()
  return { ok: true }
}

async function handleFileChange(event: FileChangeEvent): Promise<void> {
  if (!currentRoot) return

  switch (event.type) {
    case 'add':
    case 'change':
      await indexer.indexFile(currentRoot, event.path)
      indexer.recomputeBacklinks()
      break
    case 'unlink':
      indexer.removeFile(event.path)
      break
    case 'addDir':
    case 'unlinkDir':
      // Folders do not change the index, but the tree does.
      break
    default:
      break
  }
  pushIndex()
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function registerIpc(): void {
  // --- Vault ---

  ipcMain.handle(IPC.openVault, async (_e, root: string) => openVault(root))

  ipcMain.handle(IPC.createVault, async (_e, root: string) => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(root, { recursive: true })
    return openVault(root)
  })

  ipcMain.handle(IPC.pickVaultFolder, async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open vault',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Open vault',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC.getVaultTree, async () => {
    if (!currentRoot) return []
    return readTree(currentRoot)
  })

  ipcMain.handle(IPC.getIndexSnapshot, (): IndexSnapshot => indexer.snapshot())

  ipcMain.handle(IPC.closeVault, async () => {
    await watcher.stop()
    currentRoot = null
    indexer = new VaultIndexer()
    mainWindow?.webContents.send(IPC.onVaultChanged, null)
    return true
  })

  // --- Files ---

  ipcMain.handle(IPC.readFile, async (_e, rel: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    return readFile(currentRoot, rel)
  })

  ipcMain.handle(IPC.writeFile, async (_e, rel: string, content: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    watcher.markSelfWrite(rel)
    await writeFile(currentRoot, rel, content)
    await indexer.indexFile(currentRoot, rel)
    indexer.recomputeBacklinks()
    pushIndex()
    return { success: true }
  })

  ipcMain.handle(IPC.createNote, async (_e, rel: string, content = '') => {
    if (!currentRoot) throw new Error('No vault is open.')
    watcher.markSelfWrite(rel)
    await createNote(currentRoot, rel, content)
    await indexer.indexFile(currentRoot, rel)
    indexer.recomputeBacklinks()
    pushIndex()
    return { success: true, path: rel }
  })

  ipcMain.handle(IPC.createFolder, async (_e, rel: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    await createFolder(currentRoot, rel)
    return { success: true }
  })

  ipcMain.handle(IPC.renamePath, async (_e, from: string, to: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    watcher.markSelfWrite(to)
    await renamePath(currentRoot, from, to)

    // Re-index: the old path disappears, the new one appears.
    indexer.removeFile(from)
    await indexer.indexFile(currentRoot, to)
    indexer.recomputeBacklinks()
    pushIndex()
    return { success: true }
  })

  ipcMain.handle(IPC.deletePath, async (_e, rel: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    await removePath(currentRoot, rel)
    if (/\.md$/i.test(rel)) {
      indexer.removeFile(rel)
      indexer.recomputeBacklinks()
      pushIndex()
    }
    return { success: true }
  })

  ipcMain.handle(IPC.uniqueNotePath, async (_e, folder: string, baseName: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    return uniqueNotePath(currentRoot, folder, baseName)
  })

  ipcMain.handle(IPC.revealInFolder, async (_e, rel: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    shell.showItemInFolder(path.join(currentRoot, rel))
    return true
  })

  // --- Links ---

  ipcMain.handle(IPC.getBacklinks, (_e, rel: string) => indexer.getBacklinks(rel))

  ipcMain.handle(IPC.getOutgoingLinks, (_e, rel: string) => indexer.getOutgoingLinks(rel))

  ipcMain.handle(IPC.getUnlinkedMentions, (_e, rel: string) =>
    indexer.unlinkedMentions(rel)
  )

  ipcMain.handle(IPC.getAllNotePaths, () => indexer.notePaths)

  ipcMain.handle(IPC.resolveLink, (_e, target: string, fromPath?: string) => {
    const resolver = createResolver(indexer.notePaths)
    return resolver(target, { fromPath })
  })

  ipcMain.handle(IPC.createNoteFromLink, async (_e, target: string, fromPath: string) => {
    if (!currentRoot) throw new Error('No vault is open.')
    const resolver = createResolver(indexer.notePaths)
    const existing = resolver(target, { fromPath })
    if (existing) return { success: true, path: existing, created: false }

    // Create the note in the same folder as the linking note, like Obsidian.
    const folder = fromPath.includes('/')
      ? fromPath.slice(0, fromPath.lastIndexOf('/'))
      : ''
    const safeName = target.replace(/[/\\]/g, '-')
    const rel = await uniqueNotePath(currentRoot, folder, safeName)
    watcher.markSelfWrite(rel)
    await createNote(currentRoot, rel, '')
    await indexer.indexFile(currentRoot, rel)
    indexer.recomputeBacklinks()
    pushIndex()
    return { success: true, path: rel, created: true }
  })

  ipcMain.handle(IPC.updateLinksOnRename, async (_e, from: string, to: string) => {
    if (!currentRoot) throw new Error('No vault is open.')

    const oldBase = path.basename(from, path.extname(from))
    const newBase = path.basename(to, path.extname(to))
    const newTarget = newBase

    const changedPaths: string[] = []
    const allPaths = indexer.notePaths

    for (const rel of allPaths) {
      if (rel === from) continue
      const content = indexer.getNoteContent(rel)
      if (content === undefined) continue

      const { content: updated, changed } = rewriteLinkTargets(content, oldBase, newTarget)
      if (changed > 0) {
        watcher.markSelfWrite(rel)
        await writeFile(currentRoot, rel, updated)
        await indexer.indexFile(currentRoot, rel)
        changedPaths.push(rel)
      }
    }

    indexer.recomputeBacklinks()
    pushIndex()
    return { success: true, changedPaths }
  })

  // --- Search ---

  ipcMain.handle(IPC.search, (_e, query): SearchResult[] => {
    return indexer.getSearchIndex().search(query)
  })

  ipcMain.handle(IPC.getTags, () => indexer.getTagList())

  ipcMain.handle(IPC.getNotesWithTag, (_e, tag: string) => {
    return indexer.getAllNotes().filter((n) => n.tags.includes(tag))
  })

  // --- Settings ---

  ipcMain.handle(IPC.getSettings, () => settings)

  ipcMain.handle(IPC.setSettings, async (_e, patch: Partial<AppSettings>) => {
    settings = { ...settings, ...patch }
    await writeSettings(settings)
    pushSettings()
    return settings
  })

  // --- Daily notes ---

  ipcMain.handle(IPC.openDailyNote, async () => {
    if (!currentRoot) throw new Error('No vault is open.')

    const date = new Date()
    const folder = settings.dailyNotesFolder || ''
    const fileName = formatDate(date, settings.dailyNoteFormat || 'YYYY-MM-DD')
    const rel = folder ? `${folder}/${fileName}.md` : `${fileName}.md`

    if (await exists(currentRoot, rel)) {
      return { path: rel, created: false }
    }

    let content = ''
    if (settings.dailyNotesTemplate) {
      const templateRel = settings.dailyNotesTemplate
      if (await exists(currentRoot, templateRel)) {
        const template = await readFile(currentRoot, templateRel)
        content = applyTemplateTokens(template, date, fileName)
      }
    }

    watcher.markSelfWrite(rel)
    await createNote(currentRoot, rel, content)
    await indexer.indexFile(currentRoot, rel)
    indexer.recomputeBacklinks()
    pushIndex()
    return { path: rel, created: true }
  })

  // --- App ---

  ipcMain.handle(IPC.getVersion, () => app.getVersion())
  ipcMain.handle(IPC.getPlatform, () => process.platform)
}

// ---------------------------------------------------------------------------
// Daily note helpers
// ---------------------------------------------------------------------------

/**
 * Format a date using the tokens Obsidian supports in daily note settings.
 * Supports YYYY, YY, MM, M, DD, D, WW, dddd, ddd, and [[date]] / {{date}}.
 */
export function formatDate(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')

  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: date.toLocaleString('en-US', { month: 'long' }),
    MMM: date.toLocaleString('en-US', { month: 'short' }),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    dddd: date.toLocaleString('en-US', { weekday: 'long' }),
    ddd: date.toLocaleString('en-US', { weekday: 'short' }),
    WW: String(isoWeek(date)),
  }

  return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|WW/g, (token) => tokens[token] ?? token)
}

/** ISO-8601 week number. */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/**
 * Expand template tokens in a daily-note template.
 *   {{date}} / {{date:YYYY-MM-DD}}   the date
 *   {{title}}                       the file name without extension
 *   {{time}} / {{time:HH:mm}}       the time
 */
export function applyTemplateTokens(template: string, date: Date, title: string): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (full, body: string) => {
    const [key, arg] = body.split(':')
    switch (key.trim()) {
      case 'date':
        return formatDate(date, (arg ?? 'YYYY-MM-DD').trim())
      case 'title':
        return title
      case 'time':
        return formatDate(date, (arg ?? 'HH:mm').trim().replace('HH', 'HH'))
      default:
        return full
    }
  })
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New note',
          accelerator: 'CmdOrCtrl+N',
          click: () => send('command', 'file:new-note'),
        },
        {
          label: 'New folder',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => send('command', 'file:new-folder'),
        },
        { type: 'separator' },
        {
          label: 'Open vault…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('command', 'vault:open'),
        },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find in file',
          accelerator: 'CmdOrCtrl+F',
          click: () => send('command', 'editor:find'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle reading / source view',
          accelerator: 'CmdOrCtrl+E',
          click: () => send('command', 'editor:toggle-mode'),
        },
        {
          label: 'Quick switcher',
          accelerator: 'CmdOrCtrl+Alt+O',
          click: () => send('command', 'ui:quick-switcher'),
        },
        {
          label: 'Command palette',
          accelerator: 'CmdOrCtrl+P',
          click: () => send('command', 'ui:command-palette'),
        },
        {
          label: "Today's daily note",
          accelerator: 'CmdOrCtrl+D',
          click: () => send('command', 'daily:open'),
        },
        {
          label: 'Graph view',
          accelerator: 'CmdOrCtrl+G',
          click: () => send('command', 'ui:graph-view'),
        },
        { type: 'separator' },
        {
          label: 'Toggle file explorer',
          accelerator: 'CmdOrCtrl+B',
          click: () => send('command', 'ui:toggle-file-explorer'),
        },
        {
          label: 'Toggle right sidebar',
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => send('command', 'ui:toggle-right-sidebar'),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Send a command to the renderer. */
function send(channel: string, payload: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

void app.whenReady().then(async () => {
  nativeTheme.themeSource =
    settings.theme === 'light' ? 'light' : settings.theme === 'dark' ? 'dark' : 'system'

  registerIpc()
  buildMenu()
  createWindow()

  // Reopen the last vault.
  if (settings.lastVaultPath) {
    await openVault(settings.lastVaultPath).catch(() => {
      // The vault may have moved; ignore and let the user pick a new one.
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  await watcher.stop()
})
