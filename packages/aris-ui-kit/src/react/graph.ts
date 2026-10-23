/**
 * Phần thuần của đồ thị tri thức 3D (màn 5.3): kiểu nút, phép chiếu phối cảnh
 * sau khi xoay quanh hai trục, lọc nút theo loại và mốc thời gian, tìm nút dưới con trỏ.
 */

export type GraphNodeType = 'note' | 'project' | 'area' | 'person' | 'memory' | 'skill' | 'session'

export interface GraphNode {
  name: string
  type: GraphNodeType
  x: number
  y: number
  z: number
  /** Nút trung tâm của một cụm (dự án, lĩnh vực). */
  hub: boolean
  /** Chỉ số cụm. */
  cl: number
  /** Thời điểm tạo, chuẩn hoá 0–1 (1 = hôm nay). */
  t: number
}

export interface GraphEdge {
  a: number
  b: number
  /** Lệch pha của chấm chạy dọc dây (0–1). */
  off: number
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Tên cụm theo chỉ số. */
  clusters: string[]
}

/** Màu theo loại nút (theo canvas); phiên chat dùng màu chữ mờ của theme. */
export const NODE_COLORS: Record<Exclude<GraphNodeType, 'session'>, string> = {
  note: '#5B8DEF',
  project: '#00B5A5',
  area: '#FFAA00',
  person: '#FF6700',
  memory: '#9259FE',
  skill: '#FF309C',
}

/** Bán kính gốc theo loại nút. */
export const NODE_SIZE: Record<GraphNodeType, number> = {
  note: 5,
  project: 12.5,
  area: 11.5,
  person: 6,
  memory: 6.4,
  skill: 6,
  session: 4.2,
}

export interface Projected {
  x: number
  y: number
  z: number
  /** Hệ số phối cảnh (gần thì lớn hơn 1). */
  p: number
}

/** Khoảng cách camera trong phép chiếu phối cảnh. */
const CAMERA = 3.2

/** Chiếu một điểm sau khi xoay `rotY` quanh trục đứng rồi `rotX` quanh trục ngang. */
export function project(
  x: number,
  y: number,
  z: number,
  view: { rotX: number; rotY: number; scale: number; w: number; h: number },
): Projected {
  const cy = Math.cos(view.rotY)
  const sy = Math.sin(view.rotY)
  const cx = Math.cos(view.rotX)
  const sx = Math.sin(view.rotX)
  const x1 = x * cy - z * sy
  const z1 = x * sy + z * cy
  const y2 = y * cx - z1 * sx
  const z2 = y * sx + z1 * cx
  const p = CAMERA / (CAMERA - z2)
  return { x: view.w / 2 + x1 * view.scale * p, y: view.h / 2 + y2 * view.scale * p, z: z2, p }
}

/** Độ sâu chuẩn hoá 0 (xa) – 1 (gần) để làm mờ nút và dây phía sau. */
export const depth = (z: number) => Math.max(0, Math.min(1, (z + 1.4) / 2.8))

export type GraphFilter = Partial<Record<GraphNodeType, boolean>>

/** Nút có hiện không: loại được bật (dự án, lĩnh vực luôn hiện) và tạo trước mốc thời gian. */
export function isVisible(n: GraphNode, show: GraphFilter, timeCut: number): boolean {
  const on = n.type === 'project' || n.type === 'area' ? true : show[n.type] === true
  return on && n.t <= timeCut + 0.0001
}

/** Nút hiện gần con trỏ nhất trong bán kính bắt (nút trung tâm bắt rộng hơn), hoặc -1. */
export function pickNode(
  nodes: readonly GraphNode[],
  projected: readonly Projected[],
  visible: (n: GraphNode) => boolean,
  x: number,
  y: number,
): number {
  let best = -1
  let bestD = Infinity
  projected.forEach((p, i) => {
    const n = nodes[i]
    if (!n || !visible(n)) return
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < (n.hub ? 16 : 9) * p.p && d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Số dây nối vào mỗi nút. */
export function degrees(graph: Graph): number[] {
  const deg = graph.nodes.map(() => 0)
  for (const e of graph.edges) {
    deg[e.a] = (deg[e.a] ?? 0) + 1
    deg[e.b] = (deg[e.b] ?? 0) + 1
  }
  return deg
}
