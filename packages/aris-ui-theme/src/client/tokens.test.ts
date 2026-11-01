import { describe, expect, it } from 'vitest'
import { G9_THEMES, THEMES, g9Vars } from '@aris/ui-kit'
import { ARIS_TOKENS, G9_TOKENS } from './tokens.js'

describe('theme aris', () => {
  const entries = Object.entries(ARIS_TOKENS)

  it('mỗi token là biến CSS có đủ giá trị sáng và tối', () => {
    for (const [name, modes] of entries) {
      expect(name, name).toMatch(/^--(dsw|dsh)-/)
      expect(modes.light, name).not.toBe('')
      expect(modes.dark, name).not.toBe('')
    }
  })

  it('nền, chữ và màu nhấn khớp bảng màu aris', () => {
    expect(ARIS_TOKENS['--dsw-alias-bg-base']).toEqual({ light: THEMES.light.bg, dark: THEMES.dark.bg })
    expect(ARIS_TOKENS['--dsw-alias-label-primary']).toEqual({
      light: THEMES.light.ink,
      dark: THEMES.dark.ink,
    })
    expect(ARIS_TOKENS['--dsw-alias-link']).toEqual({ light: THEMES.light.accent, dark: THEMES.dark.accent })
    expect(ARIS_TOKENS['--dsw-static-deepseek-500']?.light).toBe(THEMES.light.accent)
  })

  it('phông là bộ phông mặc định của DeepSeek (hệ thống, SF Mono)', () => {
    expect(ARIS_TOKENS['--dsh-font-family-text-default']?.light).toMatch(/^-apple-system/)
    expect(ARIS_TOKENS['--dsh-font-family-code-default']?.light).toMatch(/^"SF Mono"/)
  })

  it('giao diện GĐ9: cùng mọi khoá với bảng cũ, màu theo bản vẽ, phông Inter', () => {
    expect(Object.keys(G9_TOKENS).sort()).toEqual(Object.keys(ARIS_TOKENS).sort())
    expect(G9_TOKENS['--dsw-specific-sidebar-fill']).toEqual({ light: '#f1f1f1', dark: '#000000' })
    expect(G9_TOKENS['--dsw-alias-bg-base']).toEqual({ light: '#ffffff', dark: '#0e0e0e' })
    expect(G9_TOKENS['--dsw-specific-bubble']?.dark).toBe(G9_THEMES.dark.ubub)
    expect(G9_TOKENS['--dsh-font-family-text-default']?.light).toMatch(/Inter/)
    // Chữ trên nút chính không trùng màu nền nút.
    for (const m of ['light', 'dark'] as const)
      expect(G9_TOKENS['--dsw-alias-label-primary-foreground']?.[m]).not.toBe(
        G9_TOKENS['--dsw-alias-button-primary-fill']?.[m],
      )
  })

  it('bảng màu GĐ9 có đủ khoá cho cả hai nền và sinh đúng biến CSS', () => {
    expect(Object.keys(G9_THEMES.dark).sort()).toEqual(Object.keys(G9_THEMES.light).sort())
    for (const key of Object.keys(THEMES.light)) expect(G9_THEMES.light).toHaveProperty(key)
    expect(g9Vars('dark')).toContain('--g9-acc2:#7fb4ff;')
  })
})
