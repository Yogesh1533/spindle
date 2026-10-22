import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  IconBacklinks,
  IconCentre,
  IconFilter,
  IconFit,
  IconGraph,
  IconOutgoing,
  IconPin,
  IconRefresh,
  IconSearch,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from './icons.js'

interface GraphNode extends SimulationNodeDatum {
  id: string
  path: string
  title: string
  tags: string[]
  /** Total link count, used for sizing. */
  degree: number
  /** Links pointing at this note. */
  inDegree: number
  /** Links leaving this note. */
  outDegree: number
  /** True for a placeholder standing in for a note that does not exist yet. */
  unresolved?: boolean
  /** True when the user has dragged the node and it now stays where it was put. */
  pinned?: boolean
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

const MIN_ZOOM = 0.15
const MAX_ZOOM = 4

/**
 * The graph view: a force-directed map of notes and the links between them.
 *
 * The layout is driven by our own timer rather than by d3's, because d3 uses
 * requestAnimationFrame — which Chromium stops firing in a window that is not
 * in front. With d3 driving the clock the graph would silently never lay
 * itself out, so we step the simulation ourselves.
 */
export function GraphView() {
  const notes = useVaultStore((s) => s.notes)
  const linksByPath = useVaultStore((s) => s.linksByPath)
  const backlinksByPath = useVaultStore((s) => s.backlinksByPath)
  const activeTab = useVaultStore((s) => s.activeTab)
  const setGraphOpen = useVaultStore((s) => s.setGraphOpen)
  const openTab = useVaultStore((s) => s.openTab)

  const [localDepth, setLocalDepth] = useState(0)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState<string | null>(null)
  const [showUnresolved, setShowUnresolved] = useState(false)
  const [search, setSearch] = useState('')
  const [alwaysLabels, setAlwaysLabels] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [tick, setTick] = useState(0)

  const svgRef = useRef<SVGSVGElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const simulationRef = useRef<Simulation<GraphNode, GraphEdge> | null>(null)
  /** Starts (or re-heats) the simulation's tick loop. */
  const driveRef = useRef<((reheat?: boolean) => void) | null>(null)
  /** True once the graph has been fitted to the screen, so it happens once. */
  const hasFitted = useRef(false)
  const fitRef = useRef<() => void>(() => {})
  const transformRef = useRef(transform)
  transformRef.current = transform

  // ---- Who links to whom ----
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>()
    const add = (from: string, to: string) => {
      let set = map.get(from)
      if (!set) {
        set = new Set()
        map.set(from, set)
      }
      set.add(to)
    }
    for (const [from, links] of Object.entries(linksByPath)) {
      for (const link of links) {
        if (!link.resolvedPath) continue
        add(from, link.resolvedPath)
        add(link.resolvedPath, from)
      }
    }
    return map
  }, [linksByPath])

  // ---- Build the graph data ----
  const { nodes: graphNodes, edges: graphEdges } = useMemo(() => {
    let candidatePaths = notes.map((n) => n.path)

    // The local graph: the current note plus everything within N hops.
    if (localDepth > 0 && activeTab) {
      const seen = new Set<string>([activeTab])
      let frontier = [activeTab]
      for (let d = 0; d < localDepth; d++) {
        const next: string[] = []
        for (const path of frontier) {
          for (const neighbour of adjacency.get(path) ?? []) {
            if (seen.has(neighbour)) continue
            seen.add(neighbour)
            next.push(neighbour)
          }
        }
        frontier = next
      }
      candidatePaths = [...seen]
    }

    if (tagFilter) {
      candidatePaths = candidatePaths.filter((p) =>
        notes.find((n) => n.path === p)?.tags.includes(tagFilter)
      )
    }

    if (folderFilter) {
      candidatePaths = candidatePaths.filter(
        (p) => p === folderFilter || p.startsWith(folderFilter + '/')
      )
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
        inDegree: 0,
        outDegree: 0,
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

    // Count the links, so nodes can be sized and coloured by how connected
    // they are.
    for (const edge of edgeList) {
      const s = typeof edge.source === 'string' ? edge.source : edge.source.id
      const t = typeof edge.target === 'string' ? edge.target : edge.target.id
      const source = nodeList.find((n) => n.id === s)
      const target = nodeList.find((n) => n.id === t)
      if (source) {
        source.degree++
        source.outDegree++
      }
      if (target) {
        target.degree++
        target.inDegree++
      }
    }

    // Unresolved links get a placeholder node, so you can see what is still
    // missing from the vault.
    if (showUnresolved) {
      const missing = new Map<string, number>()
      for (const [from, links] of Object.entries(linksByPath)) {
        if (!visible.has(from)) continue
        for (const link of links) {
          if (link.resolvedPath) continue
          missing.set(link.target, (missing.get(link.target) ?? 0) + 1)
        }
      }
      for (const [target, count] of missing) {
        nodeList.push({
          id: `unresolved:${target}`,
          path: target,
          title: target,
          tags: [],
          degree: count,
          inDegree: count,
          outDegree: 0,
          unresolved: true,
        })
      }
    }

    return { nodes: nodeList, edges: edgeList }
  }, [notes, linksByPath, adjacency, activeTab, localDepth, tagFilter, folderFilter, showUnresolved])

  // Search highlights matching notes rather than hiding the rest, so the
  // context around a match stays visible.
  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return null
    const set = new Set<string>()
    for (const note of notes) {
      if (note.title.toLowerCase().includes(needle)) set.add(note.path)
      else if (note.path.toLowerCase().includes(needle)) set.add(note.path)
    }
    return set
  }, [notes, search])

  // ---- Run the simulation ----
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    // Carry the positions over, so changing a filter does not throw the
    // layout away and start again from scratch.
    const previous = new Map(nodesRef.current.map((n) => [n.id, n]))

    const nodes: GraphNode[] = graphNodes.map((n) => {
      const old = previous.get(n.id)
      return {
        ...n,
        x: old?.x,
        y: old?.y,
        vx: old?.vx,
        vy: old?.vy,
        fx: old?.fx,
        fy: old?.fy,
        pinned: old?.pinned,
      }
    })
    const edges: GraphEdge[] = graphEdges.map((e) => ({ ...e }))

    nodesRef.current = nodes
    edgesRef.current = edges
    // Paint the nodes straight away; the effect runs after the first render,
    // which would otherwise show an empty graph.
    setTick((t) => t + 1)

    const width = svg.clientWidth || 800
    const height = svg.clientHeight || 600

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
      // We step the simulation ourselves — see the note at the top.
      .stop()

    simulationRef.current = simulation

    let running = false
    let timer = 0

    const loop = () => {
      if (!running) return
      simulation.tick()
      setTick((t) => t + 1)
      if (simulation.alpha() > 0.002) {
        timer = window.setTimeout(loop, 16)
      } else {
        running = false
        // The layout has settled: fit it on screen the first time round.
        if (!hasFitted.current && nodes.length) {
          hasFitted.current = true
          fitRef.current()
        }
      }
    }

    const drive = (reheat = false) => {
      if (reheat) simulation.alpha(0.6)
      if (running) return
      running = true
      timer = window.setTimeout(loop, 16)
    }

    driveRef.current = drive
    drive()

    return () => {
      running = false
      window.clearTimeout(timer)
      driveRef.current = null
      simulation.stop()
      simulationRef.current = null
    }
  }, [graphNodes, graphEdges])

  // ---- View helpers ----
  const fitView = useCallback(() => {
    const nodes = nodesRef.current.filter((n) => n.x != null && n.y != null)
    if (!nodes.length) return
    const rect = svgRef.current?.getBoundingClientRect()
    const width = rect?.width || 800
    const height = rect?.height || 600
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      minX = Math.min(minX, node.x as number)
      maxX = Math.max(maxX, node.x as number)
      minY = Math.min(minY, node.y as number)
      maxY = Math.max(maxY, node.y as number)
    }
    // Leave room for the toolbar at the top and the legend at the bottom.
    const padX = 70
    const padTop = 90
    const padBottom = 70
    const k = Math.min(
      MAX_ZOOM,
      Math.max(
        MIN_ZOOM,
        Math.min(
          (width - padX * 2) / Math.max(maxX - minX, 1),
          (height - padTop - padBottom) / Math.max(maxY - minY, 1)
        )
      )
    )
    setTransform({
      k,
      x: width / 2 - ((minX + maxX) / 2) * k,
      y: padTop + (height - padTop - padBottom) / 2 - ((minY + maxY) / 2) * k,
    })
  }, [])

  fitRef.current = fitView

  const centreOn = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id)
    if (!node || node.x == null || node.y == null) return
    const rect = svgRef.current?.getBoundingClientRect()
    const width = rect?.width || 800
    const height = rect?.height || 600
    const t = transformRef.current
    setTransform({ ...t, x: width / 2 - node.x * t.k, y: height / 2 - node.y * t.k })
  }, [])

  const zoomBy = useCallback((factor: number) => {
    setTransform((t) => ({
      ...t,
      k: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor)),
    }))
  }, [])

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 })
    driveRef.current?.(true)
  }, [])

  const unpinAll = useCallback(() => {
    for (const node of nodesRef.current) {
      node.fx = null
      node.fy = null
      node.pinned = false
    }
    driveRef.current?.(true)
    setTick((t) => t + 1)
  }, [])

  // Fit the graph on screen the first time it is opened, once the layout has
  // had a moment to settle.

  // ---- Pointer handling: pan, zoom and drag ----
  const dragState = useRef<{
    mode: 'none' | 'pan' | 'node'
    id: string
    moved: boolean
    startX: number
    startY: number
    startTransform: { x: number; y: number; k: number }
  }>({ mode: 'none', id: '', moved: false, startX: 0, startY: 0, startTransform: { x: 0, y: 0, k: 1 } })

  /** Set when a drag ends, so the click that follows does not open a note. */
  const draggedRef = useRef(false)
  /** The pending "open this note" click, cancelled by a double click. */
  const clickTimer = useRef<number | null>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element
      const nodeEl = target.closest<SVGGElement>('.graph-node')
      try {
        svg.setPointerCapture(event.pointerId)
      } catch {
        // The pointer may already be gone; nothing to capture.
      }

      if (nodeEl) {
        const id = nodeEl.dataset.id ?? ''
        const node = nodesRef.current.find((n) => n.id === id)
        if (!node) return
        dragState.current = {
          mode: 'node',
          id,
          moved: false,
          startX: event.clientX,
          startY: event.clientY,
          startTransform: transformRef.current,
        }
        // Hold it still while it is being dragged.
        node.fx = node.x ?? 0
        node.fy = node.y ?? 0
        simulationRef.current?.alphaTarget(0.3)
        driveRef.current?.()
        return
      }

      dragState.current = {
        mode: 'pan',
        id: '',
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        startTransform: transformRef.current,
      }
      svg.classList.add('is-panning')
    }

    const onPointerMove = (event: PointerEvent) => {
      const state = dragState.current
      if (state.mode === 'none') return
      const dx = event.clientX - state.startX
      const dy = event.clientY - state.startY
      if (!state.moved && Math.hypot(dx, dy) < 4) return
      state.moved = true

      if (state.mode === 'pan') {
        setTransform({
          ...state.startTransform,
          x: state.startTransform.x + dx,
          y: state.startTransform.y + dy,
        })
        return
      }

      const node = nodesRef.current.find((n) => n.id === state.id)
      if (!node) return
      const t = transformRef.current
      const rect = svg.getBoundingClientRect()
      node.fx = (event.clientX - rect.left - t.x) / t.k
      node.fy = (event.clientY - rect.top - t.y) / t.k
      node.pinned = true
      draggedRef.current = true
      setTick((t) => t + 1)
    }

    const onPointerUp = (event: PointerEvent) => {
      const state = dragState.current
      if (state.mode === 'node') {
        const node = nodesRef.current.find((n) => n.id === state.id)
        if (node && state.moved) {
          // Left where the user dropped it.
          node.pinned = true
        }
        simulationRef.current?.alphaTarget(0)
        driveRef.current?.()
      }
      dragState.current = {
        mode: 'none',
        id: '',
        moved: false,
        startX: 0,
        startY: 0,
        startTransform: { x: 0, y: 0, k: 1 },
      }
      svg.classList.remove('is-panning')
      try {
        svg.releasePointerCapture(event.pointerId)
      } catch {
        // Nothing captured.
      }
    }

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.12 : 0.89
      setTransform((t) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.k * factor))
        const ratio = k / t.k
        // Keep whatever is under the pointer under the pointer.
        return { k, x: px - (px - t.x) * ratio, y: py - (py - t.y) * ratio }
      })
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
  }, [])

  // ---- Keyboard ----
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          !!target.closest?.('.cm-editor'))

      if (typing) {
        if (event.key === 'Escape') target.blur()
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault()
        fitView()
        return
      }
      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault()
        setLocalDepth((d) => (d > 0 ? 0 : 1))
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSelected(null)
        setSearch('')
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'Tab') {
        event.preventDefault()
        const ids = graphNodes.map((n) => n.id)
        if (!ids.length) return
        const at = selected ? ids.indexOf(selected) : -1
        const next = event.key === 'Tab' && event.shiftKey ? at - 1 : at + 1
        setSelected(ids[(next + ids.length) % ids.length])
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        const ids = graphNodes.map((n) => n.id)
        if (!ids.length) return
        const at = selected ? ids.indexOf(selected) : 0
        setSelected(ids[(at - 1 + ids.length) % ids.length])
        return
      }
      if (event.key === 'Enter' && selected) {
        event.preventDefault()
        openTab(selected)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [graphNodes, selected, fitView, openTab])

  // Take the focus off the editor, so the graph's own keys are the ones that
  // arrive while it is open.
  useEffect(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  }, [])

  // ---- Derived state for the render ----
  const focusId = hovered ?? selected
  const neighbours = useMemo(() => {
    if (!focusId) return new Set<string>()
    const set = new Set<string>([focusId])
    for (const edge of edgesRef.current) {
      const s = typeof edge.source === 'string' ? edge.source : edge.source.id
      const t = typeof edge.target === 'string' ? edge.target : edge.target.id
      if (s === focusId) set.add(t)
      if (t === focusId) set.add(s)
    }
    return set
  }, [focusId, tick])

  const tags = useVaultStore((s) => s.tags)
  const folders = useMemo(() => {
    const set = new Set<string>()
    for (const note of notes) {
      if (note.folder) set.add(note.folder)
    }
    return [...set].sort()
  }, [notes])

  const selectedNote = selected ? notes.find((n) => n.path === selected) : null
  const selectedOutgoing = selected
    ? (linksByPath[selected] ?? []).filter((l) => l.resolvedPath)
    : []
  const selectedBacklinks = selected
    ? (backlinksByPath[selected] ?? []).filter((b) => !b.isUnlinked)
    : []
  const selectedNode = selected ? nodesRef.current.find((n) => n.id === selected) : null
  const pinnedCount = nodesRef.current.filter((n) => n.pinned).length

  /** Open a note, unless the click turns out to be a double click. */
  const openFromGraph = (path: string) => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      openTab(path)
    }, 200)
  }

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <input
          ref={searchRef}
          className="input"
          style={{ width: 190 }}
          placeholder="Highlight notes…  ( / )"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className={`button ${localDepth > 0 ? 'button--primary' : ''}`}
          onClick={() => setLocalDepth((d) => (d > 0 ? 0 : 1))}
          title="Show only the current note and its direct links (L)"
        >
          Local graph
        </button>

        <select
          className="input"
          style={{ width: 112 }}
          value={localDepth > 0 ? String(localDepth) : '0'}
          onChange={(e) => setLocalDepth(Number(e.target.value))}
          title="How many links away to include"
        >
          <option value="0">Whole vault</option>
          <option value="1">1 hop</option>
          <option value="2">2 hops</option>
          <option value="3">3 hops</option>
        </select>

        <select
          className="input"
          style={{ width: 140 }}
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
          style={{ width: 140 }}
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

        <button
          className={`button ${alwaysLabels ? 'button--primary' : ''}`}
          onClick={() => setAlwaysLabels((v) => !v)}
          title="Always show the note names, even when zoomed out"
        >
          Labels
        </button>

        {pinnedCount > 0 && (
          <button className="button" onClick={unpinAll} title="Let the pinned notes move again">
            <IconPin size={12} />
            Unpin {pinnedCount}
          </button>
        )}

        <div style={{ flex: 1 }} />

        <button className="button" onClick={() => setGraphOpen(false)}>
          <IconX size={13} />
          Close
        </button>
      </div>

      <svg ref={svgRef} className="graph-svg">
        <defs>
          <marker
            id="spindle-arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className="graph-arrow" />
          </marker>
          <marker
            id="spindle-arrow-out"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className="graph-arrow--out" />
          </marker>
          <marker
            id="spindle-arrow-in"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className="graph-arrow--in" />
          </marker>
        </defs>

        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {edgesRef.current.map((edge, i) => {
            const s = edge.source as GraphNode
            const t = edge.target as GraphNode
            if (!s || !t) return null
            const touching = focusId !== null && (s.id === focusId || t.id === focusId)
            const outgoing = focusId !== null && s.id === focusId
            const incoming = focusId !== null && t.id === focusId
            return (
              <line
                key={i}
                className={`graph-edge ${touching ? 'graph-edge--active' : ''} ${
                  outgoing ? 'graph-edge--out' : ''
                } ${incoming ? 'graph-edge--in' : ''}`}
                x1={s.x ?? 0}
                y1={s.y ?? 0}
                x2={t.x ?? 0}
                y2={t.y ?? 0}
                opacity={focusId && !touching ? 0.15 : 1}
                markerEnd={
                  outgoing
                    ? 'url(#spindle-arrow-out)'
                    : incoming
                      ? 'url(#spindle-arrow-in)'
                      : touching
                        ? 'url(#spindle-arrow)'
                        : undefined
                }
              />
            )
          })}

          {nodesRef.current.map((node) => {
            const radius = 5 + Math.min(node.degree, 12) * 0.9
            const dimmed = (focusId !== null && !neighbours.has(node.id)) ||
              (matches !== null && !matches.has(node.path))
            const isActive = node.path === activeTab
            const isSelected = node.id === selected
            const isMatch = matches !== null && matches.has(node.path)
            const color = node.unresolved
              ? 'var(--link-unresolved)'
              : node.tags.length > 0
                ? 'var(--graph-tag)'
                : 'var(--graph-node)'

            return (
              <g
                key={node.id}
                data-id={node.id}
                className={`graph-node ${node.pinned ? 'graph-node--pinned' : ''} ${
                  isSelected ? 'graph-node--selected' : ''
                } ${isMatch ? 'graph-node--match' : ''}`}
                opacity={dimmed ? 0.25 : 1}
                onClick={() => {
                  if (draggedRef.current) {
                    draggedRef.current = false
                    return
                  }
                  if (node.unresolved) return
                  openFromGraph(node.path)
                }}
                onDoubleClick={(event) => {
                  // A double click means "inspect", not "open".
                  event.preventDefault()
                  if (clickTimer.current) {
                    window.clearTimeout(clickTimer.current)
                    clickTimer.current = null
                  }
                  draggedRef.current = false
                  setSelected((current) => (current === node.id ? null : node.id))
                }}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: node.unresolved ? 'default' : 'pointer' }}
              >
                <circle
                  cx={node.x ?? 0}
                  cy={node.y ?? 0}
                  r={radius}
                  fill={color}
                  stroke={
                    isActive
                      ? 'var(--graph-node-active)'
                      : isSelected
                        ? 'var(--accent)'
                        : 'none'
                  }
                  strokeWidth={isActive || isSelected ? 3 : 0}
                />
                {(alwaysLabels || transform.k > 0.65) && (
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

      {selectedNote && (
        <div className="graph-panel">
          <div className="graph-panel__head">
            <IconGraph size={13} />
            <span className="graph-panel__title">{selectedNote.title}</span>
            <button
              className="graph-panel__close"
              onClick={() => setSelected(null)}
              title="Close the inspector"
            >
              <IconX size={12} />
            </button>
          </div>
          <div className="graph-panel__path">{selectedNote.path}</div>

          {selectedNote.tags.length > 0 && (
            <div className="graph-panel__tags">
              {selectedNote.tags.map((tag) => (
                <button
                  key={tag}
                  className="graph-panel__tag"
                  onClick={() => setTagFilter(tag)}
                  title={`Show only notes tagged #${tag}`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="graph-panel__actions">
            <button className="button" onClick={() => openTab(selectedNote.path)}>
              Open note
            </button>
            <button className="button" onClick={() => centreOn(selectedNote.path)}>
              <IconCentre size={12} />
              Centre
            </button>
            {selectedNode?.pinned && (
              <button
                className="button"
                onClick={() => {
                  const node = nodesRef.current.find((n) => n.id === selectedNote.path)
                  if (!node) return
                  node.fx = null
                  node.fy = null
                  node.pinned = false
                  driveRef.current?.(true)
                  setTick((t) => t + 1)
                }}
              >
                <IconPin size={12} />
                Unpin
              </button>
            )}
          </div>

          <div className="graph-panel__section">
            <div className="graph-panel__heading">
              <IconOutgoing size={12} />
              Links out ({selectedOutgoing.length})
            </div>
            {selectedOutgoing.length === 0 ? (
              <div className="graph-panel__empty">No outgoing links</div>
            ) : (
              selectedOutgoing.map((link, i) => (
                <button
                  key={`${link.rawText}-${i}`}
                  className="graph-panel__link"
                  onClick={() => openTab(link.resolvedPath as string)}
                >
                  {link.alias ?? link.target}
                </button>
              ))
            )}
          </div>

          <div className="graph-panel__section">
            <div className="graph-panel__heading">
              <IconBacklinks size={12} />
              Linked mentions ({selectedBacklinks.length})
            </div>
            {selectedBacklinks.length === 0 ? (
              <div className="graph-panel__empty">Nothing links here yet</div>
            ) : (
              selectedBacklinks.map((backlink, i) => (
                <button
                  key={`${backlink.sourcePath}-${i}`}
                  className="graph-panel__link"
                  onClick={() => openTab(backlink.sourcePath)}
                >
                  {backlink.sourceTitle}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="graph-controls">
        <button className="button" onClick={() => zoomBy(1.2)} title="Zoom in">
          <IconZoomIn size={14} />
        </button>
        <button className="button" onClick={() => zoomBy(0.83)} title="Zoom out">
          <IconZoomOut size={14} />
        </button>
        <button className="button" onClick={fitView} title="Fit the whole graph on screen (F)">
          <IconFit size={14} />
        </button>
        <button className="button" onClick={resetView} title="Reset the view">
          <IconRefresh size={14} />
        </button>
      </div>

      <div className="graph-legend">
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--graph-node)' }} />
          <span>Note ({graphNodes.length})</span>
        </div>
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--graph-tag)' }} />
          <span>Tagged</span>
        </div>
        <div className="graph-legend__row">
          <span className="graph-legend__dot" style={{ background: 'var(--link-unresolved)' }} />
          <span>Unresolved</span>
        </div>
        <div className="graph-legend__row">
          <IconSearch size={11} />
          <span>{graphEdges.length} links</span>
        </div>
        <div className="graph-legend__row" style={{ opacity: 0.7 }}>
          <IconFilter size={11} />
          <span>Drag to pan, scroll to zoom, drag a note to move it</span>
        </div>
        <div className="graph-legend__row" style={{ opacity: 0.7 }}>
          <span>Double-click a note to inspect it</span>
        </div>
      </div>
    </div>
  )
}
