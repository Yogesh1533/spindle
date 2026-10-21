/**
 * Editor store: per-file content buffers and save state.
 *
 * Content is kept here so switching tabs does not lose in-progress edits.
 * The CodeMirror instance is the source of truth while a file is open; this
 * store mirrors the last known text so we can detect unsaved changes.
 */

import { create } from 'zustand'

export interface EditorState {
  /** path -> current text */
  contents: Record<string, string>
  /** path -> the text as it was last read from / written to disk */
  saved: Record<string, string>
  /** path -> is a save in flight */
  saving: Record<string, boolean>

  setContent: (path: string, content: string) => void
  setSaved: (path: string, content: string) => void
  setSaving: (path: string, saving: boolean) => void
  isDirty: (path: string) => boolean
  clear: (path: string) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  contents: {},
  saved: {},
  saving: {},

  setContent: (path, content) =>
    set((state) => ({ contents: { ...state.contents, [path]: content } })),

  setSaved: (path, content) =>
    set((state) => ({
      saved: { ...state.saved, [path]: content },
      contents: { ...state.contents, [path]: content },
    })),

  setSaving: (path, saving) =>
    set((state) => ({ saving: { ...state.saving, [path]: saving } })),

  isDirty: (path) => {
    const state = get()
    const content = state.contents[path]
    if (content === undefined) return false
    return content !== state.saved[path]
  },

  clear: (path) =>
    set((state) => {
      const contents = { ...state.contents }
      const saved = { ...state.saved }
      const saving = { ...state.saving }
      delete contents[path]
      delete saved[path]
      delete saving[path]
      return { contents, saved, saving }
    }),
}))
