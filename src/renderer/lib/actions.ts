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

/**
 * Read a note's content into the editor store.
 *
 * The buffer is reused when it is still current, but a note that was
 * changed on disk since we last read it is re-read — otherwise switching
 * back to a tab would show a stale version of a file that another app
 * (or another vault) has since rewritten.
 */
export async function loadNote(path: string): Promise<string> {
  const editor = useEditorStore.getState()
  const existing = editor.contents[path]

  // A dirty buffer is the user's work in progress and always wins.
  if (existing !== undefined && editor.isDirty(path)) return existing

  let content: string
  try {
    content = await window.slate.file.read(path)
  } catch {
    // The file is gone; keep whatever we had rather than blanking the tab.
    return existing ?? ''
  }
  if (existing !== undefined && existing === content) return existing

  editor.setSaved(path, content)
  editor.setContent(path, content)
  return content
}

/**
 * Write a note's current content to disk.
 *
 * The file is only written when the buffer actually differs from what was
 * last saved, so a no-op save costs nothing.
 */
export async function saveNote(path: string): Promise<boolean> {
  const editor = useEditorStore.getState()
  const content = editor.contents[path]
  if (content === undefined) return false
  if (!editor.isDirty(path)) return true
  if (editor.saving[path]) return true

  editor.setSaving(path, true)
  try {
    const result = await window.slate.file.write(path, content)
    if (!result.success) return false
    editor.setSaved(path, content)
    return true
  } catch {
    return false
  } finally {
    editor.setSaving(path, false)
  }
}

/**
 * Save every note with unsaved changes.
 */
export async function saveAll(): Promise<void> {
  const editor = useEditorStore.getState()
  const paths = Object.keys(editor.contents).filter((path) => editor.isDirty(path))
  await Promise.all(paths.map((path) => saveNote(path)))
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
