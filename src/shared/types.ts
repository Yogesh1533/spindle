/**
 * Types shared between the Electron main process and the renderer.
 * Kept dependency-free so it can be imported from both sides.
 */

export type ThemeMode = 'light' | 'dark' | 'system'

export type ViewMode = 'source' | 'preview'

/** A file or folder entry in the vault tree. Path is vault-relative, posix separators. */
export interface TreeNode {
  /** Vault-relative path, e.g. "notes/ideas.md" */
  path: string
  /** Base name including extension, e.g. "ideas.md" */
  name: string
  /** True when this entry is a directory */
  isFolder: boolean
  /** Child entries (folders only), sorted folders-first then alphabetical */
  children?: TreeNode[]
  /** Last modification time in epoch ms (files only) */
  mtime?: number
  /** File size in bytes (files only) */
  size?: number
}

/** A markdown file in the vault. */
export interface NoteMeta {
  /** Vault-relative path */
  path: string
  /** File name without extension */
  title: string
  /** File name with extension */
  filename: string
  /** Parent folder path, '' for vault root */
  folder: string
  mtime: number
  size: number
  /** Tags found in the note (inline #tag and frontmatter tags), without the '#' */
  tags: string[]
  /** Headings in document order, e.g. "## Section" */
  headings: HeadingInfo[]
  /** Word count of the body (excluding frontmatter) */
  wordCount: number
  /** Raw YAML frontmatter text including delimiters, or null when absent */
  frontmatter: string | null
  /** Parsed frontmatter object */
  frontmatterData: Record<string, unknown> | null
}

export interface HeadingInfo {
  level: number
  text: string
  /** Vault-relative path + '#' + heading text — the anchor used by [[note#heading]] */
  anchor: string
  line: number
}

/** A link extracted from a note. */
export interface LinkRef {
  /** The raw target as written, e.g. "Some Note#Section" */
  raw: string
  /** Target without heading/block reference */
  target: string
  /** Heading or block reference without '#' or '^', if any */
  subpath: string | null
  /** Display alias from [[target|alias]] */
  alias: string | null
  /** True for ![[embed]] syntax */
  isEmbed: boolean
  /** Whether the link target could be resolved to a note in the vault */
  resolved: boolean
  /** Path of the resolved note, when resolved */
  resolvedPath: string | null
  /** Line number in the source note where the link occurs */
  line: number
  /** Character offset in the source note */
  offset: number
  /** The full matched source text, e.g. "[[target|alias]]" */
  rawText: string
}

/** A note that links to a given note (one backlink row). */
export interface Backlink {
  /** Path of the note containing the link */
  sourcePath: string
  sourceTitle: string
  /** The link that points at the target */
  link: LinkRef
  /** Surrounding text used as context, trimmed */
  context: string
  /** Line number of the link in the source note */
  line: number
  /** True when the source note mentions the target without a wikilink */
  isUnlinked: boolean
}

/** Full-text search result. */
export interface SearchResult {
  path: string
  title: string
  /** Matching snippet with the match highlighted by the renderer's highlighter */
  snippet: string
  /** Start offset of the match within the snippet */
  matchStart: number
  matchLength: number
  score: number
  /** Number of matches in this note */
  matchCount: number
}

/** A tag with its usage count. */
export interface TagInfo {
  name: string
  count: number
}

/** The whole vault index, sent to the renderer after any change. */
export interface VaultIndex {
  root: string
  notes: NoteMeta[]
  /** path -> links found in that note */
  linksByPath: Map<string, LinkRef[]>
  /** path -> notes linking to it */
  backlinksByPath: Map<string, Backlink[]>
  tags: TagInfo[]
  /** All headings across the vault, for the outline pane and [[note#heading]] */
  headingsByPath: Map<string, HeadingInfo[]>
  /** Last time the index was built */
  indexedAt: number
}

/** Settings persisted outside the vault, in the app's userData directory. */
export interface AppSettings {
  theme: ThemeMode
  /** Folder for daily notes, vault-relative. e.g. "Daily" */
  dailyNotesFolder: string
  /** Template file for daily notes, vault-relative. Empty means none. */
  dailyNotesTemplate: string
  /** Template tokens enabled */
  dailyNoteFormat: string
  /** Show the file explorer */
  showFileExplorer: boolean
  /** Show the right sidebar */
  showRightSidebar: boolean
  /** Show backlinks pane */
  showBacklinks: boolean
  /** Show tags pane */
  showTags: boolean
  /** Show outline pane */
  showOutline: boolean
  /** Default view mode for new notes */
  defaultViewMode: ViewMode
  /** Editor font size in px */
  editorFontSize: number
  /** Last opened vault path */
  lastVaultPath: string | null
  /** Whether the right sidebar is collapsed */
  rightSidebarCollapsed: boolean
  /** File explorer width in px */
  leftSidebarWidth: number
  /** Right sidebar width in px */
  rightSidebarWidth: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  dailyNotesFolder: 'Daily',
  dailyNotesTemplate: '',
  dailyNoteFormat: 'YYYY-MM-DD',
  showFileExplorer: true,
  showRightSidebar: true,
  showBacklinks: true,
  showTags: true,
  showOutline: true,
  defaultViewMode: 'preview',
  editorFontSize: 15,
  lastVaultPath: null,
  rightSidebarCollapsed: false,
  leftSidebarWidth: 260,
  rightSidebarWidth: 300,
}

/** Result of a file operation that may have been applied to many files. */
export interface WriteResult {
  success: boolean
  error?: string
  /** Paths of files that were changed (e.g. during a rename) */
  changedPaths?: string[]
}

/** A file opened in an editor tab. */
export interface OpenFile {
  path: string
  /** View mode override for this tab */
  mode: ViewMode
}

/** Payload sent when a file changes on disk. */
export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'rename'
  path: string
  /** For renames: the previous path */
  oldPath?: string
}
