import { describe, expect, it } from 'vitest'
import { decide, fixPrompt, routinePrompt, splitSuggestion, streakAfter } from './rules.js'

describe('luật chạy routine', () => {
  const r = { enabled: true, nextAt: '2026-10-25T00:30:00.000Z', catchupHours: 3 }
  const at = (s: string) => new Date(s)

  it('đến giờ: đúng giờ, chạy bù trong 3 giờ, quá thì lỡ; tắt, đang chạy, chưa tới thì thôi', () => {
    expect(decide(r, at('2026-10-25T00:29:00Z'), false)).toBeUndefined()
    expect(decide(r, at('2026-10-25T00:30:20Z'), false)).toBe('schedule')
    expect(decide(r, at('2026-10-25T02:00:00Z'), false)).toBe('catchup')
    expect(decide(r, at('2026-10-25T04:00:00Z'), false)).toBe('missed')
    expect(decide(r, at('2026-10-25T00:30:20Z'), true)).toBeUndefined()
    expect(decide({ ...r, enabled: false }, at('2026-10-25T00:30:20Z'), false)).toBeUndefined()
    expect(decide({ ...r, catchupHours: 0 }, at('2026-10-25T01:00:00Z'), false)).toBe('missed')
  })

  it('đếm lỗi liên tiếp', () => {
    expect(streakAfter(1, 'failed')).toBe(2)
    expect(streakAfter(1, 'cap')).toBe(2)
    expect(streakAfter(2, 'done')).toBe(0)
    expect(streakAfter(2, 'missed')).toBe(2)
    expect(streakAfter(2, 'stopped')).toBe(2)
  })

  it('lời gửi bot', () => {
    expect(routinePrompt('Tin đối thủ', 'Tóm tắt tin', true)).toContain('chỉ đọc')
    expect(routinePrompt('Tin đối thủ', 'Tóm tắt tin', false)).not.toContain('chỉ đọc')
    expect(fixPrompt('Tin đối thủ', ['a', 'b'])).toContain('lỗi 2 lần')
  })

  it('tách dòng gợi ý cuối câu trả lời', () => {
    expect(splitSuggestion('Chi 18 triệu.\n\nGỢI Ý: Đề xuất cắt quảng cáo')).toEqual({
      body: 'Chi 18 triệu.',
      suggestion: 'Đề xuất cắt quảng cáo',
    })
    expect(splitSuggestion('Chi 18 triệu.\n**Gợi ý:** So với tháng trước.')).toEqual({
      body: 'Chi 18 triệu.',
      suggestion: 'So với tháng trước',
    })
    expect(splitSuggestion('Không có gì mới.')).toEqual({ body: 'Không có gì mới.' })
    expect(routinePrompt('x', 'y', true)).toContain('GỢI Ý:')
  })
})
