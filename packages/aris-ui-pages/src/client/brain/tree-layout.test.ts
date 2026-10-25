import { describe, expect, it } from 'vitest'
import { branchPath, buildTree, bundlePath, foldersOf, LEAF_R } from './tree-layout.js'

const nodes = [
  { id: 'ca-nhan/wiki/nguoi/chi-ha.md', title: 'Chị Hà', type: 'person' },
  { id: 'ca-nhan/wiki/du-an/nha-in.md', title: 'Nhà in', type: 'project' },
  { id: 'ca-nhan/nhat-ky/2026-10-20.md', title: 'Nhật ký', type: 'note' },
  { id: 'cong-ty/kinh-doanh/wiki/khach-hang/abc.md', title: 'ABC', type: 'person' },
  { id: 'ky-uc:12', title: 'Ký ức của Minh', type: 'memory' },
]
const label = (seg: string) => seg

describe('đồ thị cây thư mục', () => {
  it('lấy thư mục theo đường dẫn, ký ức bot thành nhánh riêng', () => {
    expect(foldersOf(nodes[0]!)).toEqual(['ca-nhan', 'wiki', 'nguoi'])
    expect(foldersOf(nodes[4]!)).toEqual(['ky-uc-bot', 'Ký ức của Minh'])
  })

  it('đặt trang ở vòng ngoài, thư mục bên trong theo độ sâu', () => {
    const t = buildTree({ nodes, label, collapsed: new Set() })
    expect(t.root.count).toBe(5)
    const leaves = t.all.filter((n) => n.leaf !== undefined)
    expect(leaves).toHaveLength(5)
    for (const l of leaves) expect(Math.hypot(l.x, l.y)).toBeCloseTo(LEAF_R)
    const folders = t.all.filter((n) => n.leaf === undefined && n.depth > 0)
    for (const f of folders) expect(f.r).toBeLessThan(LEAF_R)
    const caNhan = t.all.find((n) => n.key === 'ca-nhan')!
    expect(caNhan.count).toBe(3)
    expect(caNhan.depth).toBe(1)
    // Các trang khác nhau không chồng góc.
    expect(new Set(leaves.map((l) => l.angle.toFixed(4))).size).toBe(5)
  })

  it('gộp thư mục: trang bên dưới hiện qua nút thư mục', () => {
    const t = buildTree({ nodes, label, collapsed: new Set(['ca-nhan/wiki']) })
    const wiki = t.all.find((n) => n.key === 'ca-nhan/wiki')!
    expect(wiki.collapsed).toBe(true)
    expect(t.shownOf[0]).toBe(wiki)
    expect(t.shownOf[1]).toBe(wiki)
    expect(t.all.some((n) => n.key === 'ca-nhan/wiki/nguoi')).toBe(false)
    expect(t.shownOf[2]?.leaf).toBe(2)
  })

  it('nhánh gộp sẵn: bấm thì mở; lá ký ức hiện nội dung', () => {
    const mem = [...nodes.slice(0, 4), { ...nodes[4]!, text: 'Thích in giấy couché' }]
    const folded = (k: string) => k.startsWith('ky-uc-bot/')
    const a = buildTree({ nodes: mem, label, collapsed: new Set(), folded })
    expect(a.shownOf[4]?.key).toBe('ky-uc-bot/Ký ức của Minh')
    const b = buildTree({ nodes: mem, label, collapsed: new Set(['ky-uc-bot/Ký ức của Minh']), folded })
    expect(b.shownOf[4]?.label).toBe('Thích in giấy couché')
  })

  it('bỏ trang theo bộ lọc', () => {
    const t = buildTree({ nodes, label, collapsed: new Set(), skip: (n) => n.id.includes('/nhat-ky/') })
    expect(t.shownOf[2]).toBeUndefined()
    expect(t.root.count).toBe(4)
  })

  it('vẽ liên kết theo nhánh và cạnh cây', () => {
    const t = buildTree({ nodes, label, collapsed: new Set() })
    const a = t.shownOf[0]!
    const b = t.shownOf[3]!
    const d = bundlePath(a, b, 0.8)
    expect(d.startsWith(`M${a.x.toFixed(1)} ${a.y.toFixed(1)}`)).toBe(true)
    expect(d).toContain(' C')
    // Cùng thư mục cha thì đường ngắn hơn (ít điểm điều khiển hơn).
    const near = bundlePath(t.shownOf[0]!, t.shownOf[1]!, 0.8)
    expect(near.split(' C').length).toBeLessThan(d.split(' C').length)
    expect(branchPath(a)).toMatch(/^M.* Q.*/)
  })
})
