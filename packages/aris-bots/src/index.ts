/**
 * Bot của aris (đặc tả: docs/specs/aris-bots.md). Bot là dữ liệu của aris gắn vào phiên, không
 * phải preset của dsh (thành viên đội của dsh dùng chung preset với phiên chính):
 * - Kho bot, phòng ban, đội mẫu; `/api/aris/bots`.
 * - Gắn bot vào phiên: mở chat thẳng với bot, hoặc thành viên đội trùng tên gọi.
 * - Ngữ cảnh `aris:bot`: tính cách của bot và đội hình.
 * - Dịch vụ `arisBots` cho plugin khác (ký ức theo bot, giao việc).
 * @module @aris/bots
 */
import { ensureHome } from '@aris/home'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-workspace'
import { handleApi, type MemoryPort } from './api.js'
import { botsDomain, type ActivityRecord, type Table, type Tables } from './domain.js'
import { botStats, LiveTracker } from './live.js'
import { checkConnection, connectionOf, McpStore, needsAsk, pluginConfig, type McpRecord } from './mcp.js'
import { renderPersona } from './persona.js'
import { botDenyReason, botToolOf, denyReason, insideDir, needOf, writeTarget } from './policy.js'
import { SoulHistory, type SoulRecord } from './soul.js'
import { BotError, BotStore, COMMANDER_ID } from './store.js'
import { loadTemplates } from './templates.js'

export { renderPersona } from './persona.js'
export { LiveTracker, type ActivityItem, type BotLive, type LiveStatus } from './live.js'
export {
  BotError,
  BotStore,
  COMMANDER_ID,
  HANDLE_RE,
  suggestHandle,
  type BotInput,
  type Template,
} from './store.js'
export type { BotRecord, DepartmentRecord } from './domain.js'
export * from './external.js'
export * from './portable.js'
export * from './mcp.js'
export * from './soul.js'

export const name = 'aris-bots'
export const inject = ['storageDomain', 'systemPrompt', 'sessionController', 'workspaceRegistry', 'tools']

/** Ngữ cảnh tính cách: trước ký ức lõi (300) để model đọc "mình là ai" trước. */
export const CONTEXT_ORDER = 290

/** Dịch vụ cho plugin khác: bot của phiên, gắn bot, trạng thái trực tiếp. */
export interface ArisBots {
  botOf(sessionId: string | undefined): {
    id: string
    handle: string
    name: string
    kind: 'commander' | 'member'
  }
  tag(sessionId: string, bot: string, via: 'open' | 'team' | 'dispatch'): Promise<void>
  /** Phiên mới trong chat riêng gắn với bot (model riêng của bot), như bấm bot trên thanh bên. */
  open(botId: string): Promise<string>
  store: BotStore
  mcp: McpStore
  live: LiveTracker
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-bots')
  const domain = await ctx.storageDomain.open(botsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-bots: domain')
  const tables = Object.fromEntries(
    (['bots', 'departments', 'sessions', 'owner'] as const).map((t) => [t, domain.table(t)]),
  ) as unknown as Tables
  const store = new BotStore(tables)
  const mcp = new McpStore(domain.table('mcp') as unknown as Table<McpRecord>)
  const souls = new SoulHistory(domain.table('souls') as unknown as Table<SoulRecord>)
  await store.ensureCommander()
  await store.ensurePolicies(await loadTemplates())

  // Việc gần đây lưu bền: giữ 8 ngày (số liệu 7 ngày ở cột phải hồ sơ bot), tối đa 3.000 mục; nạp lại
  // 30 mục mới nhất khi khởi động.
  const activity = domain.table('activity') as unknown as Table<ActivityRecord>
  const keep = 3000
  const keepMs = 8 * 86_400_000
  const live = new LiveTracker(
    (sessionId) => store.botOf(sessionId).id,
    Date.now,
    (item) => {
      const rec: ActivityRecord = {
        bot: item.bot,
        kind: item.kind,
        at: item.at,
        ...(item.task ? { task: item.task } : {}),
      }
      void activity
        .put(`${item.at}-${Math.random().toString(36).slice(2, 8)}`, rec)
        .then(async () => {
          const all = [...activity.entries()].sort(([, a], [, b]) => b.at - a.at)
          const old = Date.now() - keepMs
          for (const [key, r] of all.slice(1)) if (r.at < old) await activity.delete(key)
          for (const [key] of all.slice(keep)) await activity.delete(key)
        })
        .catch((e: unknown) => logger.warn('lưu việc gần đây: %s', String(e)))
    },
  )
  live.restore([...activity.entries()].map(([, r]) => r))
  const service: ArisBots = {
    botOf: (id) => store.botOf(id),
    tag: (id, bot, via) => store.tag(id, bot, via).then(() => attachSession(id)),
    open: (id) => open(id),
    store,
    mcp,
    live,
  }
  ctx.provide('arisBots', service)

  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:bot',
        order: CONTEXT_ORDER,
        text: (c) =>
          renderPersona(store.botOf(c?.agent?.session.id), store.list(), store.departments(), store.owner()),
        interpolate: false,
        // Bot phải biết mình là ai kể cả khi tắt ngữ cảnh tuỳ chọn.
        required: true,
      }),
    'aris-bots: persona',
  )

  // Thành viên đội trùng tên gọi với một bot: dsh ghi `team/member` (đang tạo) vào phiên chính
  // trước khi phiên con chạy, nên gắn kịp trước lần gọi model đầu tiên của phiên con.
  // Cách xưng hô: bot hỏi người dùng lần đầu rồi lưu ở đây.
  ctx.tools.register(
    defineTool({
      name: 'xung_ho',
      description:
        'Lưu cách xưng hô với người dùng sau khi hỏi: tên, người dùng muốn được gọi là gì, bạn xưng là gì. Chỉ điền phần người dùng vừa nói; cả đội bot dùng chung.',
      parameters: {
        ten: { type: 'string', description: 'Tên người dùng.' },
        goi: { type: 'string', description: 'Gọi người dùng là gì, ví dụ "anh", "chị Hà", "bạn", "sếp".' },
        xung: { type: 'string', description: 'Bạn tự xưng là gì, ví dụ "em", "tôi", "mình".' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        const o = await store.setOwner({
          ...(args.ten !== undefined ? { name: args.ten } : {}),
          ...(args.goi !== undefined ? { call: args.goi } : {}),
          ...(args.xung !== undefined ? { self: args.xung } : {}),
        })
        return `Đã lưu: ${[o.name && `tên ${o.name}`, o.call && `gọi «${o.call}»`, o.self && `xưng «${o.self}»`].filter(Boolean).join(', ') || 'chưa có gì'}.`
      },
    }),
  )

  // Quyền theo chính sách phòng ban (2.6) và bộ công cụ riêng của bot (2.2): dùng công cụ ngoài quyền
  // thì bị chặn kèm lý do. Công cụ của kết nối MCP: hỏi người dùng theo cách đã chọn (2.2c).
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const sid = exec.agent?.session.id
      if (!sid) return next()
      const bot = store.botOf(sid)
      const need = needOf(exec.name, exec.arguments)
      const p = need ? store.policyOf(bot.id) : undefined
      if (need && p && !p.policy[need]) return { kind: 'deny', reason: denyReason(need, p.department?.name) }
      // Ghi tệp theo quyền riêng của bot: không ghi; chỉ trong thư mục làm việc; mọi nơi (ngoài thư
      // mục làm việc thì hỏi).
      const target = writeTarget(exec.name, exec.arguments)
      const rec = store.get(bot.id)
      if (target !== undefined && bot.kind !== 'commander') {
        const mode = rec?.perms?.write ?? 'anywhere'
        if (mode === 'none')
          return {
            kind: 'deny',
            reason: `Quyền của ${bot.name} không cho ghi, sửa tệp. Đừng thử lại cách khác để lách; báo người giao việc.`,
          }
        const dir = (exec.agent as { session: { header?: { cwd?: string } } }).session.header?.cwd
        if (dir && target && !insideDir(target, dir)) {
          if (mode === 'workspace')
            return {
              kind: 'deny',
              reason: `Quyền của ${bot.name} chỉ cho ghi trong thư mục làm việc ${dir}. Ghi vào đó, hoặc báo người giao việc nếu cần ghi chỗ khác.`,
            }
          return {
            kind: 'ask',
            reason: `${bot.name} ghi ngoài thư mục làm việc: ${target}`,
            displayReason: {
              en: `${bot.name} wants to write outside the working folder: ${target}`,
              vi: `${bot.name} muốn ghi ngoài thư mục làm việc: ${target}`,
            },
          }
        }
      }
      const own = botToolOf(exec.name, exec.arguments)
      if (own && rec?.tools?.[own] === false) return { kind: 'deny', reason: botDenyReason(own, bot.name) }
      if (exec.name.startsWith('mcp__')) {
        const hit = connectionOf(exec.name, mcp.list(bot.id))
        // Kết nối đã tắt hoặc gỡ nhưng phiên cũ còn công cụ: chặn.
        if (hit && !hit.rec.enabled)
          return { kind: 'deny', reason: `Kết nối ${hit.rec.name} của ${bot.name} đang tắt.` }
        if (hit && needsAsk(hit.rec, hit.raw))
          return {
            kind: 'ask',
            reason: `${bot.name} dùng ${hit.rec.name} · ${hit.raw}`,
            displayReason: {
              en: `${bot.name} wants to use ${hit.rec.name} · ${hit.raw}`,
              vi: `${bot.name} muốn dùng ${hit.rec.name} · ${hit.raw}`,
            },
          }
      }
      return next()
    },
    true,
  )

  // Kết nối nền tảng (2.2c): gắn máy chủ MCP của bot vào agent của phiên, chỉ agent đó thấy công cụ.
  // Gắn khi agent được tạo, hoặc ngay sau khi phiên được gắn bot (phiên chat riêng, thành viên đội).
  type AgentLike = { session: { id: string }; ctx: unknown }
  const agents = new Map<string, AgentLike>()
  const mounted = new WeakMap<AgentLike, Map<string, () => void>>()
  let homePath: string | undefined
  const cwd = async () =>
    (homePath ??=
      (await ensureHome(ctx.workspaceRegistry as never).catch(() => undefined))?.path ?? process.cwd())
  async function attach(agent: AgentLike) {
    const bot = store.botOf(agent.session.id)
    const list = mcp.list(bot.id).filter((r) => r.enabled)
    if (list.length === 0) return
    const have = mounted.get(agent) ?? new Map<string, () => void>()
    mounted.set(agent, have)
    const mod = await import('@deepseek-ai/dsh-mcp-client')
    const dir = await cwd()
    for (const r of list) {
      if (have.has(r.id)) continue
      try {
        const fiber = (agent.ctx as { plugin(p: unknown, c: unknown): { dispose(): unknown } }).plugin(
          mod,
          pluginConfig(r, dir),
        )
        have.set(r.id, () => void fiber.dispose())
      } catch (e) {
        logger.warn('gắn kết nối %s cho %s: %s', r.name, bot.handle, String(e))
      }
    }
  }
  const attachSession = (sessionId: string) => {
    const agent = agents.get(sessionId)
    if (agent) void attach(agent).catch((e: unknown) => logger.warn('gắn kết nối: %s', String(e)))
  }
  ctx.on('agent/created', ({ agent }) => {
    const a = agent as unknown as AgentLike
    agents.set(a.session.id, a)
    void attach(a).catch((e: unknown) => logger.warn('gắn kết nối: %s', String(e)))
  })
  ctx.on('agent/disposed', ({ agent }) => {
    const a = agent as unknown as AgentLike
    if (agents.get(a.session.id) === a) agents.delete(a.session.id)
  })
  const checkMcp = async (r: McpRecord) => {
    const { scrubbedParentEnv } = await import('@deepseek-ai/dsh-subprocess')
    return checkConnection(r, await cwd(), scrubbedParentEnv)
  }

  // Trạng thái trực tiếp: lượt bắt đầu, kết thúc; đợi anh duyệt hoặc trả lời.
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/start') live.turnStart(session.id)
    else if (event.type === 'turn/end')
      live.turnEnd(session.id, (event.data as unknown as { reason: { kind: string } }).reason.kind)
  })
  ctx.on(
    'approval/request',
    async (req, next) => {
      const id = req.agent.session.id
      // Quyền riêng của bot: thao tác cần duyệt thì tự từ chối, không hỏi người dùng.
      if (store.get(store.botOf(id).id)?.perms?.danger === 'deny') return 'rejected'
      live.waitStart(id)
      try {
        return await next()
      } finally {
        live.waitEnd(id)
      }
    },
    true,
  )
  ctx.on(
    'user-questions/request',
    async (req, next) => {
      const id = req.agent?.session.id
      if (!id) return next()
      live.waitStart(id)
      try {
        return await next()
      } finally {
        live.waitEnd(id)
      }
    },
    true,
  )

  ctx.on('session/event', (_session, event) => {
    if ((event.type as string) !== 'team/member') return
    const member = (event.data as unknown as { member?: { id?: string; name?: string; phase?: string } })
      .member
    if (!member?.id || !member.name || member.phase !== 'provisioning') return
    const bot = store.byHandle(member.name)
    if (!bot || bot.kind === 'commander' || store.tagOf(member.id)) return
    const sid = member.id
    store
      .tag(sid, bot.id, 'team')
      .then(() => attachSession(sid))
      .catch((e: unknown) => logger.warn('gắn bot cho thành viên đội: %s', String(e)))
  })

  async function open(botId: string): Promise<string> {
    const bot = store.get(botId)!
    const home = await ensureHome(ctx.workspaceRegistry as never)
    const { sessionId } = await ctx.sessionController.create({ workspaceId: home.workspaceId as never })
    if (bot.kind !== 'commander') {
      await store.tag(sessionId, bot.id, 'open')
      attachSession(sessionId)
    }
    // Model riêng của bot, không có thì model mặc định của phòng.
    const model = store.effectiveModel(bot.id)
    if (model)
      await ctx.sessionController
        .selectModel({
          sessionId: SessionId(sessionId),
          provider: model.provider,
          model: model.model,
        })
        .catch((e: unknown) => logger.warn('chọn model cho %s: %s', bot.handle, String(e)))
    return sessionId
  }

  // "Nhờ Aris viết lại" tính cách: model của Commander, không có thì model vừa dùng gần nhất.
  let lastModel: { provider: string; model: string } | undefined
  ctx.on('session/event', (_session, event) => {
    if (event.type !== 'assistant/message') return
    const src = (event.data as unknown as { source?: { provider?: string; model?: string } }).source
    if (src?.provider && src.model) lastModel = { provider: src.provider, model: src.model }
  })
  async function rewrite(prompt: string, signal?: AbortSignal): Promise<string> {
    // Model của Commander; không đặt thì model mặc định của dsh; cuối cùng là model vừa dùng gần nhất.
    const fallback = await ctx.sessionController
      .modelCatalog()
      .then((c) =>
        c.default?.provider && c.default.model
          ? { provider: c.default.provider, model: c.default.model }
          : undefined,
      )
      .catch(() => undefined)
    const model = store.effectiveModel(COMMANDER_ID) ?? fallback ?? lastModel
    if (!model)
      throw new BotError('Chưa có model nào để viết: chọn model mặc định ở Cài đặt › Provider rồi thử lại.')
    const llm = ctx.get('llm') as
      { stream(o: Record<string, unknown>): AsyncIterable<{ type: string; text?: string }> } | undefined
    if (!llm) throw new BotError('Chưa gọi được model.')
    let out = ''
    for await (const chunk of llm.stream({
      provider: model.provider,
      model: model.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      maxTokens: 4000,
      ...(signal ? { signal } : {}),
    }))
      if (chunk.type === 'text-delta' && chunk.text) out += chunk.text
    return out
  }

  async function catalog() {
    const c = await ctx.sessionController.modelCatalog()
    return c.groups.map((g) => ({
      id: g.id,
      name: g.name,
      models: g.models.filter((m) => !m.id.endsWith(':batch')).map((m) => ({ id: m.id, name: m.name })),
    }))
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/bots',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) =>
          handleApi(
            {
              store,
              templates: () => loadTemplates(),
              open,
              catalog,
              live: () => live.snapshot(store.list().map((b) => b.id)),
              memory: () => ctx.get('arisMemory') as MemoryPort | undefined,
              profile: (bot) => {
                const mem = ctx.get('arisMemory') as
                  | { statsOf(bot: string): { core: { used: number; cap: number }; recent: unknown[] } }
                  | undefined
                const spend = ctx.get('arisSpend') as { botWeek?(bot: string): number } | undefined
                return {
                  live: live.of(bot),
                  week: botStats(
                    [...activity.entries()].map(([, r]) => r),
                    bot,
                  ),
                  costWeek: spend?.botWeek?.(bot) ?? null,
                  memory: mem?.statsOf(bot) ?? null,
                }
              },
              mcp,
              checkMcp,
              souls,
              rewrite,
              spend: () =>
                (ctx.get('arisSpend') as { today(): Record<string, number> } | undefined)?.today() ?? {},
            },
            request,
          ),
      })
      return () => void dispose()
    }, 'aris-bots: /api/aris/bots')
  })
}
