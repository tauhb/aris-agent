import { describe, expect, it } from 'vitest'
import type { Table } from './domain.js'
import {
  DURABLE_KEEP_MS,
  DurableApprovals,
  REPEAT_WINDOW_MS,
  RepeatGuard,
  argsHash,
  isOutbound,
  type DurableRecord,
} from './durable.js'

const memTable = <V>(): Table<V> => {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  }
}

describe('duyệt bền', () => {
  it('băm tham số không phụ thuộc thứ tự khoá, khác công cụ thì khác', () => {
    expect(argsHash('channel_send', { to: 'a', text: 'b' })).toBe(
      argsHash('channel_send', { text: 'b', to: 'a' }),
    )
    expect(argsHash('channel_send', { to: 'a' })).not.toBe(argsHash('x', { to: 'a' }))
    expect(argsHash('t', { a: [1, { b: 2, c: 3 }] })).toBe(argsHash('t', { a: [1, { c: 3, b: 2 }] }))
    expect(argsHash('t', { a: 1, b: undefined })).toBe(argsHash('t', { a: 1 }))
  })

  it('chờ → cho phép muộn → bot gọi lại đúng thao tác thì dùng một lần', async () => {
    let now = Date.parse('2026-11-01T10:00:00Z')
    const s = new DurableApprovals(memTable<DurableRecord>(), () => now)
    const hash = argsHash('update_bot_instructions', { bot: 'hang', instructions: 'x' })
    await s.open({
      id: 'r1',
      session: 's1',
      bot: 'aris',
      name: 'Aris',
      tool: 'update_bot_instructions',
      hash,
      at: new Date(now).toISOString(),
    })
    expect(s.pending().map((r) => r.id)).toEqual(['r1'])
    await s.grant('r1')
    expect(s.pending()).toEqual([])
    // Khác phiên hay khác tham số: không khớp.
    expect(await s.take('s2', 'update_bot_instructions', hash)).toBeUndefined()
    expect(await s.take('s1', 'update_bot_instructions', 'khac')).toBeUndefined()
    expect((await s.take('s1', 'update_bot_instructions', hash))?.id).toBe('r1')
    // Chỉ một lần.
    expect(await s.take('s1', 'update_bot_instructions', hash)).toBeUndefined()
    // Bỏ bản quá hạn.
    await s.open({
      id: 'r2',
      session: 's1',
      bot: 'aris',
      name: 'Aris',
      tool: 't',
      hash: 'h',
      at: new Date(now).toISOString(),
    })
    now += DURABLE_KEEP_MS + 1
    expect(await s.prune()).toBe(1)
    expect(s.all()).toEqual([])
  })
})

describe('chống lặp thao tác ra ngoài', () => {
  it('chỉ gửi tin và công cụ MCP có ghi', () => {
    const writes = (t: string) => t.endsWith('__create_page')
    expect(isOutbound('channel_send', writes)).toBe(true)
    expect(isOutbound('mcp__notion__create_page', writes)).toBe(true)
    expect(isOutbound('mcp__notion__search', writes)).toBe(false)
    expect(isOutbound('read_file', writes)).toBe(false)
  })

  it('chặn trong khoảng chống lặp, hết khoảng thì cho lại; khác bot thì không chặn', () => {
    let now = 0
    const g = new RepeatGuard(() => now)
    g.record('hang', 'h1')
    now = 60_000
    expect(g.last('hang', 'h1')).toBe(0)
    expect(g.last('mai', 'h1')).toBeUndefined()
    now = REPEAT_WINDOW_MS + 1
    expect(g.last('hang', 'h1')).toBeUndefined()
  })
})
