import { describe, expect, it } from 'vitest'
import { formation } from './formation.js'

describe('đội hình ở cột phải', () => {
  it('Commander ở giữa, bot đầu tiên ở đỉnh vòng, mọi bot nằm trong khung', () => {
    const seats = formation('aris', ['lam', 'mai', 'tin', 'ha', 'dev'])
    expect(seats[0]).toMatchObject({ id: 'aris', x: 50, y: 50 })
    expect(seats[1]).toMatchObject({ id: 'lam', x: 50, y: 16 })
    for (const s of seats) {
      expect(s.x).toBeGreaterThanOrEqual(0)
      expect(s.x).toBeLessThanOrEqual(100)
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(100)
    }
  })
})
