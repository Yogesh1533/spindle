/**
 * Filesystem watcher.
 *
 * Watches the vault folder and reports adds/changes/deletes so the index and
 * the UI stay in sync with edits made outside the app.
 *
 * Writes made *by* Slate are also seen by the watcher, so we keep a short
 * lived registry of paths we just wrote and ignore the resulting echo.
 */

import chokidar, { type FSWatcher } from 'chokidar'
import path from 'node:path'
import type { FileChangeEvent } from '../src/shared/types.js'
import { toRelative } from './vault.js'

/** How long a path stays "self-written" and is ignored, in ms. */
const ECHO_WINDOW_MS = 1500

export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private root: string | null = null
  private selfWrites = new Map<string, number>()

  constructor(
    private readonly onChange: (event: FileChangeEvent) => void,
    private readonly onError?: (error: Error) => void
  ) {}

  /** Start watching a vault folder. */
  async start(root: string): Promise<void> {
    await this.stop()
    this.root = root

    this.watcher = chokidar.watch(root, {
      ignoreInitial: true,
      persistent: true,
      ignored: (filePath: string) => {
        const name = path.basename(filePath)
        // Ignore our own settings folder and other apps' hidden folders.
        if (name.startsWith('.')) return true
        return filePath.includes('.slate-tmp-')
      },
      awaitWriteFinish: {
        stabilityThreshold: 120,
        pollInterval: 30,
      },
    })

    this.watcher
      .on('add', (p) => this.emit('add', p))
      .on('change', (p) => this.emit('change', p))
      .on('unlink', (p) => this.emit('unlink', p))
      .on('addDir', (p) => this.emit('addDir', p))
      .on('unlinkDir', (p) => this.emit('unlinkDir', p))
      .on('error', (err) => this.onError?.(err as Error))
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
    this.root = null
    this.selfWrites.clear()
  }

  /**
   * Mark a path as written by us so the watcher ignores the echo.
   */
  markSelfWrite(relativePath: string): void {
    this.selfWrites.set(relativePath, Date.now())
  }

  /** Is this path one we just wrote ourselves? */
  private isSelfWrite(relativePath: string): boolean {
    const at = this.selfWrites.get(relativePath)
    if (at === undefined) return false
    if (Date.now() - at > ECHO_WINDOW_MS) {
      this.selfWrites.delete(relativePath)
      return false
    }
    this.selfWrites.delete(relativePath)
    return true
  }

  private emit(type: FileChangeEvent['type'], absolute: string): void {
    if (!this.root) return
    const rel = toRelative(this.root, absolute)

    if (this.isSelfWrite(rel)) return
    // Ignore non-markdown files; we do not index them.
    if (type === 'add' || type === 'change' || type === 'unlink') {
      if (!/\.md$/i.test(rel)) return
    }

    this.onChange({ type, path: rel })
  }
}
