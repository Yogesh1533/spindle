import { useCallback, useEffect, useState } from 'react'
import { useVaultStore } from './store/useVaultStore.js'
import { TitleBar } from './components/TitleBar.js'
import { Ribbon } from './components/Ribbon.js'
import { FileExplorer } from './components/FileExplorer.js'
import { RightSidebar } from './components/RightSidebar.js'
import { EditorArea } from './components/EditorArea.js'
import { QuickSwitcher } from './components/QuickSwitcher.js'
import { CommandPalette } from './components/CommandPalette.js'
import { SearchOverlay } from './components/SearchOverlay.js'
import { GraphView } from './components/GraphView.js'
import { StatusBar } from './components/StatusBar.js'
import { VaultPicker } from './components/VaultPicker.js'
import { useTheme } from './hooks/useTheme.js'
import { useCommands } from './hooks/useCommands.js'
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

  const refreshTree = useCallback(async () => {
    try {
      const tree = await window.slate.vault.tree()
      setTree(tree)
    } catch {
      setTree([])
    }
  }, [setTree])

  const refreshIndex = useCallback(async () => {
    try {
      const snapshot = await window.slate.vault.indexSnapshot()
      setIndex(snapshot)
      setIndexing(false)
    } catch {
      // No vault open.
    }
  }, [setIndex, setIndexing])

  // ---- Boot: load settings and subscribe to main-process events ----
  useEffect(() => {
    let cancelled = false

    const offVault = window.slate.on.vaultChanged((nextRoot) => {
      if (cancelled) return
      setRoot(nextRoot)
    })
    const offIndex = window.slate.on.indexUpdated(() => {
      if (!cancelled) void refreshIndex()
    })
    const offFile = window.slate.on.fileChanged((event) => {
      if (cancelled) return
      handleFileChange(event)
      void refreshTree()
    })
    const offSettings = window.slate.on.settingsChanged((next) => {
      if (!cancelled) setSettings(next)
    })
    const offCommand = window.slate.on.command((command) => {
      if (cancelled) return
      window.dispatchEvent(new CustomEvent('slate:command', { detail: command }))
    })

    void (async () => {
      const loaded = await window.slate.settings.get()
      if (cancelled) return
      setSettings(loaded)
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
    const picked = await window.slate.vault.pickFolder()
    if (!picked) return
    const result = await window.slate.vault.open(picked)
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
              <EditorArea />
              <StatusBar />
            </main>
            {settings.showRightSidebar && !graphOpen && <RightSidebar />}
          </>
        ) : (
          <VaultPicker onOpenVault={handleOpenVault} />
        )}
      </div>

      {graphOpen && <GraphView />}

      <QuickSwitcher />
      <CommandPalette />
      <SearchOverlay />
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}
