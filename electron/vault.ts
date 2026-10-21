/**
 * Vault: a folder of plain files. Slate treats it as read/write but never
 * migrates or reformats it.
 *
 * Slate's own settings are kept outside the vault entirely, in the OS
 * user-data directory, so opening a vault never writes into it.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { TreeNode } from '../src/shared/types.js'

export class VaultError extends Error {
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'VaultError'
  }
}

/** Convert an absolute path to a vault-relative, posix-style path. */
export function toRelative(root: string, absolute: string): string {
  const rel = path.relative(root, absolute)
  return rel.split(path.sep).join('/')
}

/** Convert a vault-relative path back to an absolute path, guarding escapes. */
export function toAbsolute(root: string, relative: string): string {
  const abs = path.resolve(root, relative)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new VaultError(`Path escapes the vault: ${relative}`, 'ESCAPE')
  }
  return abs
}

export function isMarkdown(filePath: string): boolean {
  return /\.md$/i.test(filePath)
}

export function isHidden(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Build the file tree for a vault.
 * Hidden folders are skipped, so a vault's own dot-folders (e.g. ".obsidian")
 * stay out of the way.
 */
export async function readTree(root: string, includeHidden = false): Promise<TreeNode[]> {
  const entries = await safeReaddir(root)
  const nodes: TreeNode[] = []

  for (const entry of entries) {
    const name = entry.name
    if (!includeHidden && isHidden(name)) continue

    const abs = path.join(root, name)
    if (entry.isDirectory()) {
      const children = await readTree(abs, includeHidden)
      nodes.push({
        path: toRelative(root, abs),
        name,
        isFolder: true,
        children,
      })
    } else {
      const stat = await safeStat(abs)
      nodes.push({
        path: toRelative(root, abs),
        name,
        isFolder: false,
        mtime: stat?.mtimeMs ?? 0,
        size: stat?.size ?? 0,
      })
    }
  }

  sortTree(nodes)
  return nodes
}

/** Folders first, then files, each alphabetical (case-insensitive). */
export function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  for (const node of nodes) {
    if (node.children) sortTree(node.children)
  }
}

/** Recursively list all markdown files, vault-relative. */
export async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = []
  await walk(root, root, out)
  return out.sort()
}

async function walk(dir: string, root: string, out: string[]): Promise<void> {
  const entries = await safeReaddir(dir)
  for (const entry of entries) {
    if (isHidden(entry.name)) continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(abs, root, out)
    } else if (isMarkdown(entry.name)) {
      out.push(toRelative(root, abs))
    }
  }
}

async function safeReaddir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function safeStat(abs: string) {
  try {
    return await fs.stat(abs)
  } catch {
    return null
  }
}

/** Read a file's UTF-8 content. */
export async function readFile(root: string, relative: string): Promise<string> {
  const abs = toAbsolute(root, relative)
  return fs.readFile(abs, 'utf8')
}

/**
 * Write a file atomically: write to a temp file next to the target, then
 * rename over it. This avoids truncating the user's note if we crash
 * mid-write, and avoids the watcher seeing a half-written file.
 */
export async function writeFile(root: string, relative: string, content: string): Promise<void> {
  const abs = toAbsolute(root, relative)
  await fs.mkdir(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.slate-tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, content, 'utf8')
  try {
    await fs.rename(tmp, abs)
  } catch (err) {
    await fs.unlink(tmp).catch(() => {})
    throw err
  }
}

/** Create a new markdown file, optionally with initial content. */
export async function createNote(
  root: string,
  relative: string,
  content = ''
): Promise<void> {
  const abs = toAbsolute(root, relative)
  try {
    await fs.access(abs)
    throw new VaultError(`A file already exists at ${relative}`, 'EXISTS')
  } catch (err) {
    if (err instanceof VaultError) throw err
    // access() failing with ENOENT is the expected path.
  }
  await writeFile(root, relative, content)
}

/** Create a folder (recursively). */
export async function createFolder(root: string, relative: string): Promise<void> {
  const abs = toAbsolute(root, relative)
  await fs.mkdir(abs, { recursive: true })
}

/** Delete a file or folder. */
export async function removePath(root: string, relative: string): Promise<void> {
  const abs = toAbsolute(root, relative)
  await fs.rm(abs, { recursive: true, force: true })
}

/** Rename/move a file or folder. */
export async function renamePath(
  root: string,
  fromRelative: string,
  toRelative: string
): Promise<void> {
  const from = toAbsolute(root, fromRelative)
  const to = toAbsolute(root, toRelative)
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to)
}

/** Does a file exist? */
export async function exists(root: string, relative: string): Promise<boolean> {
  try {
    await fs.access(toAbsolute(root, relative))
    return true
  } catch {
    return false
  }
}

/**
 * Pick a non-colliding file name, appending " 1", " 2" ... like Obsidian does.
 */
export async function uniqueNotePath(
  root: string,
  folder: string,
  baseName: string,
  extension = '.md'
): Promise<string> {
  let candidate = folder ? `${folder}/${baseName}${extension}` : `${baseName}${extension}`
  let counter = 1
  while (await exists(root, candidate)) {
    candidate = folder ? `${folder}/${baseName} ${counter}${extension}` : `${baseName} ${counter}${extension}`
    counter++
  }
  return candidate
}

/**
 * Validate a vault folder: it must exist and be a directory.
 */
export async function validateVault(dir: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) return { ok: false, error: 'That path is not a folder.' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'That folder does not exist.' }
  }
}
