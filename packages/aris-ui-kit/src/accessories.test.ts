import { describe, expect, it } from 'vitest'
import {
  ACCESSORIES,
  MASCOTS,
  NO_ACCESSORY,
  accessoryOf,
  accessorySvg,
  defaultAccessory,
  isAccessoryId,
  mascotSvg,
  resolveAccessory,
} from './index.js'
import { ACC_GEO, ACC_TINT } from './accessories.generated.js'

describe('phụ kiện linh vật', () => {
  it('có 22 phụ kiện, mã không trùng và có tên', () => {
    expect(ACCESSORIES).toHaveLength(22)
    expect(new Set(ACCESSORIES.map((a) => a.id)).size).toBe(22)
    for (const a of ACCESSORIES) expect(a.name, a.id).not.toBe('')
  })
  it('mọi dáng đều có số đo và phụ kiện mặc định hợp lệ', () => {
    for (const m of MASCOTS) {
      expect(ACC_GEO[m.id], m.id).toBeDefined()
      const d = defaultAccessory(m.id)
      expect(d, m.id).toBeDefined()
      expect(isAccessoryId(d!), `${m.id} → ${d}`).toBe(true)
    }
    expect(Object.keys(ACC_GEO)).toHaveLength(MASCOTS.length)
  })
  it('bảng màu riêng chỉ trỏ tới dáng và phụ kiện có thật', () => {
    for (const key of Object.keys(ACC_TINT)) {
      const [mascot, acc] = key.split(':') as [string, string]
      expect(ACC_GEO[mascot], key).toBeDefined()
      expect(isAccessoryId(acc), key).toBe(true)
    }
  })
  it('mọi cặp dáng × phụ kiện sinh SVG hợp lệ', () => {
    for (const m of MASCOTS) {
      for (const a of ACCESSORIES) {
        const svg = accessorySvg(m.id, a.id)
        const at = `${m.id} × ${a.id}`
        expect(svg, at).not.toBe('')
        expect(svg, at).not.toMatch(/NaN|undefined|Infinity/)
        // Thẻ mở và đóng cân nhau: không có chuỗi dở dang.
        const open = (svg.match(/<(path|rect|circle|ellipse|g)\b/g) ?? []).length
        expect(open, at).toBeGreaterThan(0)
        expect((svg.match(/<g\b/g) ?? []).length, at).toBe((svg.match(/<\/g>/g) ?? []).length)
      }
    }
  })
  it('dáng hay phụ kiện lạ thì không vẽ gì', () => {
    expect(accessorySvg('khong-co', 'kinh')).toBe('')
    expect(accessorySvg('aris', 'khong-co')).toBe('')
  })
  it('resolveAccessory: chưa lưu là mặc định, none là không đeo, còn lại giữ nguyên', () => {
    expect(resolveAccessory('aris')).toBe('vuong-mien')
    expect(resolveAccessory('aris', undefined)).toBe('vuong-mien')
    expect(resolveAccessory('aris', NO_ACCESSORY)).toBeNull()
    expect(resolveAccessory('aris', 'kinh')).toBe('kinh')
    expect(resolveAccessory('khong-co')).toBeNull()
  })
  it('mascotSvg: có phụ kiện thì khung rộng hơn, none thì giữ khung cũ', () => {
    expect(mascotSvg('aris', 32, '', 'kinh')).toContain('viewBox="-10 -16 120 120"')
    expect(mascotSvg('aris', 32)).toContain('viewBox="-10 -16 120 120"')
    expect(mascotSvg('aris', 32, '', 'none')).toContain('viewBox="0 0 100 100"')
    expect(mascotSvg('aris', 32, '', 'none')).not.toContain('var(--acc-edge)')
    expect(accessoryOf('aris', 'none')).toBeNull()
  })
})
