import { describe, expect, it } from 'vitest'
import { Proposals } from './proposals.js'
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

  it('tìm trong ký ức mọi bot: chỉ ký ức đang hiệu lực, không tính lượt dùng', async () => {
    const { s } = store()
    await s.save({ ...base, bot: 'b-tin', text: 'Người dùng muốn giữ quảng cáo dưới 30% ngân sách' })
    await s.save({
      ...base,
      bot: 'b-minh',
      book: 'notes',
      kind: 'fact',
      text: 'Kênh YouTube đăng video thứ 3',
    })
    const gone = await s.save({ ...base, text: 'Ngân sách quảng cáo tháng 9 là 10 triệu' })
    await s.forget(gone.id)
    const hits = s.searchAll('ngan sach quang cao')
    expect(hits.map((h) => h.bot)).toEqual(['b-tin'])
    expect(hits[0]!.uses).toBe(0)
  })

  it('ký ức cũ viết cứng "chủ nhân" được đổi thành "người dùng"', async () => {
    const { s } = store()
    const a = await s.save({ ...base, text: 'Chủ nhân thích báo cáo dạng bảng, gửi chủ nhân bản gọn' })
    const b = await s.save({ ...base, text: 'Họp chiều thứ 5' })
    expect(await s.dropHardcodedAddress()).toBe(1)
    expect(s.get(a.id)?.text).toBe('Người dùng thích báo cáo dạng bảng, gửi người dùng bản gọn')
    expect(s.get(b.id)?.text).toBe('Họp chiều thứ 5')
    expect(await s.dropHardcodedAddress()).toBe(0)
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
    expect(out).toMatch(/Ghi chú của bot[\s\S]*Google Drive[\s\S]*Hồ sơ người dùng[\s\S]*bảng so sánh/)
  })
})

describe('đề xuất chờ duyệt', () => {
  const setup = (now = new Date('2026-10-24T10:00:00Z')) => {
    const map = new Map<string, MemoryItem>()
    let clock = now
    const store = new MemoryStore(
      {
        get: (k) => map.get(k),
        entries: () => map.entries(),
        put: async (k, v) => void map.set(k, v),
      },
      () => clock,
    )
    return { store, proposals: new Proposals(store), tick: (d: Date) => (clock = d) }
  }
  const base = {
    bot: 'aris',
    book: 'owner' as const,
    kind: 'preference' as const,
    tier: 'core' as const,
    trust: 'agent-inferred' as const,
  }

  it('đề xuất chờ duyệt, bỏ trùng, báo mở và đóng', async () => {
    const { store, proposals } = setup()
    const events: string[] = []
    proposals.on((e) =>
      events.push(`${e.type}:${e.item.bot}${e.type === 'closed' ? `:${e.decision}:${e.by}` : ''}`),
    )
    const p = await proposals.propose({
      ...base,
      text: 'Người dùng không nhận họp trước 9 giờ sáng',
      proposal: { by: 'mai', why: 'Người dùng từ chối họp 8 giờ', via: 'reflect' },
    })
    expect(p?.status).toBe('pending')
    expect(
      await proposals.propose({
        ...base,
        text: 'Người dùng không nhận họp trước 9 giờ',
        proposal: { via: 'reflect' },
      }),
    ).toBeUndefined()
    expect(proposals.list()).toMatchObject([
      { bot: 'mai', why: 'Người dùng từ chối họp 8 giờ', via: 'reflect' },
    ])
    const saved = await proposals.review(p!.id, 'saved', 'telegram', {
      text: 'Người dùng không họp trước 9 giờ',
    })
    expect(saved).toMatchObject({
      status: 'active',
      text: 'Người dùng không họp trước 9 giờ',
      review: { by: 'telegram' },
    })
    expect(events).toEqual(['opened:mai', 'closed:mai:saved:telegram'])
    expect(store.reviewedToday()).toBe(1)
    await expect(proposals.review(p!.id, 'discarded', 'user')).rejects.toThrow('đã được trả lời')
  })

  it('lõi đầy thì không lưu được ở lõi, lưu được vào lưu trữ; nguồn ngoài không lên lõi', async () => {
    const { proposals } = setup()
    const big = await proposals.propose({ ...base, text: 'x '.repeat(700), proposal: { via: 'tool' } })
    await expect(proposals.review(big!.id, 'saved', 'user')).rejects.toThrow()
    expect((await proposals.review(big!.id, 'saved', 'user', { tier: 'archive' })).tier).toBe('archive')
    const ext = await proposals.propose({
      ...base,
      trust: 'external',
      tier: 'archive',
      text: 'Giá vàng tăng',
      proposal: { via: 'tool' },
    })
    await expect(proposals.review(ext!.id, 'saved', 'user', { tier: 'core' })).rejects.toThrow('nguồn ngoài')
  })

  it('quá 7 ngày thì tự bỏ', async () => {
    const { store, proposals, tick } = setup()
    await proposals.propose({ ...base, text: 'Người dùng thích cà phê đen', proposal: { via: 'reflect' } })
    tick(new Date('2026-10-30T10:00:00Z'))
    expect(await proposals.expire()).toBe(0)
    tick(new Date('2026-11-01T10:00:01Z'))
    expect(await proposals.expire()).toBe(1)
    expect(store.pending()).toHaveLength(0)
    expect(store.reviewedToday()).toBe(0)
  })
})
