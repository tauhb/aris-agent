/**
 * Logic thuần của Văn phòng 3D (bản vẽ `VanPhong3D`): chia khu và bàn theo đội thật, chọn chỗ đứng của từng bot theo
 * trạng thái. Không dùng three, không gọi mạng; toạ độ theo đơn vị của cảnh (x sang phải, z về phía người xem).
 */
import type { ActivityItem } from '@aris/ui-kit/react'
import type { Scene } from './model.js'

export interface Pt {
  x: number
  z: number
}

export interface LayoutGroup {
  /** Mã phòng ban; bot chưa vào phòng nào ở nhóm có mã rỗng. */
  id: string
  label: string
  /** Mã các bot của phòng, mỗi bot một bàn. */
  bots: readonly string[]
}

export interface DeskPlan extends Pt {
  id: string
  zone: string
  /** Chỗ ngồi của bot (sau bàn, phía tường). */
  seat: Pt
}

export interface ZonePlan extends Pt {
  id: string
  label: string
  /** Kích thước thảm của khu. */
  w: number
  d: number
  /** Số thứ tự màu thảm (xoay vòng theo bảng màu). */
  tone: number
}

export interface SofaPlan extends Pt {
  /** Ba chỗ ngồi của ghế. */
  seats: Pt[]
}

export interface OfficeLayout {
  /** Cỡ sàn; tâm sàn ở gốc toạ độ. */
  width: number
  depth: number
  zones: ZonePlan[]
  desks: DeskPlan[]
  command: {
    x: number
    z: number
    /** Chỗ Aris đứng ở bàn chỉ huy. */
    stand: Pt
  }
  meeting: Pt
  cabinet: Pt
  plants: Pt[]
  door: Pt
  /** Chỗ đứng chờ ở cửa, từ giữa cửa ra hai bên. */
  waitSpots: Pt[]
  sofas: SofaPlan[]
  /** Chỗ ngồi trên sofa theo thứ tự (ghế này hết mới sang ghế khác). */
  seats: Pt[]
}

export const DESK_DX = 3.2
export const DESK_DZ = 3.4
const ZONE_PAD = 0.6
const MAX_PER_ROW = 3
const MARGIN = 1
const HEAD_D = 5.2
const SIDE_D = 4
const SOFA_DX = 4.6
const SOFA_DZ = 2.8
const MIN_W = 18
const MIN_D = 14

const zoneSize = (count: number) => {
  const perRow = Math.min(MAX_PER_ROW, count)
  const rows = Math.ceil(count / perRow)
  return { perRow, rows, w: perRow * DESK_DX + 2 * ZONE_PAD, d: rows * DESK_DZ + 2 * ZONE_PAD }
}

/**
 * Chia khu và bàn theo đội thật: mỗi phòng ban một khu (phòng không có bot thì bỏ), mỗi bot một bàn, khu xếp lưới tối
 * đa 3 cột nên không chồng nhau; bàn chỉ huy ở hàng đầu, sofa ở hàng cuối (đủ chỗ cho cả đội), cửa ở tường phải.
 * `commander` chỉ để tính số chỗ nghỉ và chỗ chờ.
 */
export function layoutOffice(input: { groups: readonly LayoutGroup[] }): OfficeLayout {
  const groups = input.groups.filter((g) => g.bots.length > 0)
  const n = groups.length
  const people = groups.reduce((sum, g) => sum + g.bots.length, 0) + 1 // thêm Aris
  const zoneCols = n === 0 ? 0 : Math.min(3, Math.ceil(Math.sqrt(n)))
  const zoneRows = n === 0 ? 0 : Math.ceil(n / zoneCols)
  const sizes = groups.map((g) => zoneSize(g.bots.length))
  const cellW = sizes.reduce((m, s) => Math.max(m, s.w), 0)
  const cellD = sizes.reduce((m, s) => Math.max(m, s.d), 0)
  const workW = zoneCols * cellW

  const sofaCount = Math.max(1, Math.ceil(people / 3))
  const width = Math.max(MIN_W, workW + SIDE_D + 2 * MARGIN)
  const sofasPerRow = Math.max(1, Math.floor((width - SIDE_D - 2 * MARGIN) / SOFA_DX))
  const sofaRows = Math.ceil(sofaCount / sofasPerRow)
  const loungeD = sofaRows * SOFA_DZ + 1.4
  const depth = Math.max(MIN_D, MARGIN + HEAD_D + zoneRows * cellD + loungeD)

  const z0 = -depth / 2
  const zTop = z0 + MARGIN + HEAD_D
  const areaW = width - SIDE_D - 2 * MARGIN
  const gx0 = -width / 2 + MARGIN + (areaW - workW) / 2
  const xc = -width / 2 + MARGIN + areaW / 2

  const zones: ZonePlan[] = []
  const desks: DeskPlan[] = []
  groups.forEach((g, i) => {
    const sz = sizes[i]!
    const zx = gx0 + (i % zoneCols) * cellW + cellW / 2
    const zz = zTop + Math.floor(i / zoneCols) * cellD + cellD / 2
    zones.push({ id: g.id, label: g.label, x: zx, z: zz, w: cellW, d: cellD, tone: i })
    g.bots.forEach((bot, k) => {
      const r = Math.floor(k / sz.perRow)
      const c = k % sz.perRow
      const inRow = Math.min(sz.perRow, g.bots.length - r * sz.perRow)
      const x = zx + (c - (inRow - 1) / 2) * DESK_DX
      const z = zz + (r - (sz.rows - 1) / 2) * DESK_DZ + 0.4
      desks.push({ id: bot, zone: g.id, x, z, seat: { x, z: z - 0.95 } })
    })
  })

  const cz = z0 + MARGIN + 2.2
  const doorZ = zTop + Math.max(zoneRows * cellD, 3) / 2

  // Chỗ chờ ở cửa: từ giữa cửa ra hai bên, mỗi cột 7 chỗ, cột sau lùi vào trong phòng.
  const waitSpots: Pt[] = []
  for (let j = 0; j < people; j++) {
    const col = Math.floor(j / 7)
    const k = j % 7
    const off = Math.ceil(k / 2) * 1.1 * (k % 2 === 1 ? 1 : -1)
    waitSpots.push({ x: width / 2 - 1.3 - col * 1.2, z: doorZ + off })
  }

  const sofas: SofaPlan[] = []
  for (let i = 0; i < sofaCount; i++) {
    const x = -width / 2 + MARGIN + 2 + (i % sofasPerRow) * SOFA_DX
    const z = depth / 2 - MARGIN - 0.6 - Math.floor(i / sofasPerRow) * SOFA_DZ
    sofas.push({ x, z, seats: [-1, 0, 1].map((s) => ({ x: x + s * 1.3, z })) })
  }

  return {
    width,
    depth,
    zones,
    desks,
    command: { x: xc, z: cz, stand: { x: xc, z: cz + 1.9 } },
    meeting: { x: width / 2 - SIDE_D - 1.8, z: cz + 0.2 },
    cabinet: { x: -width / 2 + 1.6, z: z0 + 0.5 },
    plants: [
      { x: -width / 2 + 0.6, z: depth / 2 - 0.6 },
      { x: width / 2 - 0.6, z: z0 + 0.6 },
      { x: xc + 4, z: z0 + 0.6 },
    ],
    door: { x: width / 2, z: doorZ },
    waitSpots,
    sofas,
    seats: sofas.flatMap((s) => s.seats),
  }
}

// --- Chỗ đứng theo trạng thái ----------------------------------------------------------------------------------

/** Dáng bot khi đã tới chỗ: gõ máy (ngồi), nhảy nhẹ (đứng chờ), nghiêng (ngồi nghỉ), đứng yên. */
export type Pose = 'type' | 'hop' | 'lean' | 'stand'

export interface Spot extends Pt {
  pose: Pose
  /** Hướng nhìn khi đã tới nơi (rad quanh trục đứng; 0 là nhìn về phía người xem). */
  face: number
  /** Nghiêng người (rad), dùng cho ngồi nghỉ. */
  tilt: number
  /** Có điểm này thì bot đi qua lại giữa chỗ của mình và điểm đó. */
  patrol?: Pt
}

export interface Occupant {
  id: string
  scene: Scene
}

/** Hướng nhìn về phía -x (vào trong phòng khi đứng ở cửa tường phải). */
export const FACE_LEFT = -Math.PI / 2

/** Điểm đứng cạnh bàn của một bot khác (lối đi bên phải bàn), để Aris tới bàn đó. */
export const visitPoint = (d: Pt): Pt => ({ x: d.x + DESK_DX / 2, z: d.z - 0.3 })

/**
 * Bot được giao việc gần nhất mà vẫn đang làm: dòng `assigned` mới nhất trong hoạt động của bot khác Aris và bot đó đang
 * làm. Không biết thì `undefined` (không đoán).
 */
export function assigneeOf(
  activity: readonly Pick<ActivityItem, 'bot' | 'kind' | 'at'>[],
  commander: string,
  occupants: readonly Occupant[],
): string | undefined {
  const working = new Set(occupants.filter((o) => o.scene === 'work').map((o) => o.id))
  let best: { bot: string; at: number } | undefined
  for (const a of activity) {
    if (a.kind !== 'assigned' || a.bot === commander || !working.has(a.bot)) continue
    if (!best || a.at > best.at) best = { bot: a.bot, at: a.at }
  }
  return best?.bot
}

/**
 * Chỗ đứng của từng người theo trạng thái thật:
 * - đang làm: ngồi sau bàn mình (Aris: đi qua lại tới bàn bot được giao việc gần nhất nếu biết, không thì đứng ở bàn chỉ huy);
 * - chờ người dùng: đứng ở cửa;
 * - rảnh (kể cả xong và vấp): ngồi nghỉ trên sofa.
 * Thứ tự chỗ chờ và chỗ sofa theo thứ tự `occupants`, nên một bot đổi trạng thái chỉ làm dịch chỗ những bot cùng nhóm.
 */
export function spotsFor(
  layout: OfficeLayout,
  occupants: readonly Occupant[],
  commander: string,
  assignee?: string,
): Record<string, Spot> {
  const out: Record<string, Spot> = {}
  const desk = new Map(layout.desks.map((d) => [d.id, d]))
  let waiting = 0
  let resting = 0
  for (const o of occupants) {
    if (o.scene === 'wait') {
      const p = layout.waitSpots[waiting++] ?? layout.waitSpots.at(-1) ?? layout.door
      out[o.id] = { ...p, pose: 'hop', face: FACE_LEFT, tilt: 0 }
    } else if (o.scene === 'work') {
      if (o.id === commander) {
        const target = assignee ? desk.get(assignee) : undefined
        const home = layout.command.stand
        out[o.id] = {
          ...home,
          pose: 'stand',
          face: 0,
          tilt: 0,
          ...(target ? { patrol: visitPoint(target) } : {}),
        }
      } else {
        const d = desk.get(o.id)
        if (d) out[o.id] = { ...d.seat, pose: 'type', face: 0, tilt: 0 }
        else out[o.id] = restSpot(layout, resting++)
      }
    } else {
      out[o.id] = restSpot(layout, resting++)
    }
  }
  return out
}

function restSpot(layout: OfficeLayout, i: number): Spot {
  const p = layout.seats[i] ?? layout.seats.at(-1) ?? layout.command.stand
  return { ...p, pose: 'lean', face: 0, tilt: i % 2 === 0 ? 0.35 : -0.35 }
}

// --- Nhãn tên trên màn hình --------------------------------------------------------------------------------------

/** Bot "rảnh" ở đây là bot không làm và không chờ: ngồi nghỉ trên sofa, tên chỉ hiện khi rê chuột hoặc khi được chọn. */
const isIdle = (s: Scene) => s !== 'work' && s !== 'wait'

export interface LabelPlan {
  /** Mã các bot có nhãn riêng: bot đang làm, bot đang chờ, và bot rảnh đang được rê chuột hoặc chọn. */
  named: Set<string>
  /** Số bot rảnh trên từng sofa (cùng thứ tự `layout.sofas`); sofa 0 bot thì không có nhãn chung. */
  sofas: number[]
}

/**
 * Chọn nhãn nào hiện: bot đang làm và đang chờ luôn có nhãn riêng; bot rảnh gộp thành một nhãn chung "Rảnh · N" trên sofa
 * họ ngồi, trừ bot trong `focus` (đang rê chuột hoặc đang chọn) thì hiện nhãn riêng.
 */
export function labelPlan(
  layout: OfficeLayout,
  bots: readonly Occupant[],
  spots: Readonly<Record<string, Spot>>,
  focus: readonly (string | null | undefined)[] = [],
): LabelPlan {
  const picked = new Set(focus.filter((f): f is string => !!f))
  const named = new Set<string>()
  const sofas = layout.sofas.map(() => 0)
  for (const b of bots) {
    if (!isIdle(b.scene) || picked.has(b.id)) {
      named.add(b.id)
      continue
    }
    const spot = spots[b.id]
    if (!spot || layout.sofas.length === 0) continue
    // Sofa gần chỗ ngồi nhất (theo khoảng cách thẳng): bot rảnh luôn ngồi đúng chỗ của một sofa.
    let best = 0
    let bestD = Infinity
    layout.sofas.forEach((s, i) => {
      const d = Math.hypot(s.x - spot.x, s.z - spot.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    sofas[best]! += 1
  }
  return { named, sofas }
}

export interface LabelBox {
  key: string
  /** Giữa nhãn trên màn hình (px). */
  x: number
  /** Mép dưới nhãn trên màn hình (px). */
  y: number
  /** Bề rộng nhãn (px). */
  w: number
}

/**
 * Giãn các nhãn đang chồng nhau: sắp theo y rồi nhãn nằm sau (thấp hơn trên màn hình) bị đẩy xuống cho cách nhãn chồng
 * nó ít nhất `gap` px. Chỉ tính hai nhãn có bề ngang giao nhau. Trả về y mới của từng nhãn.
 */
export function spreadLabels(boxes: readonly LabelBox[], gap: number): Map<string, number> {
  const out = new Map<string, number>()
  const placed: { x: number; w: number; y: number }[] = []
  for (const b of [...boxes].sort((a, c) => a.y - c.y)) {
    let y = b.y
    // Mỗi lần đẩy, y tăng tới một mốc `y của nhãn khác + gap`, nên vòng lặp dừng sau tối đa số nhãn đã đặt.
    for (let guard = 0; guard <= placed.length; guard++) {
      const hit = placed.find((p) => Math.abs(p.x - b.x) < (p.w + b.w) / 2 && Math.abs(y - p.y) < gap)
      if (!hit) break
      y = hit.y + gap
    }
    placed.push({ x: b.x, w: b.w, y })
    out.set(b.key, y)
  }
  return out
}
