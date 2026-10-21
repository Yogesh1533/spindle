/**
 * Central command handling.
 *
 * Commands come from three places: the application menu (via IPC), keyboard
 * shortcuts (handled here) and the command palette. All of them funnel into
 * the same `runCommand` switch so behaviour stays consistent.
 */

import { useEffect } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import { useEditorStore } from '../store/useEditorStore.js'
import { openDailyNote } from '../lib/actions.js'

export type CommandId =
  | 'file:new-note'
  | 'file:new-folder'
  | 'file:save'
  | 'vault:open'
  | 'editor:toggle-mode'
  | 'editor:find'
  | 'ui:quick-switcher'
  | 'ui:command-palette'
  | 'ui:search'
  | 'ui:graph-view'
  | 'ui:toggle-file-explorer'
  | 'ui:toggle-right-sidebar'
  | 'ui:toggle-theme'
  | 'ui:settings'
  | 'daily:open'

export interface CommandContext {
  onToast: (message: string) => void
}

/** Register the global key handler and the menu-command listener. */
export function useCommands(ctx: CommandContext): void {
  useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac')

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (!mod) return

      const key = event.key.toLowerCase()
      const state = useVaultStore.getState()

      // Cmd/Ctrl+P — command palette
      if (key === 'p' && !event.shiftKey) {
        event.preventDefault()
        state.setCommandPaletteOpen(true)
        return
      }
      // Cmd/Ctrl+O — quick switcher
      if (key === 'o' && !event.shiftKey) {
        event.preventDefault()
        state.setQuickSwitcherOpen(true)
        return
      }
      // Cmd/Ctrl+Shift+F — search
      if (key === 'f' && event.shiftKey) {
        event.preventDefault()
        state.setSearchOpen(true)
        return
      }
      // Cmd/Ctrl+N — new note
      if (key === 'n' && !event.shiftKey) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('slate:command', { detail: 'file:new-note' }))
        return
      }
      // Cmd/Ctrl+Shift+N — new folder
      if (key === 'n' && event.shiftKey) {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('slate:command', { detail: 'file:new-folder' }))
        return
      }
      // Cmd/Ctrl+E — toggle source / preview
      if (key === 'e') {
        event.preventDefault()
        state.toggleViewMode()
        return
      }
      // Cmd/Ctrl+G — graph view
      if (key === 'g') {
        event.preventDefault()
        state.setGraphOpen(!state.graphOpen)
        return
      }
      // Cmd/Ctrl+D — daily note
      if (key === 'd') {
        event.preventDefault()
        void openDailyNote()
        return
      }
      // Cmd/Ctrl+B — toggle file explorer
      if (key === 'b' && !event.shiftKey) {
        event.preventDefault()
        const settings = state.settings
        void window.slate.settings.set({ showFileExplorer: !settings.showFileExplorer })
        return
      }
      // Cmd/Ctrl+Shift+B — toggle right sidebar
      if (key === 'b' && event.shiftKey) {
        event.preventDefault()
        const settings = state.settings
        void window.slate.settings.set({ showRightSidebar: !settings.showRightSidebar })
        return
      }
      // Cmd/Ctrl+S — save
      if (key === 's') {
        event.preventDefault()
        void saveActiveNote()
        return
      }
      // Cmd/Ctrl+, — settings
      if (key === ',') {
        event.preventDefault()
        state.setSettingsOpen(true)
        return
      }
    }

    const onMenuCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail as CommandId
      void runCommand(command, ctx)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('slate:command', onMenuCommand)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('slate:command', onMenuCommand)
    }
  }, [ctx])
}

/** Save the active note if it has unsaved changes. */
export async function saveActiveNote(): Promise<void> {
  const state = useVaultStore.getState()
  const path = state.activeTab
  if (!path) return
  const editor = useEditorStore.getState()
  const content = editor.contents[path]
  if (content === undefined) return
  editor.setSaving(path, true)
  await window.slate.file.write(path, content)
  editor.setSaved(path, content)
  editor.setSaving(path, false)
}

/** Execute a command by id. */
export async function runCommand(command: CommandId, ctx?: CommandContext): Promise<void> {
  const state = useVaultStore.getState()
  const notify = ctx?.onToast ?? (() => {})

  switch (command) {
    case 'file:new-note': {
      const { createNewNote } = await import('../lib/actions.js')
      await createNewNote()
      break
    }
    case 'file:new-folder': {
      const { createNewFolder } = await import('../lib/actions.js')
      await createNewFolder()
      break
    }
    case 'file:save':
      await saveActiveNote()
      break
    case 'vault:open': {
      const picked = await window.slate.vault.pickFolder()
      if (!picked) return
      const result = await window.slate.vault.open(picked)
      if (!result.ok) notify(result.error ?? 'Could not open that folder.')
      break
    }
    case 'editor:toggle-mode':
      state.toggleViewMode()
      break
    case 'editor:find':
      window.dispatchEvent(new CustomEvent('slate:command', { detail: 'editor:find-in-file' }))
      break
    case 'ui:quick-switcher':
      state.setQuickSwitcherOpen(true)
      break
    case 'ui:command-palette':
      state.setCommandPaletteOpen(true)
      break
    case 'ui:search':
      state.setSearchOpen(true)
      break
    case 'ui:graph-view':
      state.setGraphOpen(!state.graphOpen)
      break
    case 'ui:toggle-file-explorer': {
      const settings = state.settings
      await window.slate.settings.set({ showFileExplorer: !settings.showFileExplorer })
      break
    }
    case 'ui:toggle-right-sidebar': {
      const settings = state.settings
      await window.slate.settings.set({ showRightSidebar: !settings.showRightSidebar })
      break
    }
    case 'ui:toggle-theme': {
      const settings = state.settings
      const next = settings.theme === 'dark' ? 'light' : 'dark'
      await window.slate.settings.set({ theme: next })
      break
    }
    case 'ui:settings':
      state.setSettingsOpen(true)
      break
    case 'daily:open':
      await openDailyNote()
      break
    default:
      break
  }
}
