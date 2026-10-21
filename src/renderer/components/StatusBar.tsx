import { useVaultStore } from '../store/useVaultStore.js'
import { useEditorStore } from '../store/useEditorStore.js'
import { basename } from '../../shared/markdown.js'

/** The status bar at the bottom of the editor area. */
export function StatusBar() {
  const activeTab = useVaultStore((s) => s.activeTab)
  const notes = useVaultStore((s) => s.notes)
  const root = useVaultStore((s) => s.root)
  const dirty = useEditorStore((s) => (activeTab ? s.isDirty(activeTab) : false))
  const saving = useEditorStore((s) => (activeTab ? s.saving[activeTab] : false))

  const note = activeTab ? notes.find((n) => n.path === activeTab) : undefined

  return (
    <div className="status-bar">
      {activeTab ? (
        <>
          <span className="status-bar__item">
            {basename(activeTab)}
            {dirty && !saving ? ' • unsaved' : ''}
            {saving ? ' • saving…' : ''}
          </span>
          {note && <span className="status-bar__item">{note.wordCount} words</span>}
          {note && note.tags.length > 0 && (
            <span className="status-bar__item">{note.tags.length} tags</span>
          )}
        </>
      ) : (
        <span className="status-bar__item">Ready</span>
      )}

      <div className="status-bar__spacer" />

      {root && (
        <span className="status-bar__item" title={root}>
          {notes.length} notes
        </span>
      )}
    </div>
  )
}
