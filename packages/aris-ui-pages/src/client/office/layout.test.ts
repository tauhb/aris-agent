import { describe, expect, it } from 'vitest'
import {
  DESK_DX,
  assigneeOf,
  layoutOffice,
  spotsFor,
  visitPoint,
  type LayoutGroup,
  type OfficeLayout,
  type Occupant,
} from './layout.js'

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
const groups = (...sizes: number[]): LayoutGroup[] =>
  sizes.map((n, i) => ({ id: `d${i}`, label: `Phòng ${i}`, bots: ids(`b${i}-`, n) }))

const rectOf = (z: { x: number; z: number; w: number; d: number }) => ({
  x0: z.x - z.w / 2,
  x1: z.x + z.w / 2,
  z0: z.z - z.d / 2,
  z1: z.z + z.d / 2,
})

describe('layoutOffice', () => {
  it('mỗi bot một bàn, mỗi phòng có bot một khu; phòng trống bị bỏ', () => {
    const l = layoutOffice({ groups: [...groups(2, 0, 3)] })
    expect(l.zones.map((z) => z.id)).toEqual(['d0', 'd2'])
    expect(l.desks).toHaveLength(5)
    expect(new Set(l.desks.map((d) => d.id)).size).toBe(5)
    expect(l.desks.find((d) => d.id === 'b2-1')?.zone).toBe('d2')
  })

  it('số khu và số bàn đổi theo đội: đội trống chỉ còn bàn chỉ huy, sofa và cửa', () => {
    const none = layoutOffice({ groups: [] })
    expect(none.zones).toHaveLength(0)
    expect(none.desks).toHaveLength(0)
    expect(none.sofas.length).toBeGreaterThanOrEqual(1)
    expect(none.waitSpots.length).toBeGreaterThanOrEqual(1)
    const big = layoutOffice({ groups: groups(5, 4, 3, 6, 2, 1, 4) })
    expect(big.zones).toHaveLength(7)
    expect(big.desks).toHaveLength(25)
    expect(big.width).toBeGreaterThan(none.width)
    expect(big.depth).toBeGreaterThan(none.depth)
  })

  it.each([[[1]], [[3, 3]], [[2, 5, 1]], [[4, 4, 4, 4]], [[6, 1, 2, 3, 4, 5, 2, 3, 1, 1]]])(
    'khu không chồng nhau, bàn nằm trong khu và trong sàn (%j)',
    (sizes) => {
      const l = layoutOffice({ groups: groups(...sizes) })
      const rects = l.zones.map(rectOf)
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!
          const b = rects[j]!
          const overlap = a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.z0 < b.z1 - 1e-6 && b.z0 < a.z1 - 1e-6
          expect(overlap).toBe(false)
        }
      }
      for (const d of l.desks) {
        const z = l.zones.find((x) => x.id === d.zone)!
        const r = rectOf(z)
        expect(d.x).toBeGreaterThan(r.x0)
        expect(d.x).toBeLessThan(r.x1)
        expect(d.z).toBeGreaterThan(r.z0)
        expect(d.z).toBeLessThan(r.z1)
        expect(Math.abs(d.x)).toBeLessThan(l.width / 2)
        expect(Math.abs(d.z)).toBeLessThan(l.depth / 2)
      }
      for (let i = 0; i < l.desks.length; i++) {
        for (let j = i + 1; j < l.desks.length; j++) {
          const a = l.desks[i]!
          const b = l.desks[j]!
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(DESK_DX - 1e-6)
        }
      }
    },
  )

  it('đủ chỗ ngồi sofa và chỗ chờ cho cả đội kể cả Aris, mọi chỗ nằm trong sàn', () => {
    const l = layoutOffice({ groups: groups(5, 4, 3, 6) })
    const people = 18 + 1
    expect(l.seats.length).toBeGreaterThanOrEqual(people)
    expect(l.waitSpots.length).toBeGreaterThanOrEqual(people)
    for (const p of [...l.seats, ...l.waitSpots, l.command.stand, l.meeting, l.door]) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(l.width / 2)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(l.depth / 2)
    }
    // Chỗ chờ không trùng nhau.
    const keys = new Set(l.waitSpots.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`))
    expect(keys.size).toBe(l.waitSpots.length)
  })

  it('bàn chỉ huy không nằm trong khu nào', () => {
    const l = layoutOffice({ groups: groups(3, 3, 3) })
    for (const z of l.zones) {
      const r = rectOf(z)
      const inside = l.command.x > r.x0 && l.command.x < r.x1 && l.command.z > r.z0 && l.command.z < r.z1
      expect(inside).toBe(false)
    }
  })
})

describe('spotsFor', () => {
  const l: OfficeLayout = layoutOffice({ groups: groups(2, 2) })
  const occ = (...s: [string, Occupant['scene']][]): Occupant[] => s.map(([id, scene]) => ({ id, scene }))
  const deskOf = (id: string) => l.desks.find((d) => d.id === id)!

  it('đang làm: ngồi sau bàn mình, dáng gõ máy', () => {
    const s = spotsFor(l, occ(['aris', 'idle'], ['b0-0', 'work'], ['b1-1', 'work']), 'aris')
    expect(s['b0-0']).toMatchObject({ x: deskOf('b0-0').seat.x, z: deskOf('b0-0').seat.z, pose: 'type' })
    expect(s['b1-1']).toMatchObject({ x: deskOf('b1-1').seat.x, z: deskOf('b1-1').seat.z, pose: 'type' })
  })

  it('chờ người dùng: đứng ở cửa, mỗi bot một chỗ, dáng nhảy nhẹ', () => {
    const s = spotsFor(l, occ(['aris', 'idle'], ['b0-0', 'wait'], ['b0-1', 'wait']), 'aris')
    expect(s['b0-0']).toMatchObject({ ...l.waitSpots[0]!, pose: 'hop' })
    expect(s['b0-1']).toMatchObject({ ...l.waitSpots[1]!, pose: 'hop' })
  })

  it('rảnh, xong và vấp: ngồi trên sofa, mỗi bot một ghế, nghiêng', () => {
    const s = spotsFor(l, occ(['aris', 'idle'], ['b0-0', 'idle'], ['b0-1', 'idle']), 'aris')
    const spots = ['aris', 'b0-0', 'b0-1'].map((id) => s[id]!)
    expect(spots.map((p) => p.pose)).toEqual(['lean', 'lean', 'lean'])
    expect(spots.map((p) => `${p.x},${p.z}`)).toEqual(l.seats.slice(0, 3).map((p) => `${p.x},${p.z}`))
    expect(Math.abs(spots[0]!.tilt)).toBeGreaterThan(0)
  })

  it('Aris đang làm: đứng ở bàn chỉ huy; biết bot được giao việc thì đi qua lại tới bàn đó', () => {
    const none = spotsFor(l, occ(['aris', 'work'], ['b0-0', 'work']), 'aris')
    expect(none['aris']).toMatchObject({ ...l.command.stand, pose: 'stand' })
    expect(none['aris']?.patrol).toBeUndefined()
    const go = spotsFor(l, occ(['aris', 'work'], ['b0-0', 'work']), 'aris', 'b0-0')
    expect(go['aris']).toMatchObject({ ...l.command.stand })
    expect(go['aris']?.patrol).toEqual(visitPoint(deskOf('b0-0')))
  })

  it('Aris chờ thì ra cửa, rảnh thì ra sofa như bot khác', () => {
    expect(spotsFor(l, occ(['aris', 'wait']), 'aris')['aris']).toMatchObject({
      ...l.waitSpots[0]!,
      pose: 'hop',
    })
    expect(spotsFor(l, occ(['aris', 'idle']), 'aris')['aris']).toMatchObject({ ...l.seats[0]!, pose: 'lean' })
  })

  it('đổi trạng thái thì đổi chỗ: bot đang làm chuyển sang chờ ra cửa', () => {
    const before = spotsFor(l, occ(['aris', 'idle'], ['b0-0', 'work']), 'aris')['b0-0']!
    const after = spotsFor(l, occ(['aris', 'idle'], ['b0-0', 'wait']), 'aris')['b0-0']!
    expect(before.pose).toBe('type')
    expect(after.pose).toBe('hop')
    expect(after.x).not.toBe(before.x)
  })

  it('bot đang làm mà không có bàn thì về sofa, không ném lỗi', () => {
    const s = spotsFor(l, occ(['aris', 'idle'], ['la', 'work']), 'aris')
    expect(s['la']?.pose).toBe('lean')
  })
})

describe('assigneeOf', () => {
  const working = (...a: string[]): Occupant[] => a.map((id) => ({ id, scene: 'work' as const }))
  it('lấy bot được giao việc mới nhất mà vẫn đang làm', () => {
    const act = [
      { bot: 'lam', kind: 'assigned' as const, at: 100 },
      { bot: 'ha', kind: 'assigned' as const, at: 200 },
      { bot: 'mai', kind: 'assigned' as const, at: 300 },
    ]
    expect(assigneeOf(act, 'aris', working('aris', 'lam', 'ha'))).toBe('ha')
  })
  it('bỏ Aris, bot không làm nữa và dòng không phải giao việc; không biết thì undefined', () => {
    const act = [
      { bot: 'aris', kind: 'assigned' as const, at: 500 },
      { bot: 'lam', kind: 'done' as const, at: 400 },
    ]
    expect(assigneeOf(act, 'aris', working('aris', 'lam'))).toBeUndefined()
    expect(assigneeOf([], 'aris', [])).toBeUndefined()
  })
})
