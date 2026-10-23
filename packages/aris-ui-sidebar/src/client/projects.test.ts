import { describe, expect, it } from 'vitest'
import { latestProjectSession } from './projects.js'

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
