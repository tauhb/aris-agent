import { describe, expect, it } from 'vitest'
import { activityV2 } from './activity-v2.js'
import type { PendingApproval } from './external.js'
import type { TeamLive } from './team.js'

const NOW = new Date(2026, 10, 1, 15, 0).getTime()
const YESTERDAY = new Date(2026, 9, 31, 20, 0).getTime()
const names: Record<string, string> = { mai: 'Mai', lam: 'Lâm', ha: 'Hà', tin: 'Tín' }
const nameOf = (id: string) => names[id] ?? id

const approvals = [
  {
    id: 's1',
    run: 'r1',
    bot: 'mai',
    name: 'send_message',
    reason: 'Gửi báo giá cho Hùng',
    parentSession: 'p1',
  },
  { id: 's2', run: 'r2', bot: 'mai', name: 'send_message' },
] as unknown as PendingApproval[]

const live: TeamLive = {
  status: {
    mai: { status: 'waiting', since: NOW - 10, running: 0 },
    tin: { status: 'waiting', task: 'Chọn khung giờ họp', since: NOW - 20, running: 0, sessions: ['t1'] },
    lam: { status: 'working', task: 'Viết bài 2 trên 3', since: NOW - 5, running: 1, sessions: ['l1'] },
    ha: { status: 'working', since: NOW - 1, running: 1 },
  },
  activity: [
    { bot: 'ha', kind: 'done', task: 'Lọc 214 khách', at: NOW - 100, session: 'h1' },
    { bot: 'lam', kind: 'failed', task: 'Đăng bài', at: NOW - 50 },
    { bot: 'lam', kind: 'started', task: 'Viết bài', at: NOW - 40 },
    { bot: 'ha', kind: 'done', task: 'Việc hôm qua', at: YESTERDAY },
  ],
}

describe('bảng Hoạt động GĐ9', () => {
  const a = activityV2(approvals, live, nameOf, NOW, 'Đang làm')

  it('mỗi yêu cầu duyệt một mục; bot đợi mà chưa có yêu cầu nào cũng vào "cần"', () => {
    expect(a.need.map((x) => [x.bot, x.title])).toEqual([
      ['mai', 'Gửi báo giá cho Hùng'],
      ['mai', 'send_message'],
      ['tin', 'Chọn khung giờ họp'],
    ])
    expect(a.need[0]!.session).toBe('p1')
    expect(a.need[2]!.session).toBe('t1')
  })

  it('đang chạy: mới nhất trước, thiếu tên việc thì dùng chữ mặc định', () => {
    expect(a.running.map((x) => [x.sub, x.title])).toEqual([
      ['Hà', 'Đang làm'],
      ['Lâm', 'Viết bài 2 trên 3'],
    ])
  })

  it('xong trong ngày: chỉ mục xong hay vấp của hôm nay, mới nhất trước', () => {
    expect(a.done.map((x) => [x.title, x.failed])).toEqual([
      ['Đăng bài', true],
      ['Lọc 214 khách', false],
    ])
  })
})
