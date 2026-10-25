/**
 * 5.3b · Đồ thị bộ não dạng cây thư mục (bản vẽ DoThiCay.dc.html): cây tỏa tròn, liên kết uốn theo nhánh.
 * Bấm trang để tô liên kết của nó, bấm thư mục để gộp hay mở nhánh.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { branchPath, buildTree, bundlePath, LEAF_R, type InNode, type TNode } from './tree-layout.js'

const COLOR: Record<string, string> = {
  note: '#5B8DEF',
  project: '#00B5A5',
  area: '#FFAA00',
  person: '#FF6700',
  memory: '#9259FE',
}
const short = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
/** Nhãn ở vòng ngoài, xoay theo hướng tỏa ra; nửa trái lật lại cho khỏi đọc ngược. */
const ringText = (angle: number, gap: number) => {
  const out = Math.cos(angle) >= 0
  const deg = (angle * 180) / Math.PI
  const x = (LEAF_R + gap) * Math.cos(angle)
  const y = (LEAF_R + gap) * Math.sin(angle)
  return {
    x,
    y,
    transform: `rotate(${out ? deg : deg + 180} ${x} ${y})`,
    textAnchor: out ? 'start' : 'end',
    dominantBaseline: 'middle',
  } as const
}

export function TreeGraph({
  t,
  nodes,
  edges,
  label,
  collapsed,
  onToggle,
  selected,
  onSelect,
  showLinks,
  beta,
  zoom,
  onZoom,
  resetKey,
  skip,
  folded,
}: {
  t: PageProps['t']
  nodes: readonly (InNode & { type: string })[]
  edges: readonly { a: number; b: number }[]
  label: (segment: string, key: string) => string
  collapsed: ReadonlySet<string>
  onToggle: (key: string) => void
  selected: number
  onSelect: (i: number) => void
  showLinks: boolean
  beta: number
  zoom: number
  onZoom: (z: number) => void
  resetKey: number
  skip: (n: InNode) => boolean
  folded: (key: string) => boolean
}) {
  const tree = useMemo(
    () => buildTree({ nodes, label, collapsed, skip, folded }),
    [nodes, label, collapsed, skip, folded],
  )
  const links = useMemo(() => {
    if (!showLinks) return []
    const seen = new Set<string>()
    const out: { d: string; hot: boolean }[] = []
    for (const e of edges) {
      const a = tree.shownOf[e.a]
      const b = tree.shownOf[e.b]
      if (!a || !b || a === b) continue
      const k = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
      const hot = e.a === selected || e.b === selected
      if (seen.has(k) && !hot) continue
      seen.add(k)
      out.push({ d: bundlePath(a, b, beta), hot })
    }
    return out.sort((x, y) => Number(x.hot) - Number(y.hot))
  }, [edges, tree, beta, selected, showLinks])
  const anyHot = links.some((l) => l.hot)
  const neighbors = useMemo(() => {
    const s = new Set<number>()
    for (const e of edges) {
      if (e.a === selected) s.add(e.b)
      if (e.b === selected) s.add(e.a)
    }
    return s
  }, [edges, selected])
  const pad = 150
  const span = (LEAF_R + pad) * 2
  const view = span / zoom

  // Kéo để dời cây, cuộn để phóng to (cây 2D: không xoay, nhãn luôn đọc được).
  const [pan, setPan] = useState({ x: 0, y: 0 })
  useEffect(() => setPan({ x: 0, y: 0 }), [resetKey])
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  const zoomRef = useRef({ zoom, onZoom })
  zoomRef.current = { zoom, onZoom }
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom: z, onZoom: set } = zoomRef.current
      set(z * Math.exp(-e.deltaY * 0.0015))
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [])
  const unit = () => view / (svg.current?.getBoundingClientRect().height || view)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < 4) return
    if (!d.moved) svg.current?.setPointerCapture(e.pointerId)
    d.moved = true
    const u = unit()
    setPan({ x: d.px - dx * u, y: d.py - dy * u })
  }
  const onPointerUp = () => {
    const moved = drag.current?.moved
    drag.current = null
    // Vừa kéo xong thì nuốt cú bấm theo sau, khỏi gộp nhầm thư mục hay đổi trang đang chọn.
    if (moved)
      svg.current?.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true })
  }

  const folderStroke = (n: TNode) =>
    n.depth === 1
      ? n.key === 'cong-ty'
        ? 'var(--a-ok)'
        : 'var(--a-accent)'
      : /(^|\/)wiki$/.test(n.key)
        ? 'var(--a-warn)'
        : 'var(--a-muted)'

  return (
    <svg
      ref={svg}
      className="ap-tree"
      viewBox={`${pan.x - view / 2} ${pan.y - view / 2 - 10} ${view} ${view}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (drag.current = null)}
      role="img"
      aria-label={t('gr.treeAlt', { n: nodes.length })}
    >
      <circle r={LEAF_R} className="ring" />
      <g className="te">
        {tree.all
          .filter((n) => n.parent)
          .map((n) => (
            <path key={`b${n.key}`} d={branchPath(n)} />
          ))}
      </g>
      <g>
        {links.map((l, i) => (
          <path key={`l${i}`} d={l.d} className={l.hot ? 'lk hot' : anyHot ? 'lk dim' : 'lk'} />
        ))}
      </g>
      {tree.all.map((n) => {
        if (n.depth === 0)
          return (
            <g key="root">
              <circle r={26} fill="var(--a-accent)" opacity={0.16} />
              <circle r={17} fill="var(--a-accent)" />
              <path d="M-6 -5h12M-6 0h12M-6 5h8" stroke="#fff" strokeWidth={2} strokeLinecap="round" />
            </g>
          )
        if (n.leaf === undefined) {
          const r = n.collapsed ? 11 : n.depth === 1 ? 9 : n.depth === 2 ? 6.5 : 5
          return (
            <g
              key={n.key}
              className="fd"
              role="button"
              tabIndex={0}
              aria-label={t(n.collapsed ? 'gr.expand' : 'gr.collapse', { name: n.label, n: n.count })}
              onClick={() => onToggle(n.key)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onToggle(n.key)}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={r}
                fill={n.collapsed ? 'var(--a-panel2)' : 'var(--a-bg)'}
                stroke={folderStroke(n)}
                strokeWidth={2.2}
                strokeDasharray={n.collapsed ? '3 3' : undefined}
              />
              {n.collapsed && (
                <text x={n.x} y={n.y + 4} textAnchor="middle" className="cnt">
                  {n.count}
                </text>
              )}
              {n.collapsed ? (
                <text {...ringText(n.angle, r + 6)} className="ll fold">
                  {short(n.label)}
                </text>
              ) : (
                <text x={n.x} y={n.y - r - 5} textAnchor="middle" className={n.depth === 1 ? 'lg1' : 'lg'}>
                  {short(n.label, 18)}
                </text>
              )}
            </g>
          )
        }
        const node = nodes[n.leaf]!
        const hot = n.leaf === selected
        const near = neighbors.has(n.leaf)
        return (
          <g
            key={n.key}
            className="pg"
            role="button"
            tabIndex={0}
            aria-label={n.label}
            aria-pressed={hot}
            onClick={() => onSelect(n.leaf!)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.leaf!)}
          >
            {hot && <circle cx={n.x} cy={n.y} r={10} fill="none" stroke="var(--a-ink)" strokeWidth={2} />}
            {node.type === 'session' ? (
              <circle
                cx={n.x}
                cy={n.y}
                r={4.6}
                fill="var(--a-bg)"
                stroke="var(--a-muted)"
                strokeWidth={1.8}
              />
            ) : (
              <circle cx={n.x} cy={n.y} r={5} fill={COLOR[node.type] ?? COLOR.note} />
            )}
            <text
              {...ringText(n.angle, 10)}
              className={hot ? 'll hot' : near ? 'll near' : anyHot ? 'll dim' : 'll'}
            >
              {short(n.label)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
