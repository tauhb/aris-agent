/**
 * Sơ đồ đội 3D (màn R3 cột phải "Đội bot lúc này", dùng lại cho màn 1.3): Commander
 * lơ lửng giữa, các bot xoay quanh trên vòng elip nghiêng, dây nối chạy khi bot
 * đang làm hoặc chờ anh, vòng trạng thái động, mắt đổi theo trạng thái. Kéo để
 * xoay, rê chuột để xem vai trò, bấm vào bot để mở. Vẽ bằng `<canvas>`; khi người
 * dùng tắt chuyển động thì đứng yên và chỉ vẽ lại khi cần.
 */
import { useEffect, useRef } from 'react'
import { getMascot } from '../mascots.js'
import type { BotStatus } from '../status.js'
import { depthOrder, orbitLayout, pickSeat, splitMascot, svgDataUrl, type OrbitSeat } from './orbit.js'

export interface OrbitBot {
  /** Mã bot, cũng là mã linh vật. */
  id: string
  name: string
  /** Vai, hiện khi rê chuột. */
  role: string
  status: BotStatus
}

export interface TeamOrbitProps {
  commander: OrbitBot
  /** Nhãn trên đầu Commander, ví dụ "Aris · Chỉ huy". */
  commanderLabel: string
  members: readonly OrbitBot[]
  /** Nhãn trạng thái đã dịch, viết thường ("đang làm"). */
  statusLabel: (status: BotStatus) => string
  /** Mô tả cả sơ đồ cho trình đọc màn hình. */
  label: string
  height?: number | undefined
  onSelect?: ((id: string) => void) | undefined
}

interface Sprite {
  color: string
  full: HTMLImageElement
  shape: HTMLImageElement
  eyes: [number, number][]
}

interface Colors {
  ink: string
  muted: string
  line: string
  warn: string
  ok: string
  danger: string
}

const FONT = '"Be Vietnam Pro", system-ui, sans-serif'

function rgba(hex: string, a: number): string {
  const m = hex.match(/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i)
  if (!m) return `rgba(16,132,254,${a})`
  return `rgba(${parseInt(m[1]!, 16)},${parseInt(m[2]!, 16)},${parseInt(m[3]!, 16)},${a})`
}

function sprite(id: string, onLoad: () => void): Sprite {
  const m = getMascot(id) ?? getMascot('aris')!
  const parts = splitMascot(m.body)
  const img = (src: string) => {
    const el = new Image()
    el.onload = onLoad
    el.src = src
    return el
  }
  return {
    color: m.color,
    full: img(svgDataUrl(m.body)),
    shape: img(svgDataUrl(parts.shapeSvg)),
    eyes: parts.eyes,
  }
}

/** Linh vật với mắt theo trạng thái: rảnh nhắm hờ, chờ mắt tròn to, xong mắt cười, còn lại mắt gốc. */
function drawMascot(
  ctx: CanvasRenderingContext2D,
  sp: Sprite,
  status: BotStatus,
  x: number,
  y: number,
  size: number,
) {
  const expressive = status === 'idle' || status === 'waiting' || status === 'done'
  if (!expressive || sp.eyes.length === 0) {
    if (sp.full.complete) ctx.drawImage(sp.full, x - size / 2, y - size / 2, size, size)
    return
  }
  if (sp.shape.complete) ctx.drawImage(sp.shape, x - size / 2, y - size / 2, size, size)
  ctx.save()
  ctx.translate(x - size / 2, y - size / 2)
  ctx.scale(size / 100, size / 100)
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineCap = 'round'
  ctx.lineWidth = 6
  for (const [ex, ey] of sp.eyes) {
    ctx.beginPath()
    if (status === 'idle') {
      ctx.moveTo(ex - 4.5, ey)
      ctx.lineTo(ex + 4.5, ey)
      ctx.stroke()
    } else if (status === 'waiting') {
      ctx.arc(ex, ey, 8, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.moveTo(ex - 5.5, ey + 3)
      ctx.quadraticCurveTo(ex, ey - 6, ex + 5.5, ey + 3)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Vòng trạng thái quanh linh vật: cung quay (đang làm), vòng thở (chờ), vòng đặc (xong, vấp), nét đứt (rảnh). */
function drawRing(
  ctx: CanvasRenderingContext2D,
  status: BotStatus,
  color: string,
  x: number,
  y: number,
  r: number,
  ts: number,
  C: Colors,
  hot: boolean,
) {
  ctx.save()
  ctx.lineWidth = hot ? 3.5 : 2.5
  ctx.beginPath()
  if (status === 'working') {
    ctx.strokeStyle = C.line
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = color
    const a = (ts / 380) % (Math.PI * 2)
    ctx.beginPath()
    ctx.arc(x, y, r, a, a + 1.4)
  } else if (status === 'waiting') {
    ctx.globalAlpha *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(ts / 260))
    ctx.strokeStyle = C.warn
    ctx.arc(x, y, r, 0, Math.PI * 2)
  } else if (status === 'done' || status === 'failed') {
    ctx.strokeStyle = status === 'done' ? C.ok : C.danger
    ctx.arc(x, y, r, 0, Math.PI * 2)
  } else {
    ctx.strokeStyle = C.muted
    ctx.setLineDash([3, 4])
    ctx.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.restore()
}

export function TeamOrbit(props: TeamOrbitProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // Vòng vẽ đọc props mới nhất mà không phải dựng lại.
  const latest = useRef(props)
  latest.current = props
  const height = props.height ?? 300

  useEffect(() => {
    const cv = canvas.current
    if (!cv) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sprites = new Map<string, Sprite>()
    const state = {
      ang: 0.6,
      hover: -1,
      dragging: false,
      lastX: 0,
      downX: 0,
      raf: 0,
      visible: true,
      colorsAt: -Infinity,
    }
    let C: Colors = {
      ink: '#16171B',
      muted: '#5C616C',
      line: '#E4E2DC',
      warn: '#B45309',
      ok: '#15803D',
      danger: '#C0262D',
    }
    let hits: ({ x: number; y: number; r: number } | undefined)[] = []
    const spriteOf = (id: string) => {
      let sp = sprites.get(id)
      if (!sp) {
        sp = sprite(id, () => reduced && draw(0))
        sprites.set(id, sp)
      }
      return sp
    }

    const draw = (ts: number) => {
      const { commander, commanderLabel, members, statusLabel } = latest.current
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
      // Màu theo theme sáng/tối, đọc lại vài lần mỗi giây.
      if (ts - state.colorsAt > 400 || reduced) {
        const s = getComputedStyle(cv)
        const v = (k: string, d: string) => s.getPropertyValue(k).trim() || d
        C = {
          ink: v('--a-ink', C.ink),
          muted: v('--a-muted', C.muted),
          line: v('--a-line', C.line),
          warn: v('--a-warn', C.warn),
          ok: v('--a-ok', C.ok),
          danger: v('--a-danger', C.danger),
        }
        state.colorsAt = ts
      }
      if (!state.dragging && !reduced) state.ang += state.hover >= 0 ? 0.0012 : 0.0038

      const L = orbitLayout(members.length, state.ang, w, h)
      const cmd = spriteOf(commander.id)
      const glowAt = (a: number) => rgba(cmd.color, a)

      // Quầng sáng trên sàn và hai vòng quỹ đạo.
      ctx.save()
      ctx.translate(L.cx, L.fy)
      ctx.scale(1, L.tilt)
      const g = ctx.createRadialGradient(0, 0, 6, 0, 0, L.R * 1.4)
      g.addColorStop(0, glowAt(0.26))
      g.addColorStop(0.6, glowAt(0.08))
      g.addColorStop(1, glowAt(0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, L.R * 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.strokeStyle = C.line
      ctx.lineWidth = 1.2
      ctx.setLineDash([4, 6])
      ctx.lineDashOffset = -ts / 80
      ctx.beginPath()
      ctx.ellipse(L.cx, L.fy, L.R, L.R * L.tilt, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.ellipse(L.cx, L.fy, L.R * 0.45, L.R * 0.45 * L.tilt, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()

      const cmdY = L.cmdY + Math.sin(ts / 650) * 3
      const beam = ctx.createLinearGradient(0, cmdY + 20, 0, L.fy)
      beam.addColorStop(0, glowAt(0.18))
      beam.addColorStop(1, glowAt(0))
      ctx.fillStyle = beam
      ctx.beginPath()
      ctx.moveTo(L.cx - 12, cmdY + 22)
      ctx.lineTo(L.cx + 12, cmdY + 22)
      ctx.lineTo(L.cx + L.R * 0.45, L.fy)
      ctx.lineTo(L.cx - L.R * 0.45, L.fy)
      ctx.closePath()
      ctx.fill()

      // Dây từ Commander tới từng bot; chạy chấm khi bot đang làm hoặc chờ anh.
      for (const seat of L.seats) {
        const m = members[seat.i]!
        const color = spriteOf(m.id).color
        const active = m.status === 'working' || m.status === 'waiting'
        const ty = seat.y - 52 * seat.s
        ctx.save()
        ctx.globalAlpha = 0.35 + (0.55 * (seat.z + 1)) / 2
        ctx.lineWidth = active ? 2.6 : 1.1
        ctx.strokeStyle = active ? color : C.line
        if (active) {
          ctx.setLineDash([7, 6])
          ctx.lineDashOffset = -ts / 28
        }
        ctx.beginPath()
        ctx.moveTo(L.cx, cmdY + 24)
        ctx.quadraticCurveTo((L.cx + seat.x) / 2, Math.min(cmdY, ty) + 30, seat.x, ty)
        ctx.stroke()
        ctx.restore()
      }

      hits = []
      const drawMember = (seat: OrbitSeat) => {
        const m = members[seat.i]!
        const sp = spriteOf(m.id)
        const hot = state.hover === seat.i
        const s = seat.s * (hot ? 1.12 : 1)
        const lift = m.status === 'working' ? Math.sin(ts / 300 + seat.i) * 2.5 : 0
        const my = seat.y - 34 * s + lift
        ctx.save()
        ctx.globalAlpha = 0.62 + (0.38 * (seat.z + 1)) / 2
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.beginPath()
        ctx.ellipse(seat.x, seat.y, 20 * s, 5.5 * s, 0, 0, Math.PI * 2)
        ctx.fill()
        drawRing(ctx, m.status, sp.color, seat.x, my, 35 * s, ts, C, hot)
        drawMascot(ctx, sp, m.status, seat.x, my, 54 * s)
        ctx.textAlign = 'center'
        ctx.fillStyle = C.ink
        ctx.font = `600 ${Math.round(12.5 * s)}px ${FONT}`
        ctx.fillText(m.name, seat.x, seat.y + 16 * s)
        const label = statusLabel(m.status)
        ctx.fillStyle =
          m.status === 'waiting'
            ? C.warn
            : m.status === 'done'
              ? C.ok
              : m.status === 'failed'
                ? C.danger
                : C.muted
        ctx.font = `500 ${Math.round(11 * s)}px ${FONT}`
        ctx.fillText(hot ? `${m.role} · ${label}` : label, seat.x, seat.y + 31 * s)
        ctx.restore()
        hits[seat.i] = { x: seat.x, y: my, r: 30 * s }
      }

      const { back, front } = depthOrder(L.seats)
      back.forEach(drawMember)

      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.beginPath()
      ctx.ellipse(L.cx, L.fy, 26, 7, 0, 0, Math.PI * 2)
      ctx.fill()
      const glow = ctx.createRadialGradient(L.cx, cmdY, 10, L.cx, cmdY, 58)
      glow.addColorStop(0, glowAt(0.3))
      glow.addColorStop(1, glowAt(0))
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(L.cx, cmdY, 58, 0, Math.PI * 2)
      ctx.fill()
      drawRing(ctx, commander.status, cmd.color, L.cx, cmdY, 40, ts, C, false)
      drawMascot(ctx, cmd, commander.status, L.cx, cmdY, 64)
      ctx.fillStyle = C.ink
      ctx.textAlign = 'center'
      ctx.font = `600 13px "Lexend", ${FONT}`
      ctx.fillText(commanderLabel, L.cx, cmdY - 48)
      ctx.restore()

      front.forEach(drawMember)
    }

    const loop = (ts: number) => {
      draw(ts)
      state.raf = state.visible ? requestAnimationFrame(loop) : 0
    }
    const start = () => {
      if (reduced) draw(0)
      else if (!state.raf) state.raf = requestAnimationFrame(loop)
    }
    // Ngoài khung nhìn thì ngừng vẽ.
    const io = new IntersectionObserver(([e]) => {
      state.visible = !!e?.isIntersecting
      if (state.visible) start()
    })
    io.observe(cv)
    const ro = new ResizeObserver(() => reduced && draw(0))
    ro.observe(cv)

    const point = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      return pickSeat(hits, e.clientX - r.left, e.clientY - r.top)
    }
    const onDown = (e: PointerEvent) => {
      state.dragging = true
      state.lastX = e.clientX
      state.downX = e.clientX
      cv.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (state.dragging) {
        state.ang += (e.clientX - state.lastX) * 0.012
        state.lastX = e.clientX
      } else {
        state.hover = point(e)
        cv.style.cursor = state.hover >= 0 ? 'pointer' : 'grab'
      }
      if (reduced) draw(0)
    }
    const onUp = (e: PointerEvent) => {
      const moved = Math.abs(e.clientX - state.downX) > 3
      state.dragging = false
      const i = point(e)
      const { members, onSelect } = latest.current
      if (!moved && i >= 0 && onSelect) onSelect(members[i]!.id)
    }
    const onLeave = () => {
      state.dragging = false
      state.hover = -1
      if (reduced) draw(0)
    }
    cv.addEventListener('pointerdown', onDown)
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerup', onUp)
    cv.addEventListener('pointerleave', onLeave)
    start()
    return () => {
      cancelAnimationFrame(state.raf)
      io.disconnect()
      ro.disconnect()
      cv.removeEventListener('pointerdown', onDown)
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerup', onUp)
      cv.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvas}
      className="a-orbit"
      role="img"
      aria-label={props.label}
      style={{ height, cursor: 'grab' }}
    />
  )
}
