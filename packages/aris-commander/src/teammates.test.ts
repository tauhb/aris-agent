import { describe, expect, it } from 'vitest'
import { LIMITS, answerText, cannotAsk, consultMessage, returnMessage } from './teammates.js'

const base = {
  depth: 1,
  rootCount: 0,
  trust: undefined,
  self: 'b-hang',
  target: { id: 'b-ngan' },
  targetRef: '@ngan',
} as const

describe('đồng đội hỏi nhau', () => {
  it('được hỏi trong lượt của chủ, đúng đồng đội, trong giới hạn', () => {
    expect(cannotAsk(base)).toBeUndefined()
    expect(cannotAsk({ ...base, trust: 'owner' })).toBeUndefined()
  })

  it('chặn lượt của khách, bot lạ, tự hỏi mình, bot ngoài, quá sâu, quá nhiều', () => {
    expect(cannotAsk({ ...base, trust: 'guest' })).toMatch(/không phải của chủ/)
    expect(cannotAsk({ ...base, trust: 'member' })).toMatch(/không phải của chủ/)
    expect(cannotAsk({ ...base, target: undefined })).toMatch(/Không có đồng đội/)
    expect(cannotAsk({ ...base, target: { id: 'b-hang' } })).toMatch(/chính mình/)
    expect(cannotAsk({ ...base, target: { id: 'b-x', external: {} } })).toMatch(/bot ngoài/)
    expect(cannotAsk({ ...base, depth: LIMITS.depth + 1 })).toMatch(/sâu/)
    expect(cannotAsk({ ...base, rootCount: LIMITS.perRoot })).toMatch(/6 lần/)
  })

  it('câu gửi đồng đội nói rõ là hỏi ý, không làm việc ra ngoài', () => {
    const m = consultMessage('Hằng', 'Đổi trả trong mấy ngày?', 'Khách mua hôm 20/10')
    expect(m).toContain('[Đồng đội Hằng hỏi ý bạn]')
    expect(m).toContain('Ngữ cảnh Hằng gửi kèm:\nKhách mua hôm 20/10')
    expect(m).toMatch(/Không gửi tin cho ai/)
    expect(answerText('Ngân', ' 7 ngày ')).toBe('Ngân trả lời:\n7 ngày')
  })

  it('kết quả quay về gom một tin, kể cả câu bị ngắt', () => {
    const m = returnMessage([
      { toName: 'Ngân', question: 'Đổi trả?', status: 'done', answer: '7 ngày' },
      { toName: 'Lâm', question: 'Giá đối thủ?', status: 'interrupted' },
    ])
    expect(m).toContain('Ngân trả lời câu «Đổi trả?»:\n7 ngày')
    expect(m).toContain('gửi Lâm bị ngắt')
    expect(m.match(/\[aris\]/g)).toHaveLength(1)
  })
})
