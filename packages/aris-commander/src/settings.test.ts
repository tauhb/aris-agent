import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, TaskSpend, cleanSettings, externalBudget } from './settings.js'

describe('cấu hình Commander', () => {
  it('gộp phần sửa, bỏ trùng bot cần duyệt, bỏ trần tiền bằng null', () => {
    const a = cleanSettings({ parallel: 3, approve: ['b-1', 'b-1'], budgetUsd: 0.5 }, DEFAULT_SETTINGS)
    expect(a).toEqual({ parallel: 3, nested: 3, helpers: true, approve: ['b-1'], budgetUsd: 0.5 })
    expect(cleanSettings({ budgetUsd: null }, a)).toEqual({
      parallel: 3,
      nested: 3,
      helpers: true,
      approve: ['b-1'],
    })
    expect(cleanSettings({ nested: 0, helpers: false, other: 1 }, DEFAULT_SETTINGS)).toEqual({
      ...DEFAULT_SETTINGS,
      nested: 0,
      helpers: false,
    })
  })

  it('số sai khoảng báo lỗi rõ, không tự kẹp', () => {
    expect(() => cleanSettings({ parallel: 0 }, DEFAULT_SETTINGS)).toThrow('từ 1 đến 12')
    expect(() => cleanSettings({ nested: 9 }, DEFAULT_SETTINGS)).toThrow('từ 0 đến 6')
    expect(() => cleanSettings({ budgetUsd: -1 }, DEFAULT_SETTINGS)).toThrow('lớn hơn 0')
    expect(() => cleanSettings({ parallel: 2.5 }, DEFAULT_SETTINGS)).toThrow()
  })

  it('trần tiền bot ngoài: trần nhỏ hơn giữa bot và Commander', () => {
    expect(externalBudget(2, 0.5)).toBe(0.5)
    expect(externalBudget(undefined, 0.5)).toBe(0.5)
    expect(externalBudget(1, undefined)).toBe(1)
    expect(externalBudget(undefined, undefined)).toBeUndefined()
  })

  it('đếm tiền từng việc, đếm lại khi giao tiếp, không đếm khi không có trần', () => {
    const s = new TaskSpend()
    s.start('p-1', 0.1, 'Tóm tắt')
    s.add('p-1', 0.06)
    expect(s.over('p-1')).toBeUndefined()
    s.add('p-1', 0.05)
    expect(s.over('p-1')).toMatchObject({ cap: 0.1, title: 'Tóm tắt' })
    s.start('p-1', 0.1, 'Việc mới')
    expect(s.over('p-1')).toBeUndefined()
    s.start('p-1', undefined, 'Không trần')
    s.add('p-1', 5)
    expect(s.over('p-1')).toBeUndefined()
  })
})
