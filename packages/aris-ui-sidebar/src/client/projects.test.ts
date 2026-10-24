import { describe, expect, it } from 'vitest'
import { latestProjectSession, recentSessions } from './projects.js'

describe('latestProjectSession', () => {
  it('chọn phiên có nội dung mới nhất trong dự án', () => {
    const byId = {
      a: { blank: false, updatedAt: 1 },
      b: { blank: false, updatedAt: 5 },
      c: { blank: true, updatedAt: 9 },
    }
    expect(latestProjectSession(['a', 'b', 'c'], byId)).toBe('b')
  })
  it('không có phiên nào có nội dung thì trả về undefined', () => {
    expect(latestProjectSession(['c', 'x'], { c: { blank: true, updatedAt: 9 } })).toBeUndefined()
  })
})

describe('recentSessions', () => {
  it('bỏ phiên trống và phiên bot con, mới nhất trước', () => {
    const byId = {
      a: { blank: false, updatedAt: 1 },
      b: { blank: true, updatedAt: 9 },
      c: { blank: false, updatedAt: 5, origin: 'subagent' },
      d: { blank: false, updatedAt: 3 },
    }
    expect(recentSessions(['a', 'b', 'c', 'd', 'x'], byId)).toEqual(['d', 'a'])
  })
})
