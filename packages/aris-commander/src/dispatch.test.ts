import { describe, expect, it } from 'vitest'
import {
  dispatch,
  parseSummary,
  planCards,
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
  {
    id: 'b-3',
    handle: 'khoa',
    name: 'Khoa',
    kind: 'member',
    external: { agent: 'claude-code', assignable: true },
  },
  { id: 'b-4', handle: 'lan', name: 'Lan', kind: 'member', external: { agent: 'codex', assignable: false } },
]

function setup(busy = 0) {
  const members: { id: string; name: string; status: string }[] = []
  const tasks: Record<
    string,
    { id: string; revision: number; subject: string; status: string; ready: boolean }
  > = {
    'task-7': { id: 'task-7', revision: 3, subject: 'Lịch đăng 8 tuần', status: 'pending', ready: true },
    'task-8': { id: 'task-8', revision: 1, subject: 'Đăng bài', status: 'pending', ready: false },
  }
  const drafts: Record<string, { title: string; taskId?: string }> = {
    'c-1': { title: 'Kịch bản video ra mắt' },
    'c-2': { title: 'Đã giao rồi', taskId: 'task-1' },
  }
  const dispatchedCards: string[] = []
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
      calls.push(`assign ${req.taskId}@${req.expectedRevision} → ${req.owner}`)
      return {}
    },
    getTask(_a, id) {
      const t = tasks[id]
      if (!t) throw new Error('not found')
      return t
    },
  }
  const log: DispatchEntry[] = []
  const deps = {
    team,
    botOf: (id: string) => (id === 'cmd' ? BOTS[0]! : BOTS[1]!),
    byHandle: (h: string) => BOTS.find((b) => b.handle === h),
    busyBots: () => busy,
    record: (e: DispatchEntry) => void log.push(e),
    cards: {
      get: (id: string) => drafts[id],
      dispatched: async (id: string, taskId: string) => void dispatchedCards.push(`${id}→${taskId}`),
    },
  }
  return { deps, calls, log, members, dispatchedCards }
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
    expect(calls).toContain('assign task-1@1 → minh')
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

describe('giao thẻ có sẵn', () => {
  it('thẻ task-n: không tạo thẻ mới, giao đúng phiên bản; thẻ đang chờ thì báo, không nhắn bot', async () => {
    const { deps, calls } = setup()
    const r = await dispatch(
      deps,
      cmd,
      [{ bot: 'minh', task: 'Làm lịch', reason: 'r', card: 'task-7' }],
      signal,
    )
    expect(r[0]).toMatchObject({ ok: true, taskId: 'task-7' })
    expect(calls).toEqual(['spawn minh: Làm lịch', 'assign task-7@3 → minh'])
    const blocked = await dispatch(
      deps,
      cmd,
      [{ bot: 'tho', task: 'Đăng', reason: 'r', card: 'task-8' }],
      signal,
    )
    expect(blocked[0]!.error).toContain('đang chờ thẻ khác')
    expect(calls.some((c) => c.includes('tho'))).toBe(false)
    const bad = await dispatch(deps, cmd, [{ bot: 'tho', task: 'x', reason: 'r', card: 'abc' }], signal)
    expect(bad[0]!.error).toContain('không đúng')
  })

  it('thẻ c-n của người dùng: tạo thẻ của đội theo tiêu đề thẻ, đánh dấu đã giao; thẻ đã giao thì báo', async () => {
    const { deps, calls, dispatchedCards, log } = setup()
    const r = await dispatch(
      deps,
      cmd,
      [{ bot: 'tho', task: 'Viết kịch bản', reason: 'r', card: 'c-1' }],
      signal,
    )
    expect(r[0]).toMatchObject({ ok: true, taskId: 'task-1' })
    expect(calls).toContain('task Kịch bản video ra mắt')
    expect(dispatchedCards).toEqual(['c-1→task-1'])
    expect(log[0]!.title).toBe('Kịch bản video ra mắt')
    const again = await dispatch(deps, cmd, [{ bot: 'minh', task: 'x', reason: 'r', card: 'c-2' }], signal)
    expect(again[0]!.error).toContain('đã giao')
  })
})

describe('chia việc thành thẻ', () => {
  it('thẻ chờ thẻ ghi trước (theo tiêu đề) hoặc thẻ có sẵn; chờ thẻ chưa có thì báo', async () => {
    const made: { subject: string; blockedBy?: readonly string[] }[] = []
    let n = 10
    const team = {
      async createTask(_a: A, req: { subject: string; description: string; blockedBy?: readonly string[] }) {
        made.push(req)
        return { id: `task-${++n}`, revision: 1 }
      },
    }
    const r = await planCards(team, cmd, [
      { title: 'Kịch bản 8 video' },
      { title: 'Lịch đăng 8 tuần', after: ['kịch bản 8 video', 'task-3'] },
    ])
    expect(r).toEqual([
      { id: 'task-11', title: 'Kịch bản 8 video', after: [] },
      { id: 'task-12', title: 'Lịch đăng 8 tuần', after: ['task-11', 'task-3'] },
    ])
    expect(made[1]!.blockedBy).toEqual(['task-11', 'task-3'])
    await expect(planCards(team, cmd, [{ title: 'A', after: ['B'] }])).rejects.toThrow('chưa có thẻ đó')
    await expect(planCards(team, cmd, [])).rejects.toThrow('Chưa có thẻ')
  })
})

describe('trưởng nhóm giao trong phòng', () => {
  it('trưởng nhóm (không phải Commander) chỉ giao được cho thành viên phòng', async () => {
    const { deps } = setup()
    const lead = { ...deps, lead: { department: 'Tăng trưởng', members: new Set(['b-2']) } }
    const me: A = { session: { id: 'lead' } }
    const r = await dispatch(
      lead,
      me,
      [
        { bot: 'tho', task: 'Viết bài', reason: 'r' },
        { bot: 'minh', task: 'Tự giao mình', reason: 'r' },
      ],
      signal,
    )
    expect(r.map((x) => x.ok)).toEqual([true, false])
    expect(r[1]!.error).toContain('không phải thành viên phòng Tăng trưởng')
    await expect(dispatch(deps, me, [{ bot: 'tho', task: 'x', reason: 'r' }], signal)).rejects.toThrow(
      'trưởng nhóm đang nhận việc lớn',
    )
  })
})

describe('giao cho bot ngoài', () => {
  it('bot ngoài chạy qua plugin, không qua Team; tóm tắt nói không dùng wait_agent', async () => {
    const { deps, calls } = setup()
    const ran: string[] = []
    const r = await dispatch(
      {
        ...deps,
        external: async (bot, a, title) => {
          ran.push(`${bot.handle}: ${title}`)
          return { handle: bot.handle, name: bot.name, ok: true, external: 'Claude Code', runId: 'ext-1' }
        },
      },
      cmd,
      [
        { bot: 'khoa', task: 'Sửa lỗi đăng nhập\nchi tiết', reason: 'sửa mã' },
        { bot: 'minh', task: 'Tìm nguyên nhân', reason: 'nghiên cứu' },
      ],
      signal,
    )
    expect(ran).toEqual(['khoa: Sửa lỗi đăng nhập'])
    expect(calls.some((c) => c.includes('khoa'))).toBe(false)
    const text = summarize(r)
    expect(text).toContain('- @khoa (Khoa): đã nhận việc (bot ngoài Claude Code), việc ngoài ext-1')
    expect(text).toContain('không dùng wait_agent cho bot ngoài')
    expect(text).toContain('Dùng wait_agent')
  })

  it('bot ngoài tắt nhận giao việc, hoặc giao kèm thẻ, thì báo lỗi', async () => {
    const { deps } = setup()
    const external = async () => ({ handle: 'x', ok: true })
    const r = await dispatch(
      { ...deps, external },
      cmd,
      [
        { bot: 'lan', task: 'Việc', reason: 'x' },
        { bot: 'khoa', task: 'Việc', reason: 'x', card: 'c-1' },
      ],
      signal,
    )
    expect(r.map((x) => [x.handle, x.ok, x.error])).toEqual([
      ['lan', false, '@lan là bot ngoài không nhận giao việc từ Commander.'],
      ['khoa', false, 'Bot ngoài chưa nhận thẻ Kanban; giao không kèm the.'],
    ])
  })
})
