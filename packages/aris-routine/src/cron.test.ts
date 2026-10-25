import { describe, expect, it } from 'vitest'
import { CronError, humanCron, nextRun, parseCron } from './cron.js'

const next = (expr: string, after: string, tz?: string) =>
  nextRun(parseCron(expr), new Date(after), tz)?.toISOString()

describe('cron', () => {
  it('đọc trường: danh sách, khoảng, bước; thứ 7 là Chủ nhật; sai thì báo lỗi tiếng Việt', () => {
    const s = parseCron('*/15 8-10 * * 1-5,7')
    expect([...s.minute]).toEqual([0, 15, 30, 45])
    expect([...s.hour]).toEqual([8, 9, 10])
    expect([...s.dow].sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(() => parseCron('0 8 * *')).toThrow(CronError)
    expect(() => parseCron('61 8 * * *')).toThrow(/phút/)
  })

  it('lần chạy kế theo giờ Việt Nam', () => {
    // 07:30 giờ VN = 00:30 UTC.
    expect(next('30 7 * * 1-5', '2026-10-24T00:00:00Z')).toBe('2026-10-26T00:30:00.000Z') // thứ 7 ⇒ thứ 2
    expect(next('30 7 * * 1-5', '2026-10-26T00:30:00Z')).toBe('2026-10-27T00:30:00.000Z') // không tính đúng phút
    expect(next('0 8 1 * *', '2026-10-24T00:00:00Z')).toBe('2026-11-01T01:00:00.000Z')
    expect(next('*/15 * * * *', '2026-10-24T00:07:12Z')).toBe('2026-10-24T00:15:00.000Z')
  })

  it('ngày và thứ cùng giới hạn thì khớp một trong hai (như cron)', () => {
    // Ngày 1 hoặc thứ 2, 09:00 giờ VN; 24/10/2026 là thứ 7.
    expect(next('0 9 1 * 1', '2026-10-24T03:00:00Z')).toBe('2026-10-26T02:00:00.000Z')
  })

  it('múi giờ có giờ mùa hè', () => {
    // New York chuyển sang giờ mùa đông 01/11/2026: 08:00 là 13:00 UTC thay vì 12:00.
    expect(next('0 8 * * *', '2026-10-31T13:00:00Z', 'America/New_York')).toBe('2026-11-01T13:00:00.000Z')
    expect(next('0 8 * * *', '2026-10-30T13:00:00Z', 'America/New_York')).toBe('2026-10-31T12:00:00.000Z')
  })

  it('viết lịch thành chữ', () => {
    expect(humanCron('30 7 * * 1-5')).toBe('Thứ 2–6, 07:30')
    expect(humanCron('0 8 * * 1')).toBe('Thứ 2, 08:00')
    expect(humanCron('0 23 * * 0')).toBe('Chủ nhật, 23:00')
    expect(humanCron('0 17 * * *')).toBe('Mỗi ngày, 17:00')
    expect(humanCron('0 3 1 1,7 *')).toBe('0 3 1 1,7 *')
    expect(humanCron('0 9 * * 6,0')).toBe('Thứ 7, Chủ nhật, 09:00')
    expect(humanCron('0 8 1 * *')).toBe('Ngày 1 hằng tháng, 08:00')
    expect(humanCron('*/10 * * * *')).toBe('Mỗi 10 phút')
    expect(humanCron('0 8 1 1 *')).toBe('Ngày 1/1 hằng năm, 08:00')
  })
})
