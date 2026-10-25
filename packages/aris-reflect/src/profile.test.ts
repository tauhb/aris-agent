import { describe, expect, it } from 'vitest'
import { insightsApi } from './index.js'
import { InsightStore, SHARED, type Insight } from './insights.js'
import { parseDrafts, parseVerdicts, reconciled, warmPick } from './profile.js'

const setup = () => {
  const map = new Map<string, Insight>()
  let clock = new Date('2026-10-25T10:00:00Z')
  const store = new InsightStore(
    { get: (k) => map.get(k), entries: () => map.entries(), put: async (k, v) => void map.set(k, v) },
    () => (clock = new Date(clock.getTime() + 1000)),
  )
  return { store, map }
}
const phone = {
  text: 'Người dùng đọc trên điện thoại là chính, mỗi mục một dòng',
  area: 'communication' as const,
}

describe('hồ sơ chung', () => {
  it('hai bot cùng thấy một điều thì gộp lên hồ sơ chung, bot nào cũng đọc', async () => {
    const { store } = setup()
    const a = await store.observeDetailed('aris', { ...phone, quote: 'đọc trên đt' }, 's-1')
    expect(a?.kind).toBe('new')
    const b = await store.observeDetailed('an', { ...phone, text: `${phone.text} ngắn gọn` }, 's-2')
    expect(b?.kind).toBe('share')
    expect(b?.insight).toMatchObject({ bot: SHARED, hits: 2 })
    expect(b?.insight.bots?.sort()).toEqual(['an', 'aris'])
    expect(store.list('aris')).toHaveLength(0)
    expect(store.forBot('minh').map((i) => i.id)).toEqual([b!.insight.id])
    // Bot thứ ba thấy lại: nâng hồ sơ chung, ghi thêm bot.
    const c = await store.observeDetailed('minh', { ...phone, supports: b!.insight.id }, 's-3')
    expect(c).toMatchObject({ kind: 'raise', insight: { bot: SHARED, hits: 3 } })
    expect(c!.insight.bots).toContain('minh')
    expect(c!.insight.confidence).toBeGreaterThan(b!.insight.confidence)
  })

  it('đưa vào chung bằng tay; ngược ý hồ sơ chung thì hỏi lại', async () => {
    const { store } = setup()
    const r = await store.observe('minh', { text: 'Người dùng muốn báo cáo một trang', area: 'work' }, 's-1')
    const shared = await store.share(r!.id)
    expect(shared).toMatchObject({ bot: SHARED, bots: ['minh'] })
    await expect(store.share(shared.id)).rejects.toThrow()
    const ask = await store.observeDetailed(
      'an',
      {
        text: 'Người dùng muốn báo cáo đầy đủ chi tiết',
        area: 'work',
        contradicts: shared.id,
        question: 'Báo cáo dài hay ngắn?',
        options: [
          { label: 'Một trang', text: 'Người dùng muốn báo cáo một trang' },
          { label: 'Đầy đủ', text: 'Người dùng muốn báo cáo đầy đủ' },
        ],
      },
      's-2',
    )
    expect(ask).toMatchObject({ kind: 'ask', insight: { id: shared.id } })
    expect(ask!.insight.question?.options).toHaveLength(2)
  })

  it('API đọc hồ sơ chung, đưa vào chung, thông tin suy luận', async () => {
    const { store } = setup()
    const r = await store.observe('aris', { text: 'Người dùng làm việc sâu buổi sáng', area: 'work' })
    const post = (body: unknown) =>
      insightsApi(
        store,
        new Request('http://x/api/aris/insights', { method: 'POST', body: JSON.stringify(body) }),
      )
    const res = (await (await post({ op: 'share', id: r!.id })).json()) as { insights: Insight[] }
    expect(res.insights).toHaveLength(0)
    const g = (await (
      await insightsApi(store, new Request('http://x/api/aris/insights?bot=chung'))
    ).json()) as {
      insights: Insight[]
    }
    expect(g.insights[0]!.text).toBe('Người dùng làm việc sâu buổi sáng')
    const p = await insightsApi(store, new Request('http://x/api/aris/insights?profile'), async () => ({
      every: 6,
    }))
    expect(await p.json()).toEqual({ every: 6 })
  })
})

describe('suy luận ba vòng', () => {
  it('đọc quan sát, phán quyết soát, kết quả hoà giải', () => {
    const drafts = parseDrafts(
      '```json\n{"observations":[{"text":"Người dùng thích bảng","area":"communication","quote":"cho bảng"},{"text":"Chủ nhân hay bận","area":"work"},{"text":"x","area":"la"}]}\n```',
    )
    expect(drafts.map((d) => d.text)).toEqual(['Người dùng thích bảng', 'x'])
    expect(drafts[1]!.area).toBe('communication')
    expect(
      parseVerdicts('{"verdicts":[{"i":0,"keep":true},{"i":0,"keep":false},{"i":5,"keep":true}]}', 2),
    ).toEqual([{ i: 0, keep: true, why: undefined }])
    const obs = reconciled(
      '{"results":[{"i":0,"action":"supports","id":"i-1"},{"i":1,"action":"contradicts","id":"i-x","question":"?"}]}',
      drafts,
      new Set(['i-1']),
    )
    expect(obs[0]).toMatchObject({ supports: 'i-1' })
    expect(obs[1]).not.toHaveProperty('contradicts')
    expect(reconciled('rác', drafts, new Set())).toHaveLength(2)
    expect(
      reconciled('{"results":[{"i":0,"action":"supports","id":"[i-1]"}]}', drafts, new Set(['i-1']))[0],
    ).toMatchObject({
      supports: 'i-1',
    })
  })

  it('đầu phiên chọn nhận định gần câu đầu nhất, tin cậy góp phần', () => {
    const mk = (id: string, text: string, confidence = 0.9): Insight => ({
      id,
      bot: 'minh',
      area: 'work',
      text,
      confidence,
      evidence: [],
      hits: 3,
      status: 'active',
      createdAt: '',
      updatedAt: '',
    })
    const items = [
      mk('a', 'Người dùng muốn bảng so sánh có cột nguồn'),
      mk('b', 'Người dùng theo dõi kênh đối thủ về khoá học AI'),
      mk('c', 'Người dùng thích màu cam'),
    ]
    expect(warmPick(items, 'tìm số liệu khoá học AI của đối thủ', 1)[0]!.id).toBe('b')
    expect(warmPick(items, 'x', 2, (i) => (i.id === 'c' ? 1 : 0))[0]!.id).toBe('c')
  })
})
