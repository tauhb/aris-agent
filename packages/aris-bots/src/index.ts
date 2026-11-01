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
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-workspace'
import { handleApi, type MemoryPort } from './api.js'
import { botsDomain, type ActivityRecord, type Table, type Tables } from './domain.js'
import { pickSessions, type SessionRow } from './sessions.js'
import { botStats, LiveTracker } from './live.js'
import { catalogView } from './catalog.js'
import {
  checkConnection,
  connectionOf,
  isOAuth,
  McpStore,
  needsAsk,
  pluginConfig,
  type McpCheck,
  type McpRecord,
} from './mcp.js'
import {
  callbackPage,
  McpOAuth,
  OAUTH_CALLBACK_PATH,
  OAuthLoginNeeded,
  type OAuthTarget,
} from './mcp-oauth.js'
import { renderPersona } from './persona.js'
import { botDenyReason, botToolOf, denyReason, insideDir, needOf, writeTarget } from './policy.js'
import { SoulHistory, type SoulRecord } from './soul.js'
import { registerManageTools } from './manage-tools.js'
import { OWNER_ID, PeopleStore, type PersonRecord, type ThreadRecord } from './people.js'
import { BotError, BotStore, COMMANDER_ID } from './store.js'
import { loadTemplates } from './templates.js'

export { renderPersona } from './persona.js'
export { LiveTracker, type ActivityItem, type BotLive, type LiveStatus } from './live.js'
export {
  BotError,
  BotStore,
  COMMANDER_ID,
  HANDLE_RE,
  LIBRARIAN_ID,
  suggestHandle,
  type BotInput,
  type Template,
} from './store.js'
export type { BotRecord, DepartmentRecord } from './domain.js'
export * from './external.js'
export * from './portable.js'
export * from './mcp.js'
export * from './mcp-import.js'
export * from './soul.js'
export * from './manage.js'
export * from './people.js'

export const name = 'aris-bots'
export const inject = [
  'storageDomain',
  'systemPrompt',
  'sessionController',
  'workspaceRegistry',
  'tools',
  'credentials',
]

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
  tag(sessionId: string, bot: string, via: 'open' | 'team' | 'dispatch' | 'acp'): Promise<void>
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
  // Đăng nhập OAuth cho MCP hosted (GĐ8.5): token ở kho khoá, gọi về qua web aris.
  const webUrl = () => (ctx.get('webApp') as { getAdvertisedUrl(): string } | undefined)?.getAdvertisedUrl()
  const oauth = new McpOAuth({
    keys: {
      resolve: async (ref) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
      set: (ref, value) => ctx.credentials.set(credentialRef(ref), value),
      unset: (ref) => ctx.credentials.unset(credentialRef(ref)),
    },
    redirectUrl: () => {
      const w = webUrl()
      return w ? new URL(OAUTH_CALLBACK_PATH, w).toString() : undefined
    },
  })
  const targetOf = (r: McpRecord): OAuthTarget => ({
    id: r.id,
    url: r.url ?? '',
    clientId: r.secrets.CLIENT_ID,
    clientSecret: r.secrets.CLIENT_SECRET,
  })
  /** Báo chủ một lần mỗi lần kết nối chuyển sang "Cần đăng nhập lại" (qua Telegram nếu có). */
  const needLogin = async (r: McpRecord, why: string) => {
    const was = mcp.get(r.id)?.oauth?.state
    await mcp.setOAuth(r.id, { state: 'login', at: new Date().toISOString(), error: why })
    if (was === 'ok')
      await (ctx.get('arisChannels') as { sendHome?(bot: string, md: string): Promise<unknown> } | undefined)
        ?.sendHome?.(
          'aris',
          `Kết nối **${r.name}** cần đăng nhập lại (${why}). Mở Cài đặt › Kết nối trên web.`,
        )
        .catch(() => undefined)
  }
  /** Token truy cập của kết nối OAuth; không có thì chuyển "Cần đăng nhập lại" và trả undefined. */
  const bearerOf = async (r: McpRecord): Promise<string | undefined> => {
    try {
      return await oauth.token(targetOf(r))
    } catch (e) {
      if (e instanceof OAuthLoginNeeded) await needLogin(r, e.message)
      else logger.warn('token %s: %s', r.name, String(e))
      return undefined
    }
  }
  const souls = new SoulHistory(domain.table('souls') as unknown as Table<SoulRecord>)
  await store.ensureCommander()
  // Aris quản đội (GĐ9.2): tạo bot, sửa và khôi phục lời dặn bằng lời, luôn qua thẻ duyệt.
  registerManageTools(ctx, store, souls)

  // Người và luồng (GĐ9.6a): người "chủ"; luồng web của chủ với từng bot dựng từ phiên gần nhất (lần đầu).
  const people = new PeopleStore(
    domain.table('people') as unknown as Table<PersonRecord>,
    domain.table('threads') as unknown as Table<ThreadRecord>,
  )
  await people.ensureOwner(store.owner().name ?? 'Chủ')
  for (const b of store.list()) {
    const last = store.latestOpen(b.id)
    if (
      last &&
      !people.current(b.id, OWNER_ID, 'direct', 'web') &&
      !people.current(b.id, OWNER_ID, 'direct', 'shared')
    )
      await people.touch({
        bot: b.id,
        person: OWNER_ID,
        kind: 'direct',
        channel: 'web',
        session: last,
        via: 'web',
      })
  }
  /** Luồng chung của chủ trên mọi kênh (công tắc ở trang Kênh, `@aris/channels`). */
  const sharedThreads = () =>
    (ctx.get('arisChannels') as { sharedThreads?(): boolean } | undefined)?.sharedThreads?.() === true
  const ownerChannel = () => (sharedThreads() ? 'shared' : 'web') as 'shared' | 'web'
  ctx.provide('arisPeople', {
    store: people,
    shared: sharedThreads,
  })
  await store.ensurePolicies(await loadTemplates())

  // Việc gần đây lưu bền: giữ 8 ngày (số liệu 7 ngày ở cột phải hồ sơ bot), tối đa 3.000 mục; nạp lại
  // 200 mục mới nhất khi khởi động (cột "Vừa làm gì" của Văn phòng xem được 7 ngày).
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
        ...(item.session ? { session: item.session } : {}),
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
      name: 'save_address_style',
      description:
        'Lưu cách xưng hô với người dùng sau khi hỏi: tên, người dùng muốn được gọi là gì, bạn xưng là gì. Chỉ điền phần người dùng vừa nói; cả đội bot dùng chung.',
      parameters: {
        name: { type: 'string', description: 'Tên người dùng.' },
        call: { type: 'string', description: 'Gọi người dùng là gì, ví dụ "anh", "chị Hà", "bạn", "sếp".' },
        self: { type: 'string', description: 'Bạn tự xưng là gì, ví dụ "em", "tôi", "mình".' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args) {
        const o = await store.setOwner({
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.call !== undefined ? { call: args.call } : {}),
          ...(args.self !== undefined ? { self: args.self } : {}),
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
        const hit = connectionOf(exec.name, mcp.forBot(bot))
        // Kết nối đã tắt hoặc gỡ nhưng phiên cũ còn công cụ: chặn.
        if (hit && !hit.rec.enabled)
          return { kind: 'deny', reason: `Kết nối ${hit.rec.name} của ${bot.name} đang tắt.` }
        if (hit && needsAsk(hit.rec, hit.raw, bot.id))
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
    const list = mcp.forBot(bot).filter((r) => r.enabled)
    if (list.length === 0) return
    const have = mounted.get(agent) ?? new Map<string, () => void>()
    mounted.set(agent, have)
    const mod = await import('@deepseek-ai/dsh-mcp-client')
    const dir = await cwd()
    for (const r of list) {
      if (have.has(r.id)) continue
      // Kết nối OAuth: làm mới token trước khi gắn; chưa đăng nhập thì bỏ qua (công cụ không hiện).
      const bearer = isOAuth(r) ? await bearerOf(r) : undefined
      if (isOAuth(r) && !bearer) continue
      try {
        const fiber = (agent.ctx as { plugin(p: unknown, c: unknown): { dispose(): unknown } }).plugin(
          mod,
          pluginConfig(r, dir, bearer),
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
  const checkMcp = async (r: McpRecord): Promise<McpCheck> => {
    const { scrubbedParentEnv } = await import('@deepseek-ai/dsh-subprocess')
    if (!isOAuth(r)) return checkConnection(r, await cwd(), scrubbedParentEnv)
    const bearer = await bearerOf(r)
    if (!bearer) return { ok: false, at: new Date().toISOString(), error: 'Cần đăng nhập', tools: [] }
    const c = await checkConnection(r, await cwd(), scrubbedParentEnv, 60_000, bearer)
    // Máy chủ từ chối token còn hạn (bị thu hồi): phải đăng nhập lại.
    if (!c.ok && /401|Unauthorized/i.test(c.error ?? '')) await needLogin(r, 'máy chủ từ chối token')
    else if (c.ok) await mcp.setOAuth(r.id, { state: 'ok', at: c.at })
    return c
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

  // Danh sách phiên (thư mục làm việc, phiên cha) đọc lại tối đa mỗi phút: dùng cho "nơi học".
  let sessionList:
    { at: number; items: { sessionId: string; cwd?: string; parentSessionId?: string }[] } | undefined
  async function listSessions() {
    if (sessionList && Date.now() - sessionList.at < 60_000) return sessionList.items
    const ac = new AbortController()
    const v = (await ctx.sessionController.list({}, ac.signal).catch(() => undefined)) as
      { items: { sessionId: string; cwd?: string; parentSessionId?: string }[] } | undefined
    sessionList = { at: Date.now(), items: v?.items ?? [] }
    return sessionList.items
  }

  /**
   * Nơi học của ký ức: tên phiên (bỏ tiền tố "[Phòng nhóm · …]" của phiên con; trống thì lấy tên
   * phiên cha), dự án (theo thư mục làm việc của phiên hoặc phiên cha), Telegram.
   */
  async function sessionSources(ids: readonly string[]) {
    const out = new Map<
      string,
      { sessionTitle?: string; project?: string; workspace?: string; channel?: 'telegram' }
    >()
    if (!ids.length) return out
    const items = await listSessions()
    const byId = new Map(items.map((x) => [String(x.sessionId), x]))
    const parentOf = (id: string) => byId.get(id)?.parentSessionId
    const want = [...new Set(ids.flatMap((id) => [id, parentOf(id)].filter((x): x is string => !!x)))]
    const titles = new Map<string, string>()
    const query = ctx.get('sessionQuery') as
      | {
          readTitleSnapshots(
            ids: unknown[],
          ): Promise<{ sessionId: string; status: string; value?: { title?: { title?: string } } }[]>
        }
      | undefined
    await query
      ?.readTitleSnapshots(want.map((id) => SessionId(id)))
      .then((rs) => {
        for (const r of rs)
          if (r.status === 'fulfilled' && r.value?.title?.title) titles.set(r.sessionId, r.value.title.title)
      })
      .catch(() => undefined)
    const clean = (t: string | undefined) => t?.replace(/^\[[^\]]*(\]|$)\s*/, '').trim() || undefined
    const reg = ctx.workspaceRegistry as unknown as {
      list(): { id: string; title: string; path: string; sessionIds: readonly string[] }[]
    }
    const home = (await ensureHome(ctx.workspaceRegistry as never).catch(() => undefined))?.workspaceId
    const projects = reg.list().filter((w) => w.id !== home)
    const under = (dir: string | undefined) =>
      dir
        ? projects.find((w) => dir === w.path || dir.startsWith(`${w.path.replace(/\/+$/, '')}/`))
        : undefined
    const channels = ctx.get('arisChannels') as { isChannelSession?(id: string): boolean } | undefined
    for (const id of ids) {
      const parent = parentOf(id)
      const ws =
        projects.find((w) => w.sessionIds.includes(id) || (parent && w.sessionIds.includes(parent))) ??
        under(byId.get(id)?.cwd) ??
        under(parent ? byId.get(parent)?.cwd : undefined)
      const title = clean(titles.get(id)) ?? (parent ? clean(titles.get(parent)) : undefined)
      out.set(id, {
        ...(title ? { sessionTitle: title } : {}),
        ...(ws ? { project: ws.title, workspace: ws.id } : {}),
        ...(channels?.isChannelSession?.(id) || (parent && channels?.isChannelSession?.(parent))
          ? { channel: 'telegram' as const }
          : {}),
      })
    }
    return out
  }

  // Cột phải hồ sơ bot: số liệu 7 ngày, chi phí, ký ức lõi, ký ức mới học kèm nơi học (tên phiên,
  // dự án, Telegram).
  async function profile(bot: string) {
    type Recent = { sessionId?: string } & Record<string, unknown>
    const mem = ctx.get('arisMemory') as
      { statsOf(bot: string): { core: { used: number; cap: number }; recent: Recent[] } } | undefined
    const spend = ctx.get('arisSpend') as { botWeek?(bot: string): number } | undefined
    const memory = mem?.statsOf(bot) ?? null
    if (memory?.recent.length) {
      const sources = await sessionSources(memory.recent.flatMap((r) => (r.sessionId ? [r.sessionId] : [])))
      memory.recent = memory.recent.map((r) => (r.sessionId ? { ...r, ...sources.get(r.sessionId) } : r))
    }
    return {
      live: live.of(bot),
      week: botStats(
        [...activity.entries()].map(([, r]) => r),
        bot,
      ),
      costWeek: spend?.botWeek?.(bot) ?? null,
      memory,
    }
  }

  // Trạng thái trực tiếp kèm tên phiên đang chạy hay đang đợi (dòng việc của bot khi chưa có việc được giao).
  // Tên nhớ 5 phút; phiên chưa có tên thì hỏi lại sau 20 giây.
  const titleCache = new Map<string, { title: string; at: number }>()
  async function titlesFor(ids: readonly string[]): Promise<Record<string, string>> {
    const now = Date.now()
    const stale = (id: string) => {
      const c = titleCache.get(id)
      return !c || now - c.at > (c.title ? 300_000 : 20_000)
    }
    const want = ids.filter(stale)
    const query = ctx.get('sessionQuery') as
      | {
          readTitleSnapshots(
            ids: unknown[],
          ): Promise<{ sessionId: string; status: string; value?: { title?: { title?: string } } }[]>
        }
      | undefined
    if (want.length && query) {
      const rs = await query.readTitleSnapshots(want.map((id) => SessionId(id))).catch(() => [])
      const got = new Set<string>()
      for (const r of rs)
        if (r.status === 'fulfilled') {
          // Bỏ tiền tố "[Phòng nhóm · …]" của phiên con.
          const title = r.value?.title?.title?.replace(/^\[[^\]]*(\]|$)\s*/, '').trim() ?? ''
          titleCache.set(r.sessionId, { title, at: now })
          got.add(r.sessionId)
        }
      for (const id of want) if (!got.has(id)) titleCache.set(id, { title: '', at: now })
    }
    return Object.fromEntries(
      ids.flatMap((id) => {
        const t = titleCache.get(id)?.title
        return t ? [[id, t]] : []
      }),
    )
  }

  /**
   * Dấu của đội (bot, tên, phòng, linh vật, hai công tắc), gửi kèm trạng thái trực tiếp: giao diện thấy dấu đổi thì tải
   * lại đội ngay (ví dụ Aris vừa tạo bot), không đợi lượt tải 30 giây.
   */
  const teamStamp = (bots: ReturnType<BotStore['list']>) => {
    let h = 5381
    for (const ch of bots
      .map((b) =>
        [
          b.id,
          b.name,
          b.role,
          b.department ?? '',
          b.mascot,
          b.skillsOnlyAssigned,
          b.connectorsOnlyAssigned,
        ].join(':'),
      )
      .join('|'))
      h = ((h << 5) + h + ch.charCodeAt(0)) | 0
    return (h >>> 0).toString(36)
  }

  async function liveView() {
    const snap = live.snapshot(store.list().map((b) => b.id))
    const ids = [...new Set(Object.values(snap.status).flatMap((l) => l.sessions))]
    return { ...snap, titles: await titlesFor(ids), team: teamStamp(store.list()) }
  }

  // Phiên gần đây của một bot cho ô chọn phiên ở bảng chat Văn phòng (`?sessions=<bot>`): tối đa 5 phiên có nội dung,
  // mới sửa trước. Bot trong đội: phiên đã gắn bot (chat riêng, phiên nhận việc). Aris: phiên chat riêng trong nhà
  // chưa gắn bot nào và không phải phiên con.
  async function botSessions(botId: string) {
    const bot = store.get(botId)
    if (!bot || bot.external) return []
    const ac = new AbortController()
    const listed = (await ctx.sessionController.list({}, ac.signal).catch(() => undefined)) as
      { items: SessionRow[] } | undefined
    const rows = new Map((listed?.items ?? []).map((x) => [String(x.sessionId), x]))
    let ids: string[]
    if (bot.kind === 'commander') {
      const home = (await ensureHome(ctx.workspaceRegistry as never).catch(() => undefined))?.workspaceId
      const reg = ctx.workspaceRegistry as unknown as {
        list(): { id: string; sessionIds: readonly string[] }[]
      }
      ids = (reg.list().find((w) => w.id === home)?.sessionIds ?? [])
        .map(String)
        .filter((id) => !store.tagOf(id) && !rows.get(id)?.parentSessionId)
    } else ids = store.sessionsOf(bot.id)
    return pickSessions(ids, rows, await titlesFor(ids), 5)
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
              live: liveView,
              memory: () => ctx.get('arisMemory') as MemoryPort | undefined,
              profile: (bot) => profile(bot),
              sessions: (bot) => botSessions(bot),
              mcp,
              checkMcp,
              connectors: catalogView,
              oauth: {
                start: (r) => oauth.begin(targetOf(r)),
                forget: (id) => oauth.forget(id),
              },
              souls,
              rewrite,
              threads: {
                current: (bot) => people.current(bot, OWNER_ID, 'direct', ownerChannel()),
                opened: async (bot, session) => {
                  await people.touch({
                    bot,
                    person: OWNER_ID,
                    kind: 'direct',
                    channel: ownerChannel(),
                    session,
                    via: 'web',
                  })
                },
              },
              spend: () =>
                (ctx.get('arisSpend') as { today(): Record<string, number> } | undefined)?.today() ?? {},
            },
            request,
          ),
      })
      return () => void dispose()
    }, 'aris-bots: /api/aris/bots')
    // Trang gọi về của OAuth: kiểm state, đổi mã lấy token, kiểm tra kết nối, rồi báo trong cửa sổ đăng nhập.
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: OAUTH_CALLBACK_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const id = await oauth.finish(new URL(request.url).searchParams)
            const r = mcp.get(id)
            if (!r) return callbackPage(false, 'Kết nối đã bị gỡ.')
            await mcp.setOAuth(id, { state: 'ok', at: new Date().toISOString() })
            const c = await checkMcp(mcp.get(id)!)
            await mcp.setCheck(id, c)
            return callbackPage(
              true,
              c.ok
                ? `Đã đăng nhập ${r.name} · ${c.tools.length} công cụ. Có thể đóng cửa sổ này.`
                : `Đã đăng nhập ${r.name}, nhưng kiểm tra chưa được: ${c.error ?? ''}`,
            )
          } catch (e) {
            return callbackPage(false, `Đăng nhập chưa được: ${e instanceof Error ? e.message : String(e)}`)
          }
        },
      })
      return () => void dispose()
    }, 'aris-bots: gọi về OAuth')
  })
}
