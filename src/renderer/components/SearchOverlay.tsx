import { useEffect, useRef, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import type { SearchResult } from '../../shared/types.js'

/**
 * Full-text search overlay (Cmd+Shift+F).
 */
export function SearchOverlay() {
  const open = useVaultStore((s) => s.searchOpen)
  const setOpen = useVaultStore((s) => s.setSearchOpen)
  const openTab = useVaultStore((s) => s.openTab)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selected, setSelected] = useState(0)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setSelected(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      return
    }

    setSearching(true)
    const timer = setTimeout(() => {
      void window.slate.search
        .query({ text: trimmed, limit: 100 })
        .then((found) => {
          setResults(found)
          setSelected(0)
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 140)

    return () => clearTimeout(timer)
  }, [query, open])

  if (!open) return null

  const choose = (result: SearchResult) => {
    openTab(result.path)
    setOpen(false)
  }

  return (
    <div className="overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette__input"
          placeholder="Search all notes…"
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
              if (target) choose(target)
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />

        <div className="search-results">
          {searching && results.length === 0 ? (
            <div className="palette__empty">Searching…</div>
          ) : query.trim() === '' ? (
            <div className="palette__empty">Type to search the whole vault.</div>
          ) : results.length === 0 ? (
            <div className="palette__empty">No notes match “{query}”.</div>
          ) : (
            results.map((result, i) => (
              <div
                key={result.path}
                className={`search-result ${i === selected ? 'is-selected' : ''}`}
                onMouseEnter={() => setSelected(i)}
                onClick={() => choose(result)}
                style={
                  i === selected
                    ? { background: 'var(--bg-selected)' }
                    : undefined
                }
              >
                <div className="search-result__title">
                  {result.title}
                  {result.matchCount > 1 && (
                    <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {' '}
                      ({result.matchCount} matches)
                    </span>
                  )}
                </div>
                <div className="search-result__snippet">
                  <Snippet result={result} />
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

/** Render a search snippet with the match highlighted. */
function Snippet({ result }: { result: SearchResult }) {
  if (result.matchLength === 0) return <>{result.snippet}</>
  const start = result.matchStart
  const end = result.matchStart + result.matchLength
  if (start < 0 || end > result.snippet.length) return <>{result.snippet}</>

  return (
    <>
      {result.snippet.slice(0, start)}
      <mark>{result.snippet.slice(start, end)}</mark>
      {result.snippet.slice(end)}
    </>
  )
}
