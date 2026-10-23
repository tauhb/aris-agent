import { describe, expect, it } from 'vitest'
import { EN, VI, type HeaderKey } from './locale.js'
import { chatSessions, whenLabel } from './sessions.js'

const s = (id: string, updatedAt: number, extra: { origin?: 'subagent'; blank?: boolean } = {}) => ({
  id,
  displayTitle: `Phiên ${id}`,
  running: false,
  blank: extra.blank ?? false,
  updatedAt,
  ...(extra.origin ? { origin: extra.origin } : {}),
})

describe('chatSessions', () => {
  it('bỏ phiên bot con và phiên trống, mới nhất trước', () => {
    const list = {
      ids: ['a', 'b', 'c', 'd'],
      byId: {
        a: s('a', 1),
        b: s('b', 5, { origin: 'subagent' }),
        c: s('c', 3),
        d: s('d', 9, { blank: true }),
      },
    }
    expect(chatSessions(list).map((x) => x.id)).toEqual(['c', 'a'])
  })
  it('giữ phiên trống nếu đó là phiên đang mở', () => {
    const list = { ids: ['a', 'd'], byId: { a: s('a', 1), d: s('d', 9, { blank: true }) } }
    expect(chatSessions(list, 'd').map((x) => x.id)).toEqual(['d', 'a'])
  })
  it('giới hạn số phiên và bỏ qua id không có tóm tắt', () => {
    const list = { ids: ['x', 'a', 'b', 'c'], byId: { a: s('a', 3), b: s('b', 2), c: s('c', 1) } }
    expect(chatSessions(list, undefined, 2).map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('whenLabel', () => {
  const now = new Date(2026, 9, 23, 10, 0).getTime()
  // Bộ dịch giả: thay biến {tên} như dsh.
  const fill =
    (dict: Record<HeaderKey, string>) =>
    (key: HeaderKey, params: Record<string, unknown> = {}) =>
      dict[key].replace(/\{(\w+)\}/g, (_, name: string) => String(params[name]))
  const vi = fill(VI)
  const en = fill(EN)
  it('hôm nay, hôm qua, rồi ngày/tháng', () => {
    expect(whenLabel(new Date(2026, 9, 23, 8).getTime(), vi, now)).toBe('hôm nay')
    expect(whenLabel(new Date(2026, 9, 22, 23).getTime(), vi, now)).toBe('hôm qua')
    expect(whenLabel(new Date(2026, 9, 18, 9).getTime(), vi, now)).toBe('18/10')
  })
  it('theo ngôn ngữ đang chọn', () => {
    expect(whenLabel(new Date(2026, 9, 22, 23).getTime(), en, now)).toBe('yesterday')
    expect(whenLabel(new Date(2026, 9, 18, 9).getTime(), en, now)).toBe('10/18')
  })
})
