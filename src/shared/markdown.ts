/**
 * Markdown + wikilink parsing.
 *
 * Pure functions, no I/O, no DOM — this module is the single source of truth
 * for how Spindle interprets a note's text and is unit tested directly.
 *
 * Supported Obsidian-compatible syntax:
 *   [[Note]]              wikilink
 *   [[Note|Alias]]        wikilink with display alias
 *   [[Note#Heading]]      wikilink to a heading
 *   [[Note#Heading|Alias]]
 *   [[Note#^block]]       wikilink to a block
 *   ![[Note]]             embed
 *   ![[image.png]]        embed of an attachment
 *   #tag                  inline tag
 *   #tag/sub              nested tag
 *   ==highlight==         highlight
 *   [[]] / [[ ]]          escaped, treated as literal text
 */

import type { HeadingInfo, LinkRef, NoteMeta, TagInfo } from './types.js'

/** Matches a wikilink or embed: optional !, [[target]], optional |alias */
const WIKILINK_RE = /(!)?\[\[([^\[\]]+?)\]\]/g

/** Inline tag: #word, allowing / and - and _ and digits, not preceded by a word char. */
const TAG_RE = /(^|[\s(\[])#([A-Za-z0-9_][\w\-/]*)/g

/** ATX heading: # Heading */
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/

/** Fenced code block delimiters */
const FENCE_RE = /^\s*(```|~~~)/

/** YAML frontmatter delimiters */
const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export interface ParsedFrontmatter {
  /** Raw text including the --- delimiters, or null when absent */
  raw: string | null
  /** Parsed key/value pairs (flat; nested YAML is kept as a raw string) */
  data: Record<string, unknown> | null
  /** Body text after the frontmatter block */
  body: string
  /** Character offset where the body starts */
  bodyOffset: number
}

/**
 * Split YAML frontmatter from the body.
 * Deliberately tolerant: a `---` that doesn't close is treated as plain text.
 */
export function parseFrontmatter(text: string): ParsedFrontmatter {
  const match = FM_RE.exec(text)
  if (!match) {
    return { raw: null, data: null, body: text, bodyOffset: 0 }
  }
  const data = parseSimpleYaml(match[1])
  return {
    raw: match[0],
    data,
    body: text.slice(match[0].length),
    bodyOffset: match[0].length,
  }
}

/**
 * Minimal YAML subset parser: `key: value` pairs, plus simple `- item` lists.
 * Deliberately not a full YAML implementation — we only need to *display*
 * properties, and we must never rewrite the user's frontmatter.
 */
export function parseSimpleYaml(yamlText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yamlText.split(/\r?\n/)
  let currentKey: string | null = null
  let listItems: (string | number | boolean)[] = []

  const flushList = () => {
    if (currentKey && listItems.length) {
      result[currentKey] = listItems.slice()
    }
    currentKey = null
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    if (!line.trim() || line.trim().startsWith('#')) continue

    const listMatch = /^\s*-\s+(.*)$/.exec(line)
    if (listMatch && currentKey) {
      listItems.push(unquoteYamlScalar(listMatch[1]))
      continue
    }

    const kv = /^([A-Za-z0-9_][\w.-]*)\s*:\s*(.*)$/.exec(line)
    if (kv) {
      flushList()
      const [, key, value] = kv
      currentKey = key
      const trimmed = value.trim()
      if (trimmed === '') {
        // Value may be a list that follows, or an empty string.
        listItems = []
      } else {
        result[key] = unquoteYamlScalar(trimmed)
        currentKey = null
      }
      continue
    }
    // Unparseable line — ignore rather than throw.
  }
  flushList()
  return result
}

function unquoteYamlScalar(value: string): string | number | boolean {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1)
  }
  // Numbers and booleans keep their natural type.
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return trimmed
}

/**
 * Extract the body offset (frontmatter-aware) so that line/offset calculations
 * refer to the whole file consistently.
 */

/** Parse a single wikilink target into its parts. */
export interface ParsedLinkTarget {
  /** Note name portion, e.g. "Some Note" */
  target: string
  /** Heading or block anchor without the sigil, e.g. "Section" */
  subpath: string | null
  /** Display alias */
  alias: string | null
}

/**
 * Split a wikilink inner text into target / subpath / alias.
 *   "Note"            -> target Note
 *   "Note|Alias"      -> target Note, alias Alias
 *   "Note#Heading"    -> target Note, subpath Heading
 *   "Note#^block"     -> target Note, subpath ^block
 *   "Note#H|Alias"    -> target Note, subpath H, alias Alias
 *   "Note#H#H2|Alias" -> target Note, subpath H#H2 (keeps inner hashes)
 */
export function parseLinkTarget(inner: string): ParsedLinkTarget {
  let rest = inner
  let alias: string | null = null

  // Alias is after the LAST pipe that is not part of a path (pipes are rare in paths).
  const pipeIndex = rest.indexOf('|')
  if (pipeIndex !== -1) {
    alias = rest.slice(pipeIndex + 1).trim()
    rest = rest.slice(0, pipeIndex)
  }

  let subpath: string | null = null
  const hashIndex = rest.indexOf('#')
  if (hashIndex !== -1) {
    subpath = rest.slice(hashIndex + 1).trim()
    rest = rest.slice(0, hashIndex)
  }

  return { target: rest.trim(), subpath: subpath || null, alias: alias || null }
}

/**
 * Find every wikilink/embed in a document.
 * `resolve` decides whether a target points at an existing note.
 */
export function findLinks(
  text: string,
  resolve?: (target: string) => string | null
): LinkRef[] {
  const links: LinkRef[] = []
  const lineStarts = computeLineStarts(text)

  for (const match of text.matchAll(WIKILINK_RE)) {
    const rawText = match[0]
    const isEmbed = match[1] === '!'
    const inner = match[2]
    const offset = match.index ?? 0

    const { target, subpath, alias } = parseLinkTarget(inner)
    if (!target) continue

    const resolvedPath = resolve ? resolve(target) : null
    links.push({
      raw: target,
      target,
      subpath,
      alias,
      isEmbed,
      resolved: resolvedPath !== null,
      resolvedPath,
      line: lineNumberAt(lineStarts, offset),
      offset,
      rawText,
    })
  }
  return links
}

/**
 * Find every inline `#tag` in a document.
 * Skips tags inside code spans/fences and inside URLs (e.g. `http://x#y`).
 */
export function findTags(text: string): string[] {
  const tags = new Set<string>()
  const masked = maskCodeAndUrls(text)

  for (const match of masked.matchAll(TAG_RE)) {
    const name = match[2].replace(/[.,;:!?)\]]+$/, '')
    if (!name) continue
    tags.add(name)
  }
  return [...tags]
}

/**
 * Find every heading in a document, skipping fenced code blocks.
 */
export function findHeadings(text: string, path = ''): HeadingInfo[] {
  const headings: HeadingInfo[] = []
  const lines = text.split(/\r?\n/)
  let inFence = false
  let fenceMarker = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = FENCE_RE.exec(line)
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[1]
      } else if (fence[1] === fenceMarker) {
        inFence = false
      }
      continue
    }
    if (inFence) continue

    const heading = HEADING_RE.exec(line)
    if (heading) {
      const level = heading[1].length
      const text_ = heading[2].trim()
      headings.push({
        level,
        text: text_,
        anchor: `${path}#${text_}`,
        line: i + 1,
      })
    }
  }
  return headings
}

/**
 * Build a NoteMeta record for a file.
 */
export function buildNoteMeta(
  path: string,
  content: string,
  mtime: number,
  size: number
): NoteMeta {
  const { raw, data, body } = parseFrontmatter(content)
  const filename = basename(path)
  const title = filename.replace(/\.md$/i, '')
  const folder = dirname(path)

  // Frontmatter `tags` (string or list) counts as tags too.
  const fmTags = extractFrontmatterTags(data)

  return {
    path,
    title,
    filename,
    folder,
    mtime,
    size,
    tags: fmTags,
    headings: findHeadings(body, path),
    wordCount: countWords(body),
    frontmatter: raw,
    frontmatterData: data,
  }
}

/** Read `tags` from frontmatter, normalising to a string array. */
export function extractFrontmatterTags(data: Record<string, unknown> | null): string[] {
  if (!data) return []
  const value = data.tags ?? data.tag
  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    return value
      .filter((v): v is string => typeof v === 'string')
      .map((t) => t.replace(/^#/, '').trim())
      .filter(Boolean)
  }
  return []
}

/** Count words: whitespace-separated runs, ignoring markdown punctuation edges. */
export function countWords(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!?\[\[[^\]]*\]\]/g, ' ')
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
  const matches = stripped.match(/[\p{L}\p{N}'’-]+/gu)
  return matches ? matches.length : 0
}

/**
 * Replace the contents of code spans, fenced blocks and URLs with spaces of
 * equal length, so that offsets stay aligned while masking false matches.
 */
export function maskCodeAndUrls(text: string): string {
  let masked = text

  // Fenced code blocks (multi-line).
  masked = masked.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
  masked = masked.replace(/~~~[\s\S]*?~~~/g, (m) => ' '.repeat(m.length))

  // Inline code spans.
  masked = masked.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))

  // URLs — so that the `#fragment` in a link target is not read as a tag.
  masked = masked.replace(/https?:\/\/[^\s)"']+/g, (m) => ' '.repeat(m.length))

  return masked
}

/** Line start offsets for a document. */
export function computeLineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/** 1-based line number for a character offset. */
export function lineNumberAt(lineStarts: number[], offset: number): number {
  let low = 0
  let high = lineStarts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (lineStarts[mid] <= offset) low = mid
    else high = mid - 1
  }
  return low + 1
}

/** Basename of a posix path. */
export function basename(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

/** Dirname of a posix path; '' for root-level files. */
export function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  if (idx === -1) return ''
  if (idx === 0) return '/'
  return path.slice(0, idx)
}

/** Join a vault-relative path onto a folder. */
export function joinPath(folder: string, name: string): string {
  if (!folder || folder === '/') return name
  return `${folder.replace(/\/$/, '')}/${name}`
}

/**
 * Build a tag tree for the tag pane, preserving hierarchy.
 * "project/alpha" and "project/beta" both live under "project".
 */
export interface TagNode extends TagInfo {
  children: TagNode[]
}

export function buildTagTree(tags: TagInfo[]): TagNode[] {
  const root: TagNode[] = []
  const byPath = new Map<string, TagNode>()

  for (const tag of tags) {
    const parts = tag.name.split('/')
    let siblings = root
    let pathSoFar = ''

    parts.forEach((part, i) => {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      let node = byPath.get(pathSoFar)
      if (!node) {
        node = { name: part, count: 0, children: [] }
        byPath.set(pathSoFar, node)
        siblings.push(node)
      }
      if (i === parts.length - 1) {
        node.count = tag.count
      } else {
        node.count += tag.count
      }
      siblings = node.children
    })
  }

  const sort = (nodes: TagNode[]) => {
    nodes.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    nodes.forEach((n) => sort(n.children))
  }
  sort(root)
  return root
}
