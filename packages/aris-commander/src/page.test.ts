import { describe, expect, it } from 'vitest'
import { COMPACT_AT, contextTokens, shouldCompact } from './page.js'

describe('sang trang', () => {
  it('ngữ cảnh gồm cả phần đọc và ghi bộ nhớ đệm', () => {
    expect(contextTokens({ inputTokens: 6968, cacheReadTokens: 11520, cacheWriteTokens: 0 })).toBe(18488)
    expect(contextTokens(undefined)).toBe(0)
  })

  it('chỉ nén khi lượt xong bình thường và vượt trần', () => {
    expect(shouldCompact(COMPACT_AT + 1, 'completed')).toBe(true)
    expect(shouldCompact(COMPACT_AT, 'completed')).toBe(false)
    expect(shouldCompact(COMPACT_AT + 1, 'error')).toBe(false)
    expect(shouldCompact(25_000, 'completed', 20_000)).toBe(true)
    expect(shouldCompact(undefined, 'completed')).toBe(false)
  })
})
