import { useState } from 'react'
import { useVaultStore } from '../store/useVaultStore.js'
import type { TreeNode } from '../../shared/types.js'
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconPencil,
  IconPlus,
  IconTrash,
} from './icons.js'
import { createNewNote, deletePath, renameNote } from '../lib/actions.js'

/** The file explorer sidebar. */
export function FileExplorer() {
  const tree = useVaultStore((s) => s.tree)
  const activeTab = useVaultStore((s) => s.activeTab)
  const openTab = useVaultStore((s) => s.openTab)
  const setRenamingPath = useVaultStore((s) => s.setRenamingPath)
  const renamingPath = useVaultStore((s) => s.renamingPath)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')

  const toggleFolder = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const handleRename = async (from: string, to: string) => {
    setRenamingPath(null)
    if (!to || to === from) return
    const target = from.includes('/')
      ? `${from.slice(0, from.lastIndexOf('/'))}/${to}`
      : to
    await renameNote(from, target)
  }

  const filterTree = (nodes: TreeNode[]): TreeNode[] => {
    if (!filter.trim()) return nodes
    const needle = filter.toLowerCase()
    const match = (node: TreeNode): boolean => {
      if (node.name.toLowerCase().includes(needle)) return true
      return node.children ? node.children.some(match) : false
    }
    return nodes.filter(match)
  }

  const visible = filterTree(tree)

  return (
    <aside className="sidebar sidebar--left" style={{ width: 260 }}>
      <div className="sidebar__header">
        <span>Files</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            className="tree__action"
            title="New note"
            onClick={() => void createNewNote()}
          >
            <IconPlus size={13} />
          </button>
        </div>
      </div>

      <div style={{ padding: '6px 10px' }}>
        <input
          className="input"
          placeholder="Filter files…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="sidebar__body">
        <div className="tree">
          {visible.length === 0 ? (
            <div style={{ padding: '12px 10px', color: 'var(--text-muted)', fontSize: 12.5 }}>
              {filter ? 'No matching files.' : 'This vault is empty.'}
            </div>
          ) : (
            visible.map((node) => (
              <TreeItem
                key={node.path}
                node={node}
                depth={0}
                expanded={expanded}
                activeTab={activeTab}
                renamingPath={renamingPath}
                onToggle={toggleFolder}
                onOpen={openTab}
                onRename={handleRename}
                onStartRename={setRenamingPath}
                onDelete={deletePath}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  )
}

interface ItemProps {
  node: TreeNode
  depth: number
  expanded: Set<string>
  activeTab: string | null
  renamingPath: string | null
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  onRename: (from: string, to: string) => void
  onStartRename: (path: string | null) => void
  onDelete: (path: string) => void
}

function TreeItem({
  node,
  depth,
  expanded,
  activeTab,
  renamingPath,
  onToggle,
  onOpen,
  onRename,
  onStartRename,
  onDelete,
}: ItemProps) {
  const isOpen = expanded.has(node.path)
  const isRenaming = renamingPath === node.path
  const isActive = activeTab === node.path

  return (
    <>
      <div
        className={`tree__item ${node.isFolder ? 'is-folder' : ''} ${isActive ? 'is-active' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => (node.isFolder ? onToggle(node.path) : onOpen(node.path))}
      >
        {node.isFolder ? (
          <span className={`tree__twisty ${isOpen ? 'is-open' : ''}`}>
            <IconChevronRight size={11} />
          </span>
        ) : (
          <span className="tree__twisty" />
        )}

        <span className="tree__icon">
          {node.isFolder ? (
            isOpen ? (
              <IconFolderOpen size={13} />
            ) : (
              <IconFolder size={13} />
            )
          ) : (
            <IconFile size={13} />
          )}
        </span>

        {isRenaming ? (
          <input
            className="tree__name-input"
            defaultValue={node.name}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => void onRename(node.path, e.target.value.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void onRename(node.path, e.currentTarget.value.trim())
              } else if (e.key === 'Escape') {
                onStartRename(null)
              }
            }}
          />
        ) : (
          <span className="tree__name">{node.name}</span>
        )}

        {!isRenaming && (
          <span className="tree__actions" onClick={(e) => e.stopPropagation()}>
            {!node.isFolder && (
              <button
                className="tree__action"
                title="Rename"
                onClick={() => onStartRename(node.path)}
              >
                <IconPencil size={12} />
              </button>
            )}
            <button
              className="tree__action"
              title="Delete"
              onClick={() => void onDelete(node.path)}
            >
              <IconTrash size={12} />
            </button>
          </span>
        )}
      </div>

      {node.isFolder &&
        isOpen &&
        node.children?.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            activeTab={activeTab}
            renamingPath={renamingPath}
            onToggle={onToggle}
            onOpen={onOpen}
            onRename={onRename}
            onStartRename={onStartRename}
            onDelete={onDelete}
          />
        ))}
    </>
  )
}
