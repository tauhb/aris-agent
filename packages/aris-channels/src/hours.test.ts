import { describe, expect, it } from 'vitest'
import { isOpen, nextOpen, validHours, wantsHuman } from './hours.js'

const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
// 27/10/2026 là thứ Ba.
const H = { days: [1, 2, 3, 4, 5, 6], from: '08:00', to: '21:00' }

describe('giờ trực', () => {
  it('trong và ngoài giờ, ngày nghỉ', () => {
    expect(isOpen(H, at(2026, 10, 27, 9))).toBe(true)
    expect(isOpen(H, at(2026, 10, 27, 7, 59))).toBe(false)
    expect(isOpen(H, at(2026, 10, 27, 21))).toBe(false)
    expect(isOpen(H, at(2026, 11, 1, 10))).toBe(false) // Chủ nhật
  })

  it('lần vào giờ kế tiếp: sáng nay, sáng mai, bỏ qua Chủ nhật', () => {
    expect(nextOpen(H, at(2026, 10, 27, 6))).toBe(at(2026, 10, 27, 8))
    expect(nextOpen(H, at(2026, 10, 27, 22))).toBe(at(2026, 10, 28, 8))
    expect(nextOpen(H, at(2026, 10, 31, 22))).toBe(at(2026, 11, 2, 8)) // tối thứ Bảy → sáng thứ Hai
    expect(nextOpen(H, at(2026, 10, 27, 9))).toBe(at(2026, 10, 27, 9))
  })

  it('ca qua nửa đêm', () => {
    const N = { days: [2], from: '20:00', to: '02:00' }
    expect(isOpen(N, at(2026, 10, 27, 23))).toBe(true)
    expect(isOpen(N, at(2026, 10, 28, 1))).toBe(true) // sáng thứ Tư, thuộc ca tối thứ Ba
    expect(isOpen(N, at(2026, 10, 28, 3))).toBe(false)
    expect(isOpen(N, at(2026, 10, 28, 23))).toBe(false)
  })

  it('giờ sai dạng thì coi như luôn trực; kiểm hợp lệ', () => {
    expect(isOpen({ days: [1], from: 'x', to: '09:00' }, at(2026, 11, 1, 3))).toBe(true)
    expect(validHours(H)).toBe(true)
    expect(validHours({ days: [], from: '08:00', to: '09:00' })).toBe(false)
    expect(validHours({ days: [1], from: '25:00', to: '09:00' })).toBe(false)
  })
})

describe('khách muốn gặp người thật', () => {
  it('nhận ra các cách nói thường gặp, có dấu hay không dấu', () => {
    for (const t of [
      'Cho mình gặp nhân viên',
      'gap nhan vien',
      'Mình muốn gặp người thật',
      'cần tư vấn viên',
      '/nhanvien',
    ])
      expect(wantsHuman(t), t).toBe(true)
    for (const t of ['nhân viên giao hàng tới chưa', 'giá bao nhiêu', 'gặp lại sau nhé'])
      expect(wantsHuman(t), t).toBe(false)
  })
})
