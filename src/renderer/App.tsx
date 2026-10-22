import { useCallback, useEffect, useState } from 'react'
import { useVaultStore } from './store/useVaultStore.js'
import { useEditorStore } from './store/useEditorStore.js'
import { TitleBar } from './components/TitleBar.js'
import { Ribbon } from './components/Ribbon.js'
import { FileExplorer } from './components/FileExplorer.js'
import { RightSidebar } from './components/RightSidebar.js'
import { EditorArea } from './components/EditorArea.js'
import { QuickSwitcher } from './components/QuickSwitcher.js'
import { CommandPalette } from './components/CommandPalette.js'
import { SearchOverlay } from './components/SearchOverlay.js'
import { SettingsModal } from './components/SettingsModal.js'
import { GraphView } from './components/GraphView.js'
import { StatusBar } from './components/StatusBar.js'
import { VaultPicker } from './components/VaultPicker.js'
import { useTheme } from './hooks/useTheme.js'
import { useCommands } from './hooks/useCommands.js'
import { useAutosave } from './hooks/useAutosave.js'
import { Toast } from './components/Toast.js'

export function App() {
  const root = useVaultStore((s) => s.root)
  const settings = useVaultStore((s) => s.settings)
  const graphOpen = useVaultStore((s) => s.graphOpen)
  const setRoot = useVaultStore((s) => s.setRoot)
  const setTree = useVaultStore((s) => s.setTree)
  const setIndex = useVaultStore((s) => s.setIndex)
  const setIndexing = useVaultStore((s) => s.setIndexing)
  const setSettings = useVaultStore((s) => s.setSettings)
  const handleFileChange = useVaultStore((s) => s.handleFileChange)
  const [toast, setToast] = useState<string | null>(null)

  useTheme(settings.theme)
  useAutosave()

  const refreshTree = useCallback(async () => {
    try {
      const tree = await window.spindle.vault.tree()
      setTree(tree)
    } catch {
      setTree([])
    }
  }, [setTree])

  const refreshIndex = useCallback(async () => {
    try {
      const snapshot = await window.spindle.vault.indexSnapshot()
      setIndex(snapshot)
      setIndexing(false)
    } catch {
      // No vault open.
    }
  }, [setIndex, setIndexing])

  /**
   * Pull a note's text back from disk after an outside edit.
   *
   * The editor buffer wins: if the note has unsaved changes the file on
   * disk is stale, and overwriting the buffer would throw away the user's
   * work. A dirty note keeps its buffer and is left to the next autosave.
   */
  const reloadFromDisk = useCallback(async (path: string) => {
    const editor = useEditorStore.getState()
    if (editor.isDirty(path)) return
    try {
      const content = await window.spindle.file.read(path)
      editor.setSaved(path, content)
      editor.setContent(path, content)
    } catch {
      // The file may have been removed between the event and the read.
    }
  }, [])

  // ---- Boot: load settings and subscribe to main-process events ----
  useEffect(() => {
    let cancelled = false

    const offVault = window.spindle.on.vaultChanged((nextRoot) => {
      if (cancelled) return
      setRoot(nextRoot)
    })
    const offIndex = window.spindle.on.indexUpdated(() => {
      if (!cancelled) void refreshIndex()
    })
    const offFile = window.spindle.on.fileChanged((event) => {
      if (cancelled) return
      handleFileChange(event)
      void refreshTree()
      if (event.type === 'change' || event.type === 'add') void reloadFromDisk(event.path)
    })
    const offSettings = window.spindle.on.settingsChanged((next) => {
      if (!cancelled) setSettings(next)
    })
    const offCommand = window.spindle.on.command((command) => {
      if (cancelled) return
      window.dispatchEvent(new CustomEvent('spindle:command', { detail: command }))
    })

    void (async () => {
      const loaded = await window.spindle.settings.get()
      if (cancelled) return
      setSettings(loaded)

      // The main process keeps the vault open across renderer reloads, so a
      // reload has to ask which vault it is rather than showing the picker.
      const current = await window.spindle.vault.current()
      if (cancelled || !current) return
      setRoot(current)
    })()

    return () => {
      cancelled = true
      offVault()
      offIndex()
      offFile()
      offSettings()
      offCommand()
    }
  }, [setRoot, setSettings, handleFileChange, refreshIndex, refreshTree])

  // Load the tree + index whenever the vault changes.
  useEffect(() => {
    if (!root) {
      setTree([])
      return
    }
    setIndexing(true)
    void refreshTree()
    void refreshIndex()
  }, [root, refreshTree, refreshIndex, setTree, setIndexing])

  useCommands({ onToast: setToast })

  const handleOpenVault = useCallback(async () => {
    const picked = await window.spindle.vault.pickFolder()
    if (!picked) return
    const result = await window.spindle.vault.open(picked)
    if (!result.ok) {
      setToast(result.error ?? 'Could not open that folder.')
    }
  }, [])

  return (
    <div className="app">
      <TitleBar onOpenVault={handleOpenVault} />
      <div className="body">
        {root ? (
          <>
            <Ribbon />
            {settings.showFileExplorer && <FileExplorer />}
            <main className="main">
              {graphOpen ? (
                <GraphView />
              ) : (
                <>
                  <EditorArea />
                  <StatusBar />
                </>
              )}
            </main>
            {settings.showRightSidebar && !graphOpen && <RightSidebar />}
          </>
        ) : (
          <VaultPicker onOpenVault={handleOpenVault} />
        )}
      </div>

      <QuickSwitcher />
      <CommandPalette />
      <SearchOverlay />
      <SettingsModal />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
