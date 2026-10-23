import { describe, expect, it } from 'vitest'
import { highlight } from './recall-api.js'

describe('highlight', () => {
  it('tô mọi chỗ khớp, không phân biệt hoa thường', () => {
    expect(highlight('Giá gói Pro là 490k, gói pro năm rẻ hơn', 'gói pro')).toEqual([
      ['Giá ', 'gói', ''],
      [' ', 'Pro', ''],
      [' là 490k, ', 'gói', ''],
      [' ', 'pro', ' năm rẻ hơn'],
    ])
  })

  it('gõ không dấu vẫn tô được chữ có dấu', () => {
    expect(highlight('Trang bán khoá học AI', 'khoa hoc')).toEqual([
      ['Trang bán ', 'khoá', ''],
      [' ', 'học', ' AI'],
    ])
    expect(highlight('Đà Nẵng', 'da nang')).toEqual([
      ['', 'Đà', ''],
      [' ', 'Nẵng', ''],
    ])
  })

  it('không khớp thì giữ nguyên đoạn trích', () => {
    expect(highlight('không có gì', 'xyz')).toEqual([['không có gì', '', '']])
    expect(highlight('a (b)', '(b')).toEqual([['a ', '(b', ')']])
  })
})
