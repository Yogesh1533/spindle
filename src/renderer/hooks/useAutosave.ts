/**
 * Autosave.
 *
 * Edits are written back to the file a short while after the user stops
 * typing. A vault is a folder of plain Markdown files, so the file on disk
 * is the real document — leaving edits only in memory would be surprising
 * and would lose work if the app closed.
 */

import { useEffect } from 'react'
import { useEditorStore } from '../store/useEditorStore.js'
import { saveNote } from '../lib/actions.js'

/** How long to wait after the last keystroke before writing. */
const AUTOSAVE_DELAY_MS = 800

export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    // The path whose save is currently queued, so a burst of edits to one
    // file only schedules one write.
    let queued: string | null = null

    const unsubscribe = useEditorStore.subscribe((state, previous) => {
      if (state.contents === previous.contents) return

      // Find the file that changed and is now out of sync with disk.
      let changed: string | null = null
      for (const path of Object.keys(state.contents)) {
        if (state.contents[path] !== previous.contents[path]) {
          changed = path
          break
        }
      }
      if (!changed) return
      if (state.contents[changed] === state.saved[changed]) return

      if (queued !== changed && timer) {
        clearTimeout(timer)
        timer = null
      }
      queued = changed

      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        const path = queued
        queued = null
        if (!path) return
        void saveNote(path)
      }, AUTOSAVE_DELAY_MS)
    })

    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  // Flush pending edits when the window goes away. The IPC call is fire and
  // forget: the main process is told to save, and the write completes even
  // though the renderer is being torn down.
  useEffect(() => {
    const flush = () => {
      const editor = useEditorStore.getState()
      const paths = Object.keys(editor.contents).filter((path) => editor.isDirty(path))
      for (const path of paths) void saveNote(path)
    }

    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [])
}
