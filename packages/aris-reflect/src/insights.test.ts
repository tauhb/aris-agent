import { describe, expect, it } from 'vitest'
import { insightsApi } from './index.js'
import { InsightStore, reinforce, renderInsights, type Insight } from './insights.js'
import { parseReflection } from './prompt.js'

const setup = () => {
  const map = new Map<string, Insight>()
  let clock = new Date('2026-10-24T10:00:00Z')
  const store = new InsightStore(
    { get: (k) => map.get(k), entries: () => map.entries(), put: async (k, v) => void map.set(k, v) },
    () => (clock = new Date(clock.getTime() + 1000)),
  )
  return { store, map }
}
const short = { text: 'Người dùng thích câu trả lời ngắn, có bảng', area: 'communication' as const }

describe('hồ sơ chủ nhân', () => {
  it('thấy 4 lần thì vượt 0,8 và vào prompt; gần trùng tính là thấy thêm', async () => {
    const { store } = setup()
    const a = await store.observe('lam', { ...short, quote: 'ngắn thôi' }, 's-1')
    expect(a?.confidence).toBe(0.4)
    expect(renderInsights(store.list('lam'))).toBe('')
    await store.observe('lam', { ...short, supports: a!.id }, 's-2')
    await store.observe(
      'lam',
      { text: 'Người dùng thích câu trả lời ngắn, có bảng so sánh', area: 'communication' },
      's-3',
    )
    const d = await store.observe('lam', { ...short, supports: a!.id }, 's-4')
    expect(d).toMatchObject({ id: a!.id, hits: 4 })
    expect(d!.confidence).toBeCloseTo(reinforce(reinforce(reinforce(0.4))))
    expect(d!.confidence).toBeGreaterThanOrEqual(0.8)
    expect(d!.evidence.map((e) => e.sessionId)).toEqual(['s-1', 's-2', 's-3', 's-4'])
    const prompt = renderInsights(store.list('lam'))
    expect(prompt).toContain('<aris-owner-insights>')
    expect(prompt).toContain('## Cách giao tiếp')
    expect(renderInsights(store.list('mai'))).toBe('')
  })

  it('bằng chứng ngược hạ độ tin cậy và hỏi; chọn lựa chọn thì xác nhận', async () => {
    const { store } = setup()
    const a = await store.observe('lam', { text: 'Người dùng muốn báo cáo dài 1 trang', area: 'work' })
    const b = await store.observe('lam', {
      text: 'Người dùng muốn báo cáo đầy đủ',
      area: 'work',
      contradicts: a!.id,
      question: 'Báo cáo nghiên cứu nên dài 1 trang hay đầy đủ?',
      options: [
        { label: '1 trang', text: 'Người dùng muốn báo cáo nghiên cứu dài 1 trang' },
        { label: 'Đầy đủ', text: 'Người dùng muốn báo cáo nghiên cứu đầy đủ chi tiết' },
      ],
    })
    expect(b).toMatchObject({
      id: a!.id,
      confidence: 0.2,
      question: { text: expect.stringContaining('1 trang') },
    })
    const c = await store.answer(a!.id, 1)
    expect(c).toMatchObject({
      text: 'Người dùng muốn báo cáo nghiên cứu đầy đủ chi tiết',
      confirmed: true,
      confidence: 1,
    })
    expect(c.question).toBeUndefined()
    await expect(store.answer(a!.id, 0)).rejects.toThrow('Lựa chọn')
  })

  it('bác thì không vào prompt và vòng học không đưa lại; sửa là xác nhận', async () => {
    const { store } = setup()
    const a = await store.observe('lam', short)
    await store.reject(a!.id)
    expect(store.list('lam')).toHaveLength(0)
    expect(await store.observe('lam', short)).toBeUndefined()
    const b = await store.observe('lam', { text: 'Người dùng làm việc buổi sáng', area: 'work' })
    expect((await store.edit(b!.id, 'Người dùng làm việc sâu từ 6 đến 9 giờ sáng')).confidence).toBe(1)
    expect(renderInsights(store.list('lam'))).toContain('6 đến 9 giờ')
  })

  it('chép sang bot khác, gộp nhận định trùng ý', async () => {
    const { store } = setup()
    await store.observe('lam', short)
    await store.observe('lam', { text: 'Người dùng tập trung kênh YouTube quý 4', area: 'work' })
    await store.observe('mai', { text: 'Người dùng thích câu trả lời ngắn có bảng', area: 'communication' })
    expect(await store.copy('lam', 'mai')).toBe(2)
    const mai = store.list('mai')
    expect(mai).toHaveLength(2)
    expect(mai.find((i) => i.area === 'communication')?.hits).toBe(2)
    await expect(store.copy('lam', 'lam')).rejects.toThrow()
  })

  it('API: xem, xác nhận, sửa, bác, trả lời, chép', async () => {
    const { store } = setup()
    const a = await store.observe('lam', short)
    const call = async (body?: unknown, q = '?bot=lam') =>
      (await insightsApi(
        store,
        new Request(
          `http://x/api/aris/insights${q}`,
          body ? { method: 'POST', body: JSON.stringify(body) } : {},
        ),
      ).then((r) => r.json())) as { insights?: Insight[]; error?: string; copied?: number }
    expect((await call()).insights).toHaveLength(1)
    expect((await call({ op: 'confirm', id: a!.id })).insights?.[0]?.confirmed).toBe(true)
    expect((await call({ op: 'edit', id: a!.id, text: '' })).error).toBe('Nhận định rỗng.')
    expect((await call({ op: 'copy', bot: 'lam', to: 'tin' })).copied).toBe(1)
    expect((await call({ op: 'reject', id: a!.id })).insights).toHaveLength(0)
    expect((await call({ op: 'nope' })).error).toBe('op không hợp lệ')
  })

  it('đọc quan sát trong câu trả lời của vòng học', () => {
    const { insights } = parseReflection(
      JSON.stringify({
        memories: [],
        insights: [
          {
            text: 'Người dùng không thích emoji',
            area: 'communication',
            quote: 'bỏ emoji đi',
            supports: 'i-1',
          },
          { text: 'Chủ nhân thích cà phê', area: 'work' },
          {
            text: 'Người dùng chạy quảng cáo Facebook',
            area: 'lạ',
            options: [{ label: 'a' }, { label: 'b', text: 'B' }],
          },
        ],
      }),
    )
    expect(insights).toHaveLength(2)
    expect(insights[0]).toMatchObject({ area: 'communication', supports: 'i-1', quote: 'bỏ emoji đi' })
    expect(insights[1]).toMatchObject({ area: 'communication', options: [{ label: 'b', text: 'B' }] })
  })
})
