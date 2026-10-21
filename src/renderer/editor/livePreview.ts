/**
 * Live preview extension for CodeMirror 6.
 *
 * Rather than replacing the editor's content with rendered HTML, this
 * extension *decorates* the source text: Markdown markers are hidden and the
 * text underneath is styled. The document therefore stays plain Markdown, so
 * every position in the rendered view maps exactly to a position in the file.
 *
 * That is what makes it possible to click a link, jump to a heading and keep
 * the caret where the user expects it.
 *
 * The scanner works directly on the source text so every decoration has an
 * exact offset — no token-stream position guessing.
 *
 * Decoration *ordering* is the fiddly part. CodeMirror's range builder only
 * accepts ranges sorted by `from` and then by the decoration's `startSide`,
 * and throws otherwise. Line decorations use a negative side and so sort
 * before marks that start at the same position. The collector below sorts
 * with the same comparator CodeMirror itself uses, and merges overlapping
 * hide ranges so two replacements never cover the same text.
 */

import { Prec, StateEffect, StateField } from '@codemirror/state'
import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view'

/**
 * State effect that toggles the live-preview decorations.
 * Dispatching it with `true` renders the preview, `false` shows plain source.
 */
export const setLivePreview = StateEffect.define<boolean>()

/** Holds whether live preview is currently enabled. */
const livePreviewField = StateField.define<boolean>({
  create: () => true,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setLivePreview)) value = effect.value
    }
    return value
  },
})

// ---------------------------------------------------------------------------
// Decoration kinds
// ---------------------------------------------------------------------------

const mdBold = Decoration.mark({ class: 'cm-md-bold' })
const mdItalic = Decoration.mark({ class: 'cm-md-italic' })
const mdStrike = Decoration.mark({ class: 'cm-md-strikethrough' })
const mdCode = Decoration.mark({ class: 'cm-md-code' })
const mdLink = Decoration.mark({ class: 'cm-md-link' })
const mdUnresolvedLink = Decoration.mark({ class: 'cm-md-link cm-md-link--unresolved' })
const mdEmbedLink = Decoration.mark({ class: 'cm-md-link cm-md-link--embed' })
const mdTag = Decoration.mark({ class: 'cm-md-tag' })
const mdHighlight = Decoration.mark({ class: 'cm-md-highlight' })
const mdListMarker = Decoration.mark({ class: 'cm-md-list-marker' })

/** Hide a range of syntax markers. */
const hideMark = Decoration.replace({})

function headingLine(level: number) {
  return Decoration.line({ class: `cm-md-heading cm-md-heading-${level}` })
}

function ruleLine() {
  return Decoration.line({ class: 'cm-md-rule' })
}

function quoteLine() {
  return Decoration.line({ class: 'cm-md-quote-line' })
}

function codeBlockLine() {
  return Decoration.line({ class: 'cm-md-codeblock-line' })
}

function tableLine() {
  return Decoration.line({ class: 'cm-md-table-line' })
}

function frontmatterLine() {
  return Decoration.line({ class: 'cm-md-frontmatter-line' })
}

function taskDoneLine() {
  return Decoration.line({ class: 'cm-md-task-done' })
}

/** A checkbox that replaces the raw `[ ]` / `[x]` task marker. */
class TaskCheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super()
  }

  override eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked
  }

  override toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = this.checked ? 'cm-md-checkbox cm-md-checkbox--checked' : 'cm-md-checkbox'
    span.textContent = this.checked ? '☑' : '☐'
    return span
  }
}

/**
 * A highlight style for the *source* view.
 *
 * CodeMirror's built-in style underlines headings and links, which is
 * exactly what the live preview replaces with its own styling. The preview
 * decorations sit outside the highlighter's, so the highlighter's underline
 * would still show through on the text the preview styles.
 */
export const sourceHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, fontWeight: 'bold' },
  { tag: tags.link, color: 'var(--link-text)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)' },
  { tag: tags.comment, color: 'var(--text-muted)' },
  { tag: tags.keyword, color: 'var(--accent-text)' },
  { tag: tags.string, color: 'var(--success)' },
  { tag: tags.number, color: 'var(--accent-text)' },
  { tag: tags.tagName, color: 'var(--tag-text)' },
  { tag: tags.processingInstruction, color: 'var(--text-muted)' },
])

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LivePreviewOptions {
  /** Resolve a link target to a path. Returns null when unresolved. */
  resolveLink?: (target: string) => string | null
  /** Enable the preview decorations. When false, plain source is shown. */
  enabled: boolean
}

// ---------------------------------------------------------------------------
// Decoration collection
// ---------------------------------------------------------------------------

interface PendingRange {
  from: number
  to: number
  deco: Decoration
}

/**
 * The `startSide` of a decoration decides its order among decorations that
 * start at the same position. It is not part of the public typings, but it
 * is the value CodeMirror's own comparator sorts on.
 */
function startSideOf(deco: Decoration): number {
  return (deco as unknown as { startSide: number }).startSide
}

/** Merge overlapping or touching ranges into the smallest equivalent set. */
function mergeRanges(ranges: { from: number; to: number }[]): { from: number; to: number }[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to)
  const out = [{ from: sorted[0].from, to: sorted[0].to }]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    const next = sorted[i]
    if (next.from <= last.to) {
      if (next.to > last.to) last.to = next.to
    } else {
      out.push({ from: next.from, to: next.to })
    }
  }
  return out
}

/**
 * Collects decoration ranges and emits them in the order CodeMirror requires:
 * sorted by `from` position, and for equal positions by `startSide`.
 *
 * CodeMirror's range builder rejects unsorted input, and it is far easier to
 * collect ranges in whatever order the scanner finds them and sort at the end
 * than to keep every scanner in strict order.
 */
class DecorationCollector {
  private lines: PendingRange[] = []
  private marks: PendingRange[] = []
  private replaces: PendingRange[] = []
  private hides: { from: number; to: number }[] = []

  /** A line decoration, which must sit at the start of its line. */
  addLine(from: number, deco: Decoration): void {
    this.lines.push({ from, to: from, deco })
  }

  /** A mark decoration covering a range of text. */
  add(from: number, to: number, deco: Decoration): void {
    if (to <= from) return
    this.marks.push({ from, to, deco })
  }

  /** Hide a range of syntax markers. */
  hide(from: number, to: number): void {
    if (to <= from) return
    this.hides.push({ from, to })
  }

  /** Replace a range with a widget. */
  replace(from: number, to: number, deco: Decoration): void {
    if (to <= from) return
    this.replaces.push({ from, to, deco })
  }

  finish(): DecorationSet {
    const ranges: PendingRange[] = [...this.lines, ...this.marks, ...this.replaces]

    // Two replacements that cover the same text render badly, so hide ranges
    // are merged into the smallest equivalent set first.
    for (const range of mergeRanges(this.hides)) {
      ranges.push({ from: range.from, to: range.to, deco: hideMark })
    }

    // The same comparator CodeMirror uses internally.
    ranges.sort((a, b) => a.from - b.from || startSideOf(a.deco) - startSideOf(b.deco))

    return Decoration.set(
      ranges.map((range) => range.deco.range(range.from, range.to)),
      true
    )
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

interface LineInfo {
  /** Offset of the line start. */
  start: number
  /** Offset just past the line's last character (before the newline). */
  end: number
  text: string
  /** True when the line is inside a fenced code block. */
  inCode: boolean
  /** True when the line is inside a table. */
  inTable: boolean
}

/** Split the document into lines, tracking code-fence and table state. */
function scanLines(text: string): LineInfo[] {
  const lines: LineInfo[] = []
  const rawLines = text.split('\n')
  let offset = 0
  let inFence = false
  let fenceMarker = ''

  for (const raw of rawLines) {
    const lineText = raw.replace(/\r$/, '')
    const fenceMatch = /^\s*(```+|~~~+)/.exec(lineText)

    if (fenceMatch) {
      if (!inFence) {
        inFence = true
        fenceMarker = fenceMatch[1][0]
      } else if (fenceMatch[1][0] === fenceMarker) {
        inFence = false
      }
    }

    lines.push({
      start: offset,
      end: offset + lineText.length,
      text: lineText,
      inCode: inFence,
      inTable: false,
    })

    offset += raw.length + 1
  }

  // Mark table rows: a line containing "|" that follows a header row whose
  // delimiter row exists.
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].inCode) continue
    const isDelimiter = /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(lines[i].text)
    if (isDelimiter && lines[i].text.includes('-') && lines[i].text.includes('|')) {
      lines[i].inTable = true
      if (i > 0) lines[i - 1].inTable = true
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].text.includes('|') && !lines[j].text.trim().startsWith('```')) {
          lines[j].inTable = true
        } else break
      }
    }
  }

  return lines
}

/**
 * Find the YAML frontmatter block, if the document starts with one.
 * Returns the line index of the closing delimiter, or -1.
 */
function findFrontmatterEnd(lines: LineInfo[]): number {
  if (lines.length === 0 || lines[0].text.trim() !== '---') return -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].text.trim() === '---' || lines[i].text.trim() === '...') return i
  }
  return -1
}

/**
 * Build the decoration set for a document's text.
 */
function buildFromText(
  text: string,
  resolveLink: (target: string) => string | null
): DecorationSet {
  const out = new DecorationCollector()
  const lines = scanLines(text)
  const frontmatterEnd = findFrontmatterEnd(lines)

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]

    // --- Frontmatter ---
    if (frontmatterEnd > 0 && index <= frontmatterEnd) {
      out.addLine(line.start, frontmatterLine())
      if (index === 0 || index === frontmatterEnd) {
        out.hide(line.start, line.end)
      } else {
        applyInline(line.text, line.start, out, resolveLink)
      }
      continue
    }

    if (line.inCode) {
      // Inside a fence: style the whole line as code, hide the fence markers.
      const fence = /^\s*(```+|~~~+)/.exec(line.text)
      if (fence) {
        out.hide(line.start, line.start + fence[0].length)
      }
      out.addLine(line.start, codeBlockLine())
      continue
    }

    // --- Headings ---
    const heading = /^(#{1,6})(\s+)(.*?)(#*)\s*$/.exec(line.text)
    if (heading) {
      const level = heading[1].length
      out.addLine(line.start, headingLine(level))

      const hashEnd = line.start + heading[1].length
      out.hide(line.start, hashEnd)
      // Hide the space after the hashes.
      out.hide(hashEnd, hashEnd + heading[2].length)

      const textStart = hashEnd + heading[2].length
      const textEnd = textStart + heading[3].length
      // Trailing hashes.
      if (heading[4]) {
        out.hide(textEnd, textEnd + heading[4].length)
      }
      // Style the heading text.
      out.add(textStart, textEnd, Decoration.mark({ class: 'cm-md-heading' }))
      // Inline formatting inside the heading. The slice index is relative to
      // the line, while `textStart` is an absolute document offset.
      const headingText = heading[3]
      applyInline(headingText, textStart, out, resolveLink)
      continue
    }

    // --- Horizontal rule ---
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line.text)) {
      out.addLine(line.start, ruleLine())
      out.hide(line.start, line.end)
      continue
    }

    // --- Blockquote ---
    const quote = /^(\s*>\s?)/.exec(line.text)
    if (quote) {
      out.addLine(line.start, quoteLine())
      out.hide(line.start, line.start + quote[1].length)
      // `quote[1].length` is a line-relative index; the base is absolute.
      applyInline(
        line.text.slice(quote[1].length),
        line.start + quote[1].length,
        out,
        resolveLink
      )
      continue
    }

    // --- List item ---
    const list = /^(\s*)([-*+]|\d+\.)\s+/.exec(line.text)
    if (list) {
      const markerStart = line.start + list[1].length
      const markerEnd = markerStart + list[2].length
      out.add(markerStart, markerEnd, mdListMarker)

      // `markerEnd` is absolute; the slice index must be relative to the
      // line, so track the two separately.
      let contentIndex = markerEnd + 1 - line.start
      let contentStart = markerEnd + 1
      let contentText = line.text.slice(contentIndex)

      // Task list: "- [x] text"
      const task = /^\[([ xX])\]\s+/.exec(contentText)
      if (task) {
        const checked = task[1].toLowerCase() === 'x'
        const boxStart = contentStart
        const boxEnd = contentStart + task[0].length
        // Replace the raw marker with a real checkbox.
        out.replace(boxStart, boxEnd, Decoration.replace({ widget: new TaskCheckboxWidget(checked) }))
        if (checked) out.addLine(line.start, taskDoneLine())
        contentStart = boxEnd
        contentIndex += task[0].length
        contentText = line.text.slice(contentIndex)
      }

      applyInline(contentText, contentStart, out, resolveLink)
      continue
    }

    // --- Table row ---
    if (line.inTable) {
      out.addLine(line.start, tableLine())
      // The delimiter row carries no content, so hide it entirely.
      if (/^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(line.text) && line.text.includes('|')) {
        out.hide(line.start, line.end)
        continue
      }
      // Hide the cell separators and style each cell.
      let cellStart = 0
      for (let i = 0; i <= line.text.length; i++) {
        const isPipe = i === line.text.length || line.text[i] === '|'
        if (!isPipe) continue
        // Trim the whitespace that padded the cell.
        const raw = line.text.slice(cellStart, i)
        const lead = raw.length - raw.trimStart().length
        const from = line.start + cellStart + lead
        const to = line.start + i - (raw.length - raw.trimEnd().length)
        if (to > from) {
          out.add(from, to, Decoration.mark({ class: 'cm-md-table-cell' }))
        }
        // Hide the pipe itself. The final "pipe" is the end of the line
        // rather than a character, and hiding past it would swallow the
        // line break.
        if (i < line.text.length) {
          out.hide(line.start + i, line.start + i + 1)
        }
        cellStart = i + 1
      }
      continue
    }

    // --- Ordinary paragraph line ---
    applyInline(line.text, line.start, out, resolveLink)
  }

  return out.finish()
}

// ---------------------------------------------------------------------------
// Inline scanner
// ---------------------------------------------------------------------------

/**
 * Style inline content within a single line.
 *
 * `lineText` is the text of the line and `base` is its offset in the document.
 */
function applyInline(
  lineText: string,
  base: number,
  out: DecorationCollector,
  resolveLink: (target: string) => string | null
): void {
  if (!lineText) return

  // --- Wikilinks and embeds ---
  for (const match of lineText.matchAll(/(!?)\[\[([^\[\]]+?)\]\]/g)) {
    const at = match.index ?? 0
    const full = match[0]
    const isEmbed = match[1] === '!'
    const inner = match[2]

    const from = base + at
    const innerStart = from + (isEmbed ? 3 : 2)
    const innerEnd = innerStart + inner.length
    const to = from + full.length

    // Hide the brackets.
    out.hide(from, innerStart)
    out.hide(innerEnd, to)

    // Style the link text.
    const target = inner.split('|')[0].split('#')[0].trim()
    const resolved = resolveLink(target)

    if (isEmbed) {
      out.add(innerStart, innerEnd, mdEmbedLink)
    } else if (resolved) {
      out.add(innerStart, innerEnd, mdLink)
    } else {
      out.add(innerStart, innerEnd, mdUnresolvedLink)
    }
  }

  // --- Tags ---
  // Code spans are masked out so a "#tag" inside `code` is left alone.
  const masked = maskCodeSpans(lineText)
  for (const match of lineText.matchAll(/(^|[\s(\[])#([A-Za-z0-9_][\w\-/]*)/g)) {
    const at = (match.index ?? 0) + match[1].length
    const to = at + match[0].length - match[1].length
    // The slice still carries the leading "#", which match[2] does not.
    if (masked.slice(at, to) !== `#${match[2]}`) continue
    out.add(base + at, base + to, mdTag)
  }

  // --- Highlight (==text==) ---
  for (const match of lineText.matchAll(/==([^=\n]+)==/g)) {
    const at = match.index ?? 0
    const innerStart = at + 2
    const innerEnd = at + match[0].length - 2
    out.hide(base + at, base + innerStart)
    out.hide(base + innerEnd, base + at + match[0].length)
    out.add(base + innerStart, base + innerEnd, mdHighlight)
  }

  // --- Bold and italic ---
  for (const match of lineText.matchAll(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g)) {
    const at = match.index ?? 0
    const innerStart = at + match[1].length
    const innerEnd = innerStart + match[2].length
    out.hide(base + at, base + innerStart)
    out.hide(base + innerEnd, base + innerEnd + match[1].length)
    out.add(base + innerStart, base + innerEnd, mdBold)
  }

  for (const match of lineText.matchAll(/(?<![*\w])([*_])(?=\S)([^*_]*?\S)\1(?![*\w])/g)) {
    const at = match.index ?? 0
    const innerStart = at + 1
    const innerEnd = innerStart + match[2].length
    // Skip when the marker is part of a bold run already handled above.
    if (lineText.slice(Math.max(0, at - 2), at).endsWith('**')) continue
    if (lineText.slice(innerEnd, innerEnd + 2) === '**') continue
    out.hide(base + at, base + innerStart)
    out.hide(base + innerEnd, base + innerEnd + 1)
    out.add(base + innerStart, base + innerEnd, mdItalic)
  }

  // --- Strikethrough ---
  for (const match of lineText.matchAll(/~~([^~\n]+)~~/g)) {
    const at = match.index ?? 0
    out.hide(base + at, base + at + 2)
    out.hide(base + at + match[0].length - 2, base + at + match[0].length)
    out.add(base + at + 2, base + at + match[0].length - 2, mdStrike)
  }

  // --- Inline code ---
  for (const match of lineText.matchAll(/(`+)([^`]+?)\1/g)) {
    const at = match.index ?? 0
    out.add(base + at, base + at + match[0].length, mdCode)
  }
}

/**
 * Replace code spans with spaces so other scanners skip them.
 */
function maskCodeSpans(text: string): string {
  return text.replace(/(`+)([^`]+?)\1/g, (m) => ' '.repeat(m.length))
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

/**
 * The live-preview extension.
 */
export function livePreview(options: LivePreviewOptions) {
  const resolve = options.resolveLink ?? (() => null)

  // The decoration set lives in a state field rather than in the view
  // plugin. A plugin publishes its decorations as a *function* of the view,
  // and CodeMirror treats such sets as viewport-dependent: they may not
  // replace line breaks, which is exactly what hiding a Markdown marker
  // needs. A state field publishes a plain set, so hiding works.
  const decoField = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      if (!tr.docChanged && !tr.effects.length) return value
      // The document is the source of truth here: the set is rebuilt from
      // the new text, so its offsets stay correct.
      const text = tr.state.doc.toString()
      return tr.state.field(livePreviewField) ? buildFromText(text, resolve) : Decoration.none
    },
  })

  return [
    livePreviewField,
    decoField,
    // The live preview draws its own styling, so it must win over the
    // Markdown syntax highlighter that CodeMirror ships with.
    Prec.high(EditorView.decorations.from(decoField, (set) => set)),
  ]
}

/**
 * Click handling: clicking a wikilink opens the target.
 */
export function linkClickHandler(onLinkClick: (target: string) => void) {
  return EditorView.domEventHandlers({
    mousedown(event) {
      const target = event.target as HTMLElement | null
      if (!target) return false

      const link = target.closest('.cm-md-link')
      if (!link) return false

      const text = link.textContent ?? ''
      const inner = text.split('|')[0].split('#')[0].trim()
      if (!inner) return false

      event.preventDefault()
      onLinkClick(inner)
      return true
    },
  })
}
