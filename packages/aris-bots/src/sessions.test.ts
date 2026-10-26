import { describe, expect, it } from 'vitest'
import { pickSessions, type SessionRow } from './sessions.js'

const row = (id: string, updatedAt: number, extra: Partial<SessionRow> = {}): [string, SessionRow] => [
  id,
  { sessionId: id, updatedAt, ...extra },
]

describe('pickSessions', () => {
  it('lấy tối đa 5 phiên mới sửa nhất, kèm tên và cờ đang chạy', () => {
    const rows = new Map(
      Array.from({ length: 8 }, (_, i) => row(`s${i}`, 100 + i, i === 7 ? { running: true } : {})),
    )
    const ids = [...rows.keys()]
    const out = pickSessions(ids, rows, { s7: 'Bài Facebook' }, 5)
    expect(out.map((s) => s.id)).toEqual(['s7', 's6', 's5', 's4', 's3'])
    expect(out[0]).toEqual({ id: 's7', title: 'Bài Facebook', at: 107, running: true })
    expect(out[1]).toMatchObject({ title: '', running: false })
  })

  it('bỏ phiên không còn trong dsh, phiên trống, phiên bot con ẩn danh và mã lặp', () => {
    const rows = new Map([
      row('a', 5),
      row('blank', 9, { blank: true }),
      row('child', 8, { origin: 'subagent' }),
      row('b', 3),
    ])
    const out = pickSessions(['a', 'a', 'gone', 'blank', 'child', 'b'], rows, {}, 5)
    expect(out.map((s) => s.id)).toEqual(['a', 'b'])
  })
})
