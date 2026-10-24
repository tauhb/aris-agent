import { describe, expect, it } from 'vitest'
import type { DispatchRecord } from './domain.js'
import { learnedContext, learnedFrom, rateOf } from './learned.js'

const rec = (
  bot: string,
  kind: string | undefined,
  outcome?: DispatchRecord['outcome'],
  at = '2026-10-24T10:00:00Z',
): DispatchRecord => ({
  at,
  sessionId: 's',
  bot,
  handle: bot,
  title: 't',
  task: 't',
  reason: 'r',
  member: 'm',
  reused: false,
  ...(kind ? { kind } : {}),
  ...(outcome ? { outcome } : {}),
})

describe('Commander tự học', () => {
  it('gộp theo bot × loại việc, chuẩn hoá tên loại, bỏ lần không ghi loại', () => {
    const list = learnedFrom([
      rec('minh', 'Nghiên cứu thị trường', 'done'),
      rec('minh', 'nghiên cứu  thị trường', 'done', '2026-10-25T10:00:00Z'),
      rec('minh', 'nghiên cứu thị trường', 'failed'),
      rec('mai', 'lịch và email', 'done'),
      rec('mai', 'lịch và email'),
      rec('mai', undefined, 'done'),
    ])
    expect(list).toHaveLength(2)
    expect(list[0]).toMatchObject({
      bot: 'minh',
      kind: 'nghiên cứu thị trường',
      times: 3,
      done: 2,
      failed: 1,
      last: '2026-10-25T10:00:00Z',
    })
    expect(rateOf(list[0]!)).toBeCloseTo(2 / 3)
    expect(rateOf(list[1]!)).toBe(1)
  })

  it('khối ngữ cảnh cho Commander', () => {
    expect(learnedContext([], (b) => b)).toBe('')
    const text = learnedContext(
      learnedFrom([rec('minh', 'nghiên cứu', 'done'), rec('tin', 'báo cáo', undefined)]),
      (b) => b.toUpperCase(),
    )
    expect(text).toContain('- MINH · nghiên cứu: 1 lần, xong 100%')
    expect(text).toContain('- TIN · báo cáo: 1 lần\n')
  })
})
