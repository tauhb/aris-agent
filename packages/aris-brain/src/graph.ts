/**
 * Đồ thị bộ não (giai đoạn 5, đợt 4b; bản vẽ 5.1 "Quanh trang này", 5.3). Thuần.
 * - Đồ thị toàn cục: nút là trang (wiki theo loại; nguồn, ký ức bot bật thêm), cạnh là liên kết `[[...]]`, cụm
 *   quanh trang dự án, chủ đề và quanh nút phòng ban; vị trí 3D tính sẵn (cụm trên mặt cầu, nút quanh tâm cụm).
 * - Gợi ý nối: trang nhắc tên một trang khác mà chưa liên kết (như "unlinked mentions" của Obsidian); "Nối" thay
 *   chỗ nhắc đầu tiên bằng `[[tên|chữ gốc]]`.
 */
import { fold } from './page.js'

export type NodeType = 'note' | 'project' | 'area' | 'person' | 'memory' | 'session' | 'department'

export interface GraphPage {
  path: string
  name: string
  title: string
  layer: string
  group?: string | undefined
  /** Nhãn `loai` ở đầu trang. */
  kind?: string | undefined
  space?: string | undefined
  /** Mã phòng ban duy nhất của trang (thư mục `phong-ban/<mã>/`, hay nhãn `phong-ban` một mã); trống nếu dùng chung. */
  dept?: string | undefined
  mtime: number
  links: readonly string[]
}

export interface GraphMemory {
  id: string
  bot: string
  text: string
  at: string
  /** Tên hiện trên đồ thị, ví dụ "Ký ức của Tín". */
  label?: string | undefined
}

export interface GNode {
  /** Đường dẫn trang, `ky-uc:<mã>` cho ký ức bot, `phong-ban:<mã>` cho nút phòng ban. */
  id: string
  name: string
  title: string
  /** Ký ức bot: nội dung ngắn (tiêu đề là tên ký ức theo bot). */
  text?: string | undefined
  type: NodeType
  space?: string | undefined
  x: number
  y: number
  z: number
  hub: boolean
  cl: number
  t: number
}

/** Loại nút theo lớp và nhóm của trang. */
export function nodeType(p: Pick<GraphPage, 'layer' | 'group' | 'kind'>): NodeType {
  if (p.layer === 'nguon') return 'session'
  // Nhãn `loai` của trang trước, rồi mới đến thư mục (trang ở `chung/` không có nhóm).
  const g = p.kind ?? (p.group ?? '').split('/').pop()
  if (g === 'phong-ban') return 'department'
  if (g === 'nguoi' || g === 'khach-hang') return 'person'
  if (g === 'du-an') return 'project'
  if (g === 'chu-de' || g === 'quy-trinh' || g === 'san-pham') return 'area'
  return 'note'
}

/** Số giả ngẫu nhiên ổn định theo chuỗi (vị trí không nhảy giữa hai lần tải). */
function seeded(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const words = (s: string) =>
  ` ${fold(s.normalize('NFC'))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `

export function buildGraph(o: {
  pages: readonly GraphPage[]
  memories?: readonly GraphMemory[] | undefined
  /** Phòng ban: mỗi phòng một nút trung tâm (không phải trang), nằm sau các trang và ký ức. */
  departments?: readonly { id: string; name: string }[] | undefined
  /** Tên cụm khi nút không nối tới dự án hay chủ đề nào. */
  other: string
}): { nodes: GNode[]; edges: { a: number; b: number; off: number }[]; clusters: string[] } {
  const pages = o.pages
  const idx = new Map<string, number>()
  pages.forEach((p, i) => {
    idx.set(fold(p.name), i)
    if (!idx.has(fold(p.title))) idx.set(fold(p.title), i)
  })
  const edges: [number, number][] = []
  const seen = new Set<string>()
  const add = (a: number, b: number) => {
    if (a === b) return
    const k = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(k)) return
    seen.add(k)
    edges.push([a, b])
  }
  pages.forEach((p, i) => {
    for (const l of p.links) {
      const j = idx.get(fold(l))
      if (j !== undefined) add(i, j)
    }
  })
  // Ký ức bot nối tới trang có tiêu đề được nhắc trong ký ức.
  const mems = o.memories ?? []
  const memBase = pages.length
  mems.forEach((m, k) => {
    const hay = words(m.text)
    pages.forEach((p, j) => {
      const tw = words(p.title)
      if (tw.trim().length >= 4 && hay.includes(tw)) add(memBase + k, j)
    })
  })

  const depts = o.departments ?? []
  const deptBase = memBase + mems.length
  const types: NodeType[] = [
    ...pages.map(nodeType),
    ...mems.map(() => 'memory' as const),
    ...depts.map(() => 'department' as const),
  ]
  const total = types.length
  const adj: number[][] = Array.from({ length: total }, () => [])
  for (const [a, b] of edges) {
    adj[a]!.push(b)
    adj[b]!.push(a)
  }
  // Nút phòng ban của từng trang (chỉ khi phòng có trong danh sách).
  const deptNode = new Map(depts.map((d, k) => [d.id, deptBase + k]))
  const ownerOf = (i: number) => (i < memBase ? deptNode.get(pages[i]!.dept ?? '') : undefined)
  // Cụm: tâm là trang dự án, chủ đề; nút khác về tâm gần nhất theo liên kết (tìm theo chiều rộng).
  const topics = types.map((t, i) => (t === 'project' || t === 'area' ? i : -1)).filter((i) => i >= 0)
  const hubs = [...topics, ...depts.map((_, k) => deptBase + k)]
  const cl = new Array<number>(total).fill(-1)
  const queue: number[] = []
  const dist = new Array<number>(total).fill(0)
  topics.forEach((h, c) => {
    cl[h] = c
    queue.push(h)
  })
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q]!
    for (const n of adj[cur]!) {
      if (cl[n] !== -1) continue
      // Trang của phòng ban chỉ theo dự án, chủ đề khi nối thẳng tới tâm; xa hơn thì về cụm phòng.
      if (ownerOf(n) !== undefined && dist[cur]! > 0) continue
      cl[n] = cl[cur]!
      dist[n] = dist[cur]! + 1
      queue.push(n)
    }
  }
  // Cụm phòng ban: tâm, các trang của phòng chưa có cụm, rồi lan theo liên kết cho nút còn lẻ.
  const second = queue.length
  depts.forEach((_, k) => {
    cl[deptBase + k] = topics.length + k
    queue.push(deptBase + k)
  })
  for (let i = 0; i < memBase; i++) {
    const h = ownerOf(i)
    if (h !== undefined && cl[i] === -1) {
      cl[i] = cl[h]!
      queue.push(i)
    }
  }
  for (let q = second; q < queue.length; q++)
    for (const n of adj[queue[q]!]!)
      if (cl[n] === -1) {
        cl[n] = cl[queue[q]!]!
        queue.push(n)
      }
  // Tâm dự án, chủ đề nằm trong phòng thì nối vào nút phòng (cạnh thêm sau khi chia cụm).
  for (const h of topics) {
    const d = ownerOf(h)
    if (d !== undefined) add(d, h)
  }
  const clusters = hubs.map((h) =>
    h < memBase ? pages[h]!.title : h >= deptBase ? depts[h - deptBase]!.name : '',
  )
  const otherId = clusters.length
  const hasOther = cl.some((c) => c === -1)
  if (hasOther) clusters.push(o.other)

  // Vị trí: tâm cụm rải đều trên mặt cầu (xoắn Fibonacci), nút quanh tâm cụm.
  const centers = clusters.map((_, c) => {
    if (c === otherId) return [0, 0, 0] as const
    const n = hubs.length
    const y = n === 1 ? 0 : 1 - (2 * c) / (n - 1)
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = c * 2.399963
    const R = n === 1 ? 0 : 1.05
    return [R * r * Math.cos(th), R * y * 0.8, R * r * Math.sin(th)] as const
  })
  const times = pages.map((p) => p.mtime).concat(mems.map((m) => Date.parse(m.at) || 0))
  const sorted = [...times].sort((a, b) => a - b)
  const rank = (v: number) => (sorted.length > 1 ? sorted.indexOf(v) / (sorted.length - 1) : 1)
  const hubSet = new Set(hubs)
  const nodes: GNode[] = types.map((type, i) => {
    const page = i < memBase ? pages[i] : undefined
    const mem = i >= memBase && i < deptBase ? mems[i - memBase] : undefined
    const dept = i >= deptBase ? depts[i - deptBase] : undefined
    const c = cl[i] === -1 ? otherId : cl[i]!
    const hub = hubSet.has(i)
    const rnd = seeded(page?.path ?? mem?.id ?? `phong-ban:${dept!.id}`)
    const [cx, cy, cz] = centers[c]!
    const rad = hub ? 0 : c === otherId ? 0.35 + rnd() * 0.5 : 0.24 + rnd() * 0.26
    const th = rnd() * Math.PI * 2
    const ph = Math.acos(2 * rnd() - 1)
    return {
      id: page?.path ?? (dept ? `phong-ban:${dept.id}` : `ky-uc:${mem!.id}`),
      name: page?.name ?? dept?.id ?? mem!.id,
      title: page?.title ?? dept?.name ?? mem!.label ?? mem!.text.slice(0, 60),
      ...(mem ? { text: mem.text.slice(0, 60) } : {}),
      type,
      space: page?.space ?? (dept ? 'cong-ty' : undefined),
      x: cx + rad * Math.sin(ph) * Math.cos(th),
      y: cy + rad * Math.cos(ph),
      z: cz + rad * Math.sin(ph) * Math.sin(th),
      hub,
      cl: c,
      t: dept ? 1 : Math.max(0.02, rank(times[i]!)),
    }
  })
  const off = seeded('edges')
  return { nodes, edges: edges.map(([a, b]) => ({ a, b, off: off() })), clusters }
}

/** Phần thân không xét khi tìm chỗ nhắc tên: nhãn đầu trang, mã, liên kết, tiêu đề mục. */
function masked(body: string): string {
  const keep = (m: string) => ' '.repeat(m.length)
  return body
    .replace(/^---\r?\n[\s\S]*?\r?\n---/, keep)
    .replace(/```[\s\S]*?```/g, keep)
    .replace(/`[^`\n]*`/g, keep)
    .replace(/\[\[[^\]\n]*\]\]/g, keep)
    .replace(/\[\^[^\]\n]*\]:?/g, keep)
    .replace(/^#+ .*$/gm, keep)
}

/** Chỗ nhắc tên `title` đầu tiên chưa thành liên kết (khớp không dấu, trọn từ), hay undefined. */
export function unlinkedMention(body: string, title: string): { start: number; end: number } | undefined {
  const t = fold(title.normalize('NFC')).trim()
  if (t.replace(/[^\p{L}\p{N}]/gu, '').length < 4) return undefined
  const hay = fold(masked(body.normalize('NFC')))
  for (let i = hay.indexOf(t); i >= 0; i = hay.indexOf(t, i + 1)) {
    const before = i > 0 ? hay[i - 1]! : ' '
    const after = hay[i + t.length] ?? ' '
    if (/[\p{L}\p{N}]/u.test(before) || /[\p{L}\p{N}]/u.test(after)) continue
    return { start: i, end: i + t.length }
  }
  return undefined
}

/** Nối: thay chỗ nhắc bằng `[[tên|chữ gốc]]` (chữ gốc trùng tên thì `[[tên]]`). */
export function linkMention(body: string, title: string, name: string): string | undefined {
  const text = body.normalize('NFC')
  const at = unlinkedMention(text, title)
  if (!at) return undefined
  const shown = text.slice(at.start, at.end)
  const link = shown === name ? `[[${name}]]` : `[[${name}|${shown}]]`
  return text.slice(0, at.start) + link + text.slice(at.end)
}
