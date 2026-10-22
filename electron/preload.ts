/**
 * Preload script — the only bridge between the renderer and Node.
 * Exposes a narrow, typed API on window.spindle. No Node internals leak through.
 */

import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../src/shared/ipc-contract.js'
import type { AppSettings, FileChangeEvent, TabSession } from '../src/shared/types.js'

const api = {
  vault: {
    open: (path: string) => ipcRenderer.invoke(IPC.openVault, path),
    create: (path: string) => ipcRenderer.invoke(IPC.createVault, path),
    pickFolder: () => ipcRenderer.invoke(IPC.pickVaultFolder),
    tree: () => ipcRenderer.invoke(IPC.getVaultTree),
    indexSnapshot: () => ipcRenderer.invoke(IPC.getIndexSnapshot),
    current: () => ipcRenderer.invoke(IPC.getCurrentVault),
    close: () => ipcRenderer.invoke(IPC.closeVault),
  },
  session: {
    get: (root: string) => ipcRenderer.invoke(IPC.getSession, root),
    set: (root: string, session: TabSession) =>
      ipcRenderer.invoke(IPC.setSession, root, session),
  },
  file: {
    read: (path: string) => ipcRenderer.invoke(IPC.readFile, path),
    write: (path: string, content: string) => ipcRenderer.invoke(IPC.writeFile, path, content),
    createNote: (path: string, content?: string) =>
      ipcRenderer.invoke(IPC.createNote, path, content),
    createFolder: (path: string) => ipcRenderer.invoke(IPC.createFolder, path),
    rename: (from: string, to: string) => ipcRenderer.invoke(IPC.renamePath, from, to),
    remove: (path: string) => ipcRenderer.invoke(IPC.deletePath, path),
    uniquePath: (folder: string, baseName: string) =>
      ipcRenderer.invoke(IPC.uniqueNotePath, folder, baseName),
    reveal: (path: string) => ipcRenderer.invoke(IPC.revealInFolder, path),
  },
  links: {
    backlinks: (path: string) => ipcRenderer.invoke(IPC.getBacklinks, path),
    outgoing: (path: string) => ipcRenderer.invoke(IPC.getOutgoingLinks, path),
    unlinkedMentions: (path: string) => ipcRenderer.invoke(IPC.getUnlinkedMentions, path),
    allPaths: () => ipcRenderer.invoke(IPC.getAllNotePaths),
    resolve: (target: string, fromPath?: string) =>
      ipcRenderer.invoke(IPC.resolveLink, target, fromPath),
    createFromLink: (target: string, fromPath: string) =>
      ipcRenderer.invoke(IPC.createNoteFromLink, target, fromPath),
    updateOnRename: (from: string, to: string) =>
      ipcRenderer.invoke(IPC.updateLinksOnRename, from, to),
  },
  search: {
    query: (query: {
      text?: string
      tag?: string | null
      folder?: string | null
      caseSensitive?: boolean
      limit?: number
    }) => ipcRenderer.invoke(IPC.search, query),
    tags: () => ipcRenderer.invoke(IPC.getTags),
    notesWithTag: (tag: string) => ipcRenderer.invoke(IPC.getNotesWithTag, tag),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.getSettings),
    set: (patch: Partial<AppSettings>) => ipcRenderer.invoke(IPC.setSettings, patch),
  },
  daily: {
    open: () => ipcRenderer.invoke(IPC.openDailyNote),
  },
  app: {
    version: () => ipcRenderer.invoke(IPC.getVersion),
    platform: () => ipcRenderer.invoke(IPC.getPlatform),
  },
  on: {
    indexUpdated: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.onIndexUpdated, handler)
      return () => ipcRenderer.removeListener(IPC.onIndexUpdated, handler)
    },
    fileChanged: (cb: (event: FileChangeEvent) => void) => {
      const handler = (_e: unknown, event: FileChangeEvent) => cb(event)
      ipcRenderer.on(IPC.onFileChanged, handler)
      return () => ipcRenderer.removeListener(IPC.onFileChanged, handler)
    },
    vaultChanged: (cb: (root: string | null) => void) => {
      const handler = (_e: unknown, root: string | null) => cb(root)
      ipcRenderer.on(IPC.onVaultChanged, handler)
      return () => ipcRenderer.removeListener(IPC.onVaultChanged, handler)
    },
    settingsChanged: (cb: (settings: AppSettings) => void) => {
      const handler = (_e: unknown, settings: AppSettings) => cb(settings)
      ipcRenderer.on(IPC.onSettingsChanged, handler)
      return () => ipcRenderer.removeListener(IPC.onSettingsChanged, handler)
    },
    command: (cb: (command: string) => void) => {
      const handler = (_e: unknown, command: string) => cb(command)
      ipcRenderer.on(IPC.onCommand, handler)
      return () => ipcRenderer.removeListener(IPC.onCommand, handler)
    },
  },
}

export type SpindleApi = typeof api

contextBridge.exposeInMainWorld('spindle', api)
