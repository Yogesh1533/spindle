/**
 * Autocomplete for `[[wikilinks`.
 *
 * Typing "[[" opens a list of the notes in the vault; the list is filtered as
 * you type. Choosing a note inserts `[[Title]]`.
 */

import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { useVaultStore } from '../store/useVaultStore.js'

/** Matches an open wikilink that has not been closed yet. */
const OPEN_WIKILINK = /\[\[([^\[\]]*)$/

export function wikilinkCompletion(
  resolveLink: (target: string) => string | null
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext): CompletionResult | null => {
    // Match the open "[[" and whatever has been typed since.
    const match = OPEN_WIKILINK.exec(context.state.doc.sliceString(Math.max(0, context.pos - 200), context.pos))
    if (!match) return null

    const query = match[1]
    const from = context.pos - match[1].length - 2

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
        apply: `[[${title}]]`,
      })
    }

    // Show recently modified notes first when there is no query.
    if (!query) {
      options.sort((a, b) => a.label.localeCompare(b.label))
    }

    return {
      from,
      options,
      validFor: /^[^[\]]*$/,
    }
  }
}
