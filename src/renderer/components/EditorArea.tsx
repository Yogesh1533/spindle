import { useEffect, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import { useEditorStore } from '../store/useEditorStore.js'
import { NoteEditor } from '../editor/NoteEditor.js'
import { loadNote, openInSplit, openLinkTarget, saveNote } from '../lib/actions.js'
import { basename } from '../../shared/markdown.js'
import { IconFile, IconX } from './icons.js'

/** The main editing area: a tab bar, the active pane, and optional splits. */
export function EditorArea() {
  const tabs = useVaultStore((s) => s.tabs)
  const activeTab = useVaultStore((s) => s.activeTab)
  const splitTabs = useVaultStore((s) => s.splitTabs)
  const activeSplit = useVaultStore((s) => s.activeSplit)
  const setActiveTab = useVaultStore((s) => s.setActiveTab)
  const closeTab = useVaultStore((s) => s.closeTab)
  const closeSplit = useVaultStore((s) => s.closeSplit)
  const setActiveSplit = useVaultStore((s) => s.setActiveSplit)
  const viewMode = useVaultStore((s) => s.viewMode)
  const settings = useVaultStore((s) => s.settings)

  const [findSignal, setFindSignal] = useState(0)

  // Handle the find-in-file command from the application menu.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail
      if (command === 'editor:find-in-file') {
        setFindSignal((n) => n + 1)
      }
    }
    window.addEventListener('spindle:command', onCommand)
    return () => window.removeEventListener('spindle:command', onCommand)
  }, [])

  if (tabs.length === 0) {
    return (
      <div className="empty">
        <div className="empty__inner">
          <h2 className="empty__title">No note open</h2>
          <p className="empty__body">
            Pick a file from the sidebar, press <kbd>Cmd</kbd> <kbd>O</kbd> to search for a note,
            or create a new one with <kbd>Cmd</kbd> <kbd>N</kbd>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="tabs">
        {tabs.map((tab) => (
          <TabButton
            key={tab.path}
            path={tab.path}
            active={tab.path === activeTab}
            onClick={(e) => {
              // Cmd/Ctrl-click moves the note into a split pane, to the right.
              if (e.metaKey || e.ctrlKey) {
                void openInSplit(tab.path)
                return
              }
              setActiveTab(tab.path)
            }}
            onClose={() => {
              void saveNote(tab.path)
              closeTab(tab.path)
            }}
          />
        ))}
      </div>

      <div className="main__splits">
        <div className="pane">
          {activeTab && (
            <EditorPane
              path={activeTab}
              mode={viewMode}
              fontSize={settings.editorFontSize}
              findSignal={findSignal}
            />
          )}
        </div>

        {splitTabs.map((tab) => (
          <div className="pane" key={`split-${tab.path}`}>
            <div className="tabs">
              {splitTabs.map((splitTab) => (
                <TabButton
                  key={splitTab.path}
                  path={splitTab.path}
                  active={splitTab.path === activeSplit}
                  onClick={() => setActiveSplit(splitTab.path)}
                  onClose={() => {
                    void saveNote(splitTab.path)
                    closeSplit(splitTab.path)
                  }}
                  small
                />
              ))}
            </div>
            <EditorPane
              path={tab.path}
              mode={viewMode}
              fontSize={settings.editorFontSize}
              findSignal={0}
            />
          </div>
        ))}
      </div>
    </>
  )
}

function TabButton({
  path,
  active,
  onClick,
  onClose,
  small,
}: {
  path: string
  active: boolean
  onClick: (event: React.MouseEvent) => void
  onClose: () => void
  small?: boolean
}) {
  const dirty = useEditorStore((s) => s.isDirty(path))

  return (
    <div
      className={`tab ${active ? 'is-active' : ''}`}
      onClick={onClick}
      title={path}
      style={small ? { minHeight: 30 } : undefined}
    >
      <IconFile size={13} />
      <span className="tab__name">{basename(path)}</span>
      {dirty && <span className="tab__dirty" title="Unsaved changes" />}
      <button
        className="tab__close"
        title="Close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        <IconX size={12} />
      </button>
    </div>
  )
}

function EditorPane({
  path,
  mode,
  fontSize,
  findSignal,
}: {
  path: string
  mode: 'source' | 'preview'
  fontSize: number
  findSignal: number
}) {
  const content = useEditorStore((s) => s.contents[path])
  const setContent = useEditorStore((s) => s.setContent)
  const notes = useVaultStore((s) => s.notes)

  // Load the file the first time this pane shows it.
  useEffect(() => {
    void loadNote(path)
  }, [path])

  const resolveLink = (target: string): string | null => {
    const clean = target.trim().toLowerCase()
    if (!clean) return null
    // Prefer an exact path match, then a title match.
    const byPath = notes.find((n) => n.path.toLowerCase() === clean)
    if (byPath) return byPath.path
    const byTitle = notes.find((n) => n.title.toLowerCase() === clean)
    return byTitle ? byTitle.path : null
  }

  if (content === undefined) {
    return <div className="editor__loading">Loading…</div>
  }

  return (
    <NoteEditor
      value={content}
      onChange={(next) => setContent(path, next)}
      resolveLink={resolveLink}
      onLinkClick={(target) => void openLinkTarget(target, path)}
      mode={mode}
      fontSize={fontSize}
      path={path}
      findSignal={findSignal}
    />
  )
}
