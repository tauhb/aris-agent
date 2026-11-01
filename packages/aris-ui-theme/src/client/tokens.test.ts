import { describe, expect, it } from 'vitest'
import { THEMES } from '@aris/ui-kit'
import { ARIS_TOKENS } from './tokens.js'

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
})
