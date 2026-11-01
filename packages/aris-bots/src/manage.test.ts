import { describe, expect, it } from 'vitest'
import { createCard, diffText, editCard, handleFrom, soulDiff } from './manage.js'

describe('Aris quản đội', () => {
  it('tên gọi từ tên tiếng Việt, không trùng', () => {
    const taken = new Set(['lan', 'cham-soc-khach'])
    expect(handleFrom('Lan', (h) => taken.has(h))).toBe('lan-2')
    expect(handleFrom('Đức Anh', () => false)).toBe('duc-anh')
    expect(handleFrom('Chăm sóc khách', (h) => taken.has(h))).toBe('cham-soc-khach-2')
    expect(handleFrom('123', () => false)).toBe('bot')
  })

  it('chỗ đổi lời dặn theo dòng', () => {
    const d = soulDiff('a\nb\nc', 'a\nB\nc\nd')
    expect(d.map((l) => `${l.kind}:${l.text}`)).toEqual(['same:a', 'del:b', 'add:B', 'same:c', 'add:d'])
    expect(diffText(d)).toBe('− b\n+ B\n+ d')
  })

  it('thẻ tạo bot có đủ phòng, model, mô tả và toàn văn lời dặn', () => {
    const card = createCard(
      {
        name: 'Lan',
        handle: 'lan',
        role: 'Chăm sóc khách',
        description: 'Trả lời khách về giá',
        soul: 'Luôn lịch sự.\nKhông đoán khi thiếu dữ liệu.',
        department: { id: 'kd', name: 'Kinh doanh' },
      },
      'vi',
    )
    expect(card).toContain('Tạo bot Lan (@lan) · Chăm sóc khách')
    expect(card).toContain('Phòng: Kinh doanh · Model: theo model mặc định')
    expect(card).toContain('Mô tả cho đồng đội: Trả lời khách về giá')
    expect(card).toContain('Lời dặn:\nLuôn lịch sự.\nKhông đoán khi thiếu dữ liệu.')
  })

  it('thẻ sửa lời dặn có bản, độ dài, lý do, chỗ đổi và toàn văn', () => {
    const card = editCard(
      { name: 'Mai', soul: 'Trả lời ngắn.' },
      'Trả lời ngắn.\nXưng em.',
      { from: 2, to: 3 },
      'Anh muốn Mai xưng em',
      'vi',
    )
    expect(card).toContain('Sửa lời dặn của Mai (bản 2 → bản 3) · 13 → 22 ký tự')
    expect(card).toContain('Lý do: Anh muốn Mai xưng em')
    expect(card).toContain('Chỗ đổi:\n+ Xưng em.')
    expect(card).toContain('Lời dặn mới (toàn văn):\nTrả lời ngắn.\nXưng em.')
    expect(editCard({ name: 'Mai', soul: 'x' }, 'y', { from: 3, to: 4, restore: 1 }, '', 'vi')).toContain(
      'Khôi phục lời dặn bản 1 của Mai (thành bản 4)',
    )
  })
})
