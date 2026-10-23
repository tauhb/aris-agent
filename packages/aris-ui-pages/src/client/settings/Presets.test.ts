import { describe, expect, it } from 'vitest'
import { isBuiltIn, presetGroups } from './Presets.js'

describe('trang Mẫu bot', () => {
  const rows = [
    { id: 'minimal', isDefault: false },
    { id: 'my-sales', name: 'Bán hàng', isDefault: false },
    { id: 'cordis', isDefault: false },
    { id: 'standard', isDefault: true },
    { id: 'ptc', isDefault: false },
    { id: 'standard', name: 'Tiêu chuẩn riêng', isDefault: false },
  ]
  it('mẫu có sẵn theo thứ tự cố định, mẫu tự tạo theo tên; mẫu đặt tên đè là tự tạo', () => {
    const g = presetGroups(rows, true)
    expect(g.builtIn.map((p) => p.id)).toEqual(['standard', 'ptc', 'minimal', 'cordis'])
    expect(g.custom.map((p) => p.name)).toEqual(['Bán hàng', 'Tiêu chuẩn riêng'])
    expect(isBuiltIn({ id: 'standard', name: 'x' })).toBe(false)
  })
  it('tắt Công cụ lập trình thì ẩn PTC và Tối giản', () => {
    expect(presetGroups(rows, false).builtIn.map((p) => p.id)).toEqual(['standard', 'cordis'])
  })
})
