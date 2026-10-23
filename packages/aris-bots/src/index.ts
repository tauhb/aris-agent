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
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import type {} from '@deepseek-ai/dsh-workspace'
import { handleApi } from './api.js'
import { botsDomain, type ActivityRecord, type Table, type Tables } from './domain.js'
import { LiveTracker } from './live.js'
import { renderPersona } from './persona.js'
import { BotStore } from './store.js'
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

export const name = 'aris-bots'
export const inject = ['storageDomain', 'systemPrompt', 'sessionController', 'workspaceRegistry']

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
  store: BotStore
  live: LiveTracker
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-bots')
  const domain = await ctx.storageDomain.open(botsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-bots: domain')
  const tables = Object.fromEntries(
    (['bots', 'departments', 'sessions'] as const).map((t) => [t, domain.table(t)]),
  ) as unknown as Tables
  const store = new BotStore(tables)
  await store.ensureCommander()

  // Việc gần đây lưu bền: giữ 30 mục mới nhất, nạp lại khi khởi động.
  const activity = domain.table('activity') as unknown as Table<ActivityRecord>
  const keep = 30
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
          for (const [key] of all.slice(keep)) await activity.delete(key)
        })
        .catch((e: unknown) => logger.warn('lưu việc gần đây: %s', String(e)))
    },
  )
  live.restore([...activity.entries()].map(([, r]) => r))
  const service: ArisBots = {
    botOf: (id) => store.botOf(id),
    tag: (id, bot, via) => store.tag(id, bot, via),
    store,
    live,
  }
  ctx.provide('arisBots', service)

  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:bot',
        order: CONTEXT_ORDER,
        text: (c) => renderPersona(store.botOf(c.agent?.session.id), store.list(), store.departments()),
        interpolate: false,
        // Bot phải biết mình là ai kể cả khi tắt ngữ cảnh tuỳ chọn.
        required: true,
      }),
    'aris-bots: persona',
  )

  // Thành viên đội trùng tên gọi với một bot: dsh ghi `team/member` (đang tạo) vào phiên chính
  // trước khi phiên con chạy, nên gắn kịp trước lần gọi model đầu tiên của phiên con.
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
    store
      .tag(member.id, bot.id, 'team')
      .catch((e: unknown) => logger.warn('gắn bot cho thành viên đội: %s', String(e)))
  })

  async function open(botId: string): Promise<string> {
    const bot = store.get(botId)!
    const home = await ensureHome(ctx.workspaceRegistry as never)
    const { sessionId } = await ctx.sessionController.create({ workspaceId: home.workspaceId as never })
    if (bot.kind !== 'commander') await store.tag(sessionId, bot.id, 'open')
    if (bot.model)
      await ctx.sessionController
        .selectModel({
          sessionId: SessionId(sessionId),
          provider: bot.model.provider,
          model: bot.model.model,
        })
        .catch((e: unknown) => logger.warn('chọn model cho %s: %s', bot.handle, String(e)))
    return sessionId
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
            },
            request,
          ),
      })
      return () => void dispose()
    }, 'aris-bots: /api/aris/bots')
  })
}
