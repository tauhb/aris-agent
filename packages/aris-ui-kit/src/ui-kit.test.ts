import { describe, expect, it } from 'vitest'
import {
  MASCOTS,
  STATUSES,
  THEMES,
  getMascot,
  markEyes,
  mascotSvg,
  motionVars,
  statusSvg,
  themeCss,
} from './index.js'

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
  it('có 50 dáng, 6 dáng đang dùng, mã không trùng', () => {
    expect(MASCOTS).toHaveLength(50)
    expect(MASCOTS.filter((m) => m.inUse).map((m) => m.id)).toEqual([
      'aris',
      'lam',
      'mai',
      'tin',
      'dev',
      'ha',
    ])
    expect(new Set(MASCOTS.map((m) => m.id)).size).toBe(50)
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
  it('dáng nào cũng đánh dấu được hai mắt để chớp', () => {
    for (const m of MASCOTS) {
      const marked = markEyes(m.body)
      expect(marked.match(/class="eye"/g)?.length ?? 0, m.id).toBeGreaterThanOrEqual(1)
      expect(marked.replace(/<[^>]*class="eye"[^>]*>/g, ''), m.id).not.toMatch(/(fill|stroke)="#fff"/i)
    }
  })
  it('đánh dấu cả nhóm tô trắng, không đánh dấu lại phần đã có', () => {
    expect(markEyes('<g fill="#fff"><circle cx="1" cy="1" r="1"/></g>')).toBe(
      '<g class="eye" fill="#fff"><circle cx="1" cy="1" r="1"/></g>',
    )
    const once = markEyes('<circle cx="1" cy="1" r="1" fill="#fff"/>')
    expect(markEyes(once)).toBe(once)
  })
  it('nhịp lệch theo hạt giống, ổn định giữa các lần', () => {
    expect(motionVars('aris')).toEqual(motionVars('aris'))
    const v = motionVars('mai')
    expect(Number.parseFloat(v['--d'])).toBeLessThanOrEqual(0)
    expect(Number.parseFloat(v['--d'])).toBeGreaterThan(-2.4)
    expect([1, -1]).toContain(v['--dir'])
  })
})
