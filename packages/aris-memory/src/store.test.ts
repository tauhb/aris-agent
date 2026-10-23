import { describe, expect, it } from 'vitest'
import {
  CAPS,
  MemoryError,
  MemoryStore,
  fold,
  newId,
  renderCore,
  type MemoryItem,
  type MemoryTable,
} from './store.js'

function memTable(): MemoryTable & { map: Map<string, MemoryItem> } {
  const map = new Map<string, MemoryItem>()
  return {
    map,
    get: (k) => map.get(k),
    entries: () => map.entries(),
    put: async (k, v) => void map.set(k, v),
  }
}

function store() {
  let t = Date.parse('2026-10-23T10:00:00Z')
  const table = memTable()
  return { table, s: new MemoryStore(table, () => new Date((t += 1000))) }
}

const base = { bot: 'aris', kind: 'preference', book: 'owner', tier: 'core', trust: 'user-stated' } as const

describe('MemoryStore', () => {
  it('mã bản ghi hợp lệ cho khoá storage', () => {
    expect(newId(Date.now())).toMatch(/^[a-zA-Z0-9_-]+$/)
  })

  it('bỏ dấu khi so khớp', () => {
    expect(fold('Họp Đội')).toBe('hop doi')
  })

  it('lưu, sửa, xoá mềm', async () => {
    const { s, table } = store()
    const m = await s.save({ ...base, text: 'Họp team marketing ưu tiên chiều thứ 5' })
    expect(s.list('aris')).toHaveLength(1)
    const u = await s.update(m.id, 'Họp team marketing chiều thứ 5, sau 14h')
    expect(u.revision).toBe(2)
    await s.forget(m.id)
    expect(s.list('aris')).toHaveLength(0)
    expect(table.map.get(m.id)?.status).toBe('deleted')
  })

  it('từ chối khi vượt trần và báo cách xử lý', async () => {
    const { s } = store()
    await s.save({ ...base, text: 'x'.repeat(CAPS.owner - 10) })
    await expect(s.save({ ...base, text: 'y'.repeat(20) })).rejects.toMatchObject({ code: 'full' })
    // Lưu trữ không có trần.
    await expect(s.save({ ...base, tier: 'archive', text: 'y'.repeat(20) })).resolves.toBeTruthy()
    expect(s.usage('aris', 'owner').used).toBe(CAPS.owner - 10)
  })

  it('nội dung nguồn ngoài không lên lõi', async () => {
    const { s } = store()
    await expect(
      s.save({ ...base, trust: 'external', text: 'Giá đối thủ B giảm 20%' }),
    ).rejects.toBeInstanceOf(MemoryError)
    const a = await s.save({ ...base, trust: 'external', tier: 'archive', text: 'Giá đối thủ B giảm 20%' })
    await expect(s.promote(a.id)).rejects.toMatchObject({ code: 'untrusted-core' })
  })

  it('hạ, nâng, duyệt ký ức chờ', async () => {
    const { s } = store()
    const m = await s.save({ ...base, text: 'Báo cáo dùng đơn vị triệu đồng' })
    await s.demote(m.id)
    expect(s.list('aris', { tier: 'core' })).toHaveLength(0)
    await s.promote(m.id)
    expect(s.list('aris', { tier: 'core' })).toHaveLength(1)
    const p = await s.save({ ...base, status: 'pending', text: 'Không họp trước 9 giờ sáng' })
    expect(renderCore(s.list('aris'))).not.toContain('9 giờ')
    await s.approve(p.id)
    expect(renderCore(s.list('aris'))).toContain('9 giờ')
  })

  it('tìm không dấu, xếp theo mức khớp, tăng lượt dùng', async () => {
    const { s } = store()
    await s.save({ ...base, tier: 'archive', kind: 'project', text: 'Khoá học AI ra mắt tháng 12' })
    await s.save({
      ...base,
      tier: 'archive',
      kind: 'person',
      text: 'Chị Hà — editor video, làm việc qua Zalo',
    })
    const r = await s.search('aris', 'khoa hoc ra mat')
    expect(r.map((m) => m.text)).toEqual(['Khoá học AI ra mắt tháng 12'])
    expect(r[0]!.uses).toBe(1)
    expect(await s.search('aris', '   ')).toEqual([])
    expect(await s.search('lam', 'khoa hoc')).toEqual([])
  })

  it('đoạn lõi chia theo cuốn, rỗng khi chưa có', async () => {
    const { s } = store()
    expect(renderCore(s.list('aris'))).toBe('')
    await s.save({ ...base, text: 'Thích bảng so sánh có cột nguồn' })
    await s.save({
      ...base,
      book: 'notes',
      kind: 'environment',
      text: 'Tài liệu ở Google Drive "Kinh doanh 2026"',
    })
    const out = renderCore(s.list('aris'))
    expect(out).toMatch(/Ghi chú của bot[\s\S]*Google Drive[\s\S]*Hồ sơ chủ nhân[\s\S]*bảng so sánh/)
  })
})
