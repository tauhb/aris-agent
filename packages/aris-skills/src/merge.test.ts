import { describe, expect, it } from 'vitest'
import {
  DUP_MAX_PAIRS,
  duplicateCandidates,
  headingsOf,
  mergePrompt,
  pairKey,
  parseMerge,
  similarity,
  type DupSkill,
} from './merge.js'
import { SkillStore } from './store.js'

const body = (extra = '') => `## Khi nào dùng
Người dùng cần báo cáo doanh thu tuần.

## Các bước
1. Lấy file doanh thu tuần
2. Gộp theo kênh, đơn vị triệu đồng
${extra}`

const sk = (over: Partial<DupSkill> & { name: string }): DupSkill => ({
  id: `tin--${over.name}`,
  bot: 'tin',
  description: 'Báo cáo doanh thu tuần theo kênh bán hàng',
  body: body(),
  ...over,
})

describe('tìm cặp nghi trùng', () => {
  it('hai skill gần giống thì thành cặp, hai skill khác việc thì không', () => {
    const a = sk({ name: 'bao-cao-doanh-thu-tuan' })
    const b = sk({
      name: 'bao-cao-doanh-thu-tuan-theo-kenh',
      description: 'Làm báo cáo doanh thu tuần theo từng kênh bán',
    })
    const c = sk({
      name: 'dat-lich-hop',
      description: 'Đặt lịch họp với khách và gửi lời mời',
      body: '## Các bước\n1. Hỏi giờ rảnh\n2. Gửi lời mời',
    })
    const out = duplicateCandidates([a, b, c])
    expect(out).toHaveLength(1)
    expect(out[0]!.a.name).toBe('bao-cao-doanh-thu-tuan')
    expect(out[0]!.score).toBeGreaterThanOrEqual(0.45)
    expect(similarity(a, c)).toBeLessThan(0.45)
  })

  it('chỉ so skill cùng bot, bỏ cặp trong danh sách bỏ qua', () => {
    const a = sk({ name: 'bao-cao-doanh-thu-tuan' })
    const other = sk({ name: 'bao-cao-doanh-thu-tuan', bot: 'khoa', id: 'khoa--bao-cao-doanh-thu-tuan' })
    expect(duplicateCandidates([a, other])).toHaveLength(0)
    const b = sk({ name: 'bao-cao-doanh-thu-tuan-v2' })
    expect(duplicateCandidates([a, b])).toHaveLength(1)
    expect(duplicateCandidates([a, b], new Set([pairKey(b.id, a.id)]))).toHaveLength(0)
  })

  it('mỗi lần tối đa 10 cặp, điểm cao trước', () => {
    const many = Array.from({ length: 8 }, (_, i) => sk({ name: `bao-cao-${i}`, id: `tin--bao-cao-${i}` }))
    const out = duplicateCandidates(many)
    expect(out).toHaveLength(DUP_MAX_PAIRS)
    expect(out[0]!.score).toBeGreaterThanOrEqual(out.at(-1)!.score)
  })

  it('tiêu đề mục trùng được cộng điểm', () => {
    expect(headingsOf(body())).toEqual(new Set(['khi nao dung', 'cac buoc']))
    const a = sk({ name: 'a-b', description: 'xử lý hóa đơn nhập kho' })
    const same = sk({ name: 'c-d', description: 'kiểm tra tồn kho cuối ngày' })
    const diff = { ...same, body: '## Quy trình\nlàm gì đó' }
    expect(similarity(a, same)).toBeGreaterThan(similarity(a, diff))
  })

  it('lời nhờ model nêu cả hai skill', () => {
    const p = mergePrompt(sk({ name: 'a-a' }), sk({ name: 'b-b' }))
    expect(p).toContain('Tên: a-a')
    expect(p).toContain('Tên: b-b')
  })
})

describe('đọc kết quả của model', () => {
  const names = ['a-a', 'b-b'] as const
  it('duplicate kèm thân gộp', () => {
    expect(
      parseMerge(
        'Đây:\n{"relation":"duplicate","keep":"b-b","reason":"cùng việc","merged":"## Các bước\\n1. x"}',
        names,
      ),
    ).toEqual({ relation: 'duplicate', keep: 'b-b', reason: 'cùng việc', merged: '## Các bước\n1. x' })
  })
  it('duplicate thiếu thân gộp hay giữ tên lạ thì bỏ', () => {
    expect(parseMerge('{"relation":"duplicate","keep":"a-a","reason":"x"}', names)).toBeUndefined()
    expect(
      parseMerge('{"relation":"duplicate","keep":"lạ","reason":"x","merged":"y"}', names),
    ).toBeUndefined()
  })
  it('overlap và distinct không cần thân gộp', () => {
    expect(parseMerge('{"relation":"overlap","keep":"a-a","reason":"chung một phần"}', names)).toEqual({
      relation: 'overlap',
      keep: 'a-a',
      reason: 'chung một phần',
    })
    expect(parseMerge('{"relation":"distinct","keep":"zzz","reason":"khác việc"}', names)?.keep).toBe('a-a')
  })
  it('JSON hỏng hay quan hệ lạ thì bỏ', () => {
    expect(parseMerge('không có json', names)).toBeUndefined()
    expect(parseMerge('{"relation":"duplicate","keep":', names)).toBeUndefined()
    expect(parseMerge('{"relation":"gần giống","keep":"a-a"}', names)).toBeUndefined()
  })
})

describe('duyệt và từ chối đề xuất gộp', () => {
  const setup = () => {
    let clock = new Date('2026-10-26T10:00:00Z')
    const t = () => {
      const m = new Map()
      return {
        get: (k: string) => m.get(k),
        entries: () => m.entries(),
        put: async (k: string, v: never) => void m.set(k, v),
        delete: async (k: string) => m.delete(k),
      }
    }
    const store = new SkillStore(t(), t(), () => clock)
    return { store, tick: (d: string) => (clock = new Date(d)) }
  }
  const add = async (store: SkillStore, name: string, bot = 'tin') => {
    const v = await store.propose({
      bot,
      name,
      description: 'Báo cáo doanh thu tuần theo kênh',
      body: body(name),
      by: 'user',
    })
    await store.approve(v!.id, 'user')
    return `${bot}--${name}`
  }

  it('duyệt: skill giữ lại có bản mới, skill kia được cất kèm "đã gộp vào"', async () => {
    const { store } = setup()
    const keep = await add(store, 'bao-cao-tuan')
    const gone = await add(store, 'bao-cao-tuan-kenh')
    const p = await store.propose({
      bot: 'tin',
      name: 'bao-cao-tuan',
      description: 'Báo cáo doanh thu tuần theo kênh',
      body: body('đã gộp'),
      by: 'merge',
      mergeOf: gone,
    })
    expect(p?.by).toBe('merge')
    await store.approve(p!.id, 'user')
    expect(store.get(keep)?.version).toBe(2)
    expect(store.get(gone)).toMatchObject({ status: 'archived', archivedBy: 'curator', mergedInto: keep })
  })

  it('từ chối: cặp được nhớ 90 ngày rồi hết', async () => {
    const { store, tick } = setup()
    const keep = await add(store, 'bao-cao-tuan')
    const gone = await add(store, 'bao-cao-tuan-kenh')
    const p = await store.propose({
      bot: 'tin',
      name: 'bao-cao-tuan',
      description: 'Báo cáo doanh thu tuần theo kênh',
      body: body('đã gộp'),
      by: 'merge',
      mergeOf: gone,
    })
    await store.reject(p!.id, 'user')
    expect(store.get(gone)?.status).toBe('active')
    expect(store.mergeSkipped().has(pairKey(keep, gone))).toBe(true)
    tick('2027-02-01T10:00:00Z')
    expect(store.mergeSkipped().has(pairKey(keep, gone))).toBe(false)
  })

  it('đề xuất gộp hết hạn không tính là từ chối', async () => {
    const { store } = setup()
    const keep = await add(store, 'bao-cao-tuan')
    const gone = await add(store, 'bao-cao-tuan-kenh')
    const p = await store.propose({
      bot: 'tin',
      name: 'bao-cao-tuan',
      description: 'Báo cáo doanh thu tuần theo kênh',
      body: body('đã gộp'),
      by: 'merge',
      mergeOf: gone,
    })
    await store.reject(p!.id, 'timeout')
    expect(store.mergeSkipped().has(pairKey(keep, gone))).toBe(false)
  })
})
