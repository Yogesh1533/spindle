/**
 * The vault store: everything about the open vault, its index and the UI
 * layout. Kept in one zustand store because the panes all need consistent
 * views of the same data.
 */

import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Backlink,
  type FileChangeEvent,
  type LinkRef,
  type NoteMeta,
  type TagInfo,
  type TreeNode,
  type ViewMode,
} from '../../shared/types.js'

export type RightPane = 'backlinks' | 'outgoing' | 'tags' | 'outline' | 'graph'

export interface OpenTab {
  path: string
  /** Per-tab view mode; falls back to the app default when null. */
  mode: ViewMode | null
}

export interface VaultState {
  // Vault
  root: string | null
  tree: TreeNode[]
  notes: NoteMeta[]
  linksByPath: Record<string, LinkRef[]>
  backlinksByPath: Record<string, Backlink[]>
  tags: TagInfo[]
  headingsByPath: Record<string, NoteMeta['headings']>
  indexing: boolean

  // Editor
  tabs: OpenTab[]
  activeTab: string | null
  /** Extra panes to the right of the main one. */
  splitTabs: OpenTab[]
  activeSplit: string | null
  viewMode: ViewMode

  // UI
  settings: AppSettings
  rightPane: RightPane
  graphOpen: boolean
  quickSwitcherOpen: boolean
  commandPaletteOpen: boolean
  searchOpen: boolean
  tagSearchOpen: boolean
  /** Path currently being renamed in the file explorer. */
  renamingPath: string | null

  // Actions
  setRoot: (root: string | null) => void
  setTree: (tree: TreeNode[]) => void
  setIndex: (snapshot: {
    notes: NoteMeta[]
    linksByPath: Record<string, LinkRef[]>
    backlinksByPath: Record<string, Backlink[]>
    tags: TagInfo[]
    headingsByPath: Record<string, NoteMeta['headings']>
  }) => void
  setIndexing: (indexing: boolean) => void

  openTab: (path: string, mode?: ViewMode) => void
  closeTab: (path: string) => void
  setActiveTab: (path: string) => void
  openInSplit: (path: string) => void
  setActiveSplit: (path: string) => void
  closeSplit: (path: string) => void
  setViewMode: (mode: ViewMode) => void
  toggleViewMode: () => void
  renameTab: (from: string, to: string) => void

  setSettings: (patch: Partial<AppSettings>) => void
  setRightPane: (pane: RightPane) => void
  setGraphOpen: (open: boolean) => void
  setQuickSwitcherOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setTagSearchOpen: (open: boolean) => void
  setRenamingPath: (path: string | null) => void

  handleFileChange: (event: FileChangeEvent) => void
}

export const useVaultStore = create<VaultState>((set, get) => ({
  root: null,
  tree: [],
  notes: [],
  linksByPath: {},
  backlinksByPath: {},
  tags: [],
  headingsByPath: {},
  indexing: false,

  tabs: [],
  activeTab: null,
  splitTabs: [],
  activeSplit: null,
  viewMode: DEFAULT_SETTINGS.defaultViewMode,

  settings: { ...DEFAULT_SETTINGS },
  rightPane: 'backlinks',
  graphOpen: false,
  quickSwitcherOpen: false,
  commandPaletteOpen: false,
  searchOpen: false,
  tagSearchOpen: false,
  renamingPath: null,

  setRoot: (root) => set({ root }),
  setTree: (tree) => set({ tree }),
  setIndexing: (indexing) => set({ indexing }),

  setIndex: (snapshot) =>
    set({
      notes: snapshot.notes,
      linksByPath: snapshot.linksByPath,
      backlinksByPath: snapshot.backlinksByPath,
      tags: snapshot.tags,
      headingsByPath: snapshot.headingsByPath,
    }),

  openTab: (path, mode) =>
    set((state) => {
      if (state.tabs.some((t) => t.path === path)) {
        return { activeTab: path }
      }
      return {
        tabs: [...state.tabs, { path, mode: mode ?? null }],
        activeTab: path,
      }
    }),

  closeTab: (path) =>
    set((state) => {
      const index = state.tabs.findIndex((t) => t.path === path)
      if (index === -1) return {}
      const tabs = state.tabs.filter((t) => t.path !== path)
      let activeTab = state.activeTab
      if (activeTab === path) {
        const next = tabs[index] ?? tabs[index - 1]
        activeTab = next ? next.path : null
      }
      return { tabs, activeTab }
    }),

  setActiveTab: (path) => set({ activeTab: path }),

  openInSplit: (path) =>
    set((state) => {
      if (state.splitTabs.some((t) => t.path === path)) {
        return { activeSplit: path }
      }
      return {
        splitTabs: [...state.splitTabs, { path, mode: null }],
        activeSplit: path,
      }
    }),

  setActiveSplit: (path) => set({ activeSplit: path }),

  closeSplit: (path) =>
    set((state) => {
      const splitTabs = state.splitTabs.filter((t) => t.path !== path)
      let activeSplit = state.activeSplit
      if (activeSplit === path) {
        activeSplit = splitTabs.length ? splitTabs[splitTabs.length - 1].path : null
      }
      return { splitTabs, activeSplit }
    }),

  setViewMode: (mode) => set({ viewMode: mode }),

  toggleViewMode: () =>
    set((state) => ({ viewMode: state.viewMode === 'preview' ? 'source' : 'preview' })),

  renameTab: (from, to) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.path === from ? { ...t, path: to } : t)),
      splitTabs: state.splitTabs.map((t) => (t.path === from ? { ...t, path: to } : t)),
      activeTab: state.activeTab === from ? to : state.activeTab,
      activeSplit: state.activeSplit === from ? to : state.activeSplit,
    })),

  setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),

  setRightPane: (rightPane) => set({ rightPane }),
  setGraphOpen: (graphOpen) => set({ graphOpen }),
  setQuickSwitcherOpen: (quickSwitcherOpen) => set({ quickSwitcherOpen }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setTagSearchOpen: (tagSearchOpen) => set({ tagSearchOpen }),
  setRenamingPath: (renamingPath) => set({ renamingPath }),

  handleFileChange: (event) => {
    const state = get()

    if (event.type === 'unlink') {
      // Close tabs whose file vanished. The check has to be against the
      // tab list *before* filtering, or nothing is ever removed.
      const openPaths = new Set(state.tabs.map((t) => t.path))
      const tabs = state.tabs.filter((t) => t.path !== event.path)
      const splitTabs = state.splitTabs.filter((t) => t.path !== event.path)
      set({
        tabs,
        splitTabs,
        activeTab:
          state.activeTab && state.activeTab !== event.path && openPaths.has(state.activeTab)
            ? state.activeTab
            : (tabs[0]?.path ?? null),
        activeSplit:
          state.activeSplit && state.activeSplit !== event.path && openPaths.has(state.activeSplit)
            ? state.activeSplit
            : (splitTabs[0]?.path ?? null),
      })
      return
    }

    if (event.type === 'rename' && event.oldPath) {
      // The note moved; follow it so the tab does not point at a file
      // that is no longer there.
      const renameTab = (tab: OpenTab) =>
        tab.path === event.oldPath ? { ...tab, path: event.path } : tab
      const tabs = state.tabs.map(renameTab)
      const splitTabs = state.splitTabs.map(renameTab)
      set({
        tabs,
        splitTabs,
        activeTab: state.activeTab === event.oldPath ? event.path : state.activeTab,
        activeSplit: state.activeSplit === event.oldPath ? event.path : state.activeSplit,
      })
    }
  },
}))
