import { describe, expect, it } from 'vitest'
import { callRecord, eventRecord, sessionRecord } from './domain.js'

describe('bản ghi thống kê đã lưu', () => {
  it('loại việc, nguồn và loại sự kiện cũ (tiếng Việt) quy về giá trị mới khi đọc', () => {
    const call = {
      at: 1,
      day: '2026-10-26',
      provider: 'deepseek',
      model: 'm',
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      usd: 0.01,
    }
    expect(callRecord.parse({ ...call, kind: 'giao', source: 'giao' })).toMatchObject({
      kind: 'delegated',
      source: 'bot',
    })
    expect(callRecord.parse({ ...call, kind: 'hoc', source: 'nen' })).toMatchObject({
      kind: 'learning',
      source: 'background',
    })
    expect(callRecord.parse({ ...call, kind: 'routine', source: 'lich' }).source).toBe('schedule')
    expect(callRecord.parse({ ...call, kind: 'chat', source: 'web' })).toMatchObject({
      kind: 'chat',
      source: 'web',
    })
    const ses = {
      day: '2026-10-26',
      session: 's1',
      bot: 'b',
      firstAt: 1,
      lastAt: 2,
      calls: 1,
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      usd: 0,
      saveUsd: 0,
      fullInUsd: 0,
      asked: false,
    }
    expect(sessionRecord.parse({ ...ses, kind: 'giao', source: 'commander' }).kind).toBe('delegated')
    expect(eventRecord.parse({ at: 1, session: 's1', type: 'duyet' }).type).toBe('approval')
    expect(eventRecord.parse({ at: 1, session: 's1', type: 'hoi' }).type).toBe('question')
    expect(() => eventRecord.parse({ at: 1, session: 's1', type: 'la' })).toThrow()
  })
})
