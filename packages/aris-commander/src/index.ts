/**
 * Commander của aris (đặc tả: docs/specs/aris-commander.md):
 * - Công cụ `giao_viec`, chỉ Commander dùng: giao việc cho bot qua Team của dsh, mỗi việc một thẻ.
 * - Nhật ký định tuyến: bản ghi `plugin:aris/dispatch` trong log phiên, và kho `aris_commander`
 *   cho trang 2.5 (`/api/aris/commander`).
 * - Luật đội: bot thường không tự lập đội (chặn `spawn_teammate` ở phiên của bot thường).
 * - Hướng dẫn giao việc: ngữ cảnh động chỉ nạp ở phiên của Commander.
 * - Việc lớn của phòng ban (`giao_phong`) và phòng nhóm của dự án (`moi_noi`).
 * @module @aris/commander
 */
import { randomUUID } from 'node:crypto'
import type { ArisBots } from '@aris/bots'
import { foldTeam } from '@aris/projects'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  commanderDomain,
  type DispatchRecord,
  type JobRecord,
  type RoomEntry,
  type RoundRecord,
  type Table,
} from './domain.js'
import { findDepartment, jobBrief, jobContext, jobReport, textOf, type MemberLike } from './jobs.js'
import {
  dispatch,
  DispatchError,
  planCards,
  summarize,
  type Assignment,
  type DispatchEntry,
  type DraftCards,
  type TeamPort,
} from './dispatch.js'

import {
  cannotOpen,
  roundReport,
  RoomState,
  runRound,
  type RoomBot,
  type RoomRules,
  type Spoken,
} from './room.js'

export * from './dispatch.js'
export * from './jobs.js'
export * from './room.js'

export const name = 'aris-commander'
export const inject = ['tools', 'systemPrompt', 'storageDomain']

export const DISPATCH_RECORD = 'plugin:aris/dispatch'

export const ROOM_RECORD = 'plugin:aris/room-say'
export const LEAD_RECORD = 'plugin:aris/room-lead'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/dispatch': Omit<DispatchEntry, 'sessionId'>
    /** Một tin trong phòng nhóm: khung chat vẽ thành tin riêng của bot, không gập theo lượt của Aris. */
    'plugin:aris/room-say': RoomEntry & { callId: string; round: number; maxRounds: number }
    /** Đầu tin "Aris · Điều phối" đặt ngay trước câu trả lời của Aris sau một vòng bàn. */
    'plugin:aris/room-lead': { before: number; at: string }
  }
}

/** Sau tính cách (290) và ký ức lõi (300). */
export const CONTEXT_ORDER = 310

export const GUIDE = `<aris-commander>
Bạn chỉ huy đội bot (đội hình ở <aris-bot>). Trước khi làm, xếp việc vào một trong ba mức theo thước đo dưới đây, không theo cảm giác.

Thước đo (đếm, không đoán):
- Số phần: số phần việc độc lập, mỗi phần giao được cho một người và cho ra một kết quả riêng.
- Kỹ năng: việc cần chuyên môn của ai (xem mô tả việc của từng bot và phòng ban ở <aris-bot>).
- Độ dài: trả lời được ngay trong vài bước, hay cần một lượt làm việc dài (tra cứu, viết, sửa nhiều tệp), hay nhiều lượt cần tổng hợp lại.

Ba mức:
- Việc nhỏ: 1 phần, bạn tự làm được, xong trong vài bước (hỏi nhanh, trò chuyện, tóm tắt một đoạn, sửa một câu). Tự làm, không giao. Ví dụ: "tóm tắt email này".
- Việc vừa: 1 phần (hoặc vài phần rời, mỗi phần một chuyên môn), cần một lượt làm việc dài hoặc đúng chuyên môn một bot. Giao bằng giao_viec. Ví dụ: "viết một bài Facebook về khoá học".
- Việc lớn: từ 2 phần trở lên, cần nhiều vai trong cùng một phòng ban, nhiều lượt rồi tổng hợp. Giao cả phòng bằng giao_phong. Ví dụ: "lên chiến dịch ra mắt khoá học: nghiên cứu khách, 5 bài viết, kịch bản bán hàng".

Luật xếp mức:
- Lời người dùng là trên hết: họ nói rõ "cả phòng", "giao cho X" hay "tự làm" thì làm đúng như vậy.
- Đứng giữa hai mức: chọn mức nhỏ hơn. Việc lớn mà không phòng nào đủ chuyên môn: chia thẻ và giao từng bot (việc vừa), không giao_phong.
- Không rõ người dùng muốn gì đến mức không xếp được: hỏi lại đúng một câu ngắn.
- Khi giao (việc vừa hoặc việc lớn), nói ngắn gọn một câu: xếp mức nào và vì sao (số phần, kỹ năng), để người dùng sửa nếu bạn hiểu sai. Việc nhỏ thì không cần nói.

Cách giao:
- Việc vừa: chọn bot theo mô tả việc của bot, ghi lý do. Nhiều phần độc lập thì giao song song trong một lần gọi; phần sau cần kết quả phần trước thì giao phần trước, đợi, rồi giao tiếp kèm kết quả đó.
- Việc nhiều bước có thứ tự: chia thành thẻ bằng tao_the (thẻ nào chờ thẻ nào), rồi giao từng thẻ sẵn sàng bằng giao_viec với tham số the.
- Sau khi giao_viec: dùng wait_agent đợi kết quả, rồi tổng hợp trả lời người dùng. Nói rõ ai đã làm phần nào.
- Bot đã làm việc trong cuộc này thì giao tiếp cho chính bot đó (nó nhớ việc trước).
- Việc lặt vặt không cần chuyên môn (đọc một tệp lớn, tra cứu nhỏ): dùng subagent (trợ lý ẩn danh) thay vì giao bot.
- Việc lớn: giao_phong; trưởng nhóm tự chia cho thành viên phòng, báo cáo của phòng về đây thành tin nhắn sau, không cần đợi.
</aris-commander>`

interface AgentLike {
  session: { id: string }
}

/** Tối đa việc lớn của phòng ban chạy cùng lúc. */
export const MAX_JOBS = 3

/** Phần bộ điều khiển phiên của dsh dùng cho việc lớn. */
interface SessionPort {
  create(req: { workspaceId?: string }): Promise<{ sessionId: string }>
  prompt(
    req: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] },
    signal: AbortSignal,
  ): Promise<unknown>
}

interface SessionQueryPort {
  observeSession(
    id: string,
    o: { projectionMode: 'none' },
  ): Promise<{ events: readonly unknown[]; [Symbol.dispose](): void }>
}

/** Phần dự án Commander đọc: dự án của phiên, thành viên, luật. */
interface ProjectsPort {
  ofSession(
    sessionId: string,
  ): { project: { name: string; members: string[]; mainSession?: string; rules: RoomRules } } | undefined
}

type RoomTeam = TeamPort<AgentLike> & { interrupt(agent: AgentLike, name: string): unknown }

/** Phần Team dùng để đánh dấu xong thẻ của bot. */
interface CardTeam {
  tryMembership(agent: AgentLike): { role: 'lead' | 'teammate'; name: string } | undefined
  listTasks(agent: AgentLike): readonly { id: string; revision: number; status: string; ownerName?: string }[]
  updateTask(
    agent: AgentLike,
    req: { taskId: string; expectedRevision: number; action: 'complete' },
  ): Promise<unknown>
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-commander')
  const domain = await ctx.storageDomain.open(commanderDomain)
  ctx.effect(() => () => void domain.close(), 'aris-commander: domain')
  const log = domain.table('dispatch') as unknown as Table<DispatchRecord>

  const bots = () => {
    const b = ctx.get('arisBots') as ArisBots | undefined
    if (!b) throw new DispatchError('Chưa có dịch vụ đội bot (@aris/bots).')
    return b
  }
  const team = () => {
    const t = ctx.get('agentTeams') as unknown as TeamPort<AgentLike> | undefined
    if (!t) throw new DispatchError('Profile này chưa bật Agent Teams của dsh.')
    return t
  }
  const isCommander = (sessionId: string | undefined) =>
    (ctx.get('arisBots') as ArisBots | undefined)?.botOf(sessionId).kind !== 'member'

  // Việc lớn của phòng ban: phiên của trưởng nhóm đang nhận việc được lập đội, chỉ trong phòng.
  const jobs = domain.table('jobs') as unknown as Table<JobRecord>
  const allJobs = () => [...jobs.entries()].map(([, j]) => j)
  const jobOf = (sessionId: string | undefined) =>
    sessionId ? allJobs().find((j) => j.session === sessionId && j.status === 'running') : undefined
  const departmentName = (id: string) =>
    (ctx.get('arisBots') as ArisBots | undefined)?.store.departments().find((d) => d.id === id)?.name ?? id
  const membersOf = (department: string, except?: string): MemberLike[] =>
    ((ctx.get('arisBots') as ArisBots | undefined)?.store.list() ?? []).filter(
      (b) => b.kind === 'member' && b.department === department && b.id !== except,
    )
  const leadScope = (sessionId: string) => {
    const job = jobOf(sessionId)
    return job
      ? {
          department: departmentName(job.department),
          members: new Set(membersOf(job.department, job.lead).map((b) => b.id)),
        }
      : undefined
  }

  // Hướng dẫn giao việc chỉ ở phiên của Commander.
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:commander',
        order: CONTEXT_ORDER,
        text: (c) => {
          const id = c?.agent?.session.id
          if (isCommander(id)) return GUIDE
          const job = jobOf(id)
          return job
            ? jobContext(job, departmentName(job.department), membersOf(job.department, job.lead))
            : ''
        },
        interpolate: false,
      }),
    'aris-commander: guide',
  )

  // Luật đội: bot thường không tự lập đội (không có vòng giao việc lặp).
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const sid = exec.agent?.session.id
      if (exec.name === 'spawn_teammate' && !isCommander(sid) && !jobOf(sid))
        return {
          kind: 'deny',
          reason:
            'Chỉ Commander, hoặc trưởng nhóm đang nhận việc lớn của phòng, được lập đội và giao việc. Cần đồng đội giúp thì nhắn họ bằng send_message, hoặc báo Commander.',
        }
      return next()
    },
    true,
  )

  ctx.tools.register(
    defineTool({
      name: 'giao_viec',
      description:
        'Chỉ Commander: giao việc cho một hoặc nhiều bot trong đội (chạy song song). Mỗi việc ghi bot (tên gọi), nội dung đủ để bot tự làm, lý do chọn bot. Sau đó dùng wait_agent để đợi kết quả.',
      parameters: {
        viec: {
          type: 'array',
          required: true,
          description: 'Danh sách việc, tối đa 4, mỗi bot một việc.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              bot: { type: 'string', required: true, description: 'Tên gọi của bot, ví dụ minh.' },
              tieu_de: { type: 'string', description: 'Tên ngắn của việc (thẻ trên bảng việc).' },
              noi_dung: { type: 'string', required: true, description: 'Việc cần làm, đủ ngữ cảnh.' },
              ly_do: { type: 'string', required: true, description: 'Vì sao chọn bot này.' },
              the: {
                type: 'string',
                description:
                  'Mã thẻ có sẵn để giao: task-n (thẻ đã chia) hoặc c-n (thẻ người dùng tạo trên Kanban).',
              },
            },
          },
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent) return 'Không có phiên để giao việc.'
        const list = (args.viec ?? []) as {
          bot: string
          tieu_de?: string
          noi_dung: string
          ly_do: string
          the?: string
        }[]
        const assignments: Assignment[] = list.map((v) => ({
          bot: v.bot,
          title: v.tieu_de,
          task: v.noi_dung,
          reason: v.ly_do,
          card: v.the,
        }))
        try {
          const b = bots()
          const results = await dispatch(
            {
              team: team(),
              botOf: (id) => b.botOf(id),
              byHandle: (h) => b.store.byHandle(h),
              busyBots: () => b.live.busyBots('aris'),
              cards: (ctx.get('arisProjects') as { cards?: DraftCards } | undefined)?.cards,
              lead: isCommander(agent.session.id) ? undefined : leadScope(agent.session.id),
              record(entry) {
                b.live.assigned(entry.bot, entry.title, entry.member)
                const rest: Omit<DispatchEntry, 'sessionId'> & { sessionId?: string } = { ...entry }
                delete rest.sessionId
                try {
                  appendPluginRecord(exec.agent!.session, DISPATCH_RECORD, rest)
                } catch (e) {
                  logger.warn('ghi bản ghi giao việc: %s', String(e))
                }
                const at = new Date().toISOString()
                void log
                  .put(`${Date.now()}-${entry.handle}`, { ...entry, at })
                  .catch((e: unknown) => logger.warn('nhật ký giao việc: %s', String(e)))
              },
            },
            agent,
            assignments,
            exec.signal ?? new AbortController().signal,
          )
          return summarize(results)
        } catch (e) {
          if (e instanceof DispatchError) return `Không giao được: ${e.message}`
          throw e
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'tao_the',
      description:
        'Chỉ Commander: chia một việc lớn thành các thẻ trên bảng việc của đội (Kanban), chưa giao ai. Thẻ phải đợi thẻ khác xong thì ghi sau (mã task-n hoặc tiêu đề một thẻ ghi trước trong cùng lần). Giao từng thẻ sau bằng giao_viec với the.',
      parameters: {
        the: {
          type: 'array',
          required: true,
          description: 'Các thẻ theo thứ tự, tối đa 12.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tieu_de: { type: 'string', required: true, description: 'Tên ngắn của thẻ.' },
              noi_dung: { type: 'string', description: 'Việc cần làm, đủ ngữ cảnh.' },
              sau: {
                type: 'array',
                items: { type: 'string' },
                description: 'Thẻ phải xong trước: mã task-n hoặc tiêu đề thẻ ghi trước.',
              },
            },
          },
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent || (!isCommander(agent.session.id) && !jobOf(agent.session.id)))
          return 'Chỉ Commander, hoặc trưởng nhóm đang nhận việc lớn của phòng, được chia việc thành thẻ.'
        const list = (args.the ?? []) as { tieu_de: string; noi_dung?: string; sau?: string[] }[]
        try {
          const made = await planCards(
            team(),
            agent,
            list.map((c) => ({ title: c.tieu_de, description: c.noi_dung, after: c.sau })),
          )
          return [
            ...made.map(
              (m) => `- ${m.id} «${m.title}»${m.after.length ? ` (chờ ${m.after.join(', ')})` : ''}`,
            ),
            'Thẻ đã lên bảng việc, chưa giao ai. Giao thẻ sẵn sàng bằng giao_viec với the; thẻ chờ thì giao sau khi thẻ kia xong.',
          ].join('\n')
        } catch (e) {
          if (e instanceof DispatchError) return `Không chia được: ${e.message}`
          throw e
        }
      },
    }),
  )

  // Bot làm xong một lượt bình thường: đánh dấu xong thẻ cũ nhất bot đang giữ (chính bot là chủ thẻ
  // nên có quyền), để bảng việc và Kanban đi đúng tiến độ.
  const finishing = new Set<string>()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    if ((event.data as unknown as { reason?: { kind?: string } }).reason?.kind !== 'completed') return
    const agents = ctx.get('agents') as { get(id: string): unknown } | undefined
    const t = ctx.get('agentTeams') as unknown as CardTeam | undefined
    const agent = agents?.get(session.id) as AgentLike | undefined
    if (!agent || !t || finishing.has(session.id)) return
    const m = t.tryMembership(agent)
    if (m?.role !== 'teammate') return
    const mine = t
      .listTasks(agent)
      .filter((x) => x.status === 'in_progress' && x.ownerName === m.name)
      .sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)))[0]
    if (!mine) return
    finishing.add(session.id)
    t.updateTask(agent, { taskId: mine.id, expectedRevision: mine.revision, action: 'complete' })
      .catch((e: unknown) => logger.warn('đánh dấu xong thẻ %s: %s', mine.id, String(e)))
      .finally(() => finishing.delete(session.id))
  })

  // Gửi một tin vào phiên (đánh thức bot của phiên): lời giao cho trưởng nhóm, báo cáo về Commander.
  const prompt = async (sessionId: string, text: string) => {
    const sc = ctx.get('sessionController') as SessionPort | undefined
    if (!sc) throw new DispatchError('Chưa có bộ điều khiển phiên của dsh.')
    await sc.prompt(
      { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text }] },
      AbortSignal.timeout(30_000),
    )
  }

  ctx.tools.register(
    defineTool({
      name: 'giao_phong',
      description:
        'Chỉ Commander: giao một việc lớn cho cả phòng ban. Trưởng nhóm của phòng nhận việc ở một phiên riêng, tự chia cho thành viên phòng, rồi nộp báo cáo về đây thành tin nhắn (không cần đợi).',
      parameters: {
        phong: { type: 'string', required: true, description: 'Tên hoặc mã phòng ban, ví dụ Tăng trưởng.' },
        tieu_de: { type: 'string', description: 'Tên ngắn của việc.' },
        noi_dung: {
          type: 'string',
          required: true,
          description: 'Việc cần làm, đủ ngữ cảnh, kết quả mong muốn.',
        },
        ly_do: { type: 'string', required: true, description: 'Vì sao giao cho phòng này.' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent || !isCommander(agent.session.id)) return 'Chỉ Commander được giao việc cho cả phòng.'
        const b = bots()
        const deps = b.store.departments()
        const dep = findDepartment(deps, String(args.phong ?? ''))
        if (!dep)
          return `Không có phòng «${args.phong}». Các phòng: ${deps.map((d) => d.name).join(', ') || '(chưa có)'}.`
        const lead = dep.lead ? b.store.get(dep.lead) : undefined
        if (!lead)
          return `Phòng ${dep.name} chưa có trưởng nhóm: nhờ người dùng đặt trưởng nhóm ở trang Phòng ban, hoặc giao_viec cho từng bot.`
        const task = String(args.noi_dung ?? '').trim()
        if (!task) return 'Cần nội dung việc.'
        if (allJobs().filter((j) => j.status === 'running').length >= MAX_JOBS)
          return `Đang có ${MAX_JOBS} việc lớn của phòng ban chạy; đợi bớt rồi giao tiếp.`
        const title = String(args.tieu_de ?? task)
          .trim()
          .split('\n')[0]!
          .slice(0, 80)
        try {
          const sc = ctx.get('sessionController') as SessionPort | undefined
          const reg = ctx.get('workspaceRegistry') as
            { list(): readonly { id: string; sessionIds: readonly string[] }[] } | undefined
          if (!sc) return 'Chưa có bộ điều khiển phiên của dsh.'
          // Phiên gốc của trưởng nhóm, cùng dự án (thư mục) với phiên đang giao.
          const ws = reg?.list().find((w) => w.sessionIds.includes(agent.session.id))
          const { sessionId } = await sc.create(ws ? { workspaceId: ws.id } : {})
          await b.tag(sessionId, lead.id, 'dispatch')
          const job: JobRecord = {
            id: `job-${Date.now().toString(36)}`,
            department: dep.id,
            lead: lead.id,
            title,
            task,
            parentSession: agent.session.id,
            session: sessionId,
            ...(ws ? { workspace: ws.id } : {}),
            status: 'running',
            createdAt: new Date().toISOString(),
          }
          await jobs.put(job.id, job)
          b.live.assigned(lead.id, title, sessionId)
          const at = new Date().toISOString()
          void log
            .put(`${Date.now()}-${lead.handle}`, {
              at,
              sessionId: agent.session.id,
              bot: lead.id,
              handle: lead.handle,
              title: `[Phòng ${dep.name}] ${title}`,
              task,
              reason: String(args.ly_do ?? ''),
              member: sessionId,
              reused: false,
            })
            .catch((e: unknown) => logger.warn('nhật ký giao việc: %s', String(e)))
          await prompt(sessionId, jobBrief(job, lead, dep.name, membersOf(dep.id, lead.id)))
          return `Đã giao cho phòng ${dep.name}: trưởng nhóm @${lead.handle} nhận ${job.id} «${title}» ở phiên ${sessionId}. Báo cáo của phòng sẽ về đây thành tin nhắn khi xong; giờ báo người dùng là phòng đang làm.`
        } catch (e) {
          if (e instanceof DispatchError) return `Không giao được: ${e.message}`
          throw e
        }
      },
    }),
  )

  // Đọc log phiên trưởng nhóm (không đánh thức phiên): bảng việc của phòng, báo cáo cuối, số lượt xong.
  async function leadLog(job: JobRecord) {
    const empty = { done: 0, total: 0, members: [] as string[], last: '', turns: 0 }
    const q = ctx.get('sessionQuery') as SessionQueryPort | undefined
    if (!q) return empty
    try {
      const obs = await q.observeSession(job.session, { projectionMode: 'none' })
      try {
        const events = obs.events as unknown as { type: string; data?: unknown }[]
        const team = foldTeam(events)
        const tasks = [...team.tasks.values()].filter((x) => x.status !== 'deleted')
        let last = ''
        let turns = 0
        for (const e of events) {
          if (e.type === 'assistant/message') {
            const text = textOf((e.data as { message?: unknown } | undefined)?.message)
            if (text.trim()) last = text
          } else if (
            e.type === 'turn/end' &&
            (e.data as { reason?: { kind?: string } })?.reason?.kind === 'completed'
          )
            turns++
        }
        return {
          done: tasks.filter((x) => x.status === 'completed').length,
          total: tasks.length,
          members: [...team.members.keys()],
          last,
          turns,
        }
      } finally {
        obs[Symbol.dispose]()
      }
    } catch {
      return empty
    }
  }

  async function finish(job: JobRecord, status: 'done' | 'failed', result?: string) {
    const next: JobRecord = {
      ...job,
      status,
      finishedAt: new Date().toISOString(),
      ...(result ? { result: result.slice(0, 6000) } : {}),
    }
    await jobs.put(job.id, next)
    await prompt(job.parentSession, jobReport(next, departmentName(job.department)))
  }

  /**
   * Việc lớn xong khi trưởng nhóm đã xong ít nhất một lượt, có câu trả lời, và cả phiên trưởng nhóm
   * lẫn mọi phiên thành viên phòng đều rảnh: câu trả lời cuối là báo cáo nộp Commander. Gọi khi
   * trưởng nhóm xong lượt, khi xem danh sách việc lớn, và lúc khởi động (sau khi aris chạy lại).
   */
  const settling = new Set<string>()
  async function settle(job: JobRecord): Promise<void> {
    if (job.status !== 'running' || settling.has(job.id)) return
    settling.add(job.id)
    try {
      const live = (ctx.get('arisBots') as ArisBots | undefined)?.live
      const log = await leadLog(job)
      if (!live || log.turns === 0 || !log.last.trim()) return
      if ([job.session, ...log.members].some((sid) => live.sessionState(sid) !== 'idle')) return
      if (jobs.get(job.id)?.status !== 'running') return
      await finish(job, 'done', log.last)
    } catch (e) {
      logger.warn('chốt việc lớn %s: %s', job.id, String(e))
    } finally {
      settling.delete(job.id)
    }
  }

  ctx.on('session/event', (session, event) => {
    const job = jobOf(session.id)
    if (!job || event.type !== 'turn/end') return
    const kind = (event.data as unknown as { reason?: { kind?: string } }).reason?.kind
    if (kind === 'error') {
      void finish(job, 'failed').catch((e: unknown) => logger.warn('báo việc lớn vấp: %s', String(e)))
      return
    }
    // Đợi trạng thái trực tiếp cập nhật xong lượt này rồi mới xét.
    if (kind === 'completed') setTimeout(() => void settle(job), 1500)
  })
  ctx.effect(() => {
    const timer = setTimeout(() => {
      for (const j of allJobs()) void settle(j)
    }, 5000)
    return () => clearTimeout(timer)
  }, 'aris-commander: chốt việc lớn sau khởi động')

  /** Tiến độ một việc lớn: thẻ xong / tổng thẻ trên bảng việc của trưởng nhóm. */
  async function progressOf(job: JobRecord): Promise<{ done: number; total: number }> {
    const { done, total } = await leadLog(job)
    return { done, total }
  }
  const jobView = async (j: JobRecord) => {
    await settle(j)
    return viewOf(jobs.get(j.id) ?? j)
  }
  const viewOf = async (j: JobRecord) => ({
    ...j,
    departmentName: departmentName(j.department),
    progress: await progressOf(j),
  })
  // Phòng nhóm của dự án (bước 3e): lượt nói của bot đọc từ sự kiện phiên của bot.
  const rounds = domain.table('rounds') as unknown as Table<RoundRecord>
  const rooms = new Map<string, RoomState>()
  const roomOf = (sid: string) => {
    let r = rooms.get(sid)
    if (!r) rooms.set(sid, (r = new RoomState()))
    return r
  }
  const mainProject = (sid: string | undefined) => {
    const found = sid ? (ctx.get('arisProjects') as ProjectsPort | undefined)?.ofSession(sid) : undefined
    return found && found.project.mainSession === sid ? found.project : undefined
  }
  const said = new Map<string, string>()
  const ended = new Map<string, Spoken & { at: number }>()
  const waiters = new Map<string, (s: Spoken) => void>()
  const waitTurn = (sid: string, since: number, signal: AbortSignal) =>
    new Promise<Spoken>((resolve, reject) => {
      const done = ended.get(sid)
      if (done && done.at >= since) return resolve(done)
      const onAbort = () => {
        waiters.delete(sid)
        reject(signal.reason as Error)
      }
      if (signal.aborted) return onAbort()
      signal.addEventListener('abort', onAbort, { once: true })
      waiters.set(sid, (s) => {
        signal.removeEventListener('abort', onAbort)
        resolve(s)
      })
    })
  const interruptSpeaker = (sid: string, room: RoomState) => {
    const agent = (ctx.get('agents') as { get(id: string): unknown } | undefined)?.get(sid) as
      AgentLike | undefined
    const t = ctx.get('agentTeams') as unknown as RoomTeam | undefined
    if (!agent || !t || !room.speaking) return
    try {
      t.interrupt(agent, room.speaking)
    } catch (e) {
      logger.warn('dừng bot %s trong phòng: %s', room.speaking, String(e))
    }
  }
  const stopRoom = (sid: string) => {
    const room = roomOf(sid)
    interruptSpeaker(sid, room)
    room.close()
  }
  ctx.on('session/event', (session, event) => {
    const sid = session.id
    const type = event.type as string
    if (type === 'turn/start') said.delete(sid)
    else if (type === 'assistant/message') {
      const text = textOf((event.data as unknown as { message?: unknown }).message)
      if (text.trim()) said.set(sid, text)
      // Aris nói sau một vòng bàn: đặt đầu tin "Aris · Điều phối" ngay trước lời đó (ghi sau khi
      // sự kiện này xong, vì không được ghi chen trong lúc phiên đang phát sự kiện).
      const room = rooms.get(sid)
      if (room?.leadPending && text.trim()) {
        room.leadPending = false
        const before = event.seq as unknown as number
        setTimeout(() => {
          try {
            appendPluginRecord(session as never, LEAD_RECORD, { before, at: new Date().toISOString() })
          } catch (e) {
            logger.warn('ghi đầu tin của Aris: %s', String(e))
          }
        }, 0)
      }
    } else if (type === 'turn/end') {
      const kind = (event.data as unknown as { reason?: { kind?: string } }).reason?.kind
      const spoken: Spoken = {
        kind: kind === 'completed' ? 'completed' : kind === 'error' ? 'error' : 'interrupted',
        text: said.get(sid) ?? '',
      }
      ended.set(sid, { ...spoken, at: Date.now() })
      if (ended.size > 500) ended.delete(ended.keys().next().value!)
      waiters.get(sid)?.(spoken)
      waiters.delete(sid)
    } else if (type === 'user/message') {
      // Người dùng nhắn vào phòng: "dừng @tên", "dừng phòng" áp ngay; tin mới mở lượt đếm mới.
      // Chỉ tin người dùng gõ; dsh cũng ghi ngữ cảnh chạy, giờ, nhắc trí nhớ thành tin vai người dùng.
      if ((event.data as unknown as { source?: { kind?: string } }).source?.kind !== 'user') return
      const project = mainProject(sid)
      const text = textOf(event.data)
      if (!project || !text.trim()) return
      const room = roomOf(sid)
      const c = room.userSaid(text, project.rules)
      if (room.speaking && project.rules.stopCommand && c.stop.includes(room.speaking))
        interruptSpeaker(sid, room)
      if (c.stopAll) stopRoom(sid)
    }
  })
  // Vòng đang chạy lúc aris tắt thì không chạy tiếp được: ghi là đã dừng.
  ctx.effect(() => {
    for (const [id, r] of rounds.entries())
      if (r.status === 'running')
        void rounds
          .put(id, { ...r, status: 'stopped', speaking: undefined } as RoundRecord)
          .catch((e: unknown) => logger.warn('khép vòng %s: %s', id, String(e)))
    return () => {}
  }, 'aris-commander: khép vòng dở')

  ctx.tools.register(
    defineTool({
      name: 'moi_noi',
      description:
        'Chỉ Aris trong phiên chính của dự án: mở một vòng bàn trong phòng nhóm. Các bot được mời nói lần lượt, nghe được nhau; công cụ đợi hết vòng rồi trả lại các tin. Luật dự án giới hạn số vòng và số tin cho mỗi tin của người dùng.',
      parameters: {
        bot: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tên gọi bot được mời nói vòng này, theo thứ tự nói. Bỏ trống là mọi thành viên dự án (@all).',
        },
        loi_moi: {
          type: 'string',
          required: true,
          description:
            'Lời của bạn với phòng ở vòng này: cần bàn gì, mỗi người góp gì. Vòng sau: điểm cần bàn tiếp, ai cần trả lời ai.',
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        const sid = agent?.session.id
        if (!agent || !sid || !isCommander(sid)) return 'Chỉ Aris (Commander) điều phối phòng nhóm.'
        const project = mainProject(sid)
        if (!project)
          return 'Phòng nhóm chỉ có trong phiên chính của một dự án. Ở đây thì giao việc bằng giao_viec.'
        const b = bots()
        const members: RoomBot[] = project.members.flatMap((id) => {
          const x = b.store.get(id)
          return x && x.kind === 'member' ? [{ id: x.id, handle: x.handle, name: x.name, role: x.role }] : []
        })
        if (!members.length) return 'Dự án chưa có bot thành viên; thêm bot vào dự án trước.'
        const room = roomOf(sid)
        const no = cannotOpen(room, project.rules)
        if (no) return no
        try {
          room.leadPending = false
          const record = await runRound(
            {
              team: team() as unknown as RoomTeam,
              agent,
              waitTurn,
              busy: (id) => b.live.of(id).status === 'working',
              save: (r) => rounds.put(r.callId, { ...r, entries: [...r.entries] }),
              post(entry, r) {
                try {
                  appendPluginRecord(exec.agent!.session, ROOM_RECORD, {
                    ...entry,
                    callId: r.callId,
                    round: r.round,
                    maxRounds: r.maxRounds,
                  })
                } catch (e) {
                  logger.warn('ghi tin phòng nhóm: %s', String(e))
                }
              },
            },
            room,
            {
              callId: String(exec.callId),
              session: sid,
              project: project.name,
              rules: project.rules,
              members,
              invite: ((args.bot ?? []) as string[]).filter((h) => !/^@?all$/i.test(h.trim())),
              prompt: String(args.loi_moi ?? ''),
              signal: exec.signal ?? new AbortController().signal,
            },
          )
          room.leadPending = record.entries.length > 0
          return roundReport(record, room, project.rules)
        } catch (e) {
          if (e instanceof DispatchError) return `Không mở được vòng: ${e.message}`
          throw e
        }
      },
    }),
  )

  /** Trạng thái phòng của một phiên cho thanh phòng trên ô nhập. */
  const roomView = (sid: string) => {
    const project = mainProject(sid)
    if (!project) return { project: false }
    const room = rooms.get(sid)
    const latest = [...rounds.entries()]
      .map(([, r]) => r)
      .filter((r) => r.session === sid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const speaking = room?.speaking ? bots().store.byHandle(room.speaking) : undefined
    return {
      project: true,
      running: latest?.status === 'running',
      round: room?.round ?? 0,
      maxRounds: project.rules.maxRounds,
      used: room?.used ?? 0,
      maxMessages: project.rules.maxMessages,
      closed: room?.closed ?? false,
      stopped: [...(room?.stopped ?? [])],
      spoke: Object.fromEntries(room?.spoke ?? []),
      ...(speaking ? { speaking: { handle: speaking.handle, name: speaking.name, id: speaking.id } } : {}),
    }
  }

  ctx.provide('arisJobs', {
    list: allJobs,
    forWorkspace: (workspace: string) => allJobs().filter((j) => j.workspace === workspace),
    progressOf,
  })

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/commander',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          const q = new URL(request.url).searchParams
          if (request.method === 'POST') {
            const body = (await request.json().catch(() => ({}))) as { op?: string; session?: string }
            if (body.op === 'room-stop' && body.session) {
              stopRoom(body.session)
              return json({ ok: true, room: roomView(body.session) })
            }
            return json({ error: 'Thao tác không hợp lệ.' }, 400)
          }
          // ?round=<mã lần gọi>: một vòng của phòng nhóm (khung chat vẽ tin của bot).
          const round = q.get('round')
          if (round) return json({ round: rounds.get(round) ?? null })
          // ?room=<phiên>: trạng thái phòng của phiên (thanh phòng trên ô nhập).
          const roomSession = q.get('room')
          if (roomSession) return json(roomView(roomSession))
          // ?jobs=1: việc lớn của các phòng (trang Phòng ban), mới trước.
          if (new URL(request.url).searchParams.get('jobs')) {
            const list = allJobs()
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 30)
            return new Response(JSON.stringify({ jobs: await Promise.all(list.map(jobView)) }), {
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          }
          const recent = [...log.entries()]
            .map(([, r]) => r)
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 50)
          return new Response(JSON.stringify({ recent }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          })
        },
      })
      return () => void dispose()
    }, 'aris-commander: /api/aris/commander')
  })
}
