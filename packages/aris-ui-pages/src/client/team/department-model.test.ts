import { describe, expect, it } from 'vitest'
import { budgetText, DEFAULT_POLICY, parseBudget, samePolicy } from './department-model.js'

describe('trang Phòng ban', () => {
  it('đọc ô ngân sách kiểu Việt', () => {
    expect(parseBudget('')).toBeUndefined()
    expect(parseBudget(' 2,5 ')).toBe(2.5)
    expect(parseBudget('2.50')).toBe(2.5)
    expect(parseBudget('abc')).toBeNull()
    expect(parseBudget('1,234')).toBeNull()
    expect(parseBudget('5000')).toBeNull()
    expect(budgetText(2)).toBe('2,00')
    expect(budgetText(undefined)).toBe('')
  })
  it('chính sách đã đổi chưa', () => {
    expect(samePolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY })).toBe(true)
    expect(samePolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY, shell: true })).toBe(false)
    expect(samePolicy(DEFAULT_POLICY, { ...DEFAULT_POLICY, budgetUsd: 2 })).toBe(false)
    expect(
      samePolicy(
        { ...DEFAULT_POLICY, model: { provider: 'a', model: 'b' } },
        { ...DEFAULT_POLICY, model: { provider: 'a', model: 'b' } },
      ),
    ).toBe(true)
  })
})
