/**
 * 5.3c · Đồ thị bộ não dạng cây thư mục 3D kiểu cầu (bản vẽ DoThiCay3D.dc.html): Brain ở tâm, thư mục ở lớp trong,
 * trang trên mặt cầu; liên kết uốn theo nhánh. Kéo để xoay, cuộn để phóng to, bấm thư mục để gộp, bấm trang để
 * tô liên kết. Nhãn trang chỉ hiện ở phía trước, trang đang chọn và trang nối với nó. Tắt chuyển động thì không
 * tự xoay; ngoài khung nhìn thì ngừng vẽ.
 */
import { NODE_COLORS, depth, project, ZOOM_MAX, ZOOM_MIN, type Projected } from '@aris/ui-kit/react'
import { useEffect, useMemo, useRef } from 'react'
import type { PageProps } from '../page.js'
import { buildTree, bundlePoints, sphereLayout, type InNode, type TNode, type Vec3 } from './tree-layout.js'

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

export function TreeGraph3D(props: {
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
  const { nodes, edges, label, collapsed, skip, folded, beta, showLinks } = props
  const tree = useMemo(
    () => buildTree({ nodes, label, collapsed, skip, folded }),
    [nodes, label, collapsed, skip, folded],
  )
  const pos = useMemo(() => sphereLayout(tree), [tree])
  const links = useMemo(() => {
    if (!showLinks) return []
    const seen = new Set<string>()
    const out: { a: number; b: number; pts: Vec3[] }[] = []
    for (const e of edges) {
      const a = tree.shownOf[e.a]
      const b = tree.shownOf[e.b]
      if (!a || !b || a === b) continue
      const k = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ a: e.a, b: e.b, pts: bundlePoints(a, b, beta, pos) })
    }
    return out
  }, [edges, tree, pos, beta, showLinks])

  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef({ props, tree, pos, links })
  latest.current = { props, tree, pos, links }
  const view = useRef({ rotX: -0.32, rotY: 0.6 })
  useEffect(() => {
    view.current = { rotX: -0.32, rotY: 0.6 }
  }, [props.resetKey])

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const state = {
      hover: undefined as TNode | undefined,
      dragging: false,
      moved: 0,
      lx: 0,
      ly: 0,
      raf: 0,
      visible: true,
    }
    let colorsAt = -Infinity
    let dark = false
    let C = {
      ink: '#16171B',
      muted: '#5C616C',
      line: '#C9CCD3',
      accent: '#1D6FE0',
      panel: '#FFFFFF',
      bg: '#F6F5F2',
      ok: '#15803D',
      warn: '#B45309',
    }
    let proj = new Map<TNode, Projected>()

    const draw = (ts: number) => {
      const { props: p, tree: t, pos: P, links: L } = latest.current
      const w = cv.clientWidth
      const h = cv.clientHeight
      if (!w || !h) return
      const dpr = window.devicePixelRatio || 1
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr)
        cv.height = Math.round(h * dpr)
      }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (ts - colorsAt > 400 || reduced) {
        const s = getComputedStyle(cv)
        const v = (k: string, d: string) => s.getPropertyValue(k).trim() || d
        C = {
          ink: v('--a-ink', C.ink),
          muted: v('--a-muted', C.muted),
          line: v('--a-line', C.line),
          accent: v('--a-accent', C.accent),
          panel: v('--a-panel', C.panel),
          bg: v('--a-bg', C.bg),
          ok: v('--a-ok', C.ok),
          warn: v('--a-warn', C.warn),
        }
        dark = cv.closest('[data-ds-dark-theme]') !== null
        colorsAt = ts
      }
      if (!state.dragging && !state.hover && !reduced) view.current.rotY += 0.0016

      const bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.6)
      bg.addColorStop(0, dark ? 'rgba(90,165,255,0.09)' : 'rgba(29,111,224,0.05)')
      bg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      const v = {
        rotX: view.current.rotX,
        rotY: view.current.rotY,
        scale: Math.min(w, h) * 0.38 * p.zoom,
        w,
        h,
      }
      const pr = (q: Vec3) => project(q[0], q[1], q[2], v)
      proj = new Map(t.all.map((n) => [n, pr(P.get(n) ?? [0, 0, 0])]))
      const at = (n: TNode) => proj.get(n)!

      // Xích đạo của mặt cầu trang và của lớp thư mục làm mặt phẳng tham chiếu.
      for (const [radius, alpha] of [
        [1, 0.45],
        [0.62, 0.25],
      ] as const) {
        ctx.save()
        ctx.strokeStyle = C.line
        ctx.lineWidth = 1
        ctx.setLineDash([3, 7])
        ctx.globalAlpha = alpha
        ctx.beginPath()
        for (let k = 0; k <= 72; k++) {
          const a = (k / 72) * Math.PI * 2
          const q = pr([radius * Math.cos(a), 0, radius * Math.sin(a)])
          if (k === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        }
        ctx.stroke()
        ctx.restore()
      }

      const focus = state.hover?.leaf ?? p.selected
      const near = new Set<number>()
      for (const e of p.edges) {
        if (e.a === focus) near.add(e.b)
        if (e.b === focus) near.add(e.a)
      }

      // Cạnh cây.
      ctx.lineCap = 'round'
      for (const n of t.all) {
        if (!n.parent) continue
        const a = at(n.parent)
        const b = at(n)
        ctx.globalAlpha = 0.18 + 0.45 * depth((a.z + b.z) / 2)
        ctx.strokeStyle = C.muted
        ctx.lineWidth = (n.depth <= 2 ? 1.6 : 1) * ((a.p + b.p) / 2)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }

      // Liên kết, nóng vẽ sau cùng.
      const anyHot = focus >= 0
      const sorted = [...L].sort(
        (x, y) => Number(x.a === focus || x.b === focus) - Number(y.a === focus || y.b === focus),
      )
      for (const l of sorted) {
        const hot = l.a === focus || l.b === focus
        const q = l.pts.map(pr)
        const d = depth(q.reduce((s, x) => s + x.z, 0) / q.length)
        ctx.globalAlpha = hot ? 0.95 : anyHot ? 0.07 + 0.12 * d : 0.15 + 0.35 * d
        ctx.strokeStyle = C.accent
        ctx.lineWidth = hot ? 2.2 : 1.2
        ctx.beginPath()
        q.forEach((x, i) => (i ? ctx.lineTo(x.x, x.y) : ctx.moveTo(x.x, x.y)))
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Nút, xa vẽ trước; nhãn vẽ sau cùng.
      const labels: {
        n: TNode
        q: Projected
        d: number
        dy: number
        kind: 'big' | 'folder' | 'hot' | 'near' | 'page'
      }[] = []
      const folderStroke = (n: TNode) =>
        n.depth === 1 ? (n.key === 'cong-ty' ? C.ok : C.accent) : /(^|\/)wiki$/.test(n.key) ? C.warn : C.muted
      for (const n of [...t.all].sort((a, b) => at(a).z - at(b).z)) {
        const q = at(n)
        const d = depth(q.z)
        ctx.globalAlpha = 0.3 + 0.7 * d
        if (n === t.root) {
          ctx.globalAlpha = 0.18
          ctx.fillStyle = C.accent
          ctx.beginPath()
          ctx.arc(q.x, q.y, 26 * q.p, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.beginPath()
          ctx.arc(q.x, q.y, 17 * q.p, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.beginPath()
          for (const [y, len] of [
            [-5, 12],
            [0, 12],
            [5, 8],
          ] as const) {
            ctx.moveTo(q.x - 6, q.y + y)
            ctx.lineTo(q.x - 6 + len, q.y + y)
          }
          ctx.stroke()
          continue
        }
        if (n.leaf === undefined) {
          const r = (n.collapsed ? 12 : n.depth === 1 ? 9 : n.depth === 2 ? 6.5 : 5) * q.p
          ctx.fillStyle = n.collapsed ? C.panel : C.bg
          ctx.strokeStyle = folderStroke(n)
          ctx.lineWidth = 2.2
          if (n.collapsed) ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
          ctx.setLineDash([])
          if (n.collapsed) {
            ctx.fillStyle = C.ink
            ctx.font = `700 10px ${FONT}`
            ctx.textAlign = 'center'
            ctx.fillText(String(n.count), q.x, q.y + 3.5)
          }
          if (n.depth <= 2 || n.collapsed || d > 0.5)
            labels.push({ n, q, d, dy: -r - 7, kind: n.depth === 1 ? 'big' : 'folder' })
          continue
        }
        const node = p.nodes[n.leaf]!
        const r = (node.type === 'session' ? 4.6 : 5.2) * q.p * (n.leaf === focus ? 1.3 : 1)
        ctx.beginPath()
        if (node.type === 'session') {
          ctx.fillStyle = C.bg
          ctx.strokeStyle = C.muted
          ctx.lineWidth = 1.8
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        } else {
          const c = NODE_COLORS[node.type as keyof typeof NODE_COLORS] ?? NODE_COLORS.note
          const g = ctx.createRadialGradient(q.x - r * 0.35, q.y - r * 0.4, r * 0.1, q.x, q.y, r)
          g.addColorStop(0, '#ffffff')
          g.addColorStop(0.3, c)
          g.addColorStop(1, c)
          ctx.fillStyle = g
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        if (n.leaf === focus) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = C.ink
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(q.x, q.y, r + 5, 0, Math.PI * 2)
          ctx.stroke()
        }
        const kind = n.leaf === focus ? 'hot' : near.has(n.leaf) ? 'near' : 'page'
        if (kind !== 'page' || d > 0.58) labels.push({ n, q, d, dy: r + 12, kind })
      }
      for (const L of labels) {
        const strong = L.kind !== 'page' && L.kind !== 'folder'
        ctx.globalAlpha = strong ? 1 : 0.55 + 0.45 * L.d
        ctx.font = `${L.kind === 'big' ? '700 13px' : L.kind === 'hot' ? '700 12px' : L.kind === 'folder' ? '600 11px' : '500 11px'} ${FONT}`
        const text = short(L.n.label)
        const tw = ctx.measureText(text).width
        const lx = L.q.x - tw / 2
        const ly = L.q.y + L.dy
        const a = ctx.globalAlpha
        ctx.globalAlpha = a * 0.8
        ctx.fillStyle = C.panel
        ctx.beginPath()
        if (ctx.roundRect) ctx.roundRect(lx - 5, ly - 11, tw + 10, 16, 7)
        else ctx.rect(lx - 5, ly - 11, tw + 10, 16)
        ctx.fill()
        ctx.globalAlpha = a
        ctx.fillStyle = L.kind === 'near' ? C.accent : L.kind === 'folder' ? C.muted : C.ink
        ctx.textAlign = 'left'
        ctx.fillText(text, lx, ly + 1)
      }
      ctx.globalAlpha = 1
    }

    const loop = (ts: number) => {
      draw(ts)
      state.raf = state.visible ? requestAnimationFrame(loop) : 0
    }
    const start = () => {
      if (reduced) draw(0)
      else if (!state.raf) state.raf = requestAnimationFrame(loop)
    }
    const io = new IntersectionObserver(([e]) => {
      state.visible = !!e?.isIntersecting
      if (state.visible) start()
    })
    io.observe(cv)
    const ro = new ResizeObserver(() => reduced && draw(0))
    ro.observe(cv)

    // Nút gần con trỏ nhất, ưu tiên nút phía trước.
    const pick = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      let best: TNode | undefined
      let bz = -Infinity
      for (const [n, q] of proj) {
        if (!n.parent) continue
        const lim = (n.collapsed ? 14 : n.leaf !== undefined ? 9 : 10) * q.p
        if (Math.hypot(q.x - x, q.y - y) < lim && q.z > bz) {
          bz = q.z
          best = n
        }
      }
      return best
    }
    const onDown = (e: PointerEvent) => {
      state.dragging = true
      state.moved = 0
      state.lx = e.clientX
      state.ly = e.clientY
      cv.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (state.dragging) {
        const dx = e.clientX - state.lx
        const dy = e.clientY - state.ly
        state.moved += Math.abs(dx) + Math.abs(dy)
        view.current.rotY += dx * 0.008
        view.current.rotX = Math.max(-1.3, Math.min(1.3, view.current.rotX + dy * 0.008))
        state.lx = e.clientX
        state.ly = e.clientY
      } else {
        state.hover = pick(e)
        cv.style.cursor = state.hover ? 'pointer' : 'grab'
      }
      if (reduced) draw(0)
    }
    const onUp = (e: PointerEvent) => {
      state.dragging = false
      if (state.moved >= 4) return
      const n = pick(e)
      if (!n) return
      const p = latest.current.props
      if (n.leaf !== undefined) p.onSelect(n.leaf)
      else {
        state.hover = undefined
        p.onToggle(n.key)
      }
    }
    const onLeave = () => {
      state.dragging = false
      state.hover = undefined
      if (reduced) draw(0)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom, onZoom } = latest.current.props
      onZoom(clampZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)))
    }
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointerleave', onLeave)
    cv.addEventListener('wheel', onWheel, { passive: false })
    start()
    return () => {
      cancelAnimationFrame(state.raf)
      io.disconnect()
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointerleave', onLeave)
      cv.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      className="a-graph"
      role="img"
      aria-label={props.t('gr.tree3dAlt', { n: nodes.length })}
    />
  )
}
