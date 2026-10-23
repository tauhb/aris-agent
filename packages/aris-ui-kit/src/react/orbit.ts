/**
 * Phần hình học thuần của sơ đồ đội 3D (màn R3 cột phải, màn 1.3): tách linh vật
 * thành khối màu và vị trí mắt để vẽ mắt theo trạng thái, đặt các bot trên một
 * vòng elip nghiêng quanh Commander, và tìm bot dưới con trỏ.
 */

/** Linh vật tách đôi: SVG chỉ còn khối màu (bỏ phần trắng là mắt) và tâm từng mắt. */
export interface MascotParts {
  shapeSvg: string
  eyes: [number, number][]
}

const WHITE = /(fill|stroke)="#(?:fff|ffffff)"/i
const num = (attrs: string, name: string) =>
  Number(attrs.match(new RegExp(`\\b${name}="([-\\d.]+)"`))?.[1] ?? NaN)

/** Tâm mắt của một phần tử trắng: tâm tròn, giữa đoạn nét, hoặc tâm hình chữ nhật. */
function eyeCenters(tag: string, attrs: string): [number, number][] {
  if (tag === 'circle') return [[num(attrs, 'cx'), num(attrs, 'cy')]]
  if (tag === 'rect')
    return [[num(attrs, 'x') + num(attrs, 'width') / 2, num(attrs, 'y') + num(attrs, 'height') / 2]]
  if (tag === 'path') {
    const d = attrs.match(/\bd="([^"]+)"/)?.[1] ?? ''
    const out: [number, number][] = []
    for (const m of d.matchAll(/M\s*([-\d.]+)[ ,]([-\d.]+)\s*L\s*([-\d.]+)[ ,]([-\d.]+)/g))
      out.push([(Number(m[1]) + Number(m[3])) / 2, (Number(m[2]) + Number(m[4])) / 2])
    return out
  }
  return []
}

/**
 * Tách thân SVG của linh vật (`viewBox 0 0 100 100`): phần tử trắng (hoặc nằm trong
 * nhóm tô trắng) là mắt; phần còn lại là khối màu.
 */
export function splitMascot(body: string): MascotParts {
  const eyes: [number, number][] = []
  // Nhóm tô trắng: mọi phần tử con là mắt.
  let shape = body.replace(/<g\b([^>]*)>([\s\S]*?)<\/g>/g, (all, gAttrs: string, inner: string) => {
    if (!WHITE.test(gAttrs)) return all
    for (const m of inner.matchAll(/<(circle|rect|path)\b([^>]*)>/g)) eyes.push(...eyeCenters(m[1]!, m[2]!))
    return ''
  })
  shape = shape.replace(/<(circle|rect|path)\b([^>]*)>(?:<\/\1>)?/g, (all, tag: string, attrs: string) => {
    if (!WHITE.test(attrs)) return all
    eyes.push(...eyeCenters(tag, attrs))
    return ''
  })
  return { shapeSvg: shape, eyes: eyes.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) }
}

/** Ảnh SVG hoàn chỉnh (data URL) từ thân linh vật, vẽ được bằng `drawImage`. */
export function svgDataUrl(body: string, px = 200): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 100 100">${body}</svg>`,
  )}`
}

export interface OrbitSeat {
  /** Chỉ số bot trong danh sách. */
  i: number
  /** Độ sâu: -1 xa nhất (phía sau), 1 gần nhất. */
  z: number
  x: number
  y: number
  /** Hệ số cỡ theo độ sâu. */
  s: number
}

export type OrbitVariant = 'pane' | 'stage'

/**
 * Kích thước theo biến thể: `pane` cho cột phải (R3), `stage` cho trang bản đồ
 * (1.3), co theo khung bằng hệ số `K`. Số đo lấy từ canvas.
 */
export interface OrbitGeometry {
  K: number
  /** Cao độ mặt sàn (tâm vòng elip). */
  fy: number
  R: number
  tilt: number
  /** Commander cao hơn sàn bao nhiêu, theo phần chiều cao khung. */
  lift: number
  /** Biên độ nhịp lơ lửng của Commander. */
  bob: number
  /** Vẽ thêm vòng elip ngoài mờ. */
  outerRing: boolean
  /** Dây: điểm nối dưới Commander, độ cao điểm nối trên đầu bot, độ võng. */
  wireFrom: number
  wireTo: number
  sag: number
  /** Chấm chạy dọc dây khi bot đang làm hoặc chờ anh. */
  travel: boolean
  member: {
    shadow: [number, number]
    base: number
    ring: number
    mascot: number
    name: number
    status: number
    nameSize: number
    statusSize: number
    hit: number
  }
  commander: {
    glow: number
    ring: number
    mascot: number
    label: number
    labelSize: number
    shadow: [number, number]
  }
}

export interface OrbitLayout extends OrbitGeometry {
  cx: number
  /** Cao độ Commander, chưa tính nhịp lơ lửng. */
  cmdY: number
  seats: OrbitSeat[]
}

export function orbitGeometry(variant: OrbitVariant, w: number, h: number): OrbitGeometry {
  if (variant === 'stage') {
    const K = Math.max(1, Math.min(1.8, Math.min(w, h) / 330))
    return {
      K,
      fy: h * 0.64,
      R: Math.min(w * 0.34, h * 0.62),
      tilt: 0.34,
      lift: 0.42,
      bob: 4,
      outerRing: true,
      wireFrom: 32 * K,
      wireTo: 60,
      sag: 40,
      travel: true,
      member: {
        shadow: [22, 6],
        base: 36,
        ring: 37,
        mascot: 56,
        name: 18,
        status: 33,
        nameSize: 13,
        statusSize: 11.5,
        hit: 34,
      },
      commander: {
        glow: 64 * K,
        ring: 44 * K,
        mascot: 70 * K,
        label: 54 * K,
        labelSize: 14 * K,
        shadow: [30 * K, 8 * K],
      },
    }
  }
  return {
    K: 1,
    fy: h * 0.67,
    R: Math.min(w * 0.36, 118),
    tilt: 0.36,
    lift: 0.44,
    bob: 3,
    outerRing: false,
    wireFrom: 24,
    wireTo: 52,
    sag: 30,
    travel: false,
    member: {
      shadow: [20, 5.5],
      base: 34,
      ring: 35,
      mascot: 54,
      name: 16,
      status: 31,
      nameSize: 12.5,
      statusSize: 11,
      hit: 30,
    },
    commander: { glow: 58, ring: 40, mascot: 64, label: 48, labelSize: 13, shadow: [26, 7] },
  }
}

/** Đặt `count` bot đều trên vòng elip nghiêng, xoay một góc `ang` (radian). */
export function orbitLayout(
  count: number,
  ang: number,
  w: number,
  h: number,
  variant: OrbitVariant = 'pane',
): OrbitLayout {
  const g = orbitGeometry(variant, w, h)
  const cx = w / 2
  const seats = Array.from({ length: count }, (_, i) => {
    const a = ang + (i * 2 * Math.PI) / count
    const z = Math.sin(a)
    return {
      i,
      z,
      x: cx + g.R * Math.cos(a),
      y: g.fy + g.R * g.tilt * z,
      s: g.K * (0.74 + (0.3 * (z + 1)) / 2),
    }
  })
  return { ...g, cx, cmdY: g.fy - h * g.lift, seats }
}

/** Thứ tự vẽ: xa trước, gần sau (Commander vẽ giữa hai lớp). */
export function depthOrder(seats: readonly OrbitSeat[]): { back: OrbitSeat[]; front: OrbitSeat[] } {
  const sorted = [...seats].sort((a, b) => a.z - b.z)
  return { back: sorted.filter((s) => s.z < 0), front: sorted.filter((s) => s.z >= 0) }
}

/** Bot gần con trỏ nhất trong bán kính bắt của nó, hoặc -1. */
export function pickSeat(
  hits: readonly ({ x: number; y: number; r: number } | undefined)[],
  x: number,
  y: number,
): number {
  let best = -1
  let bestD = Infinity
  hits.forEach((h, i) => {
    if (!h) return
    const d = Math.hypot(h.x - x, h.y - y)
    if (d < h.r && d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
