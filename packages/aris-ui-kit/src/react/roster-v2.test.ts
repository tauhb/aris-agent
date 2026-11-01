import { describe, expect, it } from 'vitest'
import type { PendingApproval } from './external.js'
import { rosterV2 } from './roster-v2.js'
import { teamView, type TeamLive, type TeamSnapshot } from './team.js'

const bot = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: id === 'aris' ? 'commander' : 'member',
  handle: id,
  name: id.toUpperCase(),
  role: 'Vai ' + id,
  description: '',
  soul: '',
  mascot: id === 'aris' ? 'aris' : 'mai',
  createdAt: '2026-11-01T00:00:00Z',
  ...extra,
})
const snap = {
  bots: [
    bot('aris'),
    bot('mai', { department: 'kd' }),
    bot('ha', { department: 'kd' }),
    bot('lam', { department: 'nd' }),
    bot('dev'),
  ],
  departments: [
    { id: 'kd', name: 'Kinh doanh', order: 0 },
    { id: 'nd', name: 'Nội dung', order: 1 },
    { id: 'vh', name: 'Vận hành', order: 2 },
  ],
  templates: [],
} as unknown as TeamSnapshot
const live: TeamLive = {
  status: {
    lam: { status: 'working', task: 'Viết bài 2 trên 3', since: 1, running: 1 },
    dev: { status: 'failed', since: 1, running: 0 },
  },
  activity: [
    { bot: 'ha', kind: 'done', task: 'Đã lọc 214 khách', at: 5 },
    { bot: 'ha', kind: 'done', task: 'Cũ hơn', at: 1 },
    { bot: 'dev', kind: 'failed', task: 'Lỗi đăng nhập GitHub', at: 4 },
  ],
}
const appr = [
  { bot: 'mai', run: 'r1', name: 'x' },
  { bot: 'mai', run: 'r2', name: 'y' },
] as unknown as PendingApproval[]

describe('danh bạ GĐ9', () => {
  const r = rosterV2(teamView(snap, 'Khác', live), live, appr)
  const row = (id: string) => r.groups.flatMap((g) => g.rows).find((x) => x.id === id)!

  it('Aris ghim đầu, phòng theo thứ tự, phòng rỗng bỏ, bot không phòng ở cuối', () => {
    expect(r.pinned.id).toBe('aris')
    expect(r.groups.map((g) => g.label)).toEqual(['Kinh doanh', 'Nội dung', 'Khác'])
  })

  it('chấm và dòng việc theo trạng thái', () => {
    expect(row('mai')).toMatchObject({ dot: 'need', needs: 2, line: '' })
    expect(row('lam')).toMatchObject({ dot: 'run', line: 'Viết bài 2 trên 3' })
    expect(row('dev')).toMatchObject({ dot: 'err', line: 'Lỗi đăng nhập GitHub' })
    expect(row('ha')).toMatchObject({ dot: null, line: 'Đã lọc 214 khách', needs: 0 })
  })

  it('bot chưa có việc nào thì dòng phụ là vai; linh vật giữ màu riêng', () => {
    expect(r.pinned.line).toBe('Vai aris')
    expect(row('mai').color).toBe('#FF6700')
  })

  it('chưa có dữ liệu trực tiếp thì không chấm', () => {
    const q = rosterV2(teamView(snap, 'Khác'), null, [])
    expect(q.groups.flatMap((g) => g.rows).every((x) => x.dot === null)).toBe(true)
  })
})
