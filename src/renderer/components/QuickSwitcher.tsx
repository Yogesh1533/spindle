import { useEffect, useMemo, useRef, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import { IconFile, IconFolder } from './icons.js'

/**
 * The quick switcher (Cmd+O): fuzzy-find a note by name and open it.
 */
export function QuickSwitcher() {
  const open = useVaultStore((s) => s.quickSwitcherOpen)
  const setOpen = useVaultStore((s) => s.setQuickSwitcherOpen)
  const notes = useVaultStore((s) => s.notes)
  const openTab = useVaultStore((s) => s.openTab)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      // Focus after the overlay renders.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const list = notes.map((note) => ({ note, score: scoreNote(note.title, note.path, needle) }))
    const filtered = needle ? list.filter((item) => item.score > 0) : list
    filtered.sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
    return filtered.slice(0, 50).map((item) => item.note)
  }, [notes, query])

  useEffect(() => {
    setSelected(0)
  }, [query])

  if (!open) return null

  const choose = (path: string) => {
    openTab(path)
    setOpen(false)
  }

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Search notes by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSelected((s) => Math.min(s + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSelected((s) => Math.max(s - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const target = results[selected]
              if (target) choose(target.path)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />

        <div className="palette__results">
          {results.length === 0 ? (
            <div className="palette__empty">No notes match “{query}”.</div>
          ) : (
            results.map((note, i) => (
              <div
                key={note.path}
                className={`palette__item ${i === selected ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(note.path)}
              >
                <span className="palette__item-icon">
                  {note.path.includes('/') ? <IconFolder size={14} /> : <IconFile size={14} />}
                </span>
                <div className="palette__item-main">
                  <div className="palette__item-title">{note.title}</div>
                  {note.path.includes('/') && (
                    <div className="palette__item-sub">{note.folder}/</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="palette__hint">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Score a note against the query.
 * Higher is better; 0 means "no match".
 */
function scoreNote(title: string, path: string, needle: string): number {
  if (!needle) return 1

  const lowerTitle = title.toLowerCase()
  const lowerPath = path.toLowerCase()

  if (lowerTitle === needle) return 1000
  if (lowerTitle.startsWith(needle)) return 500
  if (lowerPath.includes(needle)) return 200

  // Subsequence match, e.g. "nbt" matches "note about backlinks".
  let index = 0
  for (const char of lowerTitle) {
    if (char === needle[index]) index++
    if (index === needle.length) return 100
  }

  return 0
}
