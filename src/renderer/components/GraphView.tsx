import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { useVaultStore } from '../store/useVaultStore.js'
import { IconFilter, IconRefresh, IconX, IconZoomIn, IconZoomOut } from './icons.js'

interface GraphNode extends SimulationNodeDatum {
  id: string
  path: string
  title: string
  tags: string[]
  /** Link count, used for sizing. */
  degree: number
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

/**
 * The graph view: a force-directed map of notes and the links between them.
 * Supports zoom, pan, clicking to open, a local graph of the current note and
 * filtering by tag or folder.
 */
export function GraphView() {
  const notes = useVaultStore((s) => s.notes)
  const linksByPath = useVaultStore((s) => s.linksByPath)
  const activeTab = useVaultStore((s) => s.activeTab)
  const setGraphOpen = useVaultStore((s) => s.setGraphOpen)
  const openTab = useVaultStore((s) => s.openTab)

  const [localGraph, setLocalGraph] = useState(false)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [showUnresolved, setShowUnresolved] = useState(false)
  const [search, setSearch] = useState('')

  const svgRef = useRef<SVGSVGElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [hovered, setHovered] = useState<string | null>(null)
  const simulationRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const [tick, setTick] = useState(0)

  // ---- Build the graph data ----
  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    const allPaths = notes.map((n) => n.path)

    // Link targets that do not exist yet (unresolved links).
    const unresolved = new Map<string, string[]>()
    for (const [from, links] of Object.entries(linksByPath)) {
      for (const link of links) {
        if (link.resolvedPath) continue
        if (!showUnresolved) continue
        const list = unresolved.get(link.target) ?? []
        list.push(from)
        unresolved.set(link.target, list)
      }
    }

    let candidatePaths = allPaths

    if (localGraph && activeTab) {
      // Keep the active note and everything one hop away.
      const neighbours = new Set<string>([activeTab])
      for (const link of linksByPath[activeTab] ?? []) {
        if (link.resolvedPath) neighbours.add(link.resolvedPath)
      }
      for (const [from, links] of Object.entries(linksByPath)) {
        for (const link of links) {
          if (link.resolvedPath === activeTab) neighbours.add(from)
        }
      }
      candidatePaths = [...neighbours]
    }

    if (tagFilter) {
      candidatePaths = candidatePaths.filter((p) => {
        const note = notes.find((n) => n.path === p)
        return note?.tags.includes(tagFilter)
      })
    }

    if (folderFilter) {
      candidatePaths = candidatePaths.filter(
        (p) => p === folderFilter || p.startsWith(folderFilter + '/')
      )
    }

    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      candidatePaths = candidatePaths.filter((p) => {
        const note = notes.find((n) => n.path === p)
        return note ? note.title.toLowerCase().includes(needle) : false
      })
    }

    const visible = new Set(candidatePaths)

    const nodeList: GraphNode[] = candidatePaths.map((path) => {
      const note = notes.find((n) => n.path === path)
      return {
        id: path,
        path,
        title: note?.title ?? path,
        tags: note?.tags ?? [],
        degree: 0,
      }
    })

    const edgeList: GraphEdge[] = []
    for (const [from, links] of Object.entries(linksByPath)) {
      if (!visible.has(from)) continue
      for (const link of links) {
        if (!link.resolvedPath) continue
        if (!visible.has(link.resolvedPath)) continue
        edgeList.push({ source: from, target: link.resolvedPath })
      }
    }

    // Count degrees for sizing.
    for (const edge of edgeList) {
      const s = typeof edge.source === 'string' ? edge.source : edge.source.id
      const t = typeof edge.target === 'string' ? edge.target : edge.target.id
      const source = nodeList.find((n) => n.id === s)
      const target = nodeList.find((n) => n.id === t)
      if (source) source.degree++
      if (target) target.degree++
    }

    // Unresolved links get a placeholder node.
    if (showUnresolved) {
      for (const [target, sources] of unresolved) {
        if (!visible.has(target)) {
          nodeList.push({
            id: `unresolved:${target}`,
            path: target,
            title: target,
            tags: [],
            degree: sources.length,
            unresolved: true,
          } as GraphNode)
        }
      }
    }

    return { nodes: nodeList, edges: edgeList }
  }, [notes, linksByPath, activeTab, localGraph, tagFilter, folderFilter, showUnresolved, search])

  // ---- Run the simulation ----
  useEffect(() => {
    if (!svgRef.current) return

    const nodes = graphNodes.map((n) => ({ ...n }))
    const edges = graphEdges.map((e) => ({ ...e }))
    nodesRef.current = nodes
    edgesRef.current = edges

    const width = svgRef.current.clientWidth || 800
    const height = svgRef.current.clientHeight || 600

    const simulation = forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        forceLink<GraphNode, GraphEdge>(edges)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4)
      )
      .force('charge', forceManyBody().strength(-260))
      .force('center', forceCenter(width / 2, height / 2))
      .force('collide', forceCollide<GraphNode>().radius((d) => 6 + d.degree * 1.4))
      .force('x', forceX(width / 2).strength(0.04))
      .force('y', forceY(height / 2).strength(0.04))

    simulation.on('tick', () => setTick((t) => t + 1))
    simulationRef.current = simulation

    return () => {
      simulation.stop()
      simulationRef.current = null
    }
  }, [graphNodes, graphEdges])

  // ---- Pan and zoom ----
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    let dragging = false
    let startX = 0
    let startY = 0
    let startTransform = { x: 0, y: 0, k: 1 }

    const onPointerDown = (event: PointerEvent) => {
      if ((event.target as Element).closest('.graph-node')) return
      dragging = true
      startX = event.clientX
      startY = event.clientY
      startTransform = transform
      svg.setPointerCapture(event.pointerId)
      svg.classList.add('is-panning')
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      setTransform({
        ...startTransform,
        x: startTransform.x + (event.clientX - startX),
        y: startTransform.y + (event.clientY - startY),
      })
    }

    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      svg.releasePointerCapture(event.pointerId)
      svg.classList.remove('is-panning')
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const factor = event.deltaY < 0 ? 1.12 : 0.89
      setTransform((t) => ({ ...t, k: Math.min(4, Math.max(0.15, t.k * factor)) }))
    }

    svg.addEventListener('pointerdown', onPointerDown)
    svg.addEventListener('pointermove', onPointerMove)
    svg.addEventListener('pointerup', onPointerUp)
    svg.addEventListener('pointercancel', onPointerUp)
    svg.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      svg.removeEventListener('pointerdown', onPointerDown)
      svg.removeEventListener('pointermove', onPointerMove)
      svg.removeEventListener('pointerup', onPointerUp)
      svg.removeEventListener('pointercancel', onPointerUp)
      svg.removeEventListener('wheel', onWheel)
    }
  }, [transform])

  const zoomBy = (factor: number) =>
    setTransform((t) => ({ ...t, k: Math.min(4, Math.max(0.15, t.k * factor)) }))

  const resetView = () => {
    setTransform({ x: 0, y: 0, k: 1 })
    simulationRef.current?.alpha(0.6).restart()
  }

  const tags = useVaultStore((s) => s.tags)
  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const note of notes) {
      if (note.folder) set.add(note.folder)
    }
    return [...set].sort()
  }, [notes])

  const neighbours = useMemo(() => {
    if (!hovered) return new Set<string>()
    const set = new Set<string>([hovered])
    for (const edge of edgesRef.current) {
      const s = typeof edge.source === 'string' ? edge.source : edge.source.id
      const t = typeof edge.target === 'string' ? edge.target : edge.target.id
      if (s === hovered) set.add(t)
      if (t === hovered) set.add(s)
    }
    return set
  }, [hovered, tick])

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <input
          className="input"
          style={{ width: 200 }}
          placeholder="Filter notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className={`button ${localGraph ? 'button--primary' : ''}`}
          onClick={() => setLocalGraph((v) => !v)}
          title="Show only the current note and its direct links"
        >
          Local graph
        </button>

        <select
          className="input"
          style={{ width: 150 }}
          value={tagFilter ?? ''}
          onChange={(e) => setTagFilter(e.target.value || null)}
        >
          <option value="">All tags</option>
          {tags.map((tag) => (
            <option key={tag.name} value={tag.name}>
              #{tag.name} ({tag.count})
            </option>
          ))}
        </select>

        <select
          className="input"
          style={{ width: 150 }}
          value={folderFilter ?? ''}
          onChange={(e) => setFolderFilter(e.target.value || null)}
        >
          <option value="">All folders</option>
          {folders.map((folder) => (
            <option key={folder} value={folder}>
              {folder}
            </option>
          ))}
        </select>

        <button
          className={`button ${showUnresolved ? 'button--primary' : ''}`}
          onClick={() => setShowUnresolved((v) => !v)}
          title="Show links that point at notes that do not exist yet"
        >
          Unresolved
        </button>

        <div style={{ flex: 1 }} />

        <button className="button" onClick={() => setGraphOpen(false)}>
          <IconX size={13} />
          Close
        </button>
      </div>

      <svg ref={svgRef} className="graph-svg">
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {edgesRef.current.map((edge, i) => {
            const s = edge.source as GraphNode
            const t = edge.target as GraphNode
            if (!s || !t) return null
            const active = hovered !== null && (s.id === hovered || t.id === hovered)
            return (
              <line
                key={i}
                className={`graph-edge ${active ? 'graph-edge--active' : ''}`}
                x1={s.x ?? 0}
                y1={s.y ?? 0}
                x2={t.x ?? 0}
                y2={t.y ?? 0}
                opacity={hovered && !active ? 0.15 : 1}
              />
            )
          })}

          {nodesRef.current.map((node) => {
            const radius = 5 + Math.min(node.degree, 12) * 0.9
            const dimmed = hovered !== null && !neighbours.has(node.id)
            const isActive = node.path === activeTab
            const color = (node as GraphNode & { unresolved?: boolean }).unresolved
              ? 'var(--link-unresolved)'
              : node.tags.length > 0
                ? 'var(--graph-tag)'
                : 'var(--graph-node)'

            return (
              <g
                key={node.id}
                className="graph-node"
                opacity={dimmed ? 0.25 : 1}
                onClick={() => {
                  if ((node as GraphNode & { unresolved?: boolean }).unresolved) return
                  openTab(node.path)
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={node.x ?? 0}
                  cy={node.y ?? 0}
                  r={radius}
                  fill={color}
                  stroke={isActive ? 'var(--graph-node-active)' : 'none'}
                  strokeWidth={isActive ? 3 : 0}
                />
                {transform.k > 0.65 && (
                  <text
                    className="graph-node-label"
                    x={(node.x ?? 0) + radius + 4}
                    y={(node.y ?? 0) + 3}
                  >
                    {node.title}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="graph-controls">
        <button className="button" onClick={() => zoomBy(1.2)} title="Zoom in">
          <IconZoomIn size={14} />
        </button>
        <button className="button" onClick={() => zoomBy(0.83)} title="Zoom out">
          <IconZoomOut size={14} />
        </button>
        <button className="button" onClick={resetView} title="Reset view">
          <IconRefresh size={14} />
        </button>
      </div>

      <div className="graph-legend">
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--graph-node)' }} />
          <span>Note ({nodesRef.current.length})</span>
        </div>
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--graph-tag)' }} />
          <span>Tagged</span>
        </div>
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--link-unresolved)' }} />
          <span>Unresolved</span>
        </div>
        <div className="graph-legend__row" style={{ opacity: 0.7 }}>
          <IconFilter size={11} />
          <span>Drag to pan, scroll to zoom</span>
        </div>
      </div>
    </div>
  )
}
