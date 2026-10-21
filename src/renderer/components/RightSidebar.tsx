import { useEffect, useMemo, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import { buildTagTree } from '../../shared/markdown.js'
import { openLinkTarget } from '../lib/actions.js'
import { IconOutgoing, IconTag } from './icons.js'

/** The right sidebar: backlinks, outgoing links, tags and the outline. */
export function RightSidebar() {
  const rightPane = useVaultStore((s) => s.rightPane)
  const setRightPane = useVaultStore((s) => s.setRightPane)
  const activeTab = useVaultStore((s) => s.activeTab)

  return (
    <aside className="sidebar sidebar--right" style={{ width: 300 }}>
      <div className="sidebar__header">
        <span>
          {rightPane === 'backlinks' && 'Backlinks'}
          {rightPane === 'outgoing' && 'Outgoing links'}
          {rightPane === 'tags' && 'Tags'}
          {rightPane === 'outline' && 'Outline'}
        </span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className={`tree__action ${rightPane === 'outgoing' ? 'is-active' : ''}`}
            title="Outgoing links"
            onClick={() => setRightPane('outgoing')}
          >
            <IconOutgoing size={13} />
          </button>
          <button
            className={`tree__action ${rightPane === 'tags' ? 'is-active' : ''}`}
            title="Tags"
            onClick={() => setRightPane('tags')}
          >
            <IconTag size={13} />
          </button>
        </div>
      </div>

      <div className="sidebar__body">
        {!activeTab ? (
          <div style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
            Open a note to see its links.
          </div>
        ) : rightPane === 'backlinks' ? (
          <BacklinksPane path={activeTab} />
        ) : rightPane === 'outgoing' ? (
          <OutgoingPane path={activeTab} />
        ) : rightPane === 'tags' ? (
          <TagsPane />
        ) : (
          <OutlinePane path={activeTab} />
        )}
      </div>
    </aside>
  )
}

function BacklinksPane({ path }: { path: string }) {
  const backlinks = useVaultStore((s) => s.backlinksByPath[path] ?? [])
  const [showUnlinked, setShowUnlinked] = useState(false)
  const [unlinked, setUnlinked] = useState<
    { path: string; context: string; line: number }[]
  >([])

  const title = useVaultStore((s) => s.notes.find((n) => n.path === path)?.title ?? '')

  // Load unlinked mentions on demand.
  useEffectUnlinked(path, showUnlinked, setUnlinked)

  if (backlinks.length === 0 && !showUnlinked) {
    return (
      <div style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
        No links point here yet.
      </div>
    )
  }

  return (
    <div className="pane-list">
      {backlinks.length > 0 && (
        <div className="pane-section">
          <div className="pane-section__title">
            <span>Linked mentions ({backlinks.length})</span>
          </div>
        </div>
      )}

      {backlinks.map((backlink) => (
        <div
          key={`${backlink.sourcePath}-${backlink.line}-${backlink.link.offset}`}
          className="backlink"
          onClick={() => {
            useVaultStore.getState().openTab(backlink.sourcePath)
          }}
        >
          <div className="backlink__source">{backlink.sourceTitle}</div>
          <div className="backlink__context">{highlightTitle(backlink.context, title)}</div>
        </div>
      ))}

      <div className="pane-section">
        <button
          className="button button--ghost"
          style={{ width: '100%', justifyContent: 'space-between' }}
          onClick={() => setShowUnlinked((v) => !v)}
        >
          <span>Unlinked mentions</span>
          <span>{showUnlinked ? '−' : '+'}</span>
        </button>
      </div>

      {showUnlinked &&
        (unlinked.length === 0 ? (
          <div style={{ padding: '4px 10px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
            None.
          </div>
        ) : (
          unlinked.map((mention) => (
            <div
              key={`${mention.path}-${mention.line}`}
              className="backlink"
              onClick={() => useVaultStore.getState().openTab(mention.path)}
            >
              <div className="backlink__source">
                {mention.path.split('/').pop()}
              </div>
              <div className="backlink__context">
                {highlightTitle(mention.context, title)}
              </div>
            </div>
          ))
        ))}
    </div>
  )
}

function OutgoingPane({ path }: { path: string }) {
  const links = useVaultStore((s) => s.linksByPath[path] ?? [])

  if (links.length === 0) {
    return (
      <div style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
        This note has no outgoing links.
      </div>
    )
  }

  return (
    <div className="pane-list">
      {links.map((link, i) => (
        <div
          key={`${link.rawText}-${link.offset}-${i}`}
          className="backlink"
          onClick={() => {
            if (link.resolvedPath) {
              useVaultStore.getState().openTab(link.resolvedPath)
            } else {
              void openLinkTarget(link.target, path)
            }
          }}
        >
          <div
            className="backlink__source"
            style={{ color: link.resolved ? undefined : 'var(--link-unresolved)' }}
          >
            {link.alias ?? link.target}
            {link.subpath && <span style={{ opacity: 0.6 }}> #{link.subpath}</span>}
          </div>
          <div className="backlink__context">
            {link.resolved ? link.resolvedPath : 'Not created yet — click to create'}
          </div>
        </div>
      ))}
    </div>
  )
}

function TagsPane() {
  const tags = useVaultStore((s) => s.tags)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const tree = useMemo(() => buildTagTree(tags), [tags])

  const filterTree = (nodes: ReturnType<typeof buildTagTree>): ReturnType<typeof buildTagTree> => {
    if (!query.trim()) return nodes
    const needle = query.toLowerCase()
    const filter = (node: (typeof nodes)[number]): boolean => {
      const self = node.name.toLowerCase().includes(needle)
      const childMatch = node.children.some(filter)
      node.children = node.children.filter(filter)
      return self || childMatch
    }
    return nodes.filter(filter)
  }

  const visible = filterTree(tree.map((n) => ({ ...n, children: [...n.children] })))

  if (tags.length === 0) {
    return (
      <div style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
        No tags yet. Add <code>#tag</code> to a note.
      </div>
    )
  }

  return (
    <div>
      <div style={{ padding: '8px 10px' }}>
        <input
          className="input"
          placeholder="Search tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {activeTag && (
        <div className="pane-section">
          <div className="pane-section__title">
            <span>#{activeTag}</span>
            <button className="tree__action" onClick={() => setActiveTag(null)}>
              Clear
            </button>
          </div>
          <TagNotes tag={activeTag} />
        </div>
      )}

      <div className="tag-list">
        {visible.map((node) => (
          <TagBranch
            key={node.name}
            node={node}
            depth={0}
            activeTag={activeTag}
            onSelect={setActiveTag}
          />
        ))}
      </div>
    </div>
  )
}

function TagBranch({
  node,
  depth,
  activeTag,
  onSelect,
}: {
  node: { name: string; count: number; children: { name: string; count: number; children: any[] }[] }
  depth: number
  activeTag: string | null
  onSelect: (tag: string) => void
}) {
  return (
    <>
      <span
        className={`tag-chip ${activeTag === node.name ? 'is-active' : ''}`}
        style={{ marginLeft: depth * 8 }}
        onClick={() => onSelect(node.name)}
      >
        {node.name}
        <span className="tag-chip__count">{node.count}</span>
      </span>
      {node.children.map((child) => (
        <TagBranch
          key={child.name}
          node={child}
          depth={depth + 1}
          activeTag={activeTag}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

function TagNotes({ tag }: { tag: string }) {
  const notes = useVaultStore((s) => s.notes.filter((n) => n.tags.includes(tag)))
  if (notes.length === 0) return null
  return (
    <div>
      {notes.map((note) => (
        <div
          key={note.path}
          className="outline-item"
          onClick={() => useVaultStore.getState().openTab(note.path)}
        >
          {note.title}
        </div>
      ))}
    </div>
  )
}

function OutlinePane({ path }: { path: string }) {
  const headings = useVaultStore((s) => s.headingsByPath[path] ?? [])

  if (headings.length === 0) {
    return (
      <div style={{ padding: '14px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
        This note has no headings.
      </div>
    )
  }

  return (
    <div className="pane-list">
      {headings.map((heading, i) => (
        <button
          key={`${heading.anchor}-${i}`}
          className={`outline-item outline-item--${heading.level}`}
          onClick={() => {
            // Jump to the heading by opening the note and scrolling to it.
            useVaultStore.getState().openTab(path)
            window.dispatchEvent(
              new CustomEvent('slate:goto-heading', { detail: heading.anchor })
            )
          }}
        >
          {heading.text}
        </button>
      ))}
    </div>
  )
}

/** Wrap occurrences of the title in <mark> for the backlink context lines. */
function highlightTitle(context: string, title: string) {
  if (!title) return context
  const index = context.toLowerCase().indexOf(title.toLowerCase())
  if (index === -1) return context
  return (
    <>
      {context.slice(0, index)}
      <mark>{context.slice(index, index + title.length)}</mark>
      {context.slice(index + title.length)}
    </>
  )
}

/** Small hook that loads unlinked mentions when the pane is expanded. */
function useEffectUnlinked(
  path: string,
  enabled: boolean,
  set: (value: { path: string; context: string; line: number }[]) => void
) {
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void window.slate.links
      .unlinkedMentions(path)
      .then((result) => {
        if (!cancelled) set(result)
      })
      .catch(() => {
        if (!cancelled) set([])
      })
    return () => {
      cancelled = true
    }
  }, [path, enabled, set])
}
