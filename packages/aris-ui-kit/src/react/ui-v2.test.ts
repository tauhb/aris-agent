import { describe, expect, it } from 'vitest'
import { UI_V2_KEY, isUiV2, setUiV2 } from './ui-v2.js'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('công tắc giao diện mới', () => {
  it('mặc định tắt khi chưa đặt', () => {
    expect(isUiV2(mem())).toBe(false)
  })
  it('bật rồi đọc lại, tắt rồi đọc lại', () => {
    const s = mem()
    setUiV2(true, s)
    expect(s.getItem(UI_V2_KEY)).toBe('1')
    expect(isUiV2(s)).toBe(true)
    setUiV2(false, s)
    expect(isUiV2(s)).toBe(false)
  })
  it('kho lỗi thì coi như tắt', () => {
    expect(
      isUiV2({
        getItem: () => {
          throw new Error('x')
        },
      }),
    ).toBe(false)
  })
})
