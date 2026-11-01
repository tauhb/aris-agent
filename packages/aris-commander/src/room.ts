/**
 * Phòng nhóm của dự án (bước 3e; đặc tả: docs/specs/aris-commander.md): trong phiên chính của dự án,
 * Aris điều phối một cuộc bàn chung. Mỗi lần Aris gọi `moi_noi` là một vòng: các bot được mời nói
 * lần lượt, mỗi bot đọc được những gì người dùng, Aris và đồng đội vừa nói. Luật của dự án giới hạn
 * số vòng và số tin của các bot cho mỗi tin của người dùng.
 */
import type { RoomEntry, RoundRecord } from './domain.js'
import type { TeamPort } from './dispatch.js'

export interface RoomRules {
  maxRounds: number
  maxMessages: number
  stopCommand: boolean
}

export interface RoomBot {
  id: string
  handle: string
  name: string
  role: string
}

/** Câu trả lời đúng mẫu này là bot bỏ lượt (không có ý mới). */
export const PASS = 'BỎ LƯỢT'

/** Mỗi bot nói tối đa bấy lâu; quá thì dừng bot đó, vòng đi tiếp. */
export const SPEAK_TIMEOUT_MS = 4 * 60_000

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export function isPass(text: string): boolean {
  const t = fold(text)
    .replace(/[*_`.!\s]+/g, ' ')
    .trim()
  return t === 'bo luot' || t === ''
}

/** Lệnh trong tin của người dùng: dừng cả phòng, dừng từng bot, gọi tên bot. */
export interface RoomCommands {
  stopAll: boolean
  stop: string[]
  mentions: string[]
  /** Tin chỉ có lệnh dừng (không phải câu hỏi mới cho phòng). */
  onlyStop: boolean
}

export function parseCommands(text: string): RoomCommands {
  const f = fold(text)
  const stopAllRe = /dung\s+(ca\s+phong|phong|tat\s+ca|het)(?=$|[\s.,!?])/g
  const stopRe = /dung\s+@([a-z0-9-]+)/g
  const stopAll = stopAllRe.test(f)
  const stop = [...f.matchAll(stopRe)].map((m) => m[1]!)
  const mentions = [...f.matchAll(/@([a-z0-9-]+)/g)].map((m) => m[1]!).filter((h) => !stop.includes(h))
  const rest = f
    .replace(stopAllRe, '')
    .replace(stopRe, '')
    .replace(/[\s.,!?]+/g, '')
  return { stopAll, stop, mentions, onlyStop: (stopAll || stop.length > 0) && rest === '' }
}

/** Một dòng trong biên bản của lượt: ai nói gì. */
export interface RoomLine {
  who: string
  text: string
}

/** Trạng thái phòng của một phiên chính, trong bộ nhớ: đếm theo tin của người dùng. */
export class RoomState {
  round = 0
  used = 0
  closed = false
  lines: RoomLine[] = []
  /** Bot đã đọc tới dòng nào của biên bản. */
  seen = new Map<string, number>()
  /** Bot người dùng bảo dừng (tên gọi); giữ tới khi người dùng gọi lại bot đó. */
  stopped = new Set<string>()
  /** Bot đã nói gì trong lượt này (tin, bỏ lượt, bị bỏ qua…), cho cột phải của dự án. */
  spoke = new Map<string, RoomEntry['kind']>()
  speaking: string | undefined
  /** Vòng vừa xong: câu trả lời kế tiếp của Aris là lời điều phối, cần đầu tin riêng. */
  leadPending = false
  abort = new AbortController()

  /** Người dùng nhắn vào phòng: lệnh dừng áp ngay; tin có nội dung mở một lượt mới. */
  userSaid(text: string, rules: Pick<RoomRules, 'stopCommand'>): RoomCommands {
    const c = parseCommands(text)
    for (const h of c.mentions) this.stopped.delete(h)
    if (rules.stopCommand) for (const h of c.stop) this.stopped.add(h)
    if (c.stopAll) this.close()
    if (!c.onlyStop) {
      this.round = 0
      this.used = 0
      this.closed = c.stopAll
      this.lines = [{ who: 'Người dùng', text: text.trim() }]
      this.seen.clear()
      this.spoke.clear()
      this.abort = new AbortController()
    }
    return c
  }

  close() {
    this.closed = true
    this.abort.abort()
  }
}

/** Lời mời bot nói trong một vòng: những gì mới từ lần trước bot nói, và cách trả lời. */
export function speakBrief(o: {
  project: string
  round: number
  maxRounds: number
  bot: RoomBot
  lines: readonly RoomLine[]
}): string {
  return [
    `[Phòng nhóm · dự án «${o.project}» · vòng ${o.round}/${o.maxRounds}]`,
    o.lines.length ? 'Tin mới trong phòng từ lần trước bạn nói:' : 'Không có tin mới trong phòng.',
    ...o.lines.map((l) => `${l.who}: ${l.text}`),
    '',
    `Đến lượt bạn (@${o.bot.handle}). Trả lời như một tin nhắn trong phòng: ngắn (tối đa khoảng 120 chữ), góp ý mới từ chuyên môn của bạn, có thể hỏi lại đồng đội bằng @tên. Không lặp ý người khác đã nói.`,
    `Không có ý mới thì chỉ trả lời đúng hai chữ: ${PASS}.`,
    'Không dùng send_message hay công cụ giao việc; câu trả lời cuối của bạn chính là tin trong phòng.',
  ].join('\n')
}

/** Kết quả một lượt nói của bot (đọc từ log phiên của bot). */
export interface Spoken {
  kind: 'completed' | 'error' | 'interrupted' | 'timeout'
  text: string
}

export interface RoundDeps<A> {
  team: Pick<TeamPort<A>, 'listMembers' | 'spawnTeammate' | 'sendMessage'> & {
    interrupt(agent: A, name: string): unknown
  }
  agent: A
  /**
   * Đợi lượt tới của phiên bot kết thúc. Gọi trước khi nhắn bot (phiên đã có) hoặc ngay sau khi
   * tạo bot; `since` để nhận cả lượt đã xong trong lúc tạo.
   */
  waitTurn(sessionId: string, since: number, signal: AbortSignal): Promise<Spoken>
  /** Bot đang làm việc khác (không mời được lúc này). */
  busy(botId: string): boolean
  save(record: RoundRecord): Promise<void>
  /** Ghi một tin của vòng thành dòng riêng trong phiên chính (mỗi bot một tin). */
  post?(entry: RoomEntry, record: RoundRecord): void
  now?: () => Date
}

export interface RoundInput {
  callId: string
  session: string
  project: string
  rules: RoomRules
  members: readonly RoomBot[]
  /** Tên gọi bot được mời; rỗng là mọi thành viên dự án. */
  invite: readonly string[]
  /** Lời của Aris với phòng ở vòng này. */
  prompt: string
  signal: AbortSignal
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Lý do không mở thêm vòng (hết vòng, hết tin, phòng đã dừng); không có là mở được. */
export function cannotOpen(state: RoomState, rules: RoomRules): string | undefined {
  if (state.closed) return 'Người dùng đã dừng phòng: không mời thêm; tóm tắt ngắn những gì đã bàn.'
  if (state.round >= rules.maxRounds)
    return `Đã đủ ${rules.maxRounds} vòng cho tin này của người dùng: không mời thêm; tổng hợp và trả lời người dùng.`
  if (state.used >= rules.maxMessages)
    return `Các bot đã dùng hết ${rules.maxMessages} tin cho lượt này: không mời thêm; tổng hợp và trả lời người dùng.`
  return undefined
}

/** Chạy một vòng: mời từng bot nói lần lượt, ghi từng tin (giao diện vẽ ngay), trả bản ghi vòng. */
export async function runRound<A>(
  d: RoundDeps<A>,
  state: RoomState,
  input: RoundInput,
): Promise<RoundRecord> {
  const now = d.now ?? (() => new Date())
  const { rules } = input
  state.round++
  const record: RoundRecord = {
    callId: input.callId,
    session: input.session,
    round: state.round,
    maxRounds: rules.maxRounds,
    used: state.used,
    maxMessages: rules.maxMessages,
    status: 'running',
    entries: [],
    ...(d.post ? { posted: true } : {}),
    createdAt: now().toISOString(),
  }
  const add = async (
    bot: RoomBot | { id: string; handle: string; name: string; role?: string },
    kind: RoomEntry['kind'],
    text: string,
    reason?: RoomEntry['reason'],
  ) => {
    const entry: RoomEntry = {
      bot: bot.id,
      handle: bot.handle,
      name: bot.name,
      ...(bot.role ? { role: bot.role } : {}),
      at: now().toISOString(),
      kind,
      ...(reason ? { reason } : {}),
      text,
    }
    record.entries.push(entry)
    d.post?.(entry, record)
    state.spoke.set(bot.handle, kind)
    record.used = state.used
    await d.save(record)
  }
  await d.save(record)
  if (input.prompt.trim()) state.lines.push({ who: 'Aris (điều phối)', text: input.prompt.trim() })

  const wanted = input.invite.length
    ? [...new Set(input.invite.map((h) => h.trim().replace(/^@/, '').toLowerCase()))]
    : input.members.map((b) => b.handle)
  const signal = AbortSignal.any([input.signal, state.abort.signal])

  for (const handle of wanted) {
    const bot = input.members.find((b) => b.handle === handle)
    const ghost = { id: handle, handle, name: `@${handle}` }
    if (!bot) {
      await add(ghost, 'skip', 'không tham gia phòng này', 'not-member')
      continue
    }
    if (signal.aborted || state.closed) break
    if (state.stopped.has(handle)) {
      await add(bot, 'stopped', 'người dùng đã bảo dừng', 'user-stopped')
      continue
    }
    if (state.used >= rules.maxMessages) {
      await add(bot, 'skip', 'hết số tin của lượt này', 'no-messages')
      continue
    }
    if (d.busy(bot.id)) {
      await add(bot, 'skip', 'đang làm việc khác', 'busy')
      continue
    }
    const from = state.seen.get(handle) ?? 0
    const text = speakBrief({
      project: input.project,
      round: state.round,
      maxRounds: rules.maxRounds,
      bot,
      lines: state.lines.slice(from),
    })
    const prompt = [{ type: 'text' as const, text }]
    state.speaking = handle
    record.speaking = handle
    await d.save(record)
    const timeout = AbortSignal.timeout(SPEAK_TIMEOUT_MS)
    const wait = AbortSignal.any([signal, timeout])
    let spoken: Spoken
    try {
      const since = Date.now()
      const existing = d.team.listMembers(d.agent).find((m) => m.name === handle && m.status !== 'failed')
      if (existing?.status === 'running') {
        state.speaking = undefined
        delete record.speaking
        await add(bot, 'skip', 'đang làm việc khác', 'busy')
        continue
      }
      let turn: Promise<Spoken>
      if (existing) {
        turn = d.waitTurn(existing.id, since, wait)
        await d.team.sendMessage(d.agent, { target: handle, content: prompt, signal })
      } else {
        const r = await d.team.spawnTeammate(d.agent, {
          name: handle,
          description: clip(`${bot.name}: phòng nhóm dự án ${input.project}`, 200),
          prompt,
          context: 'fresh',
          provider: 'spawn',
          signal,
        })
        turn = d.waitTurn(r.member.id, since, wait)
      }
      spoken = await turn
    } catch (e) {
      spoken = timeout.aborted
        ? { kind: 'timeout', text: '' }
        : signal.aborted
          ? { kind: 'interrupted', text: '' }
          : { kind: 'error', text: e instanceof Error ? e.message : String(e) }
    }
    if (spoken.kind === 'timeout' || spoken.kind === 'interrupted') {
      try {
        d.team.interrupt(d.agent, handle)
      } catch {
        // Bot đã xong lượt.
      }
    }
    state.speaking = undefined
    delete record.speaking
    state.seen.set(handle, state.lines.length)
    if (spoken.kind === 'completed' && !isPass(spoken.text)) {
      state.used++
      const said = clip(spoken.text.trim(), 2000)
      state.lines.push({ who: `${bot.name} (${bot.role || 'thành viên'})`, text: said })
      state.seen.set(handle, state.lines.length)
      await add(bot, 'say', said)
    } else if (spoken.kind === 'completed') await add(bot, 'pass', 'không có ý mới')
    else if (spoken.kind === 'interrupted') await add(bot, 'stopped', 'đã dừng', 'interrupted')
    else if (spoken.kind === 'timeout') await add(bot, 'error', 'nói quá lâu, đã dừng', 'timeout')
    else await add(bot, 'error', clip(spoken.text || 'lỗi khi trả lời', 200))
  }
  record.status = state.closed || input.signal.aborted ? 'stopped' : 'done'
  record.used = state.used
  delete record.speaking
  await d.save(record)
  return record
}

/** Câu trả lời của `moi_noi` cho Aris: ai nói gì, còn bao nhiêu vòng và tin, nên làm gì tiếp. */
export function roundReport(r: RoundRecord, state: RoomState, rules: RoomRules): string {
  const lines = [`Vòng ${r.round}/${r.maxRounds} · đã dùng ${r.used}/${r.maxMessages} tin.`]
  for (const e of r.entries) {
    const who = `@${e.handle}${e.name !== `@${e.handle}` ? ` (${e.name}${e.role ? ` · ${e.role}` : ''})` : ''}`
    if (e.kind === 'say') lines.push(`- ${who}: ${clip(e.text, 1500)}`)
    else if (e.kind === 'pass') lines.push(`- ${who} bỏ lượt.`)
    else lines.push(`- ${who}: ${e.text}.`)
  }
  const said = r.entries.some((e) => e.kind === 'say')
  const stop = cannotOpen(state, rules)
  if (stop) lines.push(stop)
  else if (!said) lines.push('Không ai có ý mới: dừng mời, tổng hợp và trả lời người dùng.')
  else
    lines.push(
      `Còn ${rules.maxRounds - state.round} vòng, ${rules.maxMessages - state.used} tin. Chỉ mời vòng sau (moi_noi) khi còn điểm cần bàn: có người bị hỏi lại bằng @tên, hoặc ý trái nhau; mời đúng những người đó. Không thì tổng hợp.`,
    )
  return lines.join('\n')
}
