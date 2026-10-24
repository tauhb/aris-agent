import { describe, expect, it } from 'vitest'
import {
  MARKER_RE,
  heartbeatPrompt,
  humanInterval,
  isStuck,
  loopPrompt,
  nextAuto,
  parseHeartbeat,
  parseInterval,
  parseLoop,
  parseVerdict,
  similar,
  unchanged,
  type Verdict,
} from './rules.js'

describe('giám khảo /goal', () => {
  it('đọc JSON có chữ thừa quanh, bỏ kết quả lạ', () => {
    expect(
      parseVerdict('Kết quả:\n{"verdict":"continue","reason":"còn thiếu","missing":"bảng so sánh"}'),
    ).toEqual({
      verdict: 'continue',
      reason: 'còn thiếu',
      missing: 'bảng so sánh',
    })
    expect(parseVerdict('{"verdict":"done","reason":"đủ","missing":""}')).toEqual({
      verdict: 'done',
      reason: 'đủ',
    })
    expect(parseVerdict('{"verdict":"maybe"}')).toBeUndefined()
    expect(parseVerdict('không có JSON')).toBeUndefined()
  })

  it('ba lượt liền nêu cùng điều còn thiếu thì coi là kẹt', () => {
    const c = (missing: string): Verdict => ({ verdict: 'continue', reason: '', missing })
    expect(
      similar('Chưa có bảng so sánh giá ba nhà cung cấp', 'chưa có bảng so sánh giá của ba nhà cung cấp'),
    ).toBe(true)
    expect(similar('Chưa có bảng so sánh giá', 'Chưa chạy test')).toBe(false)
    expect(isStuck([c('Chưa chạy test đơn vị'), c('chưa chạy test đơn vị')])).toBe(false)
    expect(
      isStuck([c('Chưa chạy test đơn vị'), c('chưa chạy test đơn vị'), c('Chưa chạy test đơn vị.')]),
    ).toBe(true)
    expect(isStuck([c('Chưa chạy test đơn vị'), c('Thiếu tài liệu'), c('Chưa chạy test đơn vị')])).toBe(false)
    expect(isStuck([c('a b c'), c('a b c'), { verdict: 'done', reason: '' }])).toBe(false)
  })
})

describe('/loop và /heartbeat', () => {
  it('đọc nhịp', () => {
    expect(parseInterval('5m')).toBe(300)
    expect(parseInterval('1h30m')).toBe(5400)
    expect(parseInterval('90s')).toBe(90)
    expect(parseInterval('kiểm')).toBeUndefined()
    expect(parseInterval('')).toBeUndefined()
    expect(humanInterval(300)).toBe('5 phút')
    expect(humanInterval(3600)).toBe('1 giờ')
    expect(humanInterval(90)).toBe('90 giây')
  })

  it('đọc lệnh /loop', () => {
    expect(parseLoop('')).toEqual({ kind: 'list' })
    expect(parseLoop('dừng')).toEqual({ kind: 'stop' })
    expect(parseLoop('Stop')).toEqual({ kind: 'stop' })
    expect(parseLoop('5m kiểm tra bản deploy')).toEqual({
      kind: 'start',
      seconds: 300,
      task: 'kiểm tra bản deploy',
    })
    expect(parseLoop('kiểm tra bản deploy')).toEqual({ kind: 'start', task: 'kiểm tra bản deploy' })
    expect(parseLoop('30s kiểm tra').kind).toBe('error')
    expect(parseLoop('5m').kind).toBe('error')
  })

  it('đọc lệnh /heartbeat', () => {
    expect(parseHeartbeat('')).toEqual({ kind: 'start', seconds: 1800 })
    expect(parseHeartbeat('tắt')).toEqual({ kind: 'stop' })
    expect(parseHeartbeat('1h hộp thư khách')).toEqual({
      kind: 'start',
      seconds: 3600,
      focus: 'hộp thư khách',
    })
    expect(parseHeartbeat('đơn hàng mới')).toEqual({ kind: 'start', seconds: 1800, focus: 'đơn hàng mới' })
    expect(parseHeartbeat('10s').kind).toBe('error')
  })

  it('lời nhắc mang dấu nhận ra được', () => {
    expect(MARKER_RE.exec(loopPrompt('l-abc-12', 'xem log', 300, false))?.[1]).toBe('l-abc-12')
    expect(MARKER_RE.exec(heartbeatPrompt('l-x', 1800, 'đơn mới'))?.[1]).toBe('l-x')
    expect(heartbeatPrompt('l-x', 1800)).not.toContain('nhất là')
  })

  it('tự điều nhịp: không đổi thì giãn gấp đôi tới 15 phút, đổi thì về 1 phút', () => {
    expect(unchanged('Không đổi.', 'gì đó')).toBe(true)
    expect(unchanged('ổn', undefined)).toBe(true)
    expect(unchanged('Bản deploy  vẫn chạy', 'bản deploy vẫn chạy.')).toBe(true)
    expect(unchanged('Bản deploy lỗi', 'Bản deploy vẫn chạy')).toBe(false)
    expect(nextAuto(60, true)).toBe(120)
    expect(nextAuto(600, true)).toBe(900)
    expect(nextAuto(900, true)).toBe(900)
    expect(nextAuto(480, false)).toBe(60)
  })
})
