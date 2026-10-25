import { describe, expect, it } from 'vitest'
import { buildBoard, foldTeam } from './board.js'

const ev = (type: string, data: unknown) => ({ type, data })
const task = (id: string, extra: Record<string, unknown> = {}) =>
  ev('team/task', {
    task: { id, subject: `Thẻ ${id}`, description: '', status: 'pending', blockedBy: [], ...extra },
  })

describe('bảng việc dự án', () => {
  const team = foldTeam([
    ev('team/member', { member: { id: 's-minh', name: 'minh' } }),
    ev('team/member', { member: { id: 's-tho', name: 'tho' } }),
    task('task-1'),
    task('task-1', { status: 'in_progress', ownerId: 's-minh' }),
    task('task-2', { status: 'in_progress', ownerId: 's-minh' }),
    task('task-3', { status: 'in_progress', ownerId: 's-tho' }),
    task('task-4', { blockedBy: ['task-1'] }),
    task('task-5', { status: 'completed', ownerId: 's-tho' }),
    task('task-6', { status: 'deleted' }),
    ev('session/message', {}),
  ])

  it('gom bản ghi: bản sau đè bản trước, bỏ thẻ đã xoá', () => {
    expect(team.tasks.get('task-1')!.status).toBe('in_progress')
    expect(team.members.get('s-tho')).toBe('tho')
  })

  it('xếp cột: thẻ cũ nhất bot giữ theo phiên của bot; thẻ sau chờ; thẻ chờ thẻ khác ghi rõ; thẻ chờ của người dùng', () => {
    const board = buildBoard({
      team,
      drafts: [
        { id: 'c-1', workspace: 'w', title: 'Ý tưởng của anh', bot: 'b-tho', createdAt: '' },
        { id: 'c-2', workspace: 'w', title: 'Đã giao', createdAt: '', taskId: 'task-5' },
      ],
      botOfHandle: (h) => `b-${h}`,
      sessionState: (sid) => (sid === 's-minh' ? 'running' : sid === 's-tho' ? 'waiting' : 'idle'),
    })
    const col = Object.fromEntries(board.map((c) => [c.id, c.column]))
    expect(col).toEqual({
      'task-1': 'doing',
      'task-2': 'ready',
      'task-3': 'waiting',
      'task-4': 'unassigned',
      'task-5': 'done',
      'c-1': 'unassigned',
    })
    expect(board.find((c) => c.id === 'task-4')!.waitingFor).toEqual([{ id: 'task-1', title: 'Thẻ task-1' }])
    expect(board.find((c) => c.id === 'task-1')).toMatchObject({
      bot: 'b-minh',
      session: 's-minh',
      kind: 'task',
    })
    expect(board.find((c) => c.id === 'c-1')).toMatchObject({ kind: 'draft', bot: 'b-tho' })
  })

  it('Driver: thẻ chưa giao hiện bot dự kiến; thẻ vấp, kẹt mang cờ; thẻ xong thì bỏ cờ', () => {
    const b = buildBoard({
      team,
      drafts: [],
      botOfHandle: (h) => `b-${h}`,
      sessionState: () => 'idle',
      planned: new Map([
        ['task-4', 'b-lam'],
        ['task-1', 'b-lam'],
      ]),
      driver: { gaveUp: ['task-2', 'task-5'], stuck: ['task-3'] },
    })
    expect(b.find((c) => c.id === 'task-4')).toMatchObject({ bot: 'b-lam', planned: true })
    expect(b.find((c) => c.id === 'task-1')).toMatchObject({ bot: 'b-minh' })
    expect(b.find((c) => c.id === 'task-1')!.planned).toBeUndefined()
    expect(b.find((c) => c.id === 'task-2')!.failed).toBe(true)
    expect(b.find((c) => c.id === 'task-3')!.stuck).toBe(true)
    expect(b.find((c) => c.id === 'task-5')!.failed).toBeUndefined()
  })

  it('bot rảnh mà còn giữ thẻ: thẻ ở Sẵn sàng (đã giao, chưa chạy)', () => {
    const b = buildBoard({ team, drafts: [], botOfHandle: () => undefined, sessionState: () => 'idle' })
    expect(b.find((c) => c.id === 'task-1')!.column).toBe('ready')
  })
})

describe('việc lớn trên bảng', () => {
  it('việc lớn đứng đầu, cột theo trạng thái; vấp vẫn ở Đang làm kèm cờ', () => {
    const job = (id: string, status: 'running' | 'done' | 'failed', session: string) => ({
      id,
      title: `Việc ${id}`,
      departmentName: 'Tăng trưởng',
      lead: 'b-tho',
      session,
      status,
      progress: { done: 1, total: 3 },
    })
    const b = buildBoard({
      team: { tasks: new Map(), members: new Map() },
      drafts: [],
      botOfHandle: () => undefined,
      sessionState: (s) => (s === 'wait' ? 'waiting' : 'idle'),
      jobs: [
        job('job-a', 'running', 'x'),
        job('job-b', 'running', 'wait'),
        job('job-c', 'done', 'y'),
        job('job-d', 'failed', 'z'),
      ],
    })
    expect(b.map((c) => [c.id, c.column, c.failed ?? false])).toEqual([
      ['job-a', 'doing', false],
      ['job-b', 'waiting', false],
      ['job-c', 'done', false],
      ['job-d', 'doing', true],
    ])
    expect(b[0]).toMatchObject({
      kind: 'job',
      department: 'Tăng trưởng',
      progress: { done: 1, total: 3 },
      bot: 'b-tho',
    })
  })
})
