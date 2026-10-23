import { describe, expect, it } from 'vitest'
import { MASCOTS, STATUSES, THEMES, getMascot, mascotSvg, statusSvg, themeCss } from './index.js'

describe('tokens', () => {
  it('sáng và tối có cùng bộ token', () => {
    expect(Object.keys(THEMES.dark).sort()).toEqual(Object.keys(THEMES.light).sort())
  })
  it('sinh CSS cho cả hai giao diện', () => {
    const css = themeCss()
    expect(css).toContain('.t-light{--bg:#F6F5F2')
    expect(css).toContain('.t-dark{--bg:#0F1013')
  })
})

describe('trạng thái', () => {
  it('có đúng 5 trạng thái với nhãn khác nhau', () => {
    const labels = Object.values(STATUSES).map((s) => s.label)
    expect(labels).toEqual(['Đang làm', 'Chờ duyệt', 'Xong', 'Vấp', 'Rảnh'])
  })
  it('glyph có nhãn cho trình đọc màn hình', () => {
    expect(statusSvg('waiting')).toContain('aria-label="Chờ duyệt"')
  })
})

describe('linh vật', () => {
  it('có 30 dáng, 6 dáng đang dùng, mã không trùng', () => {
    expect(MASCOTS).toHaveLength(30)
    expect(MASCOTS.filter((m) => m.inUse).map((m) => m.id)).toEqual([
      'aris',
      'lam',
      'mai',
      'tin',
      'dev',
      'ha',
    ])
    expect(new Set(MASCOTS.map((m) => m.id)).size).toBe(30)
  })
  it('mỗi dáng có màu khối và nét trắng cho mắt', () => {
    for (const m of MASCOTS) {
      expect(m.color, m.id).toMatch(/^#[0-9A-F]{6}$/i)
      expect(m.body, m.id).toMatch(/#fff/i)
    }
  })
  it('sinh SVG theo mã, báo lỗi khi sai mã', () => {
    expect(getMascot('aris')?.shape).toBe('Sao bốn cánh')
    expect(mascotSvg('ha', 24, 'Hạ')).toContain('aria-label="Hạ"')
    expect(() => mascotSvg('khong-co')).toThrow()
  })
})
