/**
 * Đồ thị bộ não dạng cây thư mục (5.3b): cây tỏa tròn theo đường dẫn trang (Brain ở tâm, rồi Cá nhân / Công ty,
 * lớp, nhóm, phòng ban, trang ở vòng ngoài), liên kết giữa trang uốn theo nhánh cây (hierarchical edge
 * bundling, Holten 2006). Thuần: nhận nút, cạnh của `/api/aris/brain?graph`, trả vị trí và đường vẽ.
 */

export interface InNode {
  /** Đường dẫn trang, hay `ky-uc:<mã>` cho ký ức bot. */
  id: string
  title: string
  /** Ký ức bot: nội dung ngắn, hiện ở lá (tiêu đề thành tên nhánh). */
  text?: string | undefined
  type: string
}

export interface TNode {
  key: string
  label: string
  depth: number
  parent?: TNode | undefined
  kids: TNode[]
  /** Chỉ số nút trang trong danh sách vào (lá). */
  leaf?: number | undefined
  /** Số trang bên dưới (nhánh). */
  count: number
  collapsed: boolean
  angle: number
  r: number
  x: number
  y: number
}

export interface TreeLayout {
  root: TNode
  all: TNode[]
  /** Nút hiện cho mỗi trang (chính nó, hay nhánh đã gộp chứa nó). */
  shownOf: (TNode | undefined)[]
  radius: number
}

/** Bán kính vòng trang. */
export const LEAF_R = 300

/** Thư mục của một trang theo đường dẫn; ký ức bot thành nhánh riêng theo tên ký ức (theo bot). */
export function foldersOf(n: InNode): string[] {
  if (n.id.startsWith('ky-uc:')) return ['ky-uc-bot', n.title]
  return n.id.split('/').slice(0, -1)
}

export function buildTree(o: {
  nodes: readonly InNode[]
  label: (segment: string, key: string) => string
  /** Thư mục đảo trạng thái gộp: mặc định gộp sẵn, có trong `collapsed` thì mở. */
  collapsed: ReadonlySet<string>
  folded?: (key: string) => boolean
  /** Bỏ trang (ví dụ nhật ký khi tắt). */
  skip?: (n: InNode) => boolean
}): TreeLayout {
  const root: TNode = {
    key: '',
    label: 'Brain',
    depth: 0,
    kids: [],
    count: 0,
    collapsed: false,
    angle: 0,
    r: 0,
    x: 0,
    y: 0,
  }
  const byKey = new Map<string, TNode>([['', root]])
  const shownOf: (TNode | undefined)[] = []
  o.nodes.forEach((n, i) => {
    if (o.skip?.(n)) {
      shownOf.push(undefined)
      return
    }
    let parent = root
    let key = ''
    let hidden: TNode | undefined
    for (const seg of foldersOf(n)) {
      key = key ? `${key}/${seg}` : seg
      let f = byKey.get(key)
      if (!f) {
        f = {
          key,
          label: o.label(seg, key),
          depth: parent.depth + 1,
          parent,
          kids: [],
          count: 0,
          collapsed: o.collapsed.has(key) !== (o.folded?.(key) ?? false),
          angle: 0,
          r: 0,
          x: 0,
          y: 0,
        }
        byKey.set(key, f)
        parent.kids.push(f)
      }
      f.count++
      if (!hidden && f.collapsed) hidden = f
      parent = f
    }
    root.count++
    if (hidden) {
      shownOf.push(hidden)
      return
    }
    const leaf: TNode = {
      key: `#${i}`,
      label: n.text ?? n.title,
      depth: parent.depth + 1,
      parent,
      kids: [],
      leaf: i,
      count: 1,
      collapsed: false,
      angle: 0,
      r: 0,
      x: 0,
      y: 0,
    }
    parent.kids.push(leaf)
    shownOf.push(leaf)
  })

  // Lá (kể cả nhánh đã gộp) chia đều quanh vòng, chừa khe giữa các nhánh lớn (Cá nhân, Công ty…).
  const order: TNode[] = []
  const collect = (n: TNode) => {
    if (n !== root && (!n.kids.length || n.collapsed)) order.push(n)
    else for (const k of n.kids) collect(k)
  }
  collect(root)
  const top = (n: TNode) => {
    let t = n
    while (t.parent && t.parent !== root) t = t.parent
    return t
  }
  const GAP = 1.4
  let u = 0
  let prev: TNode | undefined
  const units = order.map((n) => {
    const t = top(n)
    if (prev && t !== prev) u += GAP
    prev = t
    return u++
  })
  const total = Math.max(1, u + (root.kids.length > 1 ? GAP : 0))
  order.forEach((n, i) => (n.angle = -Math.PI / 2 + (2 * Math.PI * (units[i]! + 0.5)) / total))
  const setAngle = (n: TNode): number => {
    if (order.includes(n)) return n.angle
    const a = n.kids.map(setAngle)
    n.angle = a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
    return n.angle
  }
  setAngle(root)

  // Bán kính: thư mục theo độ sâu, trang ở vòng ngoài.
  const all: TNode[] = []
  const walk = (n: TNode) => {
    all.push(n)
    if (!n.collapsed) for (const k of n.kids) walk(k)
  }
  walk(root)
  const maxDepth = Math.max(1, ...all.filter((n) => n.leaf === undefined).map((n) => n.depth))
  for (const n of all) {
    n.r = n === root ? 0 : n.leaf !== undefined || n.collapsed ? LEAF_R : (LEAF_R * 0.82 * n.depth) / maxDepth
    n.x = n.r * Math.cos(n.angle)
    n.y = n.r * Math.sin(n.angle)
  }
  return { root, all, shownOf, radius: LEAF_R }
}

/** Đường cong của một liên kết: đi lên tổ tiên chung rồi xuống, nắn thẳng theo `beta` (0 thẳng, 1 sát cây). */
export function bundlePath(a: TNode, b: TNode, beta: number): string {
  const up: TNode[] = []
  for (let n: TNode | undefined = a; n; n = n.parent) up.push(n)
  const down: TNode[] = []
  let lca: TNode | undefined
  for (let n: TNode | undefined = b; n; n = n.parent) {
    if (up.includes(n)) {
      lca = n
      break
    }
    down.push(n)
  }
  const chain = [...up.slice(0, up.indexOf(lca!) + 1), ...down.reverse()]
  const k = chain.length
  const [x0, y0, x1, y1] = [chain[0]!.x, chain[0]!.y, chain[k - 1]!.x, chain[k - 1]!.y]
  const pts = chain.map((n, i) => {
    const t = k > 1 ? i / (k - 1) : 0
    return [
      beta * n.x + (1 - beta) * (x0 + (x1 - x0) * t),
      beta * n.y + (1 - beta) * (y0 + (y1 - y0) * t),
    ] as const
  })
  const P = [pts[0]!, pts[0]!, ...pts, pts[k - 1]!, pts[k - 1]!]
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`
  for (let i = 0; i + 3 < P.length; i++) {
    const [p1, p2, p3] = [P[i + 1]!, P[i + 2]!, P[i + 3]!]
    const c1 = [(2 * p1[0] + p2[0]) / 3, (2 * p1[1] + p2[1]) / 3]
    const c2 = [(p1[0] + 2 * p2[0]) / 3, (p1[1] + 2 * p2[1]) / 3]
    const e = [(p1[0] + 4 * p2[0] + p3[0]) / 6, (p1[1] + 4 * p2[1] + p3[1]) / 6]
    d += ` C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${e[0]!.toFixed(1)} ${e[1]!.toFixed(1)}`
  }
  return d
}

/** Cạnh cây từ cha tới con (cong nhẹ theo bán kính). */
export function branchPath(n: TNode): string {
  const p = n.parent!
  const rm = (p.r + n.r) / 2
  return `M${p.x.toFixed(1)} ${p.y.toFixed(1)} Q${(rm * Math.cos(n.angle)).toFixed(1)} ${(rm * Math.sin(n.angle)).toFixed(1)} ${n.x.toFixed(1)} ${n.y.toFixed(1)}`
}

export type Vec3 = readonly [number, number, number]

/**
 * Cây 3D kiểu cầu (5.3c): Brain ở tâm, trang (và nhánh đã gộp) rải theo một đường xoắn trên mặt cầu bán kính 1 từ
 * đỉnh xuống đáy nên anh em nằm liền nhau, chừa khe giữa hai không gian và giữa các lớp; thư mục nằm ở lớp trong,
 * theo hướng trung bình của con, bán kính theo độ sâu. Dùng lại cấu trúc của `buildTree`.
 */
export function sphereLayout(t: TreeLayout): Map<TNode, Vec3> {
  const pos = new Map<TNode, Vec3>()
  const outer = t.all.filter((n) => n !== t.root && (n.leaf !== undefined || n.collapsed))
  const anc = (n: TNode, depth: number) => {
    let a = n
    while (a.parent && a.depth > depth) a = a.parent
    return a
  }
  let u = 0
  let pt: TNode | undefined
  let ps: TNode | undefined
  const units = outer.map((n) => {
    const top = anc(n, 1)
    const sub = anc(n, 2)
    if (pt && top !== pt) u += 2.2
    else if (ps && sub !== ps) u += 0.7
    pt = top
    ps = sub
    return u++
  })
  const total = Math.max(1, u)
  const turns = Math.max(1.5, Math.sqrt(outer.length) / 1.5)
  outer.forEach((n, i) => {
    const f = (units[i]! + 0.5) / total
    const y = -0.96 + 1.92 * f
    const r = Math.sqrt(1 - y * y)
    const th = f * turns * Math.PI * 2
    pos.set(n, [r * Math.cos(th), y, r * Math.sin(th)])
  })
  const maxDepth = Math.max(
    1,
    ...t.all.filter((n) => n.leaf === undefined && !n.collapsed).map((n) => n.depth),
  )
  const dir = (n: TNode): Vec3 => {
    const own = pos.get(n)
    if (own) return own
    const v = [0, 0, 0]
    for (const k of n.kids) {
      const d = dir(k)
      v[0]! += d[0]
      v[1]! += d[1]
      v[2]! += d[2]
    }
    const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1
    // Lớp thư mục đầu cách tâm đủ xa để tên Cá nhân, Công ty không chồng lên Brain.
    const r = n === t.root ? 0 : 0.28 + (0.5 * (n.depth - 1)) / Math.max(1, maxDepth - 1)
    const p: Vec3 = [(v[0]! / l) * r, (v[1]! / l) * r, (v[2]! / l) * r]
    pos.set(n, p)
    return [v[0]! / l, v[1]! / l, v[2]! / l]
  }
  dir(t.root)
  return pos
}

/** Liên kết 3D: đi lên tổ tiên chung rồi xuống, nắn thẳng theo `beta`, làm mượt bằng B-spline bậc 3 (điểm mẫu). */
export function bundlePoints(
  a: TNode,
  b: TNode,
  beta: number,
  pos: ReadonlyMap<TNode, Vec3>,
  steps = 8,
): Vec3[] {
  const up: TNode[] = []
  for (let n: TNode | undefined = a; n; n = n.parent) up.push(n)
  const down: TNode[] = []
  let lca: TNode | undefined
  for (let n: TNode | undefined = b; n; n = n.parent) {
    if (up.includes(n)) {
      lca = n
      break
    }
    down.push(n)
  }
  const chain = [...up.slice(0, up.indexOf(lca!) + 1), ...down.reverse()]
  const k = chain.length
  const A = pos.get(chain[0]!) ?? [0, 0, 0]
  const B = pos.get(chain[k - 1]!) ?? [0, 0, 0]
  const pts = chain.map((n, i): Vec3 => {
    const f = k > 1 ? i / (k - 1) : 0
    const p = pos.get(n) ?? [0, 0, 0]
    return [0, 1, 2].map((c) => beta * p[c]! + (1 - beta) * (A[c]! + (B[c]! - A[c]!) * f)) as unknown as Vec3
  })
  const P = [pts[0]!, pts[0]!, ...pts, pts[k - 1]!, pts[k - 1]!]
  const out: Vec3[] = []
  for (let i = 0; i + 3 < P.length; i++) {
    for (let s = 0; s < steps; s++) {
      const f = s / steps
      const w = [
        (1 - f) ** 3 / 6,
        (3 * f ** 3 - 6 * f ** 2 + 4) / 6,
        (-3 * f ** 3 + 3 * f ** 2 + 3 * f + 1) / 6,
        f ** 3 / 6,
      ]
      out.push([0, 1, 2].map((c) => w.reduce((sum, wj, j) => sum + wj * P[i + j]![c]!, 0)) as unknown as Vec3)
    }
  }
  out.push(pts[k - 1]!)
  return out
}
