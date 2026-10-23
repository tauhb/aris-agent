import { describe, expect, it } from 'vitest'
import { degrees, depth, isVisible, pickNode, project, type Graph, type GraphNode } from './graph.js'

const node = (over: Partial<GraphNode>): GraphNode => ({
  name: '',
  type: 'note',
  x: 0,
  y: 0,
  z: 0,
  hub: false,
  cl: 0,
  t: 0.5,
  ...over,
})

describe('đồ thị tri thức 3D', () => {
  const view = { rotX: 0, rotY: 0, scale: 100, w: 400, h: 300 }

  it('chiếu tâm vào giữa khung; điểm gần camera to ra, điểm xa nhỏ lại', () => {
    expect(project(0, 0, 0, view)).toMatchObject({ x: 200, y: 150, p: 1 })
    const near = project(0, 0, 1, view)
    const far = project(0, 0, -1, view)
    expect(near.p).toBeGreaterThan(1)
    expect(far.p).toBeLessThan(1)
  })

  it('xoay nửa vòng quanh trục đứng thì trái phải đổi chỗ', () => {
    const right = project(1, 0, 0, view)
    const turned = project(1, 0, 0, { ...view, rotY: Math.PI })
    expect(right.x).toBeGreaterThan(200)
    expect(turned.x).toBeLessThan(200)
  })

  it('độ sâu chuẩn hoá trong 0–1', () => {
    expect(depth(-5)).toBe(0)
    expect(depth(5)).toBe(1)
    expect(depth(0)).toBeCloseTo(0.5)
  })

  it('dự án và lĩnh vực luôn hiện; loại khác theo bộ lọc; ẩn nút tạo sau mốc thời gian', () => {
    expect(isVisible(node({ type: 'project' }), {}, 1)).toBe(true)
    expect(isVisible(node({ type: 'skill' }), { skill: false }, 1)).toBe(false)
    expect(isVisible(node({ type: 'note' }), { note: true }, 1)).toBe(true)
    expect(isVisible(node({ type: 'note', t: 0.8 }), { note: true }, 0.5)).toBe(false)
  })

  it('chọn nút hiện gần con trỏ, bỏ qua nút ẩn', () => {
    const nodes = [node({ name: 'a' }), node({ name: 'b', type: 'skill' })]
    const proj = [
      { x: 10, y: 10, z: 0, p: 1 },
      { x: 12, y: 10, z: 0, p: 1 },
    ]
    const vis = (n: GraphNode) => isVisible(n, { note: true }, 1)
    expect(pickNode(nodes, proj, vis, 12, 10)).toBe(0)
    expect(pickNode(nodes, proj, vis, 100, 100)).toBe(-1)
  })

  it('đếm số dây nối vào mỗi nút', () => {
    const g: Graph = {
      nodes: [node({}), node({}), node({})],
      edges: [
        { a: 0, b: 1, off: 0 },
        { a: 0, b: 2, off: 0 },
      ],
      clusters: [],
    }
    expect(degrees(g)).toEqual([2, 1, 1])
  })
})
