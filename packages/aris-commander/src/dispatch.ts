/**
 * Giao việc (đặc tả: docs/specs/aris-commander.md): mỗi bot được giao là một thành viên trong
 * Team của phiên Commander (dsh `agentTeams`), mỗi việc một thẻ trên bảng việc gán cho bot. Lần
 * đầu tạo thành viên, lần sau nhắn tiếp nên bot nhớ việc trước trong cùng cuộc.
 */

export interface Assignment {
  /** Tên gọi của bot (`minh` hoặc `@minh`). */
  bot: string
  /** Việc cần làm, đủ ngữ cảnh để bot làm một mình. */
  task: string
  /** Vì sao chọn bot này. */
  reason: string
  /** Tên ngắn của việc (thẻ trên bảng việc). */
  title?: string | undefined
  /** Giao một thẻ có sẵn: `task-n` (thẻ của đội), `c-n` (thẻ người dùng tạo trên Kanban). */
  card?: string | undefined
}

export interface BotInfo {
  id: string
  handle: string
  name: string
  kind: 'commander' | 'member'
}

/** Phần của Team dsh mà giao việc dùng (truyền vào để kiểm thử bằng bản giả). */
export interface TeamPort<A> {
  listMembers(agent: A): readonly { id: string; name: string; status: string }[]
  spawnTeammate(
    agent: A,
    req: {
      name: string
      description: string
      prompt: { type: 'text'; text: string }[]
      context: 'fresh'
      provider: string
      signal: AbortSignal
    },
  ): Promise<{ member: { id: string } }>
  sendMessage(
    agent: A,
    req: { target: string; content: { type: 'text'; text: string }[]; signal: AbortSignal },
  ): Promise<unknown>
  createTask(
    agent: A,
    req: { subject: string; description: string; blockedBy?: readonly string[] },
  ): Promise<{ id: string; revision: number }>
  getTask(agent: A, id: string): TaskInfo
  updateTask(
    agent: A,
    req: { taskId: string; expectedRevision: number; action: 'reassign' | 'complete'; owner?: string },
  ): Promise<unknown>
}

export interface TaskInfo {
  id: string
  revision: number
  subject: string
  status: string
  ready: boolean
}

/** Thẻ người dùng tạo trên Kanban (`@aris/projects`). */
export interface DraftCards {
  get(
    id: string,
  ): { title: string; description?: string | undefined; taskId?: string | undefined } | undefined
  dispatched(id: string, taskId: string): Promise<void>
}

export interface DispatchDeps<A> {
  team: TeamPort<A>
  /** Bot của phiên, bot theo tên gọi. */
  botOf(sessionId: string): BotInfo
  byHandle(handle: string): BotInfo | undefined
  /** Số bot (trừ Commander) đang chạy. */
  busyBots(): number
  /** Đã giao: ghi nhật ký, việc gần đây. */
  record(entry: DispatchEntry): void
  cards?: DraftCards | undefined
}

export interface DispatchEntry {
  sessionId: string
  bot: string
  handle: string
  title: string
  task: string
  reason: string
  member: string
  taskId?: string | undefined
  reused: boolean
}

export interface DispatchResult {
  handle: string
  name?: string | undefined
  ok: boolean
  /** Mã phiên của bot trong đội. */
  sessionId?: string | undefined
  taskId?: string | undefined
  reused?: boolean | undefined
  error?: string | undefined
}

/** Tối đa bot mỗi lần giao, và bot chạy cùng lúc. */
export const MAX_PER_CALL = 4
export const MAX_BUSY = 6

export class DispatchError extends Error {}

const handleOf = (s: string) => s.trim().replace(/^@/, '').toLowerCase()
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Lời giao việc bot nhận được: việc, vì sao là nó, và cách nộp kết quả. */
export function briefFor(bot: BotInfo, a: Assignment): string {
  return [
    `Commander giao cho bạn (@${bot.handle}) một việc.`,
    '',
    a.task.trim(),
    '',
    `Vì sao là bạn: ${a.reason.trim()}`,
    'Làm xong thì trả lời bằng kết quả đầy đủ (Commander đọc câu trả lời cuối của bạn). Cần thêm thông tin thì hỏi Commander hoặc đồng đội bằng send_message.',
  ].join('\n')
}

export async function dispatch<A extends { session: { id: string } }>(
  d: DispatchDeps<A>,
  agent: A,
  assignments: readonly Assignment[],
  signal: AbortSignal,
): Promise<DispatchResult[]> {
  const me = d.botOf(agent.session.id)
  if (me.kind !== 'commander') throw new DispatchError('Chỉ Commander được giao việc.')
  if (assignments.length === 0) throw new DispatchError('Chưa có việc nào để giao.')
  if (assignments.length > MAX_PER_CALL) throw new DispatchError(`Mỗi lần giao tối đa ${MAX_PER_CALL} bot.`)
  const seen = new Set<string>()
  for (const a of assignments) {
    const h = handleOf(a.bot)
    if (seen.has(h)) throw new DispatchError(`@${h} được giao hai lần; gộp thành một việc.`)
    seen.add(h)
  }

  const members = d.team.listMembers(agent)
  const fresh = assignments.filter(
    (a) => !members.some((m) => m.name === handleOf(a.bot) && m.status === 'running'),
  )
  if (d.busyBots() + fresh.length > MAX_BUSY)
    throw new DispatchError(
      `Đã có ${d.busyBots()} bot đang chạy (tối đa ${MAX_BUSY}); đợi bớt rồi giao tiếp.`,
    )

  return Promise.all(
    assignments.map(async (a): Promise<DispatchResult> => {
      const handle = handleOf(a.bot)
      const bot = d.byHandle(handle)
      if (!bot) return { handle, ok: false, error: `Không có bot @${handle} trong đội.` }
      if (bot.kind === 'commander') return { handle, ok: false, error: 'Không tự giao việc cho Commander.' }
      if (!a.task.trim() || !a.reason.trim())
        return { handle, ok: false, error: 'Mỗi việc cần nội dung và lý do chọn bot.' }
      // Thẻ có sẵn: kiểm trước khi nhắn bot để không giao nửa vời.
      const ref = a.card?.trim()
      let known: TaskInfo | undefined
      let draft: ReturnType<DraftCards['get']>
      if (ref && /^task-\d+$/.test(ref)) {
        try {
          known = d.team.getTask(agent, ref)
        } catch {
          return { handle, ok: false, error: `Không có thẻ ${ref}.` }
        }
        if (known.status !== 'pending' && known.status !== 'in_progress')
          return { handle, ok: false, error: `Thẻ ${ref} đã xong hoặc đã xoá.` }
        if (!known.ready) return { handle, ok: false, error: `Thẻ ${ref} đang chờ thẻ khác xong.` }
      } else if (ref && /^c-\d+$/.test(ref)) {
        draft = d.cards?.get(ref)
        if (!draft) return { handle, ok: false, error: `Không có thẻ ${ref}.` }
        if (draft.taskId) return { handle, ok: false, error: `Thẻ ${ref} đã giao (${draft.taskId}).` }
      } else if (ref) return { handle, ok: false, error: `Mã thẻ ${ref} không đúng (task-n hoặc c-n).` }
      const title = clip((a.title ?? known?.subject ?? draft?.title ?? a.task).trim().split('\n')[0]!, 80)
      const prompt = [{ type: 'text' as const, text: briefFor(bot, a) }]
      try {
        const existing = d.team.listMembers(agent).find((m) => m.name === handle && m.status !== 'failed')
        let member: string
        if (existing) {
          await d.team.sendMessage(agent, { target: handle, content: prompt, signal })
          member = existing.id
        } else {
          const r = await d.team.spawnTeammate(agent, {
            name: handle,
            description: clip(`${bot.name}: ${title}`, 200),
            prompt,
            context: 'fresh',
            provider: 'spawn',
            signal,
          })
          member = r.member.id
        }
        let taskId: string | undefined
        try {
          const task =
            known ?? (await d.team.createTask(agent, { subject: title, description: a.task.trim() }))
          await d.team.updateTask(agent, {
            taskId: task.id,
            expectedRevision: task.revision,
            action: 'reassign',
            owner: handle,
          })
          taskId = task.id
          if (draft && ref) await d.cards?.dispatched(ref, task.id)
        } catch {
          // Thẻ trên bảng việc chỉ để theo dõi; việc vẫn đã giao.
        }
        d.record({
          sessionId: agent.session.id,
          bot: bot.id,
          handle,
          title,
          task: a.task.trim(),
          reason: a.reason.trim(),
          member,
          taskId,
          reused: !!existing,
        })
        return { handle, name: bot.name, ok: true, sessionId: member, taskId, reused: !!existing }
      } catch (e) {
        return { handle, name: bot.name, ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    }),
  )
}

/** Câu trả lời của công cụ cho Commander. */
export function summarize(results: readonly DispatchResult[]): string {
  const lines = results.map((r) =>
    r.ok
      ? `- @${r.handle} (${r.name}): ${r.reused ? 'đã nhắn tiếp' : 'đã nhận việc'}${r.taskId ? `, thẻ ${r.taskId}` : ''}, phiên ${r.sessionId}`
      : `- @${r.handle}: không giao được — ${r.error}`,
  )
  const ok = results.some((r) => r.ok)
  return [
    ...lines,
    ok
      ? 'Dùng wait_agent để đợi; kết quả của bot về thành tin nhắn của đội. Khi đủ kết quả thì tổng hợp trả lời người dùng.'
      : 'Chưa giao được việc nào.',
  ].join('\n')
}

/** Đọc lại kết quả từ câu trả lời của công cụ (giao diện vẽ nhánh theo bot). */
export function parseSummary(text: string): { handle: string; sessionId?: string; ok: boolean }[] {
  const out: { handle: string; sessionId?: string; ok: boolean }[] = []
  for (const line of text.split('\n')) {
    const m = line.match(/^- @([a-z0-9-]+)(.*)$/)
    if (!m) continue
    const sid = m[2]!.match(/phiên (\S+)$/)?.[1]
    out.push({ handle: m[1]!, ok: !m[2]!.includes('không giao được'), ...(sid ? { sessionId: sid } : {}) })
  }
  return out
}

/** Một thẻ Aris chia (`tao_the`): tiêu đề, nội dung, chờ thẻ nào. */
export interface PlannedCard {
  title: string
  description?: string | undefined
  /** Mã thẻ đã có (`task-n`) hoặc tiêu đề một thẻ khác trong cùng lần chia. */
  after?: readonly string[] | undefined
}

/**
 * Chia việc thành thẻ trên bảng việc của đội (chưa giao ai); thẻ chờ thẻ khác ghi `after`.
 * Trả mã và tiêu đề từng thẻ theo thứ tự.
 */
export async function planCards<A>(
  team: Pick<TeamPort<A>, 'createTask'>,
  agent: A,
  cards: readonly PlannedCard[],
): Promise<{ id: string; title: string; after: string[] }[]> {
  if (cards.length === 0) throw new DispatchError('Chưa có thẻ nào.')
  if (cards.length > 12) throw new DispatchError('Mỗi lần chia tối đa 12 thẻ.')
  const made: { id: string; title: string; after: string[] }[] = []
  for (const c of cards) {
    const title = clip(c.title.trim(), 200)
    if (!title) throw new DispatchError('Thẻ cần có tiêu đề.')
    const after = (c.after ?? []).map((ref) => {
      const r = ref.trim()
      if (/^task-\d+$/.test(r)) return r
      const hit = made.find((m) => m.title.toLowerCase() === r.toLowerCase())
      if (!hit)
        throw new DispatchError(`Thẻ «${title}» chờ «${r}» nhưng chưa có thẻ đó (ghi thẻ được chờ trước).`)
      return hit.id
    })
    const task = await team.createTask(agent, {
      subject: title,
      description: (c.description ?? title).trim(),
      ...(after.length ? { blockedBy: after } : {}),
    })
    made.push({ id: task.id, title, after })
  }
  return made
}
