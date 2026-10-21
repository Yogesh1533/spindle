/**
 * Autocomplete for `[[wikilinks`.
 *
 * Typing "[[" opens a list of the notes in the vault; the list is filtered as
 * you type. Choosing a note inserts `[[Title]]`.
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { useVaultStore } from '../store/useVaultStore.js'

/** Matches an open wikilink that has not been closed yet. */
const OPEN_WIKILINK = /\[\[([^\[\]]*)$/

/**
 * Replace the `[[query` the user typed with a complete `[[Title]]`.
 *
 * The range is worked out from the document rather than taken from
 * CodeMirror, because the live preview hides the `[[` and `]]` markers with
 * replace decorations — the visible text and the document text differ, and
 * only the document knows where the link really starts.
 */
function insertWikilink(view: EditorView, label: string): void {
  const { state } = view
  const pos = state.selection.main.from
  const before = state.doc.sliceString(Math.max(0, pos - 200), pos)
  const match = OPEN_WIKILINK.exec(before)
  if (!match) return

  const from = pos - match[0].length
  const insert = `[[${label}]]`
  view.dispatch({
    changes: { from, to: pos, insert },
    selection: { anchor: from + insert.length },
  })
}

export function wikilinkCompletion(
  resolveLink: (target: string) => string | null
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    // Match the open "[[" and whatever has been typed since.
    const match = OPEN_WIKILINK.exec(context.state.doc.sliceString(Math.max(0, context.pos - 200), context.pos))
    if (!match) return null

    const query = match[1]

    const notes = useVaultStore.getState().notes

    const options: Completion[] = []
    for (const note of notes) {
      const title = note.title
      if (query && !title.toLowerCase().includes(query.toLowerCase())) continue

      const resolved = resolveLink(title)
      options.push({
        label: title,
        type: resolved ? 'text' : 'constant',
        detail: note.path,
        apply: (view, completion) => insertWikilink(view, completion.label),
      })
    }

    // Show recently modified notes first when there is no query.
    if (!query) {
      options.sort((a, b) => a.label.localeCompare(b.label))
    }

    return {
      // The replaced range starts at the "[[" so that accepting a
      // suggestion rewrites the whole `[[query` the user typed.
      from: context.pos - match[1].length - 2,
      options,
      // The source does its own filtering, so CodeMirror's fuzzy matcher is
      // turned off. It would otherwise match the option labels against the
      // text between `from` and the cursor — which is "[[Get", not "Get" —
      // and drop every option.
      filter: false,
      // The result is only valid while the text is exactly what this query
      // was built from. As soon as the user types another character the
      // check fails and the source is asked again with the new text.
      validFor: (text: string) => text === `[[${query}`,
    }
  }
}
