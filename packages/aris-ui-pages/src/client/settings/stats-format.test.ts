import { describe, expect, it } from 'vitest'
import { clock, clockSec, dayLabel, fmtDuration, fmtInt, fmtTokens, fmtUsd, logTime } from './stats-format.js'

describe('định dạng số cho thống kê', () => {
  it('token gọn như bản vẽ', () => {
    expect(fmtTokens(38_200)).toBe('38,2K')
    expect(fmtTokens(200)).toBe('0,2K')
    expect(fmtTokens(2_104)).toBe('2,1K')
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(1_250_000)).toBe('1,3M')
    expect(fmtTokens(38_200, '.')).toBe('38.2K')
  })
  it('số nguyên có dấu nghìn', () => {
    expect(fmtInt(2040)).toBe('2.040')
    expect(fmtInt(1234567, '.')).toBe('1,234,567')
    expect(fmtInt(64)).toBe('64')
  })
  it('tiền: hai số lẻ, tiền rất nhỏ ba số lẻ', () => {
    expect(fmtUsd(0.114)).toBe('0,11')
    expect(fmtUsd(0.003)).toBe('0,003')
    expect(fmtUsd(0)).toBe('0,00')
    expect(fmtUsd(0.0004)).toBe('<0,001')
    expect(fmtUsd(2.96)).toBe('2,96')
    expect(fmtUsd(0.003, ',', false)).toBe('0,00')
    expect(fmtUsd(2.5, '.')).toBe('2.50')
  })
  it('giờ và ngày', () => {
    const t = new Date(2026, 9, 26, 7, 5, 9).getTime()
    expect(clock(t)).toBe('07:05')
    expect(clockSec(t)).toBe('07:05:09')
    expect(logTime(t, new Date(2026, 9, 26, 20).getTime())).toBe('07:05')
    expect(logTime(t, new Date(2026, 9, 27, 8).getTime())).toBe('26/10 07:05')
  })
  it('thời gian chạy', () => {
    const sec = (n: string) => `${n} s`
    const min = (m: number, s: number) => `${m} m ${s} s`
    expect(fmtDuration(1200, sec, min)).toBe('1,2 s')
    expect(fmtDuration(18_000, sec, min)).toBe('18 s')
    expect(fmtDuration(41_000, sec, min)).toBe('41 s')
    expect(fmtDuration(125_000, sec, min)).toBe('2 m 5 s')
  })
  it('nhãn ngày của biểu đồ', () => {
    const wd = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
    expect(dayLabel('2026-10-26', 'week', wd)).toBe('T2')
    expect(dayLabel('2026-10-25', 'week', wd)).toBe('CN')
    expect(dayLabel('2026-10-05', 'date', wd)).toBe('05/10')
  })
})
