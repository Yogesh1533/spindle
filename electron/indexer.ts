/**
 * The vault index: notes, links, backlinks, tags and the search index.
 *
 * It lives in the main process so that it survives renderer reloads and is
 * built once per vault rather than once per React mount.
 */

import { EventEmitter } from 'node:events'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { buildNoteMeta, findLinks, findTags, parseFrontmatter } from '../src/shared/markdown.js'
import { createResolver, findUnlinkedMentions } from '../src/shared/links.js'
import { VaultSearchIndex, type IndexableNote } from '../src/shared/search.js'
import type {
  Backlink,
  HeadingInfo,
  LinkRef,
  NoteMeta,
  TagInfo,
} from '../src/shared/types.js'
import { isMarkdown, toRelative } from './vault.js'

export interface IndexSnapshot {
  notes: NoteMeta[]
  linksByPath: Record<string, LinkRef[]>
  backlinksByPath: Record<string, Backlink[]>
  tags: TagInfo[]
  headingsByPath: Record<string, HeadingInfo[]>
  indexedAt: number
}

interface NoteEntry {
  meta: NoteMeta
  content: string
  links: LinkRef[]
  tags: string[]
}

export class VaultIndexer extends EventEmitter {
  private root: string | null = null
  private notes = new Map<string, NoteEntry>()
  private searchIndex = new VaultSearchIndex()
  private backlinks = new Map<string, Backlink[]>()
  private tags = new Map<string, number>()
  private headings = new Map<string, HeadingInfo[]>()
  private revision = 0

  get currentRoot(): string | null {
    return this.root
  }

  /** Build the index for a vault from scratch. */
  async build(root: string): Promise<void> {
    this.root = root
    this.notes.clear()
    this.searchIndex.clear()
    this.backlinks.clear()
    this.tags.clear()
    this.headings.clear()

    const files = await this.listMarkdown(root)
    for (const rel of files) {
      await this.indexFile(root, rel)
    }
    this.recomputeBacklinks()
    this.revision++
    this.emit('updated')
  }

  /** Re-index a single file (added or changed on disk). */
  async indexFile(root: string, rel: string): Promise<void> {
    const abs = path.join(root, rel)
    let content = ''
    let stat = await fs.stat(abs).catch(() => null)
    if (!stat) return

    try {
      content = await fs.readFile(abs, 'utf8')
    } catch {
      return
    }

    const meta = buildNoteMeta(rel, content, stat.mtimeMs, stat.size)
    const { body } = parseFrontmatter(content)

    const inlineTags = findTags(body)
    const tagSet = new Set([...meta.tags, ...inlineTags])
    meta.tags = [...tagSet]

    const links = findLinks(content, undefined) // resolved in recomputeBacklinks

    this.notes.set(rel, { meta, content, links, tags: meta.tags })
    this.headings.set(rel, meta.headings)

    const indexable: IndexableNote = {
      path: rel,
      title: meta.title,
      filename: meta.filename,
      content,
      body,
      headings: meta.headings.map((h) => h.text),
      tags: meta.tags,
      mtime: meta.mtime,
    }
    this.searchIndex.upsert(indexable)
  }

  /** Remove a file from the index. */
  removeFile(rel: string): void {
    this.notes.delete(rel)
    this.headings.delete(rel)
    this.searchIndex.remove(rel)
    this.recomputeBacklinks()
    this.revision++
    this.emit('updated')
  }

  /** Re-resolve every link and rebuild the backlink map and tag counts. */
  recomputeBacklinks(): void {
    const paths = [...this.notes.keys()]
    const resolver = createResolver(paths)

    this.backlinks = new Map()
    this.tags = new Map()

    for (const [rel, entry] of this.notes) {
      const resolvedLinks = entry.links.map((link) => {
        const resolvedPath = resolver(link.target, { fromPath: rel })
        return { ...link, resolvedPath, resolved: resolvedPath !== null }
      })
      entry.links = resolvedLinks

      for (const link of resolvedLinks) {
        if (!link.resolvedPath) continue
        const list = this.backlinks.get(link.resolvedPath) ?? []
        list.push({
          sourcePath: rel,
          sourceTitle: entry.meta.title,
          link,
          context: this.contextFor(entry.content, link),
          line: link.line,
          isUnlinked: false,
        })
        this.backlinks.set(link.resolvedPath, list)
      }

      for (const tag of entry.tags) {
        this.tags.set(tag, (this.tags.get(tag) ?? 0) + 1)
      }
    }

    // Sort backlinks by source path for stable rendering.
    for (const list of this.backlinks.values()) {
      list.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.line - b.line)
    }

    this.revision++
  }

  /**
   * Extract a line of context around a link for the backlinks pane.
   */
  private contextFor(content: string, link: LinkRef): string {
    const lines = content.split(/\r?\n/)
    const line = lines[link.line - 1] ?? ''
    return line.trim().slice(0, 240)
  }

  /**
   * Unlinked mentions: notes that mention a target's title without linking.
   */
  unlinkedMentions(targetPath: string): { path: string; context: string; line: number }[] {
    const entry = this.notes.get(targetPath)
    if (!entry) return []
    const linked = new Set((this.backlinks.get(targetPath) ?? []).map((b) => b.sourcePath))
    const all = [...this.notes.values()].map((n) => ({ path: n.meta.path, content: n.content }))
    return findUnlinkedMentions(targetPath, entry.meta.title, all, linked)
  }

  private async listMarkdown(root: string): Promise<string[]> {
    const out: string[] = []
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const abs = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walk(abs)
        } else if (isMarkdown(entry.name)) {
          out.push(toRelative(root, abs))
        }
      }
    }
    await walk(root)
    return out.sort()
  }

  // ---- Read accessors used by IPC ----

  getNoteMeta(path: string): NoteMeta | undefined {
    return this.notes.get(path)?.meta
  }

  getNoteContent(path: string): string | undefined {
    return this.notes.get(path)?.content
  }

  getLinks(path: string): LinkRef[] {
    return this.notes.get(path)?.links ?? []
  }

  getBacklinks(path: string): Backlink[] {
    return this.backlinks.get(path) ?? []
  }

  getOutgoingLinks(path: string): Backlink[] {
    const entry = this.notes.get(path)
    if (!entry) return []
    return entry.links
      .filter((l) => l.resolvedPath)
      .map((link) => ({
        sourcePath: path,
        sourceTitle: entry.meta.title,
        link,
        context: this.contextFor(entry.content, link),
        line: link.line,
        isUnlinked: false,
      }))
  }

  getAllNotes(): NoteMeta[] {
    return [...this.notes.values()].map((n) => n.meta)
  }

  getTagList(): TagInfo[] {
    return [...this.tags.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }

  getHeadings(path: string): HeadingInfo[] {
    return this.headings.get(path) ?? []
  }

  getSearchIndex(): VaultSearchIndex {
    return this.searchIndex
  }

  get notePaths(): string[] {
    return [...this.notes.keys()]
  }

  /** A serialisable snapshot for the renderer. */
  snapshot(): IndexSnapshot {
    const linksByPath: Record<string, LinkRef[]> = {}
    for (const [path, entry] of this.notes) {
      linksByPath[path] = entry.links
    }
    const backlinksByPath: Record<string, Backlink[]> = {}
    for (const [path, list] of this.backlinks) {
      backlinksByPath[path] = list
    }
    const headingsByPath: Record<string, HeadingInfo[]> = {}
    for (const [path, list] of this.headings) {
      headingsByPath[path] = list
    }
    return {
      notes: this.getAllNotes(),
      linksByPath,
      backlinksByPath,
      tags: this.getTagList(),
      headingsByPath,
      indexedAt: Date.now(),
    }
  }
}
