import { describe, expect, it } from 'vitest'
import { EN, TEXTS, VI } from './locale.js'

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('chữ các trang aris', () => {
  it('mỗi khu có đủ khoá ở hai ngôn ngữ, cùng biến {tên}', () => {
    for (const x of TEXTS) {
      expect(Object.keys(x.vi).sort()).toEqual(Object.keys(x.en).sort())
      for (const [k, v] of Object.entries(x.en)) expect(vars(x.vi[k]!), k).toEqual(vars(v))
    }
  })

  it('không khu nào ghi đè khoá của khu khác', () => {
    const total = TEXTS.reduce((n, x) => n + Object.keys(x.en).length, 0)
    expect(Object.keys(EN)).toHaveLength(total)
    expect(Object.keys(VI)).toHaveLength(total)
  })
})
