import { describe, expect, it } from 'vitest'
import { driverTask, emptyDriverState, planDriver, type DriverTask } from './driver.js'

const task = (id: string, over: Partial<DriverTask> = {}): DriverTask => ({
  id,
  subject: `Thẻ ${id}`,
  description: `Làm ${id}`,
  status: 'pending',
  blockedBy: [],
  ...over,
})
const now = new Date('2026-10-25T03:00:00Z')
const base = {
  planned: new Map<string, string>(),
  runs: new Map(),
  running: () => false,
  slots: 6,
  state: emptyDriverState(),
  now,
}

describe('Driver', () => {
  it('giao thẻ sẵn sàng cho bot dự kiến; thẻ còn chờ thì để yên; theo số chỗ trống', () => {
    const tasks = [
      task('task-1', { status: 'completed', owner: 'lam' }),
      task('task-2', { blockedBy: ['task-1'] }),
      task('task-3', { blockedBy: ['task-2'] }),
      task('task-4'),
    ]
    const planned = new Map([
      ['task-2', 'mai'],
      ['task-3', 'tho'],
      ['task-4', 'lam'],
    ])
    const r = planDriver({ ...base, tasks, planned })
    expect(r.actions.map((a) => [a.kind, a.kind === 'dispatch' ? `${a.task.id}>${a.bot}` : ''])).toEqual([
      ['dispatch', 'task-2>mai'],
      ['dispatch', 'task-4>lam'],
    ])
    expect(planDriver({ ...base, tasks, planned, slots: 1 }).actions).toHaveLength(1)
  })

  it('thẻ sẵn sàng không có bot dự kiến: đánh thức Aris mỗi nhịp một thẻ, mỗi thẻ một lần', () => {
    const tasks = [task('task-1'), task('task-2')]
    const r1 = planDriver({ ...base, tasks })
    expect(r1.actions).toEqual([{ kind: 'wake', task: tasks[0] }])
    const r2 = planDriver({ ...base, tasks, state: r1.state })
    expect(r2.actions).toEqual([{ kind: 'wake', task: tasks[1] }])
    expect(planDriver({ ...base, tasks, state: r2.state }).actions).toEqual([])
  })

  it('thẻ vấp: giao lại một lần, vấp lần hai thì ngừng; không đếm một lần vấp hai lần; bot đang chạy thì đợi', () => {
    const t = task('task-1', { status: 'in_progress', owner: 'lam' })
    const run = (at: string) => new Map([['task-1', { at, member: 's-lam', outcome: 'failed' as const }]])
    const r1 = planDriver({ ...base, tasks: [t], runs: run('2026-10-25T02:00:00Z') })
    expect(r1.actions).toEqual([
      { kind: 'dispatch', task: t, bot: 'lam', retry: 'lượt trước vấp giữa chừng' },
    ])
    expect(
      planDriver({ ...base, tasks: [t], runs: run('2026-10-25T02:00:00Z'), state: r1.state }).actions,
    ).toEqual([])
    expect(
      planDriver({
        ...base,
        tasks: [t],
        runs: run('2026-10-25T02:30:00Z'),
        state: r1.state,
        running: () => true,
      }).actions,
    ).toEqual([])
    const r3 = planDriver({ ...base, tasks: [t], runs: run('2026-10-25T02:30:00Z'), state: r1.state })
    expect(r3.actions).toEqual([{ kind: 'give-up', task: t, reason: 'vấp 2 lần liên tiếp' }])
    expect(
      planDriver({ ...base, tasks: [t], runs: run('2026-10-25T02:40:00Z'), state: r3.state }).actions,
    ).toEqual([])
  })

  it('thẻ đã giao im 30 phút thì báo kẹt một lần; xong hết thì báo một lần', () => {
    const t = task('task-1', { status: 'in_progress', owner: 'lam' })
    const runs = new Map([['task-1', { at: '2026-10-25T02:20:00Z', member: 's-lam' }]])
    const r = planDriver({ ...base, tasks: [t], runs })
    expect(r.actions).toEqual([{ kind: 'stuck', task: t }])
    expect(planDriver({ ...base, tasks: [t], runs, state: r.state }).actions).toEqual([])
    const done = [task('task-1', { status: 'completed' }), task('task-2', { status: 'deleted' })]
    const d = planDriver({ ...base, tasks: done })
    expect(d.actions).toEqual([{ kind: 'all-done', count: 1 }])
    expect(planDriver({ ...base, tasks: done, state: d.state }).actions).toEqual([])
  })

  it('lời giao kèm kết quả thẻ trước và lý do giao lại', () => {
    const text = driverTask(
      task('task-2', { description: 'Viết bài từ dàn ý' }),
      [
        { id: 'task-1', subject: 'Dàn ý', by: 'Lâm', answer: 'Ba ý chính: A, B, C' },
        { id: 'task-0', subject: 'Không có kết quả' },
      ],
      'lượt trước vấp giữa chừng',
    )
    expect(text).toContain('Viết bài từ dàn ý')
    expect(text).toContain('- task-1 «Dàn ý» (Lâm): Ba ý chính: A, B, C')
    expect(text).not.toContain('task-0')
    expect(text).toContain('Đây là lần giao lại: lượt trước vấp giữa chừng')
  })
})
