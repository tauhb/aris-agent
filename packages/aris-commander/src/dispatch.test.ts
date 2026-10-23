import { describe, expect, it } from 'vitest'
import {
  dispatch,
  parseSummary,
  summarize,
  type BotInfo,
  type DispatchEntry,
  type TeamPort,
} from './dispatch.js'

type A = { session: { id: string } }
const BOTS: BotInfo[] = [
  { id: 'aris', handle: 'aris', name: 'Aris', kind: 'commander' },
  { id: 'b-1', handle: 'minh', name: 'Minh', kind: 'member' },
  { id: 'b-2', handle: 'tho', name: 'Thơ', kind: 'member' },
]

function setup(busy = 0) {
  const members: { id: string; name: string; status: string }[] = []
  const calls: string[] = []
  let n = 0
  const team: TeamPort<A> = {
    listMembers: () => members,
    async spawnTeammate(_a, req) {
      calls.push(`spawn ${req.name}: ${req.prompt[0]!.text.split('\n')[2]}`)
      const id = `child-${req.name}`
      members.push({ id, name: req.name, status: 'running' })
      return { member: { id } }
    },
    async sendMessage(_a, req) {
      calls.push(`send ${req.target}`)
      return {}
    },
    async createTask(_a, req) {
      calls.push(`task ${req.subject}`)
      return { id: `task-${++n}`, revision: 1 }
    },
    async updateTask(_a, req) {
      calls.push(`assign ${req.taskId} → ${req.owner}`)
      return {}
    },
  }
  const log: DispatchEntry[] = []
  const deps = {
    team,
    botOf: (id: string) => (id === 'cmd' ? BOTS[0]! : BOTS[1]!),
    byHandle: (h: string) => BOTS.find((b) => b.handle === h),
    busyBots: () => busy,
    record: (e: DispatchEntry) => void log.push(e),
  }
  return { deps, calls, log, members }
}
const signal = new AbortController().signal
const cmd: A = { session: { id: 'cmd' } }

describe('giao việc', () => {
  it('giao song song: tạo thành viên theo tên gọi, thẻ gán cho bot, ghi nhật ký có lý do', async () => {
    const { deps, calls, log } = setup()
    const r = await dispatch(
      deps,
      cmd,
      [
        { bot: '@minh', task: 'Tóm tắt 3 đối thủ', reason: 'Minh lo nghiên cứu', title: 'Đối thủ' },
        { bot: 'tho', task: 'Viết nháp bài Facebook', reason: 'Thơ viết nội dung' },
      ],
      signal,
    )
    expect(r.map((x) => [x.handle, x.ok, x.sessionId, x.taskId])).toEqual([
      ['minh', true, 'child-minh', 'task-1'],
      ['tho', true, 'child-tho', 'task-2'],
    ])
    expect(calls).toContain('spawn minh: Tóm tắt 3 đối thủ')
    expect(calls).toContain('assign task-1 → minh')
    expect(log.map((e) => [e.handle, e.title, e.reason])).toEqual([
      ['minh', 'Đối thủ', 'Minh lo nghiên cứu'],
      ['tho', 'Viết nháp bài Facebook', 'Thơ viết nội dung'],
    ])
    const text = summarize(r)
    expect(parseSummary(text)).toEqual([
      { handle: 'minh', ok: true, sessionId: 'child-minh' },
      { handle: 'tho', ok: true, sessionId: 'child-tho' },
    ])
  })

  it('bot đã trong đội thì nhắn tiếp, không tạo lại', async () => {
    const { deps, calls } = setup()
    await dispatch(deps, cmd, [{ bot: 'minh', task: 'Việc 1', reason: 'x' }], signal)
    const r = await dispatch(deps, cmd, [{ bot: 'minh', task: 'Việc 2', reason: 'x' }], signal)
    expect(r[0]).toMatchObject({ ok: true, reused: true, sessionId: 'child-minh' })
    expect(calls.filter((c) => c.startsWith('spawn'))).toHaveLength(1)
    expect(calls).toContain('send minh')
  })

  it('luật: chỉ Commander giao; tối đa 4 bot; không trùng; bot lạ và Commander báo lỗi riêng', async () => {
    const { deps } = setup()
    await expect(
      dispatch(deps, { session: { id: 'minh-session' } }, [{ bot: 'tho', task: 'x', reason: 'y' }], signal),
    ).rejects.toThrow('Chỉ Commander')
    const five = Array.from({ length: 5 }, (_, i) => ({ bot: `b${i}`, task: 'x', reason: 'y' }))
    await expect(dispatch(deps, cmd, five, signal)).rejects.toThrow('tối đa 4')
    await expect(
      dispatch(
        deps,
        cmd,
        [
          { bot: 'minh', task: 'a', reason: 'b' },
          { bot: '@Minh', task: 'c', reason: 'd' },
        ],
        signal,
      ),
    ).rejects.toThrow('hai lần')
    const r = await dispatch(
      deps,
      cmd,
      [
        { bot: 'khong-co', task: 'x', reason: 'y' },
        { bot: 'aris', task: 'x', reason: 'y' },
        { bot: 'minh', task: 'x', reason: '' },
      ],
      signal,
    )
    expect(r.map((x) => x.ok)).toEqual([false, false, false])
    expect(summarize(r)).toContain('Chưa giao được việc nào')
  })

  it('đủ 6 bot đang chạy thì từ chối bot mới', async () => {
    const { deps } = setup(6)
    await expect(dispatch(deps, cmd, [{ bot: 'minh', task: 'x', reason: 'y' }], signal)).rejects.toThrow(
      'đang chạy',
    )
  })
})
