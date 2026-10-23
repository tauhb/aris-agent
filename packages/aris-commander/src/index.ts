/**
 * Commander của aris (đặc tả: docs/specs/aris-commander.md):
 * - Công cụ `giao_viec`, chỉ Commander dùng: giao việc cho bot qua Team của dsh, mỗi việc một thẻ.
 * - Nhật ký định tuyến: bản ghi `plugin:aris/dispatch` trong log phiên, và kho `aris_commander`
 *   cho trang 2.5 (`/api/aris/commander`).
 * - Luật đội: bot thường không tự lập đội (chặn `spawn_teammate` ở phiên của bot thường).
 * - Hướng dẫn giao việc: ngữ cảnh động chỉ nạp ở phiên của Commander.
 * @module @aris/commander
 */
import type { ArisBots } from '@aris/bots'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { commanderDomain, type DispatchRecord, type Table } from './domain.js'
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

export * from './dispatch.js'

export const name = 'aris-commander'
export const inject = ['tools', 'systemPrompt', 'storageDomain']

export const DISPATCH_RECORD = 'plugin:aris/dispatch'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/dispatch': Omit<DispatchEntry, 'sessionId'>
  }
}

/** Sau tính cách (290) và ký ức lõi (300). */
export const CONTEXT_ORDER = 310

export const GUIDE = `<aris-commander>
Bạn chỉ huy đội bot (đội hình ở <aris-bot>). Cách làm việc:
- Việc nhỏ, hỏi nhanh, trò chuyện: tự làm, không giao.
- Việc dài hoặc đúng chuyên môn một bot: giao bằng công cụ giao_viec, chọn bot theo mô tả việc của bot, ghi lý do.
- Việc nhiều phần độc lập: giao song song trong một lần gọi. Phần sau cần kết quả phần trước: giao phần trước, đợi, rồi giao tiếp kèm kết quả đó.
- Sau khi giao: dùng wait_agent đợi kết quả, rồi tổng hợp trả lời người dùng. Nói rõ ai đã làm phần nào.
- Bot đã làm việc trong cuộc này thì giao tiếp cho chính bot đó (nó nhớ việc trước).
- Việc lặt vặt không cần chuyên môn (đọc một tệp lớn, tra cứu nhỏ): dùng subagent (trợ lý ẩn danh) thay vì giao bot.
- Việc nhiều bước có thứ tự: chia thành thẻ bằng tao_the (thẻ nào chờ thẻ nào), rồi giao từng thẻ sẵn sàng bằng giao_viec với tham số the.
</aris-commander>`

interface AgentLike {
  session: { id: string }
}

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

  // Hướng dẫn giao việc chỉ ở phiên của Commander.
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:commander',
        order: CONTEXT_ORDER,
        text: (c) => (isCommander(c?.agent?.session.id) ? GUIDE : ''),
        interpolate: false,
      }),
    'aris-commander: guide',
  )

  // Luật đội: bot thường không tự lập đội (không có vòng giao việc lặp).
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      if (exec.name === 'spawn_teammate' && !isCommander(exec.agent?.session.id))
        return {
          kind: 'deny',
          reason:
            'Chỉ Commander được lập đội và giao việc. Cần đồng đội giúp thì nhắn họ bằng send_message, hoặc báo Commander.',
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
        if (!agent || !isCommander(agent.session.id)) return 'Chỉ Commander được chia việc thành thẻ.'
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

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/commander',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
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
