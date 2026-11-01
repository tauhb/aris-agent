/**
 * Commander của aris (đặc tả: docs/specs/aris-commander.md):
 * - Công cụ `assign_task`, chỉ Commander dùng: giao việc cho bot qua Team của dsh, mỗi việc một thẻ.
 * - Công cụ `hand_off`, chỉ Commander dùng: bot làm và câu trả lời của bot gửi thẳng cho người dùng.
 * - Nhật ký định tuyến: bản ghi `plugin:aris/dispatch` trong log phiên, và kho `aris_commander`
 *   cho trang 2.5 (`/api/aris/commander`).
 * - Luật đội: bot thường không tự lập đội (chặn `spawn_teammate` ở phiên của bot thường).
 * - Hướng dẫn giao việc: ngữ cảnh động chỉ nạp ở phiên của Commander.
 * - Việc lớn của phòng ban (`assign_department`) và phòng nhóm của dự án (`start_room_round`).
 * @module @aris/commander
 */
import { randomUUID } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ArisBots } from '@aris/bots'
import { foldTeam, type ArisProjects } from '@aris/projects'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-experimental-agent-team'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { SessionId, appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  commanderDomain,
  type DispatchRecord,
  type ExternalRunRecord,
  type JobRecord,
  type RoomEntry,
  type RoundRecord,
  type Table,
} from './domain.js'
import { findDepartment, jobBrief, jobContext, jobReport, textOf, type MemberLike } from './jobs.js'
import {
  addWorktree,
  externalBrief,
  ExternalHost,
  inWorktree,
  gitRoot,
  targetDir,
  label,
  loginState,
  moduleLoader,
  resolvePackage,
  worktreePlan,
  type PluginModule,
} from './external.js'
import { ApprovalHub } from './approval.js'
import { DurableApprovals, RepeatGuard, argsHash, isOutbound, type DurableRecord } from './durable.js'
import { LIMITS, answerText, cannotAsk, consultMessage, returnMessage, type TaskRecord } from './teammates.js'
import { COMPACT_AT, contextTokens, shouldCompact } from './page.js'
import { learnedContext, learnedFrom } from './learned.js'
import {
  DRIVER_TICK_MS,
  driverTask,
  emptyDriverState,
  planDriver,
  type CardRun,
  type DriverState,
  type DriverTask,
} from './driver.js'
import { ApprovalCenter, callInput, toolAlias, type ApprovalEvent } from './approvals.js'
import { childEnv, runClaude, stepOf, type DriverHooks } from './claude-driver.js'
import { runCodex } from './codex-driver.js'
import { cliVersion, findBinary } from './cli.js'
import { sessionSend, type SendAgent } from './session-send.js'
import {
  DEFAULT_SETTINGS,
  SettingsError,
  TaskSpend,
  cleanSettings,
  externalBudget,
  type CommanderSettings,
} from './settings.js'
import { EXTERNAL_AGENTS, EXTERNAL_PACKAGES, LIBRARIAN_ID, providerOf, type BotRecord } from '@aris/bots'
import {
  dispatch,
  DispatchError,
  planCards,
  summarize,
  type Assignment,
  type DispatchDeps,
  type DispatchEntry,
  type DispatchResult,
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
export * from './external.js'
export * from './approval.js'
export * from './durable.js'
export * from './teammates.js'
export * from './page.js'
export * from './claude-driver.js'
export * from './codex-driver.js'
export * from './cli.js'
export * from './room.js'

export const name = 'aris-commander'
export const inject = ['tools', 'systemPrompt', 'storageDomain']

export const DISPATCH_RECORD = 'plugin:aris/dispatch'

export const ROOM_RECORD = 'plugin:aris/room-say'
export const LEAD_RECORD = 'plugin:aris/room-lead'
/** Chuyển giao: câu trả lời của bot đích, vẽ thành lượt của bot đó và gửi thẳng cho người dùng. */
export const HANDOFF_RECORD = 'plugin:aris/handoff'
/** Thời gian tối đa đợi bot đích trả lời một lần chuyển giao. */
export const HANDOFF_TIMEOUT_MS = 15 * 60_000

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /**
     * Kết quả bot gửi về phiên giao việc (bot ngoài, trưởng nhóm việc lớn): dsh vẽ thành dòng đánh thức
     * lượt, khung chat của aris vẽ thành thẻ của bot đó thay vì tin của người dùng.
     */
    'aris-bot': { kind: 'aris-bot'; bot: string; name: string; run?: string; job?: string } & ContextFormed
    /** Lời báo của Commander gắn vào bước của bot (chạm trần tiền mỗi việc). */
    'aris-commander': { kind: 'aris-commander' } & ContextFormed
  }
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/dispatch': Omit<DispatchEntry, 'sessionId'>
    /** Một tin trong phòng nhóm: khung chat vẽ thành tin riêng của bot, không gập theo lượt của Aris. */
    'plugin:aris/room-say': RoomEntry & { callId: string; round: number; maxRounds: number }
    /** Đầu tin "Aris · Điều phối" đặt ngay trước câu trả lời của Aris sau một vòng bàn. */
    'plugin:aris/room-lead': { before: number; at: string }
    /** Câu trả lời của bot đích khi Commander chuyển giao. */
    'plugin:aris/handoff': {
      bot: string
      handle: string
      name: string
      role?: string
      reason: string
      title: string
      text: string
      member?: string
      at: string
    }
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
- Việc vừa: 1 phần (hoặc vài phần rời, mỗi phần một chuyên môn), cần một lượt làm việc dài hoặc đúng chuyên môn một bot. Giao bằng assign_task. Ví dụ: "viết một bài Facebook về khoá học".
- Việc lớn: từ 2 phần trở lên, cần nhiều vai trong cùng một phòng ban, nhiều lượt rồi tổng hợp. Giao cả phòng bằng assign_department. Ví dụ: "lên chiến dịch ra mắt khoá học: nghiên cứu khách, 5 bài viết, kịch bản bán hàng".

Luật xếp mức:
- Lời người dùng là trên hết: họ nói rõ "cả phòng", "giao cho X" hay "tự làm" thì làm đúng như vậy.
- Đứng giữa hai mức: chọn mức nhỏ hơn. Việc lớn mà không phòng nào đủ chuyên môn: chia thẻ và giao từng bot (việc vừa), không assign_department.
- Không rõ người dùng muốn gì đến mức không xếp được: hỏi lại đúng một câu ngắn.
- Khi giao (việc vừa hoặc việc lớn), nói ngắn gọn một câu: xếp mức nào và vì sao (số phần, kỹ năng), để người dùng sửa nếu bạn hiểu sai. Việc nhỏ thì không cần nói.

Cách giao:
- Việc vừa: chọn bot theo mô tả việc của bot, ghi lý do. Nhiều phần độc lập thì giao song song trong một lần gọi; phần sau cần kết quả phần trước thì giao phần trước, đợi, rồi giao tiếp kèm kết quả đó.
- Việc nhiều bước có thứ tự: chia thành thẻ bằng create_cards (thẻ nào chờ thẻ nào, ghi bot dự kiến cho từng thẻ), rồi giao thẻ đang sẵn sàng bằng assign_task với tham số card. Dự án bật Driver thì thẻ sau tự tới bot dự kiến khi thẻ trước xong; không cần giao lại.
- Sau khi assign_task: dùng wait_agent đợi kết quả, rồi tổng hợp trả lời người dùng. Nói rõ ai đã làm phần nào.
- Chuyển giao (hand_off) thay cho assign_task khi việc vừa thuộc hẳn chuyên môn một bot và người dùng chỉ cần đúng kết quả của bot đó, không cần bạn tổng hợp hay làm tiếp (ví dụ: viết một bài cho bot nội dung, trả lời một câu hỏi chuyên môn). Câu trả lời của bot hiện thẳng cho người dùng như lời của bot; sau đó bạn kết thúc lượt, không viết thêm. Cần gom nhiều bot, sửa lại, hay dùng kết quả cho bước sau thì dùng assign_task.
- Bot đã làm việc trong cuộc này thì giao tiếp cho chính bot đó (nó nhớ việc trước).
- Mỗi việc giao ghi kind (loại việc ngắn, dùng lại cùng tên cho việc cùng loại) để bạn học được bot nào làm tốt loại việc nào; khối <aris-routing-history> (nếu có) là kết quả các lần trước.
- Giao việc sửa mã cho bot ngoài trên một repo khác thư mục của cuộc này: ghi đường dẫn tuyệt đối của repo vào dir (bot ngoài làm trong worktree riêng của repo đó).
- Việc lặt vặt không cần chuyên môn (đọc một tệp lớn, tra cứu nhỏ): dùng subagent (trợ lý ẩn danh) thay vì giao bot.
- Việc lớn: assign_department; trưởng nhóm tự chia cho thành viên phòng, báo cáo của phòng về đây thành tin nhắn sau, không cần đợi.

Quản đội (bạn tạo và sửa bot cho người dùng):
- Người dùng nhờ tạo bot, hay việc cứ lặp lại mà đội chưa ai hợp: đề xuất bot (tên, vai, việc gì), người dùng đồng ý thì gọi create_bot, mỗi lần một bot. Thẻ duyệt hiện đủ chi tiết nên đừng chép lại toàn văn lời dặn vào câu trả lời.
- Lời dặn của bot mới: tiếng Việt, ngôi thứ hai ("Bạn là…"), nói rõ việc, cách xưng hô với người dùng, việc không được làm (không đoán khi thiếu dữ liệu, hỏi trước khi gửi gì ra ngoài), khi nào hỏi lại. Chọn phòng ban hợp nếu có.
- Sửa cách một bot làm việc: read_bot_instructions, viết lại toàn văn, rồi update_bot_instructions kèm lý do. Muốn quay lại bản cũ: restore_bot_instructions.
- Người dùng từ chối ở thẻ duyệt thì hỏi muốn đổi gì, không gọi lại y nguyên.
</aris-commander>`

/** Thêm vào hướng dẫn khi đội chưa có bot nào ngoài Aris: lời chào lần đầu (bản vẽ V2). */
export const FIRST_RUN = `<aris-first-run>
Đội chưa có bot nào ngoài bạn. Ở tin trả lời đầu tiên: chào ngắn một câu bằng tiếng Việt theo cách xưng hô ở <aris-bot>, nói bạn lập được đội bot làm thay việc lặp lại, rồi hỏi người dùng muốn bắt đầu từ đâu bằng ask_user_question với 3–4 lựa chọn ngắn theo điều người dùng vừa nói (ví dụ: "Lập đội bot cho việc kinh doanh", "Tạo một bot thư ký lo lịch và email", "Xem aris làm được gì"). Người dùng gõ tự do cũng được. Khi đã rõ thì đề xuất 2–3 bot và tạo bằng create_bot.
</aris-first-run>`

interface AgentLike {
  session: { id: string }
}

/** Phần bộ điều khiển phiên của dsh dùng cho việc lớn. */
/** Phần dự án Driver và `create_cards` dùng. */
type DriverProjects = Pick<ArisProjects, 'store' | 'plans' | 'team' | 'ofSession'>

interface SessionPort {
  create(req: { workspaceId?: string }): Promise<{ sessionId: string }>
  /** Agent của phiên, mở lại phiên nguội khi cần. */
  resolveAgent?(id: SessionId): Promise<{ agent: unknown } | { error: unknown }>
  /** Huỷ lượt đang chạy của phiên (như nút Dừng trong chat). */
  cancel?(req: { sessionId: SessionId }): Promise<unknown>
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

/** CLI trên máy aris tự chạy được cho từng loại agent (bộ chuyển tự viết). */
const CLI_NAMES: Partial<Record<(typeof EXTERNAL_AGENTS)[number], string>> = {
  'claude-code': 'claude',
  codex: 'codex',
}

/** Phần dịch vụ bot con của dsh dùng cho bot ngoài. */
interface SubagentsPort {
  startActivation(spec: {
    provider: string
    label: string
    request: { prompt: { type: 'text'; text: string }[]; parent: unknown; cwd?: string }
    signal: AbortSignal
    delivery: 'parent' | 'caller'
  }): Promise<{
    childId: string
    result: Promise<{
      output?: readonly { type: string; text?: string }[]
      stopReason?: string
      diagnostic?: string
    }>
    dispose(): Promise<void>
  }>
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
  /** Phiên của bot vừa nhận việc → khoá bản ghi giao việc đợi kết quả lượt. */
  const awaiting = new Map<string, string>()

  // Cấu hình Commander (trang 2.5): giới hạn, trần tiền mỗi việc, trợ lý ẩn danh, bot cần duyệt.
  const settingsTable = domain.table('settings') as unknown as Table<CommanderSettings>
  const settings = (): CommanderSettings => ({ ...DEFAULT_SETTINGS, ...settingsTable.get('commander') })
  // Tiền của từng việc giao cho bot trong đội (theo phiên của bot), cộng từ sổ chi phí của aris-providers.
  const taskSpend = new TaskSpend()
  let offCost: (() => void) | undefined
  ctx.effect(() => () => offCost?.(), 'aris-commander: cost')
  const hookCost = () => {
    if (offCost) return
    const spend = ctx.get('arisSpend') as
      { onCost?(fn: (session: string, usd: number) => void): () => void } | undefined
    offCost = spend?.onCost?.((session, usd) => taskSpend.add(session, usd))
  }

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
          if (isCommander(id)) {
            const history = learnedContext(learned(), (bot) => bots().store.get(bot)?.name ?? bot)
            const alone = !bots()
              .store.list()
              .some((b) => b.kind === 'member' && b.id !== LIBRARIAN_ID)
            return [GUIDE, alone ? FIRST_RUN : '', history].filter(Boolean).join('\n\n')
          }
          const job = jobOf(id)
          return job
            ? jobContext(job, departmentName(job.department), membersOf(job.department, job.lead))
            : ''
        },
        interpolate: false,
      }),
    'aris-commander: guide',
  )

  /** Tên các bot trong lời gọi assign_task / hand_off mà người dùng muốn duyệt mỗi lần giao. */
  const approveNeeded = (args: unknown, cfg: CommanderSettings): string[] => {
    if (!cfg.approve.length) return []
    const a = (args ?? {}) as { bot?: unknown; tasks?: unknown }
    const handles = Array.isArray(a.tasks)
      ? a.tasks.map((v) => (v as { bot?: unknown } | null)?.bot)
      : [a.bot]
    const store = (ctx.get('arisBots') as ArisBots | undefined)?.store
    const names: string[] = []
    for (const h of handles) {
      if (typeof h !== 'string') continue
      const bot = store?.byHandle(h.trim().replace(/^@/, '').toLowerCase())
      if (bot && cfg.approve.includes(bot.id) && !names.includes(bot.name)) names.push(bot.name)
    }
    return names
  }

  // Luật đội: bot thường không tự lập đội (không có vòng giao việc lặp); cấu hình Commander (2.5).
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
      if (!isCommander(sid)) return next()
      const cfg = settings()
      if (exec.name === 'agent' && !cfg.helpers)
        return {
          kind: 'deny',
          reason:
            'Người dùng đã tắt trợ lý ẩn danh của Commander (trang Commander). Tự làm, hoặc assign_task cho một bot trong đội.',
        }
      const asked =
        exec.name === 'assign_task' || exec.name === 'hand_off' ? approveNeeded(exec.arguments, cfg) : []
      if (!asked.length) return next()
      const decision = await next()
      if (decision.kind === 'deny') return decision
      const names = asked.join(', ')
      return {
        kind: 'ask',
        reason: `Giao việc cho ${names} cần duyệt mỗi lần`,
        displayReason: {
          en: `Commander wants to hand a task to ${names} (needs approval each time)`,
          vi: `Commander muốn giao việc cho ${names} (cần duyệt mỗi lần)`,
        },
      }
    },
    true,
  )

  /** Deps của `dispatch` cho một lần gọi công cụ (giao việc, chuyển giao). */
  const dispatchDeps = (agent: AgentLike, exec: { agent?: unknown }): DispatchDeps<AgentLike> => {
    const b = bots()
    return {
      team: team(),
      botOf: (id) => b.botOf(id),
      byHandle: (h) => b.store.byHandle(h),
      busyBots: () => b.live.busyBots('aris'),
      maxBusy: settings().parallel,
      cards: (ctx.get('arisProjects') as { cards?: DraftCards } | undefined)?.cards,
      lead: isCommander(agent.session.id) ? undefined : leadScope(agent.session.id),
      external: (bot, a, title, parent, signal) =>
        runExternal(b.store.get(bot.id)!, a, title, parent, signal),
      record(entry) {
        b.live.assigned(entry.bot, entry.title, entry.member)
        const cap = settings().budgetUsd
        if (cap !== undefined) hookCost()
        taskSpend.start(entry.member, cap, entry.title)
        const bot = b.store.get(entry.bot)
        members.set(entry.member, {
          bot: entry.bot,
          name: bot?.name ?? entry.handle,
          handle: entry.handle,
          parent: entry.sessionId,
        })
        askMember(entry.member)
        const rest: Omit<DispatchEntry, 'sessionId'> & { sessionId?: string } = { ...entry }
        delete rest.sessionId
        try {
          appendPluginRecord((exec.agent as AgentLike).session as never, DISPATCH_RECORD, rest)
        } catch (e) {
          logger.warn('ghi bản ghi giao việc: %s', String(e))
        }
        const at = new Date().toISOString()
        const key = `${Date.now()}-${entry.handle}`
        // Kết quả lượt của bot cập nhật vào đúng bản ghi này (Commander tự học).
        awaiting.set(entry.member, key)
        void log
          .put(key, { ...entry, at })
          .catch((e: unknown) => logger.warn('nhật ký giao việc: %s', String(e)))
      },
    }
  }

  ctx.tools.register(
    defineTool({
      name: 'assign_task',
      description:
        'Chỉ Commander: giao việc cho một hoặc nhiều bot trong đội (chạy song song). Mỗi việc ghi bot (tên gọi), nội dung đủ để bot tự làm, lý do chọn bot. Sau đó dùng wait_agent để đợi kết quả.',
      parameters: {
        tasks: {
          type: 'array',
          required: true,
          description: 'Danh sách việc, tối đa 4, mỗi bot một việc.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              bot: { type: 'string', required: true, description: 'Tên gọi của bot, ví dụ minh.' },
              title: { type: 'string', description: 'Tên ngắn của việc (thẻ trên bảng việc).' },
              task: { type: 'string', required: true, description: 'Việc cần làm, đủ ngữ cảnh.' },
              reason: { type: 'string', required: true, description: 'Vì sao chọn bot này.' },
              card: {
                type: 'string',
                description:
                  'Mã thẻ có sẵn để giao: task-n (thẻ đã chia) hoặc c-n (thẻ người dùng tạo trên Kanban).',
              },
              kind: {
                type: 'string',
                description:
                  'Loại việc ngắn, chữ thường, dùng lại cùng tên cho việc cùng loại (ví dụ: nghiên cứu thị trường, lịch và email, viết bài facebook). Để Commander học bot nào làm tốt việc gì.',
              },
              dir: {
                type: 'string',
                description:
                  'Chỉ bot ngoài: đường dẫn tuyệt đối tới repo hoặc thư mục cần làm, khi khác thư mục của phiên này (ví dụ người dùng nói "sửa lỗi trong repo X"). Bỏ trống thì dùng thư mục của phiên.',
              },
            },
          },
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent) return 'Không có phiên để giao việc.'
        const list = (args.tasks ?? []) as {
          bot: string
          title?: string
          task: string
          reason: string
          card?: string
          dir?: string
          kind?: string
        }[]
        const assignments: Assignment[] = list.map((v) => ({
          bot: v.bot,
          title: v.title,
          task: v.task,
          reason: v.reason,
          card: v.card,
          dir: v.dir,
          kind: v.kind,
        }))
        try {
          const results = await dispatch(
            dispatchDeps(agent, exec),
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
      name: 'create_cards',
      description:
        'Chỉ Commander: chia một việc lớn thành các thẻ trên bảng việc của đội (Kanban), chưa giao ai. Thẻ phải đợi thẻ khác xong thì ghi sau (mã task-n hoặc tiêu đề một thẻ ghi trước trong cùng lần). Giao từng thẻ sau bằng assign_task với card.',
      parameters: {
        cards: {
          type: 'array',
          required: true,
          description: 'Các thẻ theo thứ tự, tối đa 12.',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string', required: true, description: 'Tên ngắn của thẻ.' },
              description: { type: 'string', description: 'Việc cần làm, đủ ngữ cảnh.' },
              bot: {
                type: 'string',
                description:
                  'Tên gọi của bot dự kiến làm thẻ này khi thẻ sẵn sàng (Driver của dự án tự giao cho bot này).',
              },
              after: {
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
        const list = (args.cards ?? []) as {
          title: string
          description?: string
          after?: string[]
          bot?: string
        }[]
        try {
          const made = await planCards(
            team(),
            agent,
            list.map((c) => ({ title: c.title, description: c.description, after: c.after })),
          )
          // Bot dự kiến cho từng thẻ (Driver giao khi thẻ sẵn sàng).
          const projects = ctx.get('arisProjects') as DriverProjects | undefined
          const ws = projects?.ofSession(agent.session.id)?.project.workspace
          const store = (ctx.get('arisBots') as ArisBots | undefined)?.store
          if (ws && projects)
            for (const [i, m] of made.entries()) {
              const h = list[i]?.bot?.trim().replace(/^@/, '').toLowerCase()
              const bot = h ? store?.byHandle(h) : undefined
              if (bot && bot.kind === 'member' && !bot.external)
                await projects.plans.set(ws, m.id, bot.id).catch(() => undefined)
            }
          return [
            ...made.map(
              (m) => `- ${m.id} «${m.title}»${m.after.length ? ` (chờ ${m.after.join(', ')})` : ''}`,
            ),
            'Thẻ đã lên bảng việc, chưa giao ai. Giao thẻ sẵn sàng bằng assign_task với card; thẻ chờ thì giao sau khi thẻ kia xong.',
          ].join('\n')
        } catch (e) {
          if (e instanceof DispatchError) return `Không chia được: ${e.message}`
          throw e
        }
      },
    }),
  )

  // Commander tự học (giai đoạn 3, đợt 4): lượt của bot vừa nhận việc kết thúc thì ghi kết quả vào
  // bản ghi giao việc; thống kê bot × loại việc hiện ở trang 2.5 và vào ngữ cảnh của Commander.
  /** Câu trả lời cuối của bot đang làm việc được giao (ghi vào nhật ký khi lượt xong). */
  const lastAnswer = new Map<string, string>()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message' || !awaiting.has(session.id)) return
    const text = textOf((event.data as unknown as { message: unknown }).message).trim()
    if (text) lastAnswer.set(session.id, text)
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    const key = awaiting.get(session.id)
    if (!key) return
    awaiting.delete(session.id)
    const answer = lastAnswer.get(session.id)
    lastAnswer.delete(session.id)
    const kind = (event.data as unknown as { reason?: { kind?: string } }).reason?.kind
    // Chạm trần tiền mỗi việc: bot trả lời một câu rồi xong lượt, nhưng việc chưa xong nên tính là vấp.
    const outcome =
      kind === 'completed' && !taskSpend.over(session.id)
        ? 'done'
        : /cancel|abort|interrupt|stop/.test(kind ?? '')
          ? 'stopped'
          : 'failed'
    const rec = log.get(key)
    if (rec)
      void log
        .put(key, {
          ...rec,
          outcome,
          finishedAt: new Date().toISOString(),
          ...(answer ? { answer: answer.slice(0, 2000) } : {}),
        })
        .catch((e: unknown) => logger.warn('ghi kết quả giao việc: %s', String(e)))
  })
  const learned = () => learnedFrom([...log.entries()].map(([, r]) => r))

  // --- Driver (giai đoạn 4, đợt 4): tự đẩy việc trên bảng của dự án bật Driver ----------------
  const driverTable = domain.table('driver') as unknown as Table<DriverState>
  const driverKey = (ws: string) => ws.replace(/[^A-Za-z0-9-]/g, '-')
  ctx.provide('arisDriver', {
    /** Thẻ Driver đã ngừng tự đẩy (vấp) và thẻ kẹt của một dự án: Kanban hiện cờ. */
    flags: (ws: string) => {
      const st = driverTable.get(driverKey(ws))
      return { gaveUp: st?.gaveUp ?? [], stuck: st?.stuck ?? [] }
    },
  })
  const notify = (text: string) =>
    (ctx.get('arisChannels') as { sendHome?(bot: string, md: string): Promise<string> } | undefined)
      ?.sendHome?.('aris', text)
      .catch((e: unknown) => logger.warn('Driver báo Telegram: %s', String(e)))

  async function driveProject(
    p: { workspace: string; name: string; mainSession: string },
    projects: DriverProjects,
  ) {
    const b = bots()
    const team = await projects.team(p.workspace)
    const handleOf = (id: string) => b.store.get(id)?.handle
    const tasks: DriverTask[] = [...team.tasks.values()].map((t) => ({
      id: t.id,
      subject: t.subject,
      description: t.description,
      status: t.status,
      owner: t.ownerId ? team.members.get(t.ownerId) : undefined,
      blockedBy: t.blockedBy,
    }))
    if (!tasks.length) return
    const planned = new Map<string, string>()
    for (const [taskId, bot] of projects.plans.forWorkspace(p.workspace)) {
      const h = handleOf(bot)
      if (h) planned.set(taskId, h)
    }
    // Lần giao gần nhất của từng thẻ trong phiên chính của dự án.
    const runs = new Map<string, CardRun & { bot: string }>()
    for (const [, r] of log.entries())
      if (r.sessionId === p.mainSession && r.taskId && (runs.get(r.taskId)?.at ?? '') < r.at)
        runs.set(r.taskId, {
          at: r.at,
          member: r.member,
          bot: r.bot,
          ...(r.outcome ? { outcome: r.outcome } : {}),
          ...(r.answer ? { answer: r.answer } : {}),
        })
    const prev = driverTable.get(driverKey(p.workspace)) ?? emptyDriverState()
    const { actions, state } = planDriver({
      tasks,
      planned,
      runs,
      running: (member) => b.live.sessionState(member) !== 'idle',
      slots: Math.max(0, settings().parallel - b.live.busyBots('aris')),
      state: prev,
      now: new Date(),
    })
    let lead: AgentLike | undefined
    const leadAgent = async () => {
      if (lead) return lead
      const sc = ctx.get('sessionController') as SessionPort | undefined
      const opened = await sc?.resolveAgent?.(SessionId(p.mainSession)).catch(() => undefined)
      lead = opened && 'agent' in opened ? (opened.agent as AgentLike) : undefined
      return lead
    }
    for (const a of actions) {
      if (a.kind === 'dispatch') {
        const agent = await leadAgent()
        if (!agent) break
        const byId = new Map(tasks.map((t) => [t.id, t]))
        const parents = a.task.blockedBy.map((id) => {
          const run = runs.get(id)
          return {
            id,
            subject: byId.get(id)?.subject ?? id,
            by: run ? b.store.get(run.bot)?.name : undefined,
            answer: run?.answer,
          }
        })
        const [r] = await dispatch(
          dispatchDeps(agent, { agent }),
          agent,
          [
            {
              bot: a.bot,
              title: a.task.subject,
              task: driverTask(a.task, parents, a.retry),
              reason: a.retry
                ? 'Driver giao lại thẻ của bạn.'
                : 'Driver: thẻ đã đủ điều kiện, bạn là người dự kiến làm khi chia thẻ.',
              card: a.task.id,
            },
          ],
          AbortSignal.timeout(60_000),
        ).catch((e: unknown) => [{ ok: false, handle: a.bot, error: String(e) } as const])
        if (r && !r.ok) {
          // Không giao được (bot không còn, thẻ đổi…): ngừng tự đẩy thẻ này, để Aris xử lý.
          state.gaveUp.push(a.task.id)
          await prompt(
            p.mainSession,
            `[Driver] Không giao được thẻ ${a.task.id} «${a.task.subject}» cho @${a.bot}: ${r.error ?? 'lỗi'}. Xem lại và giao bằng assign_task với card=${a.task.id}.`,
          ).catch(() => undefined)
        } else logger.info('Driver %s: giao %s cho @%s', p.name, a.task.id, a.bot)
      } else if (a.kind === 'wake') {
        await prompt(
          p.mainSession,
          `[Driver] Thẻ ${a.task.id} «${a.task.subject}» đã sẵn sàng (các thẻ trước đã xong) nhưng chưa có bot dự kiến. Chọn bot và giao bằng assign_task với card=${a.task.id}.`,
        ).catch((e: unknown) => logger.warn('Driver đánh thức Aris: %s', String(e)))
      } else if (a.kind === 'give-up')
        void notify(
          `⚠️ Dự án «${p.name}»: thẻ ${a.task.id} «${a.task.subject}» ${a.reason}, Driver ngừng tự đẩy thẻ này. Mở Kanban để xem.`,
        )
      else if (a.kind === 'stuck')
        void notify(
          `⏳ Dự án «${p.name}»: thẻ ${a.task.id} «${a.task.subject}» đã giao cho @${a.task.owner} hơn 30 phút mà chưa có kết quả.`,
        )
      else if (a.kind === 'all-done')
        void notify(`✅ Dự án «${p.name}»: xong hết ${a.count} thẻ trên bảng việc.`)
    }
    await driverTable.put(driverKey(p.workspace), state)
  }

  ctx.effect(() => {
    let busy = false
    const tick = async () => {
      if ((ctx.get('arisGuard') as { stopped?(): boolean } | undefined)?.stopped?.()) return
      const projects = ctx.get('arisProjects') as DriverProjects | undefined
      if (!projects || !ctx.get('arisBots') || !ctx.get('agentTeams')) return
      for (const p of projects.store.list())
        if (p.driver && p.mainSession)
          await driveProject(
            { workspace: p.workspace, name: p.name, mainSession: p.mainSession },
            projects,
          ).catch((e: unknown) => logger.warn('Driver %s: %s', p.name, String(e)))
    }
    const timer = setInterval(() => {
      if (busy) return
      busy = true
      void tick().finally(() => (busy = false))
    }, DRIVER_TICK_MS)
    return () => clearInterval(timer)
  }, 'aris-commander: Driver')

  // Bot làm xong một lượt bình thường: đánh dấu xong thẻ cũ nhất bot đang giữ (chính bot là chủ thẻ
  // nên có quyền), để bảng việc và Kanban đi đúng tiến độ. Lượt dừng vì chạm trần tiền thì không.
  const finishing = new Set<string>()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'turn/end') return
    if ((event.data as unknown as { reason?: { kind?: string } }).reason?.kind !== 'completed') return
    const agents = ctx.get('agents') as { get(id: string): unknown } | undefined
    const t = ctx.get('agentTeams') as unknown as CardTeam | undefined
    const agent = agents?.get(session.id) as AgentLike | undefined
    if (!agent || !t || finishing.has(session.id) || taskSpend.over(session.id)) return
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

  /**
   * Bot nộp kết quả về phiên giao: tin nguồn `aris-bot` vào hộp thư của agent (mở lại phiên nguội nếu
   * cần) để khung chat vẽ thành thẻ của bot. Không mở được agent thì gửi như tin thường.
   */
  const relay = async (
    sessionId: string,
    text: string,
    from: { bot: string; name: string; run?: string; job?: string },
  ) => {
    const sc = ctx.get('sessionController') as SessionPort | undefined
    const opened = await sc?.resolveAgent?.(SessionId(sessionId)).catch(() => undefined)
    const agent = opened && 'agent' in opened ? (opened.agent as { followup(m: unknown): void }) : undefined
    if (!agent) return prompt(sessionId, text)
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: 'aris-bot', form: 'relay', ...from },
      }),
    )
  }

  // Trần tiền mỗi việc (2.5): bot trong đội chạm trần thì bước đầu của lượt nhận lời báo để trả lời
  // một câu (Commander biết vì sao dừng), các bước sau trong lượt bị từ chối.
  const overTurn = new Map<string, number>()
  const usd = (n: number) => n.toFixed(2).replace('.', ',')
  ctx.on(
    'agent/pre-step',
    async ({ agent, turn, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const id = (agent as unknown as AgentLike).session.id
      const over = taskSpend.over(id)
      if (!over) return decision
      if (overTurn.get(id) === turn) return { kind: 'reject' }
      overTurn.set(id, turn)
      return {
        ...decision,
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [
              {
                type: 'text',
                text: `Việc «${over.title}» đã dùng ${usd(over.spent)} USD, chạm trần ${usd(over.cap)} USD mỗi việc người dùng đặt cho Commander. Dừng việc này, không gọi công cụ; trả lời đúng một câu ngắn: đã làm tới đâu và dừng vì chạm trần tiền.`,
              },
            ],
            source: { kind: 'aris-commander', form: 'notice', summary: 'chạm trần tiền mỗi việc' },
          }) as (typeof decision.messages)[number],
        ],
      }
    },
    true,
  )

  // Bot đích của chuyển giao xong việc thì dsh báo "việc con vừa cập nhật" về phiên của Aris và đánh
  // thức thêm một lượt. Câu trả lời đã gửi thẳng cho người dùng nên gỡ thông báo đó khỏi hộp thư.
  const handedOff = new Set<string>()
  ctx.on('agent/inbox/inserted', ({ agent, message }) => {
    const src = message.source as { kind?: string; senderSessionId?: string }
    if (src.kind !== 'subagent-settled' || !src.senderSessionId || !handedOff.has(src.senderSessionId)) return
    handedOff.delete(src.senderSessionId)
    agent.inbox.remove(message.id)
  })

  ctx.tools.register(
    defineTool({
      name: 'hand_off',
      description:
        'Chỉ Commander: chuyển giao hẳn một việc cho một bot trong đội. Bot làm và câu trả lời cuối của bot gửi thẳng cho người dùng; bạn không tổng hợp, không viết lại. Dùng khi việc thuộc hẳn chuyên môn một bot và người dùng chỉ cần kết quả của bot đó (ví dụ viết bài cho bot nội dung). Cần gom kết quả nhiều bot hoặc làm tiếp thì dùng assign_task.',
      parameters: {
        bot: { type: 'string', required: true, description: 'Tên gọi của bot, ví dụ tho.' },
        title: { type: 'string', description: 'Tên ngắn của việc.' },
        task: {
          type: 'string',
          required: true,
          description: 'Việc cần làm, đủ ngữ cảnh để bot tự làm (bot không thấy cuộc trò chuyện).',
        },
        reason: {
          type: 'string',
          required: true,
          description: 'Vì sao chuyển cho bot này (hiện cho người dùng).',
        },
        kind: {
          type: 'string',
          description: 'Loại việc ngắn, chữ thường, như ở assign_task.',
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent) return 'Không có phiên để chuyển giao.'
        if (!isCommander(agent.session.id)) return 'Chỉ Commander được chuyển giao.'
        const handle = String(args.bot ?? '')
          .trim()
          .replace(/^@/, '')
          .toLowerCase()
        const bot = bots().store.byHandle(handle)
        if (bot?.external)
          return `@${handle} là bot ngoài: dùng assign_task rồi tự báo kết quả cho người dùng.`
        const signal = exec.signal ?? new AbortController().signal
        const since = Date.now()
        try {
          const [r] = await dispatch(
            dispatchDeps(agent, exec),
            agent,
            [
              {
                bot: handle,
                title: args.title as string | undefined,
                task: String(args.task ?? ''),
                reason: String(args.reason ?? ''),
                handoff: true,
                kind: args.kind as string | undefined,
              },
            ],
            signal,
          )
          if (!r?.ok || !r.sessionId || !bot) return `Không chuyển giao được: ${r?.error ?? 'không rõ lý do'}`
          handedOff.add(r.sessionId)
          const spoken = await waitTurn(
            r.sessionId,
            since,
            AbortSignal.any([signal, AbortSignal.timeout(HANDOFF_TIMEOUT_MS)]),
          ).catch((): Spoken => ({ kind: signal.aborted ? 'interrupted' : 'timeout', text: '' }))
          if (spoken.kind !== 'completed' || !spoken.text.trim()) handedOff.delete(r.sessionId)
          if (spoken.kind !== 'completed' || !spoken.text.trim())
            return `@${handle} chưa trả lời được (${spoken.kind === 'timeout' ? 'quá lâu' : spoken.kind === 'error' ? 'gặp lỗi' : 'bị dừng'}). Tự trả lời người dùng, hoặc assign_task cho bot khác.`
          const title = String(args.title ?? args.task ?? '')
            .trim()
            .split('\n')[0]!
            .slice(0, 80)
          appendPluginRecord(agent.session as never, HANDOFF_RECORD, {
            bot: bot.id,
            handle,
            name: bot.name,
            ...(bot.role ? { role: bot.role } : {}),
            reason: String(args.reason ?? '').trim(),
            title,
            text: spoken.text.trim(),
            member: r.sessionId,
            at: new Date().toISOString(),
          })
          // Câu trả lời của bot đích là câu trả lời cuối: kết thúc lượt ngay, Aris không viết thêm.
          ;(exec as { concludeTurn?: () => void }).concludeTurn?.()
          return `Đã chuyển giao: câu trả lời của @${handle} đã hiện cho người dùng như lời của ${bot.name}. Kết thúc lượt, không viết thêm, không nhắc lại nội dung.`
        } catch (e) {
          if (e instanceof DispatchError) return `Không chuyển giao được: ${e.message}`
          throw e
        }
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'assign_department',
      description:
        'Chỉ Commander: giao một việc lớn cho cả phòng ban. Trưởng nhóm của phòng nhận việc ở một phiên riêng, tự chia cho thành viên phòng, rồi nộp báo cáo về đây thành tin nhắn (không cần đợi).',
      parameters: {
        department: {
          type: 'string',
          required: true,
          description: 'Tên hoặc mã phòng ban, ví dụ Tăng trưởng.',
        },
        title: { type: 'string', description: 'Tên ngắn của việc.' },
        task: {
          type: 'string',
          required: true,
          description: 'Việc cần làm, đủ ngữ cảnh, kết quả mong muốn.',
        },
        reason: { type: 'string', required: true, description: 'Vì sao giao cho phòng này.' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const agent = exec.agent as unknown as AgentLike | undefined
        if (!agent || !isCommander(agent.session.id)) return 'Chỉ Commander được giao việc cho cả phòng.'
        const b = bots()
        const deps = b.store.departments()
        const dep = findDepartment(deps, String(args.department ?? ''))
        if (!dep)
          return `Không có phòng «${args.department}». Các phòng: ${deps.map((d) => d.name).join(', ') || '(chưa có)'}.`
        const lead = dep.lead ? b.store.get(dep.lead) : undefined
        if (!lead)
          return `Phòng ${dep.name} chưa có trưởng nhóm: nhờ người dùng đặt trưởng nhóm ở trang Phòng ban, hoặc assign_task cho từng bot.`
        const task = String(args.task ?? '').trim()
        if (!task) return 'Cần nội dung việc.'
        const maxJobs = settings().nested
        if (maxJobs === 0)
          return 'Người dùng đã tắt giao việc lớn cho cả phòng (trang Commander). Chia thẻ và assign_task cho từng bot.'
        if (allJobs().filter((j) => j.status === 'running').length >= maxJobs)
          return `Đang có ${maxJobs} việc lớn của phòng ban chạy; đợi bớt rồi giao tiếp.`
        const title = String(args.title ?? task)
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
              reason: String(args.reason ?? ''),
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
    const lead = bots().store.get(job.lead)
    await relay(job.parentSession, jobReport(next, departmentName(job.department)), {
      bot: job.lead,
      name: lead?.name ?? job.lead,
      job: job.id,
    })
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
      name: 'start_room_round',
      description:
        'Chỉ Aris trong phiên chính của dự án: mở một vòng bàn trong phòng nhóm. Các bot được mời nói lần lượt, nghe được nhau; công cụ đợi hết vòng rồi trả lại các tin. Luật dự án giới hạn số vòng và số tin cho mỗi tin của người dùng.',
      parameters: {
        bot: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Tên gọi bot được mời nói vòng này, theo thứ tự nói. Bỏ trống là mọi thành viên dự án (@all).',
        },
        prompt: {
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
          return 'Phòng nhóm chỉ có trong phiên chính của một dự án. Ở đây thì giao việc bằng assign_task.'
        const b = bots()
        const members: RoomBot[] = project.members.flatMap((id) => {
          const x = b.store.get(id)
          // Bot ngoài làm việc trọn gói, không vào phòng nhóm.
          return x && x.kind === 'member' && !x.external
            ? [{ id: x.id, handle: x.handle, name: x.name, role: x.role }]
            : []
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
              prompt: String(args.prompt ?? ''),
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

  // Bot ngoài (bước 4): mỗi bot một nhà cung cấp `aris-<mã bot>`, gắn từ module plugin đã cài.
  const externals = domain.table('externals') as unknown as Table<ExternalRunRecord>
  const host = new ExternalHost({
    load: moduleLoader(),
    mount: (mod: PluginModule, config) => {
      const fiber = (ctx as unknown as { plugin(p: unknown, c: unknown): { dispose(): unknown } }).plugin(
        mod,
        config,
      )
      return () => void fiber.dispose()
    },
    warn: (msg) => logger.warn(msg),
  })
  const syncExternal = () => host.sync((ctx.get('arisBots') as ArisBots | undefined)?.store.list() ?? [])
  ctx.effect(() => {
    void syncExternal()
    const timer = setInterval(() => void syncExternal(), 30_000)
    return () => {
      clearInterval(timer)
      host.dispose()
    }
  }, 'aris-commander: bot ngoài')
  // Lần chạy dở lúc aris tắt thì không chạy tiếp được: ghi là đã dừng.
  ctx.effect(() => {
    for (const [id, r] of externals.entries())
      if (r.status === 'running')
        void externals
          .put(id, { ...r, status: 'stopped', stoppedBy: 'restart', finishedAt: new Date().toISOString() })
          .catch((e: unknown) => logger.warn('khép lần chạy %s: %s', id, String(e)))
    return () => {}
  }, 'aris-commander: khép lần chạy dở')

  const activeRuns = new Map<string, { dispose(): Promise<void>; timer: ReturnType<typeof setTimeout> }>()
  /**
   * Mọi thay đổi trên bản ghi một lần chạy đi qua một hàng đợi (bước, chi phí, yêu cầu duyệt, dừng,
   * kết thúc): hai nơi cùng đọc bản cũ rồi ghi đè sẽ làm mất thay đổi của nhau.
   */
  const chains = new Map<string, Promise<void>>()
  const updateRun = (runId: string, fn: (r: ExternalRunRecord) => ExternalRunRecord): Promise<void> => {
    const next = (chains.get(runId) ?? Promise.resolve())
      .then(async () => {
        const cur = externals.get(runId)
        if (cur) await externals.put(runId, fn(cur))
      })
      .catch((e: unknown) => logger.warn('ghi lần chạy %s: %s', runId, String(e)))
    chains.set(runId, next)
    return next
  }
  const stopRun = async (runId: string, by: 'user' | 'timeout') => {
    await updateRun(runId, (r) => (r.status === 'running' ? { ...r, stoppedBy: by } : r))
    await activeRuns.get(runId)?.dispose()
  }

  /**
   * Thư mục cho một việc của bot ngoài (xem {@link targetDir}): thư mục Commander nêu, repo nhắc trong
   * việc khi phiên giao không ở trong repo, hoặc thư mục của phiên; worktree mới từ repo đó khi bật.
   */
  async function workdir(
    bot: BotRecord,
    title: string,
    agent: AgentLike,
    a: Assignment,
  ): Promise<
    { cwd?: string | undefined; worktree?: { branch: string; dir: string; repo: string } } | { error: string }
  > {
    const session = (ctx.get('workingDirectory') as { get(session: unknown): string } | undefined)?.get(
      (agent as unknown as { session: unknown }).session,
    )
    const target = await targetDir({ explicit: a.dir, task: a.task, session })
    if ('error' in target) return target
    const { dir: wd, root } = target
    if (!bot.external?.worktree || !wd || !root) return { cwd: wd }
    const plan = worktreePlan(root, bot.handle, title, randomUUID().replace(/-/g, '').slice(0, 8))
    try {
      await addWorktree(root, plan)
    } catch (e) {
      return { error: `Không tạo được worktree: ${String(e).split('\n')[0]}` }
    }
    return { cwd: plan.dir, worktree: { ...plan, repo: root } }
  }

  // Duyệt tập trung: yêu cầu quyền của bot ngoài (ApprovalHub) và bot trong đội (phiên con) về một
  // danh sách; web và Telegram cùng đọc. Bot ngoài còn ghi yêu cầu lên bản ghi lần chạy (thẻ trên nhánh).
  const center = new ApprovalCenter()
  // Duyệt bền (GĐ9.7a): bản ghi yêu cầu của phiên chính; công tắc ở trang Commander, mặc định bật.
  const durable = new DurableApprovals(domain.table('approvals') as unknown as Table<DurableRecord>)
  const durableOn = () => settings().durable !== false
  const repeats = new RepeatGuard()
  const sessionRun = (sid: string) => `session:${sid}`
  /** Phiên đang trả lời câu hỏi ý của đồng đội (GĐ9.5): mã phiên → mã việc. */
  const consultSessions = new Map<string, string>()
  const sessionItem = (
    r: Pick<DurableRecord, 'id' | 'session' | 'bot' | 'name' | 'tool' | 'reason' | 'at'>,
    run: string,
  ) => ({
    id: r.id,
    source: 'session' as const,
    run,
    bot: r.bot,
    name: r.name,
    parentSession: r.session,
    kind: 'other' as const,
    tool: r.tool,
    reason: r.reason,
    at: r.at,
  })
  /**
   * Trả lời một yêu cầu mà lượt không còn chờ (hết giờ hay aris khởi động lại). Cho phép: được phép một lần cho
   * đúng thao tác, nhắn vào phiên để bot làm tiếp. Từ chối: bỏ.
   */
  const answerOrphan = (id: string, allow: boolean, by: 'user' | 'telegram'): boolean => {
    const r = durable.get(id)
    if (!r || r.status !== 'pending') return false
    center.close(id, allow, by)
    if (!allow) {
      void durable.done(id)
      return true
    }
    void durable
      .grant(id)
      .then(() =>
        relay(
          r.session,
          `[aris] Người dùng vừa cho phép ${r.tool}${r.reason ? ` («${r.reason.split('\n')[0]!.slice(0, 120)}»)` : ''}. Lượt trước đã dừng khi chờ duyệt. Nếu việc vẫn cần, gọi lại đúng thao tác đó với cùng tham số: lần này chạy luôn, không hỏi lại.`,
          { bot: 'aris', name: 'aris' },
        ).catch((e: unknown) => logger.warn('báo đã cho phép: %s', String(e))),
      )
    return true
  }
  ctx.provide('arisApprovals', {
    list: (parentSession?: string) => center.list(parentSession),
    answer: (id: string, allow: boolean, by: 'user' | 'telegram' = 'user') =>
      hub.answer(id, allow, by) || answerOrphan(id, allow, by),
    on: (fn: (e: ApprovalEvent) => void) => center.on(fn),
    /**
     * Plugin khác mở một yêu cầu trong hộp duyệt chung (web, Telegram cùng thấy) và chờ trả lời. `run` riêng cho mỗi
     * yêu cầu (`computer:<mã lời gọi>`); `signal` huỷ thì yêu cầu bị đóng là từ chối.
     */
    ask: (o: { run: string; tool: string; input: unknown }, signal?: AbortSignal) => {
      const onAbort = () => hub.endRun(o.run)
      signal?.addEventListener('abort', onAbort, { once: true })
      return hub.request(o.run, o.tool, o.input).finally(() => signal?.removeEventListener('abort', onAbort))
    },
  })
  /** Phiên con của bot trong đội đang làm việc được giao: bot nào, phiên giao việc nào. */
  const members = new Map<string, { bot: string; name: string; handle: string; parent: string }>()
  /** Tham số các lần gọi công cụ gần đây của phiên con, để thẻ duyệt hiện đúng lệnh. */
  const calls = new Map<string, { name: string; args: unknown }>()
  const hub = new ApprovalHub({
    opened(req) {
      // Điều khiển máy (@aris/computer): plugin đó đưa sẵn mô tả và mã ảnh xem trước.
      if (req.run.startsWith('computer:')) {
        const i = req.input as {
          bot: string
          name: string
          parentSession?: string
          describe: string
          preview?: string
        }
        center.open({
          id: req.id,
          source: 'computer',
          run: req.run,
          bot: i.bot,
          name: i.name,
          parentSession: i.parentSession,
          kind: 'other',
          target: i.describe,
          tool: req.tool,
          preview: i.preview,
          at: req.at,
        })
        return
      }
      if (req.run.startsWith('session:')) {
        const rec = { ...(req.input as Omit<DurableRecord, 'id' | 'at' | 'status'>), id: req.id, at: req.at }
        center.open(sessionItem(rec, req.run))
        void durable.open(rec).catch((e: unknown) => logger.warn('lưu yêu cầu duyệt: %s', String(e)))
        return
      }
      if (req.run.startsWith('member:')) {
        const m = members.get(req.run.slice(7))
        const input = req.input as { call?: { name: string; args: unknown }; reason?: string }
        const step = input.call ? stepOf(toolAlias(input.call.name), callInput(input.call.args)) : undefined
        center.open({
          id: req.id,
          source: 'member',
          run: req.run,
          bot: m?.bot ?? req.run.slice(7),
          name: m?.name ?? '?',
          handle: m?.handle,
          parentSession: m?.parent,
          kind: step?.kind ?? 'other',
          target: step?.target,
          tool: step?.tool ?? input.call?.name ?? req.tool,
          reason: input.reason,
          at: req.at,
        })
        return
      }
      const r = externals.get(req.run)
      if (!r) return
      const step = stepOf(req.tool, req.input, r.cwd)
      center.open({
        id: req.id,
        source: 'external',
        run: req.run,
        bot: r.bot,
        name: r.name,
        parentSession: r.parentSession,
        kind: step.kind,
        target: step.target,
        tool: step.tool ?? req.tool,
        at: req.at,
      })
      void updateRun(req.run, (cur) => ({
        ...cur,
        pending: [
          ...(cur.pending ?? []),
          { id: req.id, ...stepOf(req.tool, req.input, cur.cwd), at: req.at },
        ],
      }))
      bots().live.externalWaiting(r.bot, true, r.id)
    },
    closed(req, allow, by) {
      center.close(req.id, allow, by)
      if (req.run.startsWith('session:')) {
        // Người dùng trả lời: xong. Hết giờ chờ hay lượt dừng: giữ yêu cầu trong hộp duyệt, trả lời muộn vẫn được.
        if (by === 'user' || by === 'telegram') void durable.done(req.id)
        else {
          const rec = durable.get(req.id)
          if (rec) center.open(sessionItem(rec, `orphan:${rec.id}`))
        }
        return
      }
      if (req.run.startsWith('member:') || req.run.startsWith('computer:')) return
      const r = externals.get(req.run)
      if (!r) return
      void updateRun(req.run, (cur) => ({
        ...cur,
        pending: (cur.pending ?? []).filter((p) => p.id !== req.id),
        answered: [
          ...(cur.answered ?? []),
          { id: req.id, ...stepOf(req.tool, req.input, cur.cwd), allow, by, at: new Date().toISOString() },
        ].slice(-20),
      }))
      bots().live.externalWaiting(r.bot, false, r.id)
    },
  })
  // Bot trong đội (phiên con của Team): dsh ghim "từ chối hết" lúc tạo; aris đổi sang "hỏi" khi giao
  // việc và trả lời các yêu cầu đó bằng hộp duyệt chung.
  const askMember = (memberSession: string) => {
    const agent = (ctx.get('agents') as { get(id: string): unknown } | undefined)?.get(memberSession)
    const approval = ctx.get('approval') as
      { setPolicy(agent: unknown, policy: 'ask' | 'never'): void } | undefined
    if (!agent || !approval) return
    try {
      approval.setPolicy(agent, 'ask')
    } catch (e) {
      logger.warn('đổi chính sách duyệt của %s: %s', memberSession, String(e))
    }
  }
  ctx.on('session/event', (session, event) => {
    // Nhắn chen khi đang chờ duyệt (GĐ9.7a, cách B): tin của người dùng vào phiên thì từ chối yêu cầu đang chờ.
    if ((event.type as string) === 'agent/inbox/spliced' && durableOn()) {
      const inserted = (event.data as { inserted?: { role?: string; source?: { kind?: string } }[] }).inserted
      const waiting = hub.of(sessionRun(session.id))
      if (
        waiting.length &&
        inserted?.some((m) => m.role === 'user' && !String(m.source?.kind ?? '').startsWith('aris'))
      ) {
        for (const r of waiting) hub.answer(r.id, false, 'user')
        // Kết quả "từ chối" của dsh không kèm lý do: chèn một lời nhắc vào lượt đang chạy để bot không nhờ
        // người dùng bấm duyệt mà kết thúc lượt, đọc tin mới.
        const agent = (ctx.get('agents') as { get(id: string): unknown } | undefined)?.get(session.id) as
          { steer?(m: unknown): void } | undefined
        agent?.steer?.(
          createUserMessage({
            content: [
              {
                type: 'text',
                text: '[aris] Người dùng vừa nhắn tin mới trong lúc thẻ duyệt đang chờ, nên yêu cầu vừa rồi bị từ chối theo ý người dùng. Đừng nhờ người dùng bấm duyệt; trả lời một câu ngắn rồi kết thúc lượt để đọc và làm theo tin mới.',
              },
            ],
            source: { kind: 'aris-bot', form: 'relay', bot: 'aris', name: 'aris' },
          }),
        )
      }
      return
    }
    // Tham số lời gọi: phiên con (thẻ duyệt hiện đúng lệnh) và phiên chính (duyệt bền khớp đúng thao tác).
    if ((event.type as string) !== 'tool/call') return
    const d = event.data as unknown as { callId?: string; name?: string; arguments?: unknown }
    if (!d.callId || !d.name) return
    calls.set(d.callId, { name: d.name, args: d.arguments })
    if (calls.size > 200) calls.delete(calls.keys().next().value!)
  })
  ctx.on(
    'approval/request',
    async (req, next) => {
      const sid = req.agent.session.id
      if (!members.has(sid)) return next()
      // Bot đặt "Hành động nguy hiểm: từ chối" thì không hỏi người dùng.
      const store = (ctx.get('arisBots') as ArisBots | undefined)?.store
      if (store?.get(store.botOf(sid).id)?.perms?.danger === 'deny') return 'rejected'
      const call = req.callId ? calls.get(req.callId) : undefined
      const run = `member:${sid}`
      const onAbort = () => hub.endRun(run)
      req.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const allow = await hub.request(run, req.toolName, { call, reason: req.reason })
        if (req.signal?.aborted) return 'cancelled'
        return allow ? 'allowed-once' : 'rejected'
      } finally {
        req.signal?.removeEventListener('abort', onAbort)
      }
    },
    true,
  )
  // --- Duyệt bền và chống lặp (GĐ9.7a, docs/plans/gd9-7-duyet-ben.md) -------------------------------------
  // Phiên chính: aris giữ yêu cầu duyệt ở hộp chung (thanh duyệt aris, chuông, Telegram) thay cho thẻ của dsh nên
  // ô nhập không bị che; yêu cầu lưu xuống đĩa.
  ctx.on(
    'approval/request',
    async (req, next) => {
      const sid = req.agent.session.id
      // Phiên đang trả lời câu hỏi ý của đồng đội (GĐ9.5): không làm việc cần duyệt.
      if (consultSessions.has(sid)) {
        const agent = (ctx.get('agents') as { get(id: string): unknown } | undefined)?.get(sid) as
          { steer?(m: unknown): void } | undefined
        agent?.steer?.(
          createUserMessage({
            content: [
              {
                type: 'text',
                text: '[aris] Bạn đang trả lời câu hỏi ý của đồng đội: thao tác cần duyệt bị từ chối. Đừng thử cách khác; trả lời bằng những gì đã biết và nói rõ việc nào cần chủ làm hay duyệt.',
              },
            ],
            source: { kind: 'aris-bot', form: 'relay', bot: 'aris', name: 'aris' },
          }),
        )
        return 'rejected'
      }
      if (!durableOn() || members.has(sid)) return next()
      // Phiên của kênh (Telegram, Lark, Zalo): kênh lo như trước.
      const channels = ctx.get('arisChannelApprovals') as
        { approve(req: unknown): Promise<string | undefined> } | undefined
      const claimed = await channels?.approve(req)
      if (claimed !== undefined) return claimed as Awaited<ReturnType<typeof next>>
      const call = req.callId ? calls.get(req.callId) : undefined
      const tool = call?.name ?? req.toolName
      const hash = argsHash(tool, call?.args ?? null)
      // Người dùng đã cho phép muộn đúng thao tác này: chạy luôn, dùng một lần.
      if (await durable.take(sid, tool, hash)) return 'allowed-once'
      const bot = bots().store.botOf(sid)
      const reason = (req.displayReason as Record<string, string> | undefined)?.vi ?? req.reason
      const run = sessionRun(sid)
      const onAbort = () => hub.endRun(run)
      req.signal?.addEventListener('abort', onAbort, { once: true })
      try {
        const allow = await hub.request(run, tool, {
          session: sid,
          bot: bot.id,
          name: bot.name,
          tool,
          hash,
          ...(reason ? { reason } : {}),
        })
        if (req.signal?.aborted) return 'cancelled'
        return allow ? 'allowed-once' : 'rejected'
      } finally {
        req.signal?.removeEventListener('abort', onAbort)
      }
    },
    // Đứng trước thẻ duyệt của dsh trong chuỗi (như mọi hook duyệt của aris).
    true,
  )

  // --- Đồng đội hỏi nhau (GĐ9.5, docs/plans/gd9-5-dong-doi-hoi-nhau.md) -----------------------------------------
  const tasks = domain.table('tasks') as unknown as Table<TaskRecord>
  const teammatesOn = () => settings().teammates !== false
  /** Lúc bắt đầu lượt hiện tại của mỗi phiên (gốc của chuỗi hỏi). */
  const turnStarted = new Map<string, number>()
  ctx.on('session/event', (session, event) => {
    if ((event.type as string) !== 'turn/start') return
    turnStarted.set(session.id, Date.now())
    if (turnStarted.size > 500) turnStarted.delete(turnStarted.keys().next().value!)
  })
  const allTasks = () => [...tasks.entries()].map(([, t]) => t)
  /** Kết quả chờ nhắn về phiên của bot hỏi (lượt đã dừng), gom theo phiên. */
  const returning = new Map<string, { list: TaskRecord[]; timer: ReturnType<typeof setTimeout> }>()
  const queueReturn = (t: TaskRecord) => {
    const cur = returning.get(t.fromSession)
    if (cur) return void cur.list.push(t)
    const entry = {
      list: [t],
      timer: setTimeout(() => {
        returning.delete(t.fromSession)
        const at = new Date().toISOString()
        void relay(t.fromSession, returnMessage(entry.list), { bot: 'aris', name: 'aris' })
          .then(() => Promise.all(entry.list.map((x) => tasks.put(x.id, { ...x, returnedAt: at }))))
          .catch((e: unknown) => logger.warn('nhắn kết quả hỏi đồng đội: %s', String(e)))
      }, LIMITS.batchMs),
    }
    returning.set(t.fromSession, entry)
  }
  const findTeammate = (ref: string) => {
    const r = ref.replace(/^@/, '').trim().toLowerCase()
    const store = bots().store
    return (
      store.byHandle(r) ??
      store.get(ref.trim()) ??
      store.list().find((b) => b.name.trim().toLowerCase() === r)
    )
  }

  ctx.tools.register(
    defineTool({
      name: 'ask_teammate',
      description:
        'Hỏi ý một đồng đội trong đội (danh sách và việc của từng người ở <aris-bot>) khi câu hỏi thuộc chuyên môn của họ. Đồng đội trả lời ở phiên riêng, câu trả lời về đây làm kết quả để bạn làm tiếp. Chỉ hỏi ý: đồng đội không gửi tin hay sửa gì ra ngoài. Đồng đội không thấy cuộc trò chuyện này, nên ghi đủ ngữ cảnh. Không hỏi điều bạn tự trả lời được; mỗi lượt hỏi tối đa 6 lần.',
      parameters: {
        teammate: { type: 'string', required: true, description: '@tên gọi hay tên của đồng đội.' },
        question: { type: 'string', required: true, description: 'Câu hỏi, rõ ràng, một ý.' },
        context: {
          type: 'string',
          description: 'Ngữ cảnh đồng đội cần để trả lời (đồng đội không thấy cuộc này).',
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        if (!teammatesOn()) return 'Người dùng đã tắt "Đồng đội hỏi nhau" (trang Commander). Tự trả lời.'
        const sid = (exec.agent as unknown as AgentLike | undefined)?.session.id
        if (!sid) return 'Không có phiên để hỏi đồng đội.'
        const me = bots().store.botOf(sid)
        const parentId = consultSessions.get(sid)
        const parent = parentId ? tasks.get(parentId) : undefined
        const depth = parent ? parent.depth + 1 : 1
        const root = parent?.root ?? `${sid}@${turnStarted.get(sid) ?? 0}`
        const trust = parent
          ? undefined
          : (
              ctx.get('arisChannelTrust') as
                { of(sid: string): 'owner' | 'member' | 'guest' | undefined } | undefined
            )?.of(sid)
        const ref = String(args.teammate ?? '')
        const target = findTeammate(ref)
        const question = String(args.question ?? '').trim()
        if (!question) return 'Cần câu hỏi.'
        const why = cannotAsk({
          depth,
          rootCount: allTasks().filter((t) => t.root === root).length,
          trust,
          self: me.id,
          target,
          targetRef: ref,
        })
        if (why || !target) return why ?? `Không có đồng đội «${ref}».`
        const task: TaskRecord = {
          id: randomUUID(),
          root,
          ...(parent ? { parent: parent.id } : {}),
          depth,
          from: me.id,
          fromName: me.name,
          fromSession: sid,
          to: target.id,
          toName: target.name,
          question,
          status: 'running',
          startedAt: new Date().toISOString(),
        }
        let toSession: string
        try {
          toSession = await bots().open(target.id)
        } catch (e) {
          return `Không mở được phiên cho ${target.name}: ${String(e)}`
        }
        consultSessions.set(toSession, task.id)
        await tasks.put(task.id, { ...task, toSession })
        const since = Date.now()
        await relay(toSession, consultMessage(me.name, question, args.context as string | undefined), {
          bot: me.id,
          name: me.name,
        })
        // Chờ đồng đội không theo lượt của bot hỏi: lượt đó dừng thì kết quả vẫn được nhắn về sau.
        const finish = waitTurn(toSession, since, AbortSignal.timeout(LIMITS.waitMs))
          .catch((): Spoken => ({ kind: 'timeout', text: '' }))
          .then(async (spoken) => {
            consultSessions.delete(toSession)
            const ok = spoken.kind === 'completed' && !!spoken.text.trim()
            const done: TaskRecord = {
              ...task,
              toSession,
              status: ok ? 'done' : 'failed',
              ...(ok ? { answer: spoken.text.trim() } : {}),
              finishedAt: new Date().toISOString(),
            }
            await tasks.put(done.id, done)
            return done
          })
        const signal = exec.signal
        const stopped = new Promise<'stopped'>((resolve) => {
          if (signal?.aborted) resolve('stopped')
          signal?.addEventListener('abort', () => resolve('stopped'), { once: true })
        })
        const first = await Promise.race([finish, stopped])
        if (first === 'stopped') {
          void finish.then(queueReturn)
          return `Đã gửi câu hỏi cho ${target.name}; kết quả sẽ được nhắn về sau.`
        }
        return first.status === 'done'
          ? answerText(target.name, first.answer ?? '')
          : `${target.name} chưa trả lời được (quá ${LIMITS.waitMs / 60_000} phút hay gặp lỗi). Tự trả lời bằng những gì bạn biết, nói rõ chỗ chưa chắc.`
      },
    }),
  )

  // Khởi động lại: câu hỏi đang chạy bị ngắt; báo bot hỏi (gom theo phiên).
  void (async () => {
    for (const t of allTasks().filter((x) => x.status === 'running')) {
      const cut: TaskRecord = { ...t, status: 'interrupted', finishedAt: new Date().toISOString() }
      await tasks.put(t.id, cut)
      queueReturn(cut)
    }
  })().catch((e: unknown) => logger.warn('nạp câu hỏi đồng đội cũ: %s', String(e)))

  // --- Sang trang (GĐ9.8a): ngữ cảnh vượt trần tuyệt đối thì nhờ dsh nén ngay trong cùng phiên khi bot rảnh. ---
  const lastContext = new Map<string, number>()
  // Nén bằng lệnh `/compact` của dsh (dịch vụ nén nằm ở phạm vi khác, lệnh thì tới được từ đây).
  type Commands = {
    execute(
      agent: unknown,
      line: string,
      attachments: readonly unknown[],
      signal: AbortSignal,
    ): Promise<unknown>
  }
  let commands: Commands | undefined
  ctx.inject(['commands'], (scope) => {
    commands = (scope as unknown as { commands: Commands }).commands
    scope.effect(
      () => () => {
        commands = undefined
      },
      'aris-commander: lệnh nén',
    )
  })
  ctx.on('session/event', (session, event) => {
    const type = event.type as string
    if (type === 'assistant/message') {
      const n = contextTokens((event.data as { usage?: Parameters<typeof contextTokens>[0] }).usage)
      if (n) lastContext.set(session.id, n)
      if (lastContext.size > 500) lastContext.delete(lastContext.keys().next().value!)
      return
    }
    if (type !== 'turn/end') return
    const kind = (event.data as { reason?: { kind?: string } }).reason?.kind
    const cap = settings().compactAt ?? COMPACT_AT
    if (!shouldCompact(lastContext.get(session.id), kind, cap)) return
    const sid = session.id
    lastContext.delete(sid)
    // Đợi lượt khép hẳn rồi mới nén (dsh chỉ nén khi agent rảnh).
    setTimeout(() => {
      const agent = (ctx.get('agents') as { get(id: string): unknown } | undefined)?.get(sid) as
        { status?: string } | undefined
      if (!agent || !commands || agent.status === 'running') {
        logger.info(
          'sang trang: chưa nén phiên %s (agent %s, lệnh %s)',
          sid,
          agent?.status ?? 'không có',
          commands ? 'có' : 'không có',
        )
        return
      }
      commands
        .execute(agent, '/compact', [], AbortSignal.timeout(5 * 60_000))
        .then(() => logger.info('sang trang: đã nén phiên %s (vượt %d token)', sid, cap))
        .catch((e: unknown) => logger.warn('sang trang: nén phiên %s: %s', sid, String(e)))
    }, 1500)
  })

  // Chống lặp: thao tác ra ngoài (gửi tin, ghi qua kết nối) cùng bot, cùng tham số vừa chạy xong thì chặn.
  const mcpWrites = (tool: string) =>
    /(create|update|delete|remove|send|post|write|add|publish|insert|upsert|comment|reply|move|archive)/i.test(
      tool.split('__').pop() ?? '',
    )
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    const sid = exec.agent?.session.id
    if (decision.kind === 'deny' || !sid || !durableOn() || !isOutbound(exec.name, mcpWrites)) return decision
    const at = repeats.last(bots().store.botOf(sid).id, argsHash(exec.name, exec.arguments ?? null))
    if (at === undefined) return decision
    const hhmm = new Date(at).toTimeString().slice(0, 5)
    return {
      kind: 'deny',
      reason: `Thao tác này (${exec.name}, cùng nội dung) đã chạy xong lúc ${hhmm}. Không làm lại để tránh gửi trùng; nếu người dùng thật sự muốn gửi lại thì hỏi họ trước.`,
    }
  })
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const out = await next()
    const sid = exec.agent?.session.id
    if (sid && durableOn() && !(result as { isError?: boolean }).isError && isOutbound(exec.name, mcpWrites))
      repeats.record(bots().store.botOf(sid).id, argsHash(exec.name, exec.arguments ?? null))
    return out
  })

  // Khởi động lại: yêu cầu còn chờ từ lần chạy trước vào lại hộp duyệt (lượt đã dừng); bỏ bản quá hạn.
  void durable
    .prune()
    .then(() => {
      for (const r of durable.pending()) center.open(sessionItem(r, `orphan:${r.id}`))
    })
    .catch((e: unknown) => logger.warn('nạp yêu cầu duyệt cũ: %s', String(e)))

  ctx.effect(() => {
    hub.start().catch((e: unknown) => logger.warn('mở socket duyệt quyền: %s', String(e)))
    return () => hub.stop()
  }, 'aris-commander: duyệt quyền bot ngoài')
  const approveScript = fileURLToPath(new URL('../bin/approve-mcp.mjs', import.meta.url))

  /** Nhật ký giao thức của một lần chạy (tên tin nhắn, giờ): ~/.aris/logs/external-<mã>.log. */
  const traceDir = join(homedir(), '.aris', 'logs')
  const traceRun = (runId: string, line: string) => {
    try {
      mkdirSync(traceDir, { recursive: true })
      appendFileSync(join(traceDir, `external-${runId}.log`), `${new Date().toISOString()} ${line}\n`)
    } catch {
      // Nhật ký chỉ để chẩn đoán.
    }
  }

  /** Báo kết quả lần chạy về phiên giao (Aris đọc rồi trả lời người dùng). */
  const reportRun = (r: ExternalRunRecord) => {
    const min = Math.max(1, Math.round((Date.parse(r.finishedAt ?? '') - Date.parse(r.startedAt)) / 60_000))
    const cost = r.costUsd !== undefined ? `, ${r.costUsd.toFixed(2)} USD` : ''
    const head =
      r.status === 'done'
        ? `${r.name} (bot ngoài ${label(r.agent as never)}) xong việc «${r.title}» sau ${min} phút${cost}.`
        : r.status === 'stopped'
          ? `${r.name} (bot ngoài) đã dừng việc «${r.title}»${r.stoppedBy === 'timeout' ? ` vì chạy quá ${r.timeoutMin} phút` : ''}${cost}.`
          : `${r.name} (bot ngoài) vấp ở việc «${r.title}»: ${r.diagnostic ?? 'không rõ lý do'}${cost}.`
    const where = r.worktree
      ? `\nThay đổi nằm trong worktree ${r.worktree.dir} (nhánh ${r.worktree.branch}).`
      : ''
    const body = r.output ? `\n\nKết quả của ${r.name}:\n${r.output}` : ''
    return relay(r.parentSession, `[Bot ngoài · việc ${r.id}] ${head}${where}${body}`, {
      bot: r.bot,
      name: r.name,
      run: r.id,
    })
  }

  /** Chạy Claude Code hay Codex có sẵn trên máy: từng bước, hỏi quyền, trần tiền, làm tiếp phiên cũ. */
  async function runCli(
    bot: BotRecord,
    a: Assignment,
    title: string,
    agent: AgentLike,
    bin: string,
  ): Promise<DispatchResult> {
    const cfg = bot.external!
    const budget = externalBudget(cfg.budgetUsd, settings().budgetUsd)
    const fail = (error: string): DispatchResult => ({ handle: bot.handle, name: bot.name, ok: false, error })
    // Đã giao cho bot này trong cuộc: làm tiếp phiên Claude Code cũ, cùng thư mục.
    let prev = [...externals.entries()]
      .map(([, r]) => r)
      .filter(
        (r) =>
          r.bot === bot.id &&
          r.parentSession === agent.session.id &&
          r.sessionRef &&
          r.runtime === 'cli' &&
          r.agent === cfg.agent,
      )
      .sort((x, y) => y.startedAt.localeCompare(x.startedAt))[0]
    if (prev?.status === 'running')
      return fail(`${bot.name} đang làm việc «${prev.title}»; đợi xong rồi giao tiếp.`)
    // Commander nêu thư mục khác lần trước: làm mới ở thư mục đó, không nối phiên cũ.
    if (prev && a.dir?.trim()) {
      const want = await targetDir({ explicit: a.dir, task: a.task })
      const had = prev.worktree?.repo ?? (prev.cwd ? await gitRoot(prev.cwd) : undefined) ?? prev.cwd
      if ('error' in want) return fail(want.error)
      if ((want.root ?? want.dir) !== had) prev = undefined
    }
    const place = prev ? { cwd: prev.cwd, worktree: prev.worktree } : await workdir(bot, title, agent, a)
    if ('error' in place) return fail(place.error)
    const runId = randomUUID()
    const rec: ExternalRunRecord = {
      id: runId,
      bot: bot.id,
      handle: bot.handle,
      name: bot.name,
      agent: cfg.agent,
      runtime: 'cli',
      title,
      task: a.task.trim(),
      parentSession: agent.session.id,
      ...(place.cwd ? { cwd: place.cwd } : {}),
      ...(place.worktree ? { worktree: place.worktree } : {}),
      ...(prev ? { resumedFrom: prev.id } : {}),
      ...(budget ? { budgetUsd: budget } : {}),
      status: 'running',
      timeoutMin: cfg.timeoutMin,
      steps: [],
      startedAt: new Date().toISOString(),
    }
    await externals.put(runId, rec)
    const live = bots().live
    live.assigned(bot.id, title, runId)
    live.externalStart(bot.id, runId, title)
    void (domain.table('dispatch') as unknown as Table<DispatchRecord>)
      .put(`${Date.now()}-${bot.handle}`, {
        at: rec.startedAt,
        sessionId: agent.session.id,
        bot: bot.id,
        handle: bot.handle,
        title,
        task: rec.task,
        reason: a.reason.trim(),
        member: runId,
        reused: !!prev,
      })
      .catch((e: unknown) => logger.warn('nhật ký giao việc: %s', String(e)))
    const ctrl = new AbortController()
    const timer = setTimeout(() => void stopRun(runId, 'timeout'), cfg.timeoutMin * 60_000)
    activeRuns.set(runId, { dispose: async () => ctrl.abort(), timer })
    // Ghi bản ghi theo hàng đợi để các bước không ghi đè nhau.
    const patch = (fn: (r: ExternalRunRecord) => ExternalRunRecord) => void updateRun(runId, fn)
    const mcpConfig = JSON.stringify({
      mcpServers: {
        aris: {
          command: process.execPath,
          args: [approveScript],
          env: { ARIS_APPROVE_SOCK: hub.path, ARIS_APPROVE_RUN: runId },
        },
      },
    })
    const brief = prev
      ? `Commander giao tiếp một việc trong cùng cuộc.\n\n${inWorktree(a.task.trim(), place.worktree)}\n\nVì sao là bạn: ${a.reason.trim()}\nXong thì trả lời bằng kết quả: đã làm gì, tệp nào đổi, kiểm tra ra sao, còn gì dở.`
      : externalBrief({
          name: bot.name,
          task: inWorktree(a.task, place.worktree),
          reason: a.reason,
          cwd: place.cwd,
          worktree: place.worktree,
        })
    const hooks: DriverHooks = {
      step: (st) => patch((r) => ({ ...r, steps: [...(r.steps ?? []), st].slice(-60) })),
      stepEnd: (id, status) =>
        patch((r) => ({ ...r, steps: (r.steps ?? []).map((x) => (x.id === id ? { ...x, status } : x)) })),
      cost: (usd) => patch((r) => ({ ...r, costUsd: usd })),
      session: (ref) => patch((r) => ({ ...r, sessionRef: ref })),
    }
    const running =
      cfg.agent === 'codex'
        ? runCodex(
            {
              bin,
              cwd: place.cwd,
              env: childEnv(process.env),
              signal: ctrl.signal,
              prompt: brief,
              permission: cfg.permission,
              model: cfg.model,
              resume: prev?.sessionRef,
              ask: (tool, input) => hub.request(runId, tool, input),
              warn: (msg) => logger.warn(msg),
              trace: (line) => traceRun(runId, line),
            },
            hooks,
          )
        : runClaude(
            {
              bin,
              cwd: place.cwd,
              env: childEnv(process.env, { ARIS_APPROVE_SOCK: hub.path, ARIS_APPROVE_RUN: runId }),
              signal: ctrl.signal,
              prompt: brief,
              permission: cfg.permission,
              model: cfg.model,
              budgetUsd: budget,
              resume: prev?.sessionRef,
              mcpConfig,
            },
            hooks,
          )
    void running.then(async (res) => {
      clearTimeout(timer)
      activeRuns.delete(runId)
      hub.endRun(runId)
      await updateRun(runId, (cur) => {
        const next: ExternalRunRecord = {
          ...cur,
          status: res.status,
          finishedAt: new Date().toISOString(),
          ...(res.output ? { output: res.output.slice(0, 8000) } : {}),
          ...(res.diagnostic ? { diagnostic: res.diagnostic } : {}),
          ...(res.costUsd !== undefined ? { costUsd: res.costUsd } : {}),
          ...(res.sessionRef ? { sessionRef: res.sessionRef } : {}),
          pending: [],
        }
        if (res.status === 'stopped' && !next.stoppedBy) next.stoppedBy = 'user'
        return next
      })
      chains.delete(runId)
      const done = externals.get(runId) ?? rec
      live.externalEnd(bot.id, runId, res.status === 'done')
      await reportRun(done).catch((e: unknown) => logger.warn('báo kết quả bot ngoài: %s', String(e)))
    })
    return {
      handle: bot.handle,
      name: bot.name,
      ok: true,
      external: `${label(cfg.agent)}${prev ? ', làm tiếp phiên cũ' : ''}`,
      runId,
      ...(place.worktree ? { worktree: place.worktree } : {}),
    }
  }

  async function runExternal(
    bot: BotRecord,
    a: Assignment,
    title: string,
    agent: AgentLike,
    signal: AbortSignal,
  ): Promise<DispatchResult> {
    const cfg = bot.external!
    const fail = (error: string): DispatchResult => ({ handle: bot.handle, name: bot.name, ok: false, error })
    // Có CLI trên máy thì aris tự chạy (từng bước, hỏi người dùng, trần tiền); không thì plugin dsh.
    const cliName = CLI_NAMES[cfg.agent]
    const cli = cliName ? findBinary(cliName) : undefined
    if (cli) return runCli(bot, a, title, agent, cli)
    await syncExternal()
    const state = host.state(bot.id)
    if (state === 'missing')
      return fail(`Chưa cài plugin ${label(cfg.agent)} của dsh. Mở hồ sơ ${bot.name} để cài rồi giao lại.`)
    if (state === 'error') return fail(`Không gắn được plugin ${label(cfg.agent)}; xem nhật ký aris.`)
    const subagents = ctx.get('subagents') as SubagentsPort | undefined
    if (!subagents) return fail('Profile này chưa có dịch vụ bot con (subagents) của dsh.')
    const place = await workdir(bot, title, agent, a)
    if ('error' in place) return fail(place.error)
    const { cwd, worktree } = place
    const act = await subagents.startActivation({
      provider: providerOf(bot.id),
      label: `${bot.name}: ${title}`,
      request: {
        prompt: [
          {
            type: 'text',
            text: externalBrief({
              name: bot.name,
              task: inWorktree(a.task, worktree),
              reason: a.reason,
              cwd,
              worktree,
            }),
          },
        ],
        parent: agent,
        ...(cwd ? { cwd } : {}),
      },
      signal,
      delivery: 'parent',
    })
    const runId = String(act.childId)
    const rec: ExternalRunRecord = {
      id: runId,
      bot: bot.id,
      handle: bot.handle,
      name: bot.name,
      agent: cfg.agent,
      title,
      task: a.task.trim(),
      parentSession: agent.session.id,
      ...(cwd ? { cwd } : {}),
      ...(worktree ? { worktree } : {}),
      status: 'running',
      timeoutMin: cfg.timeoutMin,
      startedAt: new Date().toISOString(),
    }
    await externals.put(runId, rec)
    const live = bots().live
    live.assigned(bot.id, title, runId)
    live.externalStart(bot.id, runId, title)
    const timer = setTimeout(() => void stopRun(runId, 'timeout'), cfg.timeoutMin * 60_000)
    activeRuns.set(runId, { dispose: () => act.dispose(), timer })
    const settle = async (r: {
      output?: readonly { type: string; text?: string }[]
      stopReason?: string
      diagnostic?: string
    }) => {
      clearTimeout(timer)
      activeRuns.delete(runId)
      const cur = externals.get(runId) ?? rec
      const output = (r.output ?? [])
        .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
        .join('\n')
        .trim()
      const status: ExternalRunRecord['status'] =
        r.stopReason === 'completed' ? 'done' : r.stopReason === 'aborted' ? 'stopped' : 'failed'
      await externals.put(runId, {
        ...cur,
        status,
        finishedAt: new Date().toISOString(),
        ...(output ? { output: output.slice(0, 8000) } : {}),
        ...(r.diagnostic ? { diagnostic: r.diagnostic.slice(0, 2000) } : {}),
        ...(r.stopReason ? { stopReason: r.stopReason } : {}),
      })
      live.externalEnd(bot.id, runId, status === 'done')
    }
    void act.result.then(settle, (e: unknown) => settle({ stopReason: 'error', diagnostic: String(e) }))
    const log = domain.table('dispatch') as unknown as Table<DispatchRecord>
    void log
      .put(`${Date.now()}-${bot.handle}`, {
        at: new Date().toISOString(),
        sessionId: agent.session.id,
        bot: bot.id,
        handle: bot.handle,
        title,
        task: a.task.trim(),
        reason: a.reason.trim(),
        member: runId,
        reused: false,
      })
      .catch((e: unknown) => logger.warn('nhật ký giao việc: %s', String(e)))
    return { handle: bot.handle, name: bot.name, ok: true, external: label(cfg.agent), runId }
  }

  /** Phiên bản CLI đã dò, nhớ theo đường dẫn. */
  const versions = new Map<string, Promise<string | undefined>>()
  const cliOf = async (agent: (typeof EXTERNAL_AGENTS)[number]) => {
    const name = CLI_NAMES[agent]
    const path = name ? findBinary(name) : undefined
    if (!path) return null
    if (!versions.has(path)) versions.set(path, cliVersion(path))
    return { path, version: (await versions.get(path)) ?? null }
  }

  /** Tình trạng bot ngoài cho hộp Thêm bot ngoài và hồ sơ bot. */
  const externalStatus = async () => {
    await syncExternal()
    const store = (ctx.get('arisBots') as ArisBots | undefined)?.store
    const agents = Object.fromEntries(
      await Promise.all(
        EXTERNAL_AGENTS.map(async (agent) => {
          const cli = await cliOf(agent)
          return [
            agent,
            {
              installed: !!resolvePackage(EXTERNAL_PACKAGES[agent]),
              login: loginState(agent),
              cli,
              runtime: cli ? 'cli' : 'plugin',
            },
          ] as const
        }),
      ),
    ) as Record<string, { cli: unknown }>
    return {
      agents,
      bots: Object.fromEntries(
        (store?.list() ?? []).flatMap((b) =>
          b.external ? [[b.id, agents[b.external.agent]?.cli ? 'ready' : host.state(b.id)]] : [],
        ),
      ),
    }
  }
  const runView = (r: ExternalRunRecord) => ({
    ...r,
    elapsedMs: (r.finishedAt ? Date.parse(r.finishedAt) : Date.now()) - Date.parse(r.startedAt),
  })

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
            if (body.op === 'external-approve') {
              const b = body as { id?: unknown; allow?: unknown }
              const ok =
                typeof b.id === 'string' &&
                (hub.answer(b.id, b.allow === true) || answerOrphan(b.id, b.allow === true, 'user'))
              return json({ ok }, ok ? 200 : 404)
            }
            if (body.op === 'external-stop' && typeof (body as { run?: unknown }).run === 'string') {
              const run = (body as { run: string }).run
              await stopRun(run, 'user')
              const r = externals.get(run)
              return json({ ok: true, run: r ? runView(r) : null })
            }
            if (body.op === 'settings') {
              try {
                const next = cleanSettings((body as { patch?: unknown }).patch, settings())
                await settingsTable.put('commander', next)
                return json({ ok: true, settings: next })
              } catch (e) {
                if (e instanceof SettingsError) return json({ error: e.message }, 400)
                throw e
              }
            }
            // Văn phòng: dừng phiên của bot đang chạy, hay chen tin vào việc đang chạy ("Chèn vào việc", như
            // Telegram khi bot đang bận). Chỉ phiên mà đội đang chạy hay đang đợi mới nhận.
            if ((body.op === 'session-stop' || body.op === 'session-steer') && body.session) {
              const sid = body.session
              const live = (ctx.get('arisBots') as ArisBots | undefined)?.live
              const known =
                (live?.runningSessions() ?? []).includes(sid) || live?.sessionState(sid) === 'waiting'
              if (!known) return json({ error: 'Phiên này không đang chạy.' }, 409)
              const sc = ctx.get('sessionController') as SessionPort | undefined
              if (body.op === 'session-stop') {
                await sc?.cancel?.({ sessionId: SessionId(sid) })
                return json({ ok: true })
              }
              const text = String((body as { text?: unknown }).text ?? '').trim()
              if (!text || text.length > 4000) return json({ error: 'Tin nhắn trống hoặc quá dài.' }, 400)
              const opened = await sc?.resolveAgent?.(SessionId(sid)).catch(() => undefined)
              const agent =
                opened && 'agent' in opened
                  ? (opened.agent as { status: string; steer(m: unknown): void })
                  : undefined
              if (!agent || agent.status !== 'running')
                return json({ error: 'Phiên này không đang chạy.' }, 409)
              agent.steer(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
              return json({ ok: true })
            }
            // Văn phòng: gửi tin vào một phiên (bảng chat gọn). Bot đang chạy thì chèn vào việc hay xếp sau, phiên rảnh thì
            // chạy luôn; cùng cách Telegram và Lark gửi tin vào phiên.
            if (body.op === 'session-send') {
              const sc = ctx.get('sessionController') as SessionPort | undefined
              const out = await sessionSend(
                {
                  stopped: () =>
                    (ctx.get('arisGuard') as { stopped?(): boolean } | undefined)?.stopped?.() ?? false,
                  agentOf: async (sid) => {
                    const opened = await sc?.resolveAgent?.(SessionId(sid))
                    return opened && 'agent' in opened ? (opened.agent as SendAgent) : undefined
                  },
                  message: (text) =>
                    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
                  track: (sid, title) => {
                    const b = bots()
                    if (title && b) b.live.assigned(b.botOf(sid).id, title, sid)
                  },
                },
                body,
              )
              return json(out.body, out.status)
            }
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
          // ?external=<mã lần chạy>: một việc của bot ngoài (nhánh trong chat).
          const ext = q.get('external')
          if (ext) {
            const r = externals.get(ext)
            return json({ run: r ? runView(r) : null })
          }
          // ?approvals=<phiên>: yêu cầu quyền của bot ngoài đang chờ, cho thanh duyệt trên ô nhập.
          // ?approvals=all: mọi yêu cầu đang chờ (thanh bên, Hộp duyệt).
          const approvalsOf = q.get('approvals')
          if (approvalsOf)
            return json({
              approvals: center.list(approvalsOf === 'all' ? undefined : approvalsOf),
              doneToday: center.doneToday(),
            })
          // ?externals=1: plugin đã cài chưa, đã đăng nhập chưa, bot ngoài nào sẵn sàng.
          if (q.get('externals')) return json(await externalStatus())
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
          // `live`: lượt của bot nhận việc chưa kết thúc. Việc không có kết quả mà không còn chờ (giao
          // trước khi có ghi kết quả, hay daemon khởi động lại giữa chừng) là không rõ kết quả.
          const recent = [...log.entries()]
            .map(([k, r]) => ({ ...r, live: !r.outcome && awaiting.get(r.member) === k }))
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 50)
          return new Response(JSON.stringify({ recent, settings: settings(), learned: learned() }), {
            headers: { 'content-type': 'application/json; charset=utf-8' },
          })
        },
      })
      return () => void dispose()
    }, 'aris-commander: /api/aris/commander')
  })
}
