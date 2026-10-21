/**
 * Shared actions that more than one component needs.
 * These talk to the main process and update the renderer stores.
 */

import { useVaultStore } from '../store/useVaultStore.js'
import { useEditorStore } from '../store/useEditorStore.js'
import { basename } from '../../shared/markdown.js'

/** Create a new note and open it. */
export async function createNewNote(
  folder?: string,
  name?: string
): Promise<string | null> {
  const state = useVaultStore.getState()
  if (!state.root) return null

  const targetFolder = folder ?? activeFolder()
  const base = name ?? 'Untitled'
  const rel = await window.slate.file.uniquePath(targetFolder, base)

  await window.slate.file.createNote(rel, '')
  state.openTab(rel)
  state.setRenamingPath(rel)
  return rel
}

/** Create a new folder in the vault root and refresh the tree. */
export async function createNewFolder(name = 'New folder'): Promise<string | null> {
  const state = useVaultStore.getState()
  if (!state.root) return null
  const rel = name
  await window.slate.file.createFolder(rel)
  const tree = await window.slate.vault.tree()
  state.setTree(tree)
  return rel
}

/** The folder the active note lives in, or '' for the vault root. */
export function activeFolder(): string {
  const state = useVaultStore.getState()
  const path = state.activeTab
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

/**
 * Open a link target.
 * - Resolves to an existing note -> open it.
 * - Does not resolve -> create the note, then open it.
 */
export async function openLinkTarget(
  target: string,
  fromPath?: string
): Promise<void> {
  const state = useVaultStore.getState()
  const source = fromPath ?? state.activeTab ?? undefined

  const resolved = await window.slate.links.resolve(target, source)
  if (resolved) {
    state.openTab(resolved)
    return
  }

  const result = await window.slate.links.createFromLink(target, source ?? '')
  if (result?.path) {
    state.openTab(result.path)
  }
}

/** Open a daily note, creating it (with the template) if needed. */
export async function openDailyNote(): Promise<void> {
  const state = useVaultStore.getState()
  if (!state.root) return
  try {
    const result = await window.slate.daily.open()
    if (result?.path) {
      state.openTab(result.path)
    }
  } catch {
    // No vault open.
  }
}

/** Read a note's content into the editor store. */
export async function loadNote(path: string): Promise<string> {
  const editor = useEditorStore.getState()
  const existing = editor.contents[path]
  if (existing !== undefined) return existing

  const content = await window.slate.file.read(path)
  editor.setSaved(path, content)
  editor.setContent(path, content)
  return content
}

/**
 * Rename a note and update the links in every other note that points at it.
 */
export async function renameNote(from: string, to: string): Promise<{ changed: number }> {
  const state = useVaultStore.getState()

  await window.slate.links.updateOnRename(from, to)
  await window.slate.file.rename(from, to)

  state.renameTab(from, to)
  const tree = await window.slate.vault.tree()
  state.setTree(tree)
  return { changed: 0 }
}

/** Delete a note (or folder) after confirming. */
export async function deletePath(path: string): Promise<boolean> {
  const state = useVaultStore.getState()
  const isFolder = path.includes('/') === false && !path.endsWith('.md')
  const name = basename(path)

  const confirmed = window.confirm(
    isFolder
      ? `Delete the folder "${name}" and everything inside it?`
      : `Delete the note "${name}"? This cannot be undone.`
  )
  if (!confirmed) return false

  await window.slate.file.remove(path)
  const tree = await window.slate.vault.tree()
  state.setTree(tree)
  return true
}

/** Open a note in a split pane. */
export async function openInSplit(path: string): Promise<void> {
  const state = useVaultStore.getState()
  await loadNote(path)
  state.openInSplit(path)
}
