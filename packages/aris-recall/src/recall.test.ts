import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { findSources, openText, searchHits, summarize, type QueryEngine, type Stream } from './recall.js'
import { handleApi } from './index.js'
import { summaryPrompt } from './text.js'

const T = Date.UTC(2026, 9, 16, 9, 0)

const user = (seq: number, text: string) => ({
  type: 'user/message',
  seq,
  time: T + seq,
  data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
})
const bot = (seq: number, text: string) => ({
  type: 'assistant/message',
  seq,
  time: T + seq,
  data: { message: { content: [{ type: 'text', text }] } },
})
const tool = (seq: number) => ({ type: 'tool/result', seq, time: T + seq, data: {} })

const LOGS: Record<string, unknown[]> = {
  a: [user(1, 'Mình chốt giá gói Pro là 490k nhé'), bot(2, 'Đã ghi: gói Pro 490k/tháng.'), tool(3)],
  b: [user(1, 'Lịch họp với Lâm thứ Sáu'), bot(2, 'Đã xếp 15:00 thứ Sáu.')],
  now: [user(1, 'giá gói Pro là bao nhiêu?')],
}

function fakeEngine() {
  const calls: { eventFilters?: unknown; limit?: number }[] = []
  const engine = {
    async searchSessions(req: { query: string; eventFilters?: unknown; limit?: number }) {
      calls.push(req)
      const ids = Object.keys(LOGS).filter((id) =>
        LOGS[id]!.some((e) => JSON.stringify(e).toLowerCase().includes(req.query.toLowerCase())),
      )
      return {
        items: ids.map((id) => ({
          header: { id },
          bestMatch: { seq: 1, time: T, snippet: `…${req.query}…`, sessionId: id },
        })),
      }
    },
    async readEvent(req: { sessionId: string; seq: number; before?: number; after?: number }) {
      const events = LOGS[req.sessionId]! as { seq: number; time: number }[]
      return { target: events.find((e) => e.seq === req.seq)!, events, startSeq: 1, endSeq: events.length }
    },
    async readTitleSnapshots(ids: string[]) {
      return ids.map((id) =>
        id === 'a'
          ? { sessionId: id, status: 'fulfilled', value: { title: { title: 'Giá gói Pro' } } }
          : { sessionId: id, status: 'fulfilled', value: {} },
      )
    },
  }
  return { engine: engine as unknown as QueryEngine, calls }
}

const streamOf = (...chunks: StreamChunk[]): Stream =>
  async function* () {
    yield* chunks
  }

describe('aris-recall', () => {
  it('tìm bỏ phiên đang chat, chỉ xét lời chủ nhân và bot, có lọc theo ngày', async () => {
    const { engine, calls } = fakeEngine()
    const hits = await searchHits(engine, { query: 'gói Pro', exclude: 'now', days: 7 }, T + 86_400_000)
    expect(hits.map((h) => h.sessionId)).toEqual(['a'])
    expect(hits[0]).toMatchObject({ title: 'Giá gói Pro', seq: 1 })
    expect(calls[0]!.limit).toBe(6)
    expect(calls[0]!.eventFilters).toEqual([
      { kind: 'type', values: ['user/message', 'assistant/message'] },
      { kind: 'surface', values: ['current', 'shadowed'] },
      { kind: 'time', from: T + 86_400_000 - 7 * 86_400_000 },
    ])
  })

  it('đoạn trích chỉ có lời, gắn nhãn S1; prompt yêu cầu dẫn nguồn', async () => {
    const { engine } = fakeEngine()
    const sources = await findSources(engine, await searchHits(engine, { query: 'gói Pro', exclude: 'now' }))
    expect(sources[0]!.lines.map((l) => l.role)).toEqual(['user', 'assistant'])
    const prompt = summaryPrompt('giá gói Pro?', sources)
    expect(prompt).toContain('[S1#1] Chủ nhân: Mình chốt giá gói Pro là 490k nhé')
    expect(prompt).toContain('[S1#12]')
  })

  it('tóm tắt kèm danh sách nguồn; model lỗi thì trả đoạn trích thô', async () => {
    const { engine } = fakeEngine()
    const sources = await findSources(engine, await searchHits(engine, { query: 'gói Pro', exclude: 'now' }))
    const ok = await summarize(
      streamOf({ type: 'text-delta', index: 0, text: 'Gói Pro 490k/tháng [S1#2].' }),
      { provider: 'deepseek', model: 'x' },
      'giá gói Pro?',
      sources,
    )
    expect(ok.summarized).toBe(true)
    expect(ok.text).toContain('Gói Pro 490k/tháng [S1#2].')
    expect(ok.text).toMatch(/S1 = "Giá gói Pro" · 2026-10-1\d · phiên a/)

    const failed = await summarize(
      streamOf({ type: 'finish', reason: { kind: 'error', failure: { message: '402', code: 'x' } } }),
      { provider: 'p', model: 'm' },
      'giá?',
      sources,
    )
    expect(failed.summarized).toBe(false)
    expect(failed.text).toContain('Không tóm tắt được: 402')
    expect(failed.text).toContain('[S1#2] Bot: Đã ghi: gói Pro 490k/tháng.')
  })

  it('open đọc nguyên văn quanh một tin', async () => {
    const { engine } = fakeEngine()
    expect(await openText(engine, 'b', 2)).toContain('#2 Bot: Đã xếp 15:00 thứ Sáu.')
  })

  it('API trả kết quả thô cho hộp tìm', async () => {
    const { engine } = fakeEngine()
    const res = await handleApi(engine, new Request('http://x/api/aris/recall?q=L%E1%BB%8Bch'))
    const body = (await res.json()) as { hits: { sessionId: string; title: string }[] }
    expect(body.hits.map((h) => h.sessionId)).toEqual(['b'])
    expect(body.hits[0]!.title).toBe('…Lịch…')
    expect(await (await handleApi(engine, new Request('http://x/api/aris/recall'))).json()).toEqual({
      hits: [],
    })
  })
})
