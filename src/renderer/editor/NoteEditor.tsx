import { useEffect, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { openSearchPanel, search, searchKeymap } from '@codemirror/search'
import { syntaxHighlighting } from '@codemirror/language'
import {
  linkClickHandler,
  livePreview,
  setLivePreview,
  sourceHighlightStyle,
} from './livePreview.js'
import { wikilinkCompletion } from './wikilinkCompletion.js'
import type { ViewMode } from '../../shared/types.js'

interface Props {
  value: string
  onChange: (value: string) => void
  onCursor?: (line: number, column: number) => void
  resolveLink: (target: string) => string | null
  onLinkClick: (target: string) => void
  mode: ViewMode
  fontSize: number
  /** The note this pane is showing, e.g. "notes/ideas.md". */
  path: string
  /** Increments to trigger a find-in-file. */
  findSignal?: number
}

export function NoteEditor({
  value,
  onChange,
  onCursor,
  resolveLink,
  onLinkClick,
  mode,
  fontSize,
  path,
  findSignal,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  // Keep the latest callbacks available to the extensions without
  // re-creating the editor on every render.
  const callbacks = useRef({ onChange, onCursor, resolveLink, onLinkClick })
  callbacks.current = { onChange, onCursor, resolveLink, onLinkClick }

  // Create the editor once.
  useEffect(() => {
    if (!hostRef.current) return

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      closeBrackets(),
      autocompletion({
        override: [wikilinkCompletion((target) => callbacks.current.resolveLink(target))],
        activateOnTyping: true,
      }),
      markdown({ base: markdownLanguage }),
      syntaxHighlighting(sourceHighlightStyle, { fallback: true }),
      search({ top: true }),
      EditorView.lineWrapping,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          callbacks.current.onChange(update.state.doc.toString())
        }
      }),
      EditorView.updateListener.of((update) => {
        if (update.selectionSet || update.docChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          callbacks.current.onCursor?.(line.number, head - line.from + 1)
        }
      }),
      linkClickHandler((target) => callbacks.current.onLinkClick(target)),
      livePreview({ resolveLink: (t) => callbacks.current.resolveLink(t), enabled: true }),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: value, extensions }),
      parent: hostRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor is created once; value/mode changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync external content changes (e.g. the file changed on disk).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    })
  }, [value])

  // Toggle between source and preview rendering.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setLivePreview.of(mode === 'preview') })
  }, [mode])

  // Font size.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dom.style.fontSize = `${fontSize}px`
  }, [fontSize])

  // Find-in-file, triggered from the application menu.
  useEffect(() => {
    if (!findSignal) return
    const view = viewRef.current
    if (!view) return
    openSearchPanel(view)
  }, [findSignal])

  // Jump to a heading, dispatched by the outline pane.
  const pathRef = useRef(path)
  pathRef.current = path

  useEffect(() => {
    const onGoto = (event: Event) => {
      const view = viewRef.current
      if (!view) return
      const anchor = (event as CustomEvent<string>).detail ?? ''

      // The anchor is "<path>#<heading text>". A split pane may also be
      // listening, so only the pane showing that note should act on it.
      const hash = anchor.indexOf('#')
      const targetPath = hash === -1 ? '' : anchor.slice(0, hash)
      if (targetPath && targetPath !== pathRef.current) return

      const heading = (hash === -1 ? anchor : anchor.slice(hash + 1)).trim()
      if (!heading) return

      const doc = view.state.doc
      const lines = doc.toString().split('\n')
      for (let i = 0; i < lines.length; i++) {
        const match = /^(#{1,6})\s+(.*?)\s*$/.exec(lines[i])
        if (!match) continue
        if (match[2].trim() !== heading) continue

        const line = doc.line(i + 1)
        const pos = line.from + match[1].length
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: 'start' }),
        })
        view.focus()
        return
      }
    }
    window.addEventListener('spindle:goto-heading', onGoto)
    return () => window.removeEventListener('spindle:goto-heading', onGoto)
  }, [])

  return <div className="editor" ref={hostRef} />
}
