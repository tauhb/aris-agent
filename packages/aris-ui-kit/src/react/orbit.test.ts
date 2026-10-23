import { describe, expect, it } from 'vitest'
import { MASCOTS } from '../mascots.js'
import { depthOrder, orbitGeometry, orbitLayout, pickSeat, splitMascot } from './orbit.js'

describe('sơ đồ đội 3D', () => {
  it('mọi linh vật tách được khối màu (không còn phần trắng) và có ít nhất hai mắt', () => {
    for (const m of MASCOTS) {
      const parts = splitMascot(m.body)
      expect(parts.shapeSvg, m.id).not.toMatch(/(fill|stroke)="#fff"/i)
      expect(parts.shapeSvg, m.id).toContain(m.color)
      expect(parts.eyes.length, m.id).toBeGreaterThanOrEqual(2)
      for (const [x, y] of parts.eyes) {
        expect(x, m.id).toBeGreaterThan(0)
        expect(y, m.id).toBeLessThan(100)
      }
    }
  })

  it('mắt nét (cap) lấy tâm giữa đoạn', () => {
    const mai = splitMascot(MASCOTS.find((m) => m.id === 'mai')!.body)
    expect(mai.eyes).toEqual([
      [45, 60],
      [57, 58],
    ])
  })

  it('bot xếp đều trên vòng elip quanh tâm, cỡ lớn dần khi lại gần', () => {
    const L = orbitLayout(5, 0, 300, 300)
    expect(L.seats).toHaveLength(5)
    for (const s of L.seats) {
      expect(Math.hypot((s.x - L.cx) / L.R, (s.y - L.fy) / (L.R * L.tilt))).toBeCloseTo(1, 5)
    }
    const near = L.seats.reduce((a, b) => (b.z > a.z ? b : a))
    const far = L.seats.reduce((a, b) => (b.z < a.z ? b : a))
    expect(near.s).toBeGreaterThan(far.s)
    expect(L.cmdY).toBeLessThan(L.fy)
  })

  it('bản sân khấu co theo khung: hệ số K từ 1 đến 1,8, vòng lớn hơn bản cột phải', () => {
    expect(orbitGeometry('stage', 300, 300).K).toBe(1)
    expect(orbitGeometry('stage', 2000, 2000).K).toBe(1.8)
    expect(orbitGeometry('stage', 900, 700).R).toBeGreaterThan(orbitGeometry('pane', 900, 700).R)
    const L = orbitLayout(5, 0, 900, 700, 'stage')
    for (const seat of L.seats) {
      expect(seat.s).toBeGreaterThanOrEqual(L.K * 0.74)
      expect(seat.s).toBeLessThanOrEqual(L.K * 1.04)
    }
  })

  it('vẽ xa trước gần sau; chọn bot gần con trỏ nhất trong bán kính', () => {
    const { back, front } = depthOrder(orbitLayout(5, 0.6, 300, 300).seats)
    expect([...back, ...front].map((s) => s.z)).toEqual(
      [...back, ...front].map((s) => s.z).sort((a, b) => a - b),
    )
    const hits = [{ x: 10, y: 10, r: 5 }, undefined, { x: 12, y: 10, r: 5 }]
    expect(pickSeat(hits, 12, 11)).toBe(2)
    expect(pickSeat(hits, 100, 100)).toBe(-1)
  })
})
