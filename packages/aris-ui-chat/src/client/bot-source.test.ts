import { describe, expect, it } from 'vitest'
import { matchBots } from './bot-source.js'

const bot = (handle: string, name: string) =>
  ({
    id: handle,
    kind: 'member',
    handle,
    name,
    role: '',
    description: '',
    soul: '',
    mascot: 'lam',
    createdAt: '',
  }) as const

describe('menu @: lọc bot', () => {
  const team = [bot('minh', 'Minh'), bot('tho', 'Thơ'), bot('kiet', 'Kiệt'), bot('khoa', 'Khoa')]
  it('không gõ gì thì ra cả đội', () => {
    expect(matchBots(team, '')).toHaveLength(4)
  })
  it('gõ không dấu vẫn ra, khớp đầu xếp trước', () => {
    expect(matchBots(team, 'th').map((b) => b.handle)).toEqual(['tho'])
    expect(matchBots(team, 'ki').map((b) => b.handle)).toEqual(['kiet'])
    expect(matchBots(team, 'kh').map((b) => b.handle)).toEqual(['khoa'])
    expect(matchBots(team, 'Kiệt').map((b) => b.handle)).toEqual(['kiet'])
  })
  it('chữ ở giữa tên vẫn ra, sau các khớp đầu', () => {
    expect(matchBots(team, 'i').map((b) => b.handle)).toEqual(['minh', 'kiet'])
  })
})
