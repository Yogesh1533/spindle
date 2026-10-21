/**
 * Wikilink resolution.
 *
 * Obsidian resolves a link target against the vault by trying, in order:
 *   1. Exact path match relative to the vault root  ("notes/idea.md")
 *   2. Exact path match relative to the *current note's folder*
 *   3. Filename match (with or without the .md extension), unique
 *   4. Title match (filename without extension), unique
 *
 * If a name matches more than one note the link is *ambiguous*: Obsidian still
 * resolves it (to the shortest path) but flags it. We mirror that by marking
 * ambiguous matches so the UI can style them differently.
 */

import { basename, dirname } from './markdown.js'
import type { LinkRef } from './types.js'

export interface ResolveOptions {
  /** Vault root prefix is not needed; all paths are vault-relative. */
  /** Path of the note containing the link, for folder-relative resolution. */
  fromPath?: string
}

export interface Resolver {
  /** Resolve a raw link target to a vault-relative path, or null. */
  (target: string, options?: ResolveOptions): string | null
}

/** Case-insensitive comparison that also normalises unicode. */
function norm(value: string): string {
  return value.normalize('NFC').toLowerCase()
}

/**
 * Strip the .md extension from a path-like target.
 */
function stripMd(target: string): string {
  return target.replace(/\.md$/i, '')
}

/**
 * Build a resolver over a set of known note paths.
 *
 * @param notePaths all markdown file paths in the vault, vault-relative
 */
export function createResolver(notePaths: Iterable<string>): Resolver {
  const paths = [...notePaths]
  const byExactPath = new Map<string, string>()
  const byPathNoExt = new Map<string, string[]>()
  const byFilename = new Map<string, string[]>()
  const byTitle = new Map<string, string[]>()

  for (const path of paths) {
    byExactPath.set(path, path)
    byExactPath.set(path.toLowerCase(), path)

    const noExt = stripMd(path)
    push(byPathNoExt, noExt.toLowerCase(), path)

    const file = basename(path)
    push(byFilename, file.toLowerCase(), path)
    push(byFilename, stripMd(file).toLowerCase(), path)

    const title = stripMd(file)
    push(byTitle, title.toLowerCase(), path)
  }

  return (target: string, options: ResolveOptions = {}): string | null => {
    const clean = target.trim()
    if (!clean) return null

    // 1. Exact vault-relative path.
    const direct = byExactPath.get(clean) ?? byExactPath.get(clean.toLowerCase())
    if (direct) return direct

    // 2. Path relative to the linking note's folder.
    if (options.fromPath) {
      const folder = dirname(options.fromPath)
      const relative = folder ? `${folder}/${clean}` : clean
      const relHit =
        byExactPath.get(relative) ??
        byExactPath.get(relative.toLowerCase()) ??
        byExactPath.get(`${relative}.md`) ??
        byExactPath.get(`${relative.toLowerCase()}.md`)
      if (relHit) return relHit
    }

    // 3. Path without extension, anywhere in the vault.
    const noExt = stripMd(clean)
    const pathMatches = byPathNoExt.get(noExt.toLowerCase())
    if (pathMatches && pathMatches.length) return pickBest(pathMatches)

    // 4. Filename match (with or without extension).
    const file = basename(clean)
    const fileMatches = byFilename.get(file.toLowerCase())
    if (fileMatches && fileMatches.length) return pickBest(fileMatches)

    // 5. Title match.
    const titleMatches = byTitle.get(stripMd(file).toLowerCase())
    if (titleMatches && titleMatches.length) return pickBest(titleMatches)

    return null
  }
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key)
  if (list) {
    if (!list.includes(value)) list.push(value)
  } else {
    map.set(key, [value])
  }
}

/**
 * When several notes share a name, Obsidian picks deterministically.
 * We prefer the shallowest path (fewest folders), then alphabetical.
 */
export function pickBest(matches: string[]): string {
  return [...matches].sort((a, b) => {
    const depthA = a.split('/').length
    const depthB = b.split('/').length
    if (depthA !== depthB) return depthA - depthB
    return a.localeCompare(b)
  })[0]
}

/**
 * Find every path that could satisfy a link target — used to warn about
 * ambiguous links and to offer alternatives in the link editor.
 */
export function findCandidates(target: string, notePaths: Iterable<string>): string[] {
  const clean = target.trim()
  const noExt = stripMd(clean).toLowerCase()
  const file = basename(clean).toLowerCase()
  const title = stripMd(basename(clean)).toLowerCase()

  const out: string[] = []
  for (const path of notePaths) {
    const pNoExt = stripMd(path).toLowerCase()
    const pFile = basename(path).toLowerCase()
    const pTitle = stripMd(basename(path)).toLowerCase()
    if (
      pNoExt === noExt ||
      pFile === file ||
      pTitle === title ||
      path.toLowerCase() === clean.toLowerCase()
    ) {
      out.push(path)
    }
  }
  return out
}

/**
 * Resolve all links in a document against a resolver.
 */
export function resolveLinks(
  links: LinkRef[],
  resolver: Resolver,
  fromPath: string
): LinkRef[] {
  return links.map((link) => {
    const resolvedPath = resolver(link.target, { fromPath })
    return { ...link, resolvedPath, resolved: resolvedPath !== null }
  })
}

/**
 * Build the "unlinked mentions" list: notes that mention a target's title
 * in plain text but do not link to it.
 */
export function findUnlinkedMentions(
  targetPath: string,
  targetTitle: string,
  allNotes: { path: string; content: string }[],
  alreadyLinked: Set<string>
): { path: string; context: string; line: number }[] {
  if (!targetTitle) return []
  const needle = norm(targetTitle)
  if (needle.length < 3) return [] // too noisy to be useful

  const results: { path: string; context: string; line: number }[] = []
  for (const note of allNotes) {
    if (note.path === targetPath) continue
    if (alreadyLinked.has(note.path)) continue

    const lines = note.content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (norm(line).includes(needle)) {
        results.push({
          path: note.path,
          context: line.trim().slice(0, 200),
          line: i + 1,
        })
        break // one mention per note is enough
      }
    }
  }
  return results
}

/**
 * Rewrite link targets in a document when a note is renamed.
 *
 * Returns the new content and the list of links that were changed.
 * Links that already pointed at the old name are updated; the *display alias*
 * is left alone (the user chose that text deliberately).
 */
export interface RenameUpdate {
  content: string
  changed: number
}

/**
 * @param oldTarget the link target text that used to point at the old note
 *                  (e.g. "old title" or "notes/old.md")
 * @param newTarget the new link target text
 */
export function rewriteLinkTargets(content: string, oldTarget: string, newTarget: string): RenameUpdate {
  let changed = 0

  const updated = content.replace(WIKILINK_PATTERN, (full, bang, inner) => {
    const parsed = splitTargetAlias(inner)
    const target = parsed.target
    if (!matchesTarget(target, oldTarget)) return full

    changed++
    const subpath = parsed.subpath ? `#${parsed.subpath}` : ''
    const alias = parsed.alias !== null ? `|${parsed.alias}` : ''
    return `${bang}[[${newTarget}${subpath}${alias}]]`
  })

  return { content: updated, changed }
}

/** Matches [[...]] including an optional leading ! for embeds. */
const WIKILINK_PATTERN = /(!?)\[\[([^\[\]]+?)\]\]/g

interface SplitTargetAlias {
  target: string
  subpath: string | null
  alias: string | null
}

function splitTargetAlias(inner: string): SplitTargetAlias {
  let rest = inner
  let alias: string | null = null
  const pipe = rest.indexOf('|')
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim()
    rest = rest.slice(0, pipe)
  }
  let subpath: string | null = null
  const hash = rest.indexOf('#')
  if (hash !== -1) {
    subpath = rest.slice(hash + 1).trim()
    rest = rest.slice(0, hash)
  }
  return { target: rest.trim(), subpath, alias }
}

/**
 * Does a link target refer to the same note as `oldTarget`?
 * Compares by the "leaf name" so that "notes/old.md" and "old" are equivalent.
 */
function matchesTarget(target: string, oldTarget: string): boolean {
  if (target === oldTarget) return true
  const a = norm(stripMd(basename(target)))
  const b = norm(stripMd(basename(oldTarget)))
  if (a && a === b) return true
  // Also compare the full path without extension.
  return norm(stripMd(target)) === norm(stripMd(oldTarget))
}
