import { describe, expect, it } from 'vitest'
import type { RoundRecord } from './domain.js'
import {
  cannotOpen,
  isPass,
  parseCommands,
  roundReport,
  RoomState,
  runRound,
  type RoomBot,
  type RoundDeps,
  type Spoken,
} from './room.js'

const RULES = { maxRounds: 3, maxMessages: 10, stopCommand: true }
const BOTS: RoomBot[] = [
  { id: 'b-1', handle: 'lam', name: 'Lâm', role: 'Nghiên cứu' },
  { id: 'b-2', handle: 'tin', name: 'Tín', role: 'Tài chính' },
  { id: 'b-3', handle: 'dev', name: 'Dev', role: 'Kỹ thuật' },
]
const agent = { session: { id: 'main' } }

/** Đội giả: mỗi bot trả lời theo kịch bản; ghi lại lời mời bot nhận. */
function fakeRoom(replies: Record<string, (brief: string) => Spoken>, opts: { busy?: string[] } = {}) {
  const members: { id: string; name: string; status: string }[] = []
  const briefs: Record<string, string[]> = {}
  const saved: RoundRecord[] = []
  const posted: string[] = []
  let pending: { sid: string; brief: string } | undefined
  const deps: RoundDeps<typeof agent> = {
    agent,
    team: {
      listMembers: () => members,
      async spawnTeammate(_a, req) {
        members.push({ id: `s-${req.name}`, name: req.name, status: 'inactive' })
        pending = { sid: `s-${req.name}`, brief: req.prompt[0]!.text }
        ;(briefs[req.name] ??= []).push(req.prompt[0]!.text)
        return { member: { id: `s-${req.name}` } }
      },
      async sendMessage(_a, req) {
        pending = { sid: `s-${req.target}`, brief: req.content[0]!.text }
        ;(briefs[req.target] ??= []).push(req.content[0]!.text)
        return {}
      },
      interrupt: () => ({}),
    },
    async waitTurn(sid) {
      await Promise.resolve()
      const p = pending!
      expect(p.sid).toBe(sid)
      return replies[sid.slice(2)]!(p.brief)
    },
    busy: (id) => opts.busy?.includes(id) ?? false,
    async save(r) {
      saved.push(structuredClone(r))
    },
    post(entry) {
      posted.push(`${entry.handle}:${entry.kind}`)
    },
  }
  return { deps, briefs, saved, posted }
}

const say = (text: string) => (): Spoken => ({ kind: 'completed', text })
const input = (o: Partial<Parameters<typeof runRound>[2]> = {}) => ({
  callId: 'call-1',
  session: 'main',
  project: 'Kế hoạch quý 4',
  rules: RULES,
  members: BOTS,
  invite: [],
  prompt: 'Đề xuất 3 mục tiêu quý 4.',
  signal: new AbortController().signal,
  ...o,
})

describe('lệnh trong phòng', () => {
  it('dừng một bot, dừng cả phòng, gọi tên', () => {
    expect(parseCommands('dừng @lam')).toEqual({
      stopAll: false,
      stop: ['lam'],
      mentions: [],
      onlyStop: true,
    })
    expect(parseCommands('Dừng phòng!').stopAll).toBe(true)
    expect(parseCommands('dừng tất cả').stopAll).toBe(true)
    const c = parseCommands('@all bàn tiếp, dừng @dev nhé')
    expect(c.stop).toEqual(['dev'])
    expect(c.mentions).toEqual(['all'])
    expect(c.onlyStop).toBe(false)
  })
  it('bỏ lượt', () => {
    expect(isPass('BỎ LƯỢT')).toBe(true)
    expect(isPass('**Bỏ lượt.**')).toBe(true)
    expect(isPass('Bỏ lượt vì Lâm nói đúng rồi, nhưng thêm ý này')).toBe(false)
  })
  it('tin mới của người dùng mở lượt đếm mới; lệnh dừng thì không', () => {
    const s = new RoomState()
    s.round = 2
    s.used = 6
    s.userSaid('dừng @dev', RULES)
    expect(s.round).toBe(2)
    expect(s.stopped.has('dev')).toBe(true)
    s.userSaid('@dev quay lại góp ý đi', RULES)
    expect(s.round).toBe(0)
    expect(s.used).toBe(0)
    expect(s.stopped.has('dev')).toBe(false)
    expect(s.lines).toEqual([{ who: 'Người dùng', text: '@dev quay lại góp ý đi' }])
    s.userSaid('dừng phòng', RULES)
    expect(s.closed).toBe(true)
    expect(cannotOpen(s, RULES)).toContain('dừng phòng')
  })
  it('dự án tắt lệnh "dừng @bot" thì không dừng bot', () => {
    const s = new RoomState()
    s.userSaid('dừng @dev', { stopCommand: false })
    expect(s.stopped.size).toBe(0)
  })
})

describe('một vòng', () => {
  it('bot nói lần lượt, người sau đọc được người trước; bỏ lượt không tính tin', async () => {
    const { deps, briefs, saved, posted } = fakeRoom({
      lam: say('Video hướng dẫn giữ chân tốt nhất. Đề xuất 2 video/tuần.'),
      tin: say('50 triệu: 30 sản xuất, 15 quảng cáo, 5 dự phòng. @lam 2 video/tuần có vượt không?'),
      dev: say('BỎ LƯỢT'),
    })
    const state = new RoomState()
    state.userSaid('@all Đề xuất 3 mục tiêu quý 4', RULES)
    const r = await runRound(deps, state, input())
    expect(r.status).toBe('done')
    expect(r.entries.map((e) => [e.handle, e.kind])).toEqual([
      ['lam', 'say'],
      ['tin', 'say'],
      ['dev', 'pass'],
    ])
    expect(state.used).toBe(2)
    expect(state.round).toBe(1)
    expect(Object.fromEntries(state.spoke)).toEqual({ lam: 'say', tin: 'say', dev: 'pass' })
    // Mỗi tin thành một dòng riêng trong phiên, theo đúng thứ tự nói.
    expect(posted).toEqual(['lam:say', 'tin:say', 'dev:pass'])
    expect(r.posted).toBe(true)
    expect(briefs.lam![0]).toContain('Người dùng: @all Đề xuất 3 mục tiêu quý 4')
    expect(briefs.lam![0]).toContain('Aris (điều phối): Đề xuất 3 mục tiêu quý 4.')
    expect(briefs.tin![0]).toContain('Lâm (Nghiên cứu): Video hướng dẫn')
    expect(briefs.dev![0]).toContain('vòng 1/3')
    // Giao diện thấy bot đang nói trước khi có tin.
    expect(saved.some((x) => x.speaking === 'lam' && x.entries.length === 0)).toBe(true)
    const report = roundReport(r, state, RULES)
    expect(report).toContain('Vòng 1/3 · đã dùng 2/10 tin.')
    expect(report).toContain('@dev (Dev · Kỹ thuật) bỏ lượt.')
    expect(report).toContain('Còn 2 vòng, 8 tin.')
  })

  it('vòng sau chỉ gửi tin mới cho bot, nhắn tiếp bot đã có trong đội', async () => {
    const { deps, briefs } = fakeRoom({ lam: say('Ý một'), tin: say('Ý hai') })
    const state = new RoomState()
    state.userSaid('@all bàn đi', RULES)
    await runRound(deps, state, input({ invite: ['lam', 'tin'] }))
    await runRound(deps, state, input({ callId: 'call-2', invite: ['@lam'], prompt: '@lam trả lời Tín.' }))
    expect(briefs.lam).toHaveLength(2)
    expect(briefs.lam![1]).not.toContain('Người dùng: @all bàn đi')
    expect(briefs.lam![1]).toContain('Tín (Tài chính): Ý hai')
    expect(briefs.lam![1]).toContain('Aris (điều phối): @lam trả lời Tín.')
    expect(briefs.lam![1]).toContain('vòng 2/3')
  })

  it('bot ngoài dự án, bot bị dừng, bot đang bận: ghi lý do, không nhắn', async () => {
    const { deps, briefs } = fakeRoom({ lam: say('Ý một') }, { busy: ['b-2'] })
    const state = new RoomState()
    state.userSaid('@all dừng @dev', RULES)
    const r = await runRound(deps, state, input({ invite: ['lam', 'tin', 'dev', 'mai'] }))
    expect(r.entries.map((e) => [e.handle, e.kind, e.text])).toEqual([
      ['lam', 'say', 'Ý một'],
      ['tin', 'skip', 'đang làm việc khác'],
      ['dev', 'stopped', 'người dùng đã bảo dừng'],
      ['mai', 'skip', 'không tham gia phòng này'],
    ])
    expect(Object.keys(briefs)).toEqual(['lam'])
  })

  it('hết tin của lượt thì bot sau không nói; hết vòng thì không mở thêm', async () => {
    const { deps } = fakeRoom({ lam: say('Một'), tin: say('Hai'), dev: say('Ba') })
    const rules = { ...RULES, maxRounds: 1, maxMessages: 2 }
    const state = new RoomState()
    state.userSaid('@all', rules)
    const r = await runRound(deps, state, input({ rules }))
    expect(r.entries.at(-1)).toMatchObject({ handle: 'dev', kind: 'skip', text: 'hết số tin của lượt này' })
    expect(cannotOpen(state, rules)).toContain('Đã đủ 1 vòng')
    expect(roundReport(r, state, rules)).toContain('không mời thêm')
  })

  it('dừng phòng giữa vòng: bot đang nói bị dừng, bot sau không được mời', async () => {
    const state = new RoomState()
    state.userSaid('@all', RULES)
    const { deps, briefs } = fakeRoom({
      lam: () => {
        state.close()
        return { kind: 'interrupted', text: '' }
      },
      tin: say('Hai'),
    })
    const r = await runRound(deps, state, input({ invite: ['lam', 'tin'] }))
    expect(r.status).toBe('stopped')
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0]).toMatchObject({ handle: 'lam', kind: 'stopped' })
    expect(briefs.tin).toBeUndefined()
    expect(roundReport(r, state, RULES)).toContain('Người dùng đã dừng phòng')
  })
})
