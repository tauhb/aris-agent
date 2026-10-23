import { describe, expect, it } from 'vitest'
import { latestRoomSession } from './rooms.js'

describe('latestRoomSession', () => {
  it('chọn phiên có nội dung mới nhất trong phòng', () => {
    const byId = {
      a: { blank: false, updatedAt: 1 },
      b: { blank: false, updatedAt: 5 },
      c: { blank: true, updatedAt: 9 },
    }
    expect(latestRoomSession(['a', 'b', 'c'], byId)).toBe('b')
  })
  it('không có phiên nào có nội dung thì trả về undefined', () => {
    expect(latestRoomSession(['c', 'x'], { c: { blank: true, updatedAt: 9 } })).toBeUndefined()
  })
})
