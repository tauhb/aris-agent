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
