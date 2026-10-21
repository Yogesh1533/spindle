/**
 * Full-text search over an in-memory index.
 *
 * The index is an inverted index: term -> set of note paths, plus a separate
 * prefix map so that search-as-you-type works without scanning every term.
 *
 * Ranking:
 *   title match (exact-ish)  >  heading match  >  path match  >  body match
 * with a small recency tiebreak.
 */

import { basename } from './markdown.js'
import type { SearchResult } from './types.js'

export interface IndexableNote {
  path: string
  title: string
  filename: string
  content: string
  /** Body text without frontmatter, used for body matches */
  body: string
  headings: string[]
  tags: string[]
  mtime: number
}

export interface SearchQuery {
  /** Free text to match */
  text?: string
  /** Restrict to notes carrying this tag */
  tag?: string | null
  /** Restrict to notes under this folder (vault-relative prefix) */
  folder?: string | null
  /** Match case exactly */
  caseSensitive?: boolean
  /** Maximum results */
  limit?: number
}

/** Minimal, index-friendly tokenizer: lowercase words, split on non-word chars. */
export function tokenize(text: string): string[] {
  const matches = text.match(/[\p{L}\p{N}_]+/gu)
  if (!matches) return []
  return matches.map((t) => t.toLowerCase())
}

interface Posting {
  path: string
  /** count of occurrences */
  count: number
}

export class VaultSearchIndex {
  /** term -> postings */
  private postings = new Map<string, Posting[]>()
  /** term prefix -> terms (for prefix search) */
  private prefixMap = new Map<string, Set<string>>()
  private notes = new Map<string, IndexableNote>()

  get size(): number {
    return this.notes.size
  }

  /** Add or replace a note in the index. */
  upsert(note: IndexableNote): void {
    if (this.notes.has(note.path)) this.remove(note.path)

    this.notes.set(note.path, note)

    const counts = new Map<string, number>()
    const add = (terms: string[]) => {
      for (const term of terms) {
        counts.set(term, (counts.get(term) ?? 0) + 1)
      }
    }

    add(tokenize(note.title))
    add(tokenize(note.filename))
    add(tokenize(note.path))
    add(tokenize(note.headings.join(' ')))
    add(tokenize(note.body))
    add(tokenize(note.tags.join(' ')))

    for (const [term, count] of counts) {
      let list = this.postings.get(term)
      if (!list) {
        list = []
        this.postings.set(term, list)
      }
      list.push({ path: note.path, count })

      // Register prefixes (capped to keep memory sane).
      for (let i = 1; i <= Math.min(term.length, 24); i++) {
        const prefix = term.slice(0, i)
        let set = this.prefixMap.get(prefix)
        if (!set) {
          set = new Set()
          this.prefixMap.set(prefix, set)
        }
        set.add(term)
      }
    }
  }

  /** Remove a note from the index. */
  remove(path: string): void {
    if (!this.notes.has(path)) return
    this.notes.delete(path)
    for (const [term, list] of this.postings) {
      const next = list.filter((p) => p.path !== path)
      if (next.length === 0) this.postings.delete(term)
      else this.postings.set(term, next)
    }
  }

  clear(): void {
    this.postings.clear()
    this.prefixMap.clear()
    this.notes.clear()
  }

  /** All notes in the index. */
  allNotes(): IndexableNote[] {
    return [...this.notes.values()]
  }

  get(path: string): IndexableNote | undefined {
    return this.notes.get(path)
  }

  /**
   * Find all terms starting with a prefix.
   */
  private expandPrefix(prefix: string): string[] {
    const exact = this.prefixMap.get(prefix)
    if (exact) return [...exact]
    // Fallback: scan terms (only used for very short or unusual prefixes).
    const out: string[] = []
    for (const term of this.postings.keys()) {
      if (term.startsWith(prefix)) out.push(term)
    }
    return out
  }

  /**
   * Run a search.
   */
  search(query: SearchQuery): SearchResult[] {
    const limit = query.limit ?? 100
    const text = (query.text ?? '').trim()
    const caseSensitive = query.caseSensitive ?? false

    // The token index lowercases its terms, so a case-sensitive query cannot
    // use it. Scan the raw content instead.
    if (caseSensitive && text) {
      return this.caseSensitiveSearch(text, query, limit)
    }

    let candidatePaths: Set<string> | null = null
    const termScores = new Map<string, number>()

    if (text) {
      const terms = tokenize(text)
      if (terms.length === 0) {
        // No indexable terms (e.g. only punctuation) — fall back to substring scan.
        return this.substringSearch(text, query, limit, caseSensitive)
      }

      for (const term of terms) {
        // Exact term plus prefix expansions.
        const expanded = new Set<string>([term])
        for (const t of this.expandPrefix(term)) {
          if (t !== term && t.startsWith(term)) expanded.add(t)
        }

        const scores = new Map<string, number>()
        for (const t of expanded) {
          const list = this.postings.get(t)
          if (!list) continue
          const weight = t === term ? 1 : 0.4 // exact beats prefix
          for (const posting of list) {
            scores.set(posting.path, (scores.get(posting.path) ?? 0) + posting.count * weight)
          }
        }
        if (scores.size === 0) return []

        // Intersect across terms (AND semantics).
        if (candidatePaths === null) {
          candidatePaths = new Set(scores.keys())
        } else {
          for (const path of [...candidatePaths]) {
            if (!scores.has(path)) candidatePaths.delete(path)
          }
        }
        for (const [path, score] of scores) {
          termScores.set(path, (termScores.get(path) ?? 0) + score)
        }
        if (candidatePaths.size === 0) return []
      }
    } else {
      candidatePaths = new Set(this.notes.keys())
    }

    const results: SearchResult[] = []

    for (const path of candidatePaths ?? []) {
      const note = this.notes.get(path)
      if (!note) continue

      if (query.tag && !note.tags.includes(query.tag)) continue
      if (query.folder && !path.startsWith(query.folder.replace(/\/$/, '') + '/') && path !== query.folder) {
        continue
      }

      const haystack = caseSensitive ? note.content : note.content.toLowerCase()
      const needle = caseSensitive ? text : text.toLowerCase()
      const matchIndex = text ? haystack.indexOf(needle) : -1

      // No literal match: the note matched on token prefixes only.
      // Still include it, but without a snippet highlight.
      const snippetInfo = matchIndex >= 0
        ? makeSnippet(note.content, matchIndex, needle.length)
        : makeTitleSnippet(note, text)

      const score = this.scoreNote(note, text, termScores.get(path) ?? 0, caseSensitive)
      if (score <= 0) continue

      results.push({
        path: note.path,
        title: note.title,
        snippet: snippetInfo.snippet,
        matchStart: snippetInfo.matchStart,
        matchLength: snippetInfo.matchLength,
        score,
        matchCount: countOccurrences(haystack, needle),
      })
    }

    results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    return results.slice(0, limit)
  }

  /**
   * Scan raw content for a case-sensitive query.
   * The token index is case-insensitive by design, so this is a direct scan.
   */
  private caseSensitiveSearch(
    text: string,
    query: SearchQuery,
    limit: number
  ): SearchResult[] {
    const results: SearchResult[] = []
    for (const note of this.notes.values()) {
      if (query.tag && !note.tags.includes(query.tag)) continue
      if (query.folder) {
        const folder = query.folder.replace(/\/$/, '')
        if (note.path !== folder && !note.path.startsWith(folder + '/')) continue
      }

      const index = note.content.indexOf(text)
      if (index === -1) continue

      const { snippet, matchStart, matchLength } = makeSnippet(note.content, index, text.length)
      results.push({
        path: note.path,
        title: note.title,
        snippet,
        matchStart,
        matchLength,
        score: 1,
        matchCount: countOccurrences(note.content, text),
      })
    }
    return results.slice(0, limit)
  }

  /**
   * Score a note: field weights plus the term frequency collected above.
   */
  private scoreNote(
    note: IndexableNote,
    text: string,
    termScore: number,
    caseSensitive: boolean
  ): number {
    if (!text) {
      // No query text — order by recency so the list is still useful.
      return note.mtime / 1e13
    }

    const needle = caseSensitive ? text : text.toLowerCase()
    const title = caseSensitive ? note.title : note.title.toLowerCase()
    const filename = caseSensitive ? note.filename : note.filename.toLowerCase()
    const path = caseSensitive ? note.path : note.path.toLowerCase()
    const body = caseSensitive ? note.body : note.body.toLowerCase()
    const headings = caseSensitive
      ? note.headings.join(' ').toLowerCase()
      : note.headings.join(' ').toLowerCase()

    let score = 0
    if (title === needle) score += 100
    if (title.startsWith(needle)) score += 40
    if (title.includes(needle)) score += 20
    if (filename.startsWith(needle)) score += 15
    if (path.includes(needle)) score += 8
    if (headings.includes(needle)) score += 12
    if (body.includes(needle)) score += 5
    if (note.tags.some((t) => t.toLowerCase().includes(needle))) score += 10

    score += Math.min(termScore, 50) * 0.5
    // Slight recency preference so equally-relevant notes favour the newer one.
    score += note.mtime / 1e15

    return score
  }

  /**
   * Fallback for queries with no indexable terms (punctuation-only).
   */
  private substringSearch(
    text: string,
    query: SearchQuery,
    limit: number,
    caseSensitive: boolean
  ): SearchResult[] {
    const needle = caseSensitive ? text : text.toLowerCase()
    const results: SearchResult[] = []

    for (const note of this.notes.values()) {
      if (query.tag && !note.tags.includes(query.tag)) continue
      const haystack = caseSensitive ? note.content : note.content.toLowerCase()
      const idx = haystack.indexOf(needle)
      if (idx === -1) continue
      const { snippet, matchStart, matchLength } = makeSnippet(note.content, idx, needle.length)
      results.push({
        path: note.path,
        title: note.title,
        snippet,
        matchStart,
        matchLength,
        score: 1,
        matchCount: countOccurrences(haystack, needle),
      })
    }
    return results.slice(0, limit)
  }
}

/**
 * Build a snippet centred on the match, with a little context either side.
 */
export function makeSnippet(
  content: string,
  matchIndex: number,
  matchLength: number
): { snippet: string; matchStart: number; matchLength: number } {
  const context = 60
  let start = Math.max(0, matchIndex - context)
  let end = Math.min(content.length, matchIndex + matchLength + context)

  // Snap to word boundaries so the snippet does not start mid-word.
  if (start > 0) {
    const space = content.indexOf(' ', start)
    if (space !== -1 && space < matchIndex) start = space + 1
  }
  if (end < content.length) {
    const space = content.lastIndexOf(' ', end)
    if (space > matchIndex) end = space
  }

  let snippet = content.slice(start, end).replace(/\n+/g, ' ').trim()
  let matchStart = matchIndex - start
  if (start > 0) snippet = '…' + snippet
  if (snippet.startsWith('…')) matchStart += 1
  if (end < content.length) snippet = snippet + '…'

  return { snippet, matchStart, matchLength }
}

/** When there is no literal match, show the title instead of a body snippet. */
function makeTitleSnippet(note: IndexableNote, text: string): {
  snippet: string
  matchStart: number
  matchLength: number
} {
  const haystack = note.title.toLowerCase()
  const needle = text.toLowerCase()
  const idx = haystack.indexOf(needle)
  if (idx >= 0) {
    return { snippet: note.title, matchStart: idx, matchLength: needle.length }
  }
  return { snippet: basename(note.path), matchStart: 0, matchLength: 0 }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let index = haystack.indexOf(needle)
  while (index !== -1) {
    count++
    index = haystack.indexOf(needle, index + needle.length)
    if (count > 999) break
  }
  return count
}
