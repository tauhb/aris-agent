/**
 * Đồ thị tri thức 3D (màn 5.3): các cụm dự án/lĩnh vực có quầng sáng, nút theo loại
 * (tròn, tam giác ký ức, thoi skill, vòng phiên chat), dây có chấm chạy, nút đang
 * xem và dây của nó tô màu nhấn. Kéo để xoay hai trục, cuộn để phóng to, bấm nút để
 * chọn. Tắt chuyển động thì không tự xoay; ngoài khung nhìn thì ngừng vẽ.
 */
import { useEffect, useRef } from 'react'
import {
  NODE_COLORS,
  NODE_SIZE,
  depth,
  isVisible,
  pickNode,
  project,
  type Graph,
  type GraphFilter,
  type Projected,
} from './graph.js'

export interface KnowledgeGraphProps {
  graph: Graph
  show: GraphFilter
  /** Chỉ hiện nút tạo trước mốc này (0–1). */
  timeCut: number
  selected: number
  onSelect: (index: number) => void
  zoom: number
  onZoom: (zoom: number) => void
  /** Đổi giá trị để đưa góc nhìn về ban đầu. */
  resetKey: number
  label: string
}

const FONT = '"Be Vietnam Pro", system-ui, sans-serif'
export const ZOOM_MIN = 0.6
export const ZOOM_MAX = 2.2
const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z))

export function KnowledgeGraph(props: KnowledgeGraphProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const latest = useRef(props)
  latest.current = props
  const view = useRef({ rotX: -0.28, rotY: 0.5 })

  useEffect(() => {
    view.current.rotX = -0.28
  }, [props.resetKey])

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const state = {
      hover: -1,
      dragging: false,
      moved: 0,
      lx: 0,
      ly: 0,
      raf: 0,
      visible: true,
      colorsAt: -Infinity,
      dark: false,
    }
    let C = { ink: '#16171B', muted: '#5C616C', line: '#C9CCD3', accent: '#1D6FE0', panel: '#FFFFFF' }
    let proj: Projected[] = []

    const draw = (ts: number) => {
      const { graph, show, timeCut, selected, zoom } = latest.current
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
      if (ts - state.colorsAt > 400 || reduced) {
        const s = getComputedStyle(cv)
        const v = (k: string, d: string) => s.getPropertyValue(k).trim() || d
        C = {
          ink: v('--a-ink', C.ink),
          muted: v('--a-muted', C.muted),
          line: v('--a-line', C.line),
          accent: v('--a-accent', C.accent),
          panel: v('--a-panel', C.panel),
        }
        state.dark = cv.closest('[data-ds-dark-theme]') !== null
        state.colorsAt = ts
      }
      if (!state.dragging && state.hover < 0 && !reduced) view.current.rotY += 0.0016

      const bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.65)
      bg.addColorStop(0, state.dark ? 'rgba(90,165,255,0.10)' : 'rgba(29,111,224,0.06)')
      bg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      const v = {
        rotX: view.current.rotX,
        rotY: view.current.rotY,
        scale: Math.min(w, h) * 0.36 * zoom,
        w,
        h,
      }
      proj = graph.nodes.map((n) => project(n.x, n.y, n.z, v))
      const visible = (i: number) => isVisible(graph.nodes[i]!, show, timeCut)

      // Hai vòng quỹ đạo nét đứt làm mặt phẳng tham chiếu.
      for (const [radius, y, alpha] of [
        [1.55, 0, 0.55],
        [1.1, -0.95, 0.3],
      ] as const) {
        ctx.save()
        ctx.strokeStyle = C.line
        ctx.lineWidth = 1
        ctx.setLineDash([3, 7])
        ctx.globalAlpha = alpha
        ctx.beginPath()
        for (let k = 0; k <= 72; k++) {
          const a = (k / 72) * Math.PI * 2
          const q = project(radius * Math.cos(a), y, radius * Math.sin(a), v)
          if (k === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        }
        ctx.stroke()
        ctx.restore()
      }

      const focus = state.hover >= 0 ? state.hover : selected
      ctx.lineCap = 'round'
      for (const e of graph.edges) {
        if (!visible(e.a) || !visible(e.b)) continue
        const pa = proj[e.a]!
        const pb = proj[e.b]!
        const hot = e.a === focus || e.b === focus
        const d = depth((pa.z + pb.z) / 2)
        ctx.globalAlpha = hot ? 0.95 : 0.1 + 0.4 * d
        ctx.strokeStyle = hot ? C.accent : C.line
        ctx.lineWidth = hot ? 1.8 : 0.6 + 0.8 * d
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
        if (hot || e.off < 0.28) {
          const t = (ts / 2200 + e.off) % 1
          ctx.globalAlpha = hot ? 1 : 0.35 + 0.5 * d
          ctx.fillStyle = C.accent
          ctx.beginPath()
          ctx.arc(
            pa.x + (pb.x - pa.x) * t,
            pa.y + (pb.y - pa.y) * t,
            (hot ? 2.4 : 1.6) * ((pa.p + pb.p) / 2),
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      const order = graph.nodes.map((_, i) => i).sort((a, b) => proj[a]!.z - proj[b]!.z)
      for (const i of order) {
        if (!visible(i)) continue
        const n = graph.nodes[i]!
        const p = proj[i]!
        const d = depth(p.z)
        const r = NODE_SIZE[n.type] * p.p * (i === focus ? 1.35 : 1)
        const c = n.type === 'session' ? C.muted : NODE_COLORS[n.type]
        ctx.globalAlpha = 0.35 + 0.65 * d
        if (n.hub) {
          const halo = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 2.6)
          halo.addColorStop(0, `${c}55`)
          halo.addColorStop(1, `${c}00`)
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.beginPath()
        if (n.type === 'memory') {
          ctx.fillStyle = c
          ctx.moveTo(p.x, p.y - r * 1.25)
          ctx.lineTo(p.x + r * 1.15, p.y + r * 0.8)
          ctx.lineTo(p.x - r * 1.15, p.y + r * 0.8)
          ctx.closePath()
          ctx.fill()
        } else if (n.type === 'skill') {
          ctx.fillStyle = c
          ctx.moveTo(p.x, p.y - r * 1.2)
          ctx.lineTo(p.x + r * 1.2, p.y)
          ctx.lineTo(p.x, p.y + r * 1.2)
          ctx.lineTo(p.x - r * 1.2, p.y)
          ctx.closePath()
          ctx.fill()
        } else if (n.type === 'session') {
          ctx.strokeStyle = c
          ctx.lineWidth = 1.6 * p.p
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.stroke()
        } else {
          const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.4, r * 0.1, p.x, p.y, r)
          g.addColorStop(0, '#ffffff')
          g.addColorStop(0.28, c)
          g.addColorStop(1, c)
          ctx.fillStyle = g
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()
        }
        if (i === focus) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = C.ink
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2)
          ctx.stroke()
        }
        if (n.name && (n.hub || i === focus || (d > 0.55 && p.p > 1.02))) {
          const strong = n.hub || i === focus
          ctx.font = `${n.hub ? '600 13px' : '500 11.5px'} ${FONT}`
          const tw = ctx.measureText(n.name).width
          const lx = p.x - tw / 2
          const ly = p.y + r + (n.hub ? 14 : 10)
          ctx.globalAlpha = (strong ? 1 : 0.85) * 0.85
          ctx.fillStyle = C.panel
          ctx.beginPath()
          if (ctx.roundRect) ctx.roundRect(lx - 6, ly - 11, tw + 12, 17, 8)
          else ctx.rect(lx - 6, ly - 11, tw + 12, 17)
          ctx.fill()
          ctx.globalAlpha = strong ? 1 : 0.85
          ctx.fillStyle = C.ink
          ctx.textAlign = 'left'
          ctx.fillText(n.name, lx, ly + 2)
        }
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

    const at = (e: PointerEvent) => {
      const { graph, show, timeCut } = latest.current
      const r = cv.getBoundingClientRect()
      return pickNode(
        graph.nodes,
        proj,
        (n) => isVisible(n, show, timeCut),
        e.clientX - r.left,
        e.clientY - r.top,
      )
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
        view.current.rotX = Math.max(-1.2, Math.min(1.2, view.current.rotX + dy * 0.008))
        state.lx = e.clientX
        state.ly = e.clientY
      } else {
        state.hover = at(e)
        cv.style.cursor = state.hover >= 0 ? 'pointer' : 'grab'
      }
      if (reduced) draw(0)
    }
    const onUp = (e: PointerEvent) => {
      state.dragging = false
      if (state.moved < 4) {
        const i = at(e)
        if (i >= 0) latest.current.onSelect(i)
      }
    }
    const onLeave = () => {
      state.dragging = false
      state.hover = -1
      if (reduced) draw(0)
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { zoom, onZoom } = latest.current
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

  return <canvas ref={canvas} className="a-graph" role="img" aria-label={props.label} />
}

export { clampZoom }
