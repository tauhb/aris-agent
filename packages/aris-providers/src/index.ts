/**
 * Phần riêng của aris cho nhà cung cấp model (đặc tả: docs/specs/aris-providers.md).
 * Lõi (route, khoá, danh mục model) là của dsh; plugin này thêm:
 * - `/api/aris/providers/probe`: gọi thử một model để đo kết nối (trang 6.2).
 * - Thứ tự dự phòng giữa các nhà cung cấp và vòng khoá (đổi khoá khi chạm giới hạn).
 * - Sổ chi phí theo bảng giá của pi-ai; `/api/aris/providers/state` cho trang 6.2 và thanh bên.
 * @module @aris/providers
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { chainOf, handleState } from './api.js'
import { providersDomain, type Link, type SwitchRecord, type Table } from './domain.js'
import { classify, Router, type Failure } from './fallback.js'
import { KeyPools } from './keys.js'
import { dayOf, Ledger } from './ledger.js'
import { createPrices } from './prices.js'
import { probe, probeInputError } from './probe.js'

export * from './probe.js'
export { classify, nextLink, Router } from './fallback.js'
export { KeyPools, fingerprint } from './keys.js'
export { Ledger, dayOf } from './ledger.js'
export { costOf, createPrices } from './prices.js'

export const name = 'aris-providers'
export const inject = ['llm', 'storageDomain', 'credentials']

/** Bản ghi trong log phiên mỗi lần chuyển dự phòng. */
export const SWITCH_RECORD = 'plugin:aris/provider-switch'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/provider-switch': { from: Link; to: Link; code: string; message: string }
  }
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Báo chuyển dự phòng: hiện thành dòng "notice", model cũng đọc. */
    'aris-provider': { kind: 'aris-provider' } & ContextFormed
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** POST { provider, model } → { ok, ms, error? }. dsh đã kiểm cookie và quyền chủ nhân. */
export async function handleProbe(ctx: Context, request: Request): Promise<Response> {
  let body: { provider?: unknown; model?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const invalid = probeInputError(body.provider, body.model)
  if (invalid) return json({ error: invalid }, 400)
  return json(await probe((o) => ctx.llm.stream(o), body.provider as string, body.model as string))
}

const REASON: Record<string, string> = {
  key: 'báo lỗi khoá hoặc hết tiền',
  rate: 'đang giới hạn tốc độ',
  transient: 'lỗi liên tục',
  missing: 'không có model này hoặc không nhận nổi yêu cầu cỡ này',
  overflow: 'không nhận nổi yêu cầu cỡ này',
}

export function switchNotice(from: Link, to: Link, f: Failure): string {
  return `Lượt này chuyển sang ${to.provider} · ${to.model} vì ${from.provider} · ${from.model} ${REASON[classify(f)] ?? 'lỗi'} (${f.code}${f.status ? ` ${f.status}` : ''}). Lượt sau dùng lại model đã chọn.`
}

interface AgentLike {
  session: {
    id: string
    requestHeader(): { config?: { model?: string } } | undefined
  }
}

interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-providers')
  const domain = await ctx.storageDomain.open(providersDomain)
  ctx.effect(() => () => void domain.close(), 'aris-providers: domain')
  const t = <K extends keyof typeof providersDomain.tables>(k: K) =>
    domain.table(k) as unknown as Table<never>
  const chain = t('chain') as Table<{ links: Link[] }>
  const switches = t('switches') as Table<SwitchRecord>

  // Bot và phòng ban của phiên (gói @aris/bots); không có gói đó thì coi như phiên của Commander.
  const arisBots = () =>
    ctx.get('arisBots') as
      | {
          store: {
            tagOf(id: string): { bot: string; via: string } | undefined
            botOf(id: string): { id: string; kind: string; department?: string }
            get(id: string): { models?: { goal?: Link; fallback?: Link } } | undefined
            effectiveModel(id: string): Link | undefined
            policyOf(id: string):
              | {
                  department?: { id: string; name: string }
                  policy: { budgetUsd?: number; onBudget: 'stop' | 'warn' }
                }
              | undefined
          }
        }
      | undefined
  const departmentOf = (sessionId: string) => {
    const bot = arisBots()?.store.botOf(sessionId)
    return bot?.kind === 'member' ? bot.department : undefined
  }

  const prices = createPrices()
  const ledger = new Ledger(t('ledger'), prices, t('spend'))
  // Chi phí hôm nay theo phòng ban: @aris/bots đọc để áp trần ngân sách và hiện ở trang Phòng ban.
  ctx.provide('arisSpend', {
    today: () => ledger.spentToday(),
    /** Chi phí 7 ngày của một bot (cột phải hồ sơ bot). */
    botWeek: (bot: string) => ledger.spentWeek(`bot:${bot}`),
  })
  const pools = new KeyPools(t('pools'), {
    resolve: async (ref) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
    set: (ref, value) => ctx.credentials.set(credentialRef(ref), value),
    unset: (ref) => ctx.credentials.unset(credentialRef(ref)),
  })

  // Số token của lần gọi gần nhất mỗi phiên: mắt xích dự phòng phải chứa nổi.
  const lastTokens = new Map<string, number>()
  const agents = new Map<string, AgentLike>()
  // Dòng báo chuyển dự phòng chờ gắn vào bước kế tiếp của phiên.
  const notices = new Map<string, unknown[]>()

  const router = new Router({
    chain: () => chainOf(chain),
    pools,
    async fits(sessionId, l) {
      try {
        const info = await ctx.llm.resolveModelInfo(l.provider, l.model)
        const window = info.context?.contextWindow
        return !window || window > (lastTokens.get(sessionId) ?? 0)
      } catch {
        return false
      }
    },
    switched(sessionId, from, to, f) {
      logger.info(
        '%s: chuyển %s/%s → %s/%s (%s)',
        sessionId,
        from.provider,
        from.model,
        to.provider,
        to.model,
        f.code,
      )
      const agent = agents.get(sessionId)
      if (!agent) return
      try {
        appendPluginRecord(agent.session as never, SWITCH_RECORD, {
          from,
          to,
          code: f.code,
          message: f.message,
        })
      } catch (e) {
        logger.warn('ghi bản ghi chuyển dự phòng: %s', String(e))
      }
      // Không chèn giữa bước (sẽ đánh thức thêm một bước gọi model); gắn vào bước kế tiếp.
      const list = notices.get(sessionId) ?? []
      list.push(
        createUserMessage({
          content: [{ type: 'text', text: switchNotice(from, to, f) }],
          source: { kind: 'aris-provider', form: 'notice', summary: `${from.provider} → ${to.provider}` },
        }),
      )
      notices.set(sessionId, list)
    },
    remember: async (sessionId, rec) => {
      const key = sessionId.replace(/[^A-Za-z0-9-]/g, '-')
      if (rec) await switches.put(key, rec)
      else await switches.delete(key)
    },
    recall: (sessionId) => switches.get(sessionId.replace(/[^A-Za-z0-9-]/g, '-')),
    botModel(sessionId) {
      // Phiên bot được giao việc (thành viên đội) dùng model riêng của bot, không có thì model
      // mặc định của phòng; phiên chat thẳng với bot đã chọn model lúc mở nên không đè lựa chọn của anh.
      const bots = arisBots()
      const tag = bots?.store.tagOf(sessionId)
      if (!tag || tag.via === 'open') return undefined
      return bots!.store.effectiveModel(tag.bot)
    },
    // Model theo việc của bot (bản vẽ 2.2, tab Model): phiên đang chạy /goal dùng model /goal của bot.
    goalModel(sessionId) {
      const bots = arisBots()
      const goal = bots?.store.get(bots.store.botOf(sessionId).id)?.models?.goal
      const agent = agents.get(sessionId)
      if (!goal || !agent) return undefined
      const svc = ctx.get('goals') as { get(agent: unknown): { phase: string } | undefined } | undefined
      try {
        return svc?.get(agent)?.phase === 'active' ? goal : undefined
      } catch {
        return undefined
      }
    },
    // Dự phòng riêng của bot thử trước chuỗi dự phòng chung.
    botFallback(sessionId) {
      const bots = arisBots()
      return bots?.store.get(bots.store.botOf(sessionId).id)?.models?.fallback
    },
    logger,
  })

  // Đăng ký trước (prepend) để đứng ngoài bộ chọn model của dsh: nhận cấu hình nó đã chọn rồi đổi.
  ctx.on(
    'agent/request',
    async ({ agent, turn, step }, next) => {
      agents.set((agent as unknown as AgentLike).session.id, agent as unknown as AgentLike)
      const resolved = await next()
      return (await router.request(agent.session.id, turn, step, resolved as never)) as typeof resolved
    },
    true,
  )
  ctx.on(
    'agent/request-error',
    async ({ agent, turn, step, provider, failure }, next) => {
      const a = agent as unknown as AgentLike
      agents.set(a.session.id, a)
      const model = a.session.requestHeader()?.config?.model ?? ''
      return router.error(a.session.id, turn, step, provider, model, failure, next)
    },
    true,
  )
  // Gắn dòng báo vào bước kế tiếp (cùng cách dsh báo đổi model): bước sau tool trong lượt này,
  // hoặc bước đầu của lượt sau. Không tốn thêm lần gọi model nào.
  // Trần ngân sách mỗi ngày của phòng ban (2.6). "Dừng": bước đầu của lượt nhận lời báo để bot
  // trả lời một câu (người giao việc biết vì sao dừng), các bước sau bị từ chối. "Chỉ báo": ghi nhật ký.
  const budgetNoticed = new Set<string>()
  const usd = (n: number) => n.toFixed(2).replace('.', ',')
  const budgetWarned = new Set<string>()
  ctx.on(
    'agent/pre-step',
    async ({ agent, turn, signal }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const id = (agent as unknown as AgentLike).session.id
      const bots = arisBots()
      const bot = bots?.store.botOf(id)
      const pol = bot?.kind === 'member' ? bots!.store.policyOf(bot.id) : undefined
      const dep = pol?.department
      const budget = pol?.policy.budgetUsd
      if (!dep || budget === undefined) return decision
      const spent = ledger.spentToday()[dep.id] ?? 0
      if (spent < budget) return decision
      if (pol!.policy.onBudget === 'warn') {
        const key = `${dayOf(Date.now())}-${dep.id}`
        if (!budgetWarned.has(key)) {
          budgetWarned.add(key)
          logger.warn(
            'phòng %s vượt trần ngân sách hôm nay (%s / %s USD)',
            dep.name,
            spent.toFixed(2),
            budget,
          )
        }
        return decision
      }
      const key = `${id}#${turn}`
      if (budgetNoticed.has(key)) return { kind: 'reject' }
      budgetNoticed.add(key)
      return {
        ...decision,
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [
              {
                type: 'text',
                text: `Phòng ${dep.name} đã dùng hết ngân sách hôm nay (${usd(spent)} / ${usd(budget)} USD). Không làm tiếp việc này, không gọi công cụ; trả lời đúng một câu ngắn báo việc dừng vì phòng hết ngân sách hôm nay.`,
              },
            ],
            source: { kind: 'aris-provider', form: 'notice', summary: `hết ngân sách phòng ${dep.name}` },
          }) as (typeof decision.messages)[number],
        ],
      }
    },
    true,
  )

  ctx.on(
    'agent/pre-step',
    async ({ agent, messages, signal, step }, next) => {
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      if (decision.messages.length === 0 && (step === 1 || messages.length > 0)) return decision
      const id = (agent as unknown as AgentLike).session.id
      const list = notices.get(id)
      if (!list) return decision
      notices.delete(id)
      return { ...decision, messages: [...decision.messages, ...(list as typeof decision.messages)] }
    },
    true,
  )
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end') {
      for (const k of budgetNoticed) if (k.startsWith(`${session.id}#`)) budgetNoticed.delete(k)
      router.forget(session.id)
      agents.delete(session.id)
      return
    }
    if (event.type !== 'assistant/message') return
    const data = event.data as unknown as {
      usage?: Usage
      message: { source: { provider?: string; model?: string } }
    }
    const { usage } = data
    const { provider, model } = data.message.source
    if (!usage || !provider || !model) return
    lastTokens.set(
      session.id,
      usage.totalTokens ??
        usage.inputTokens + usage.outputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
    )
    ledger
      .record(provider, model, usage, Date.now(), [
        departmentOf(session.id),
        `bot:${arisBots()?.store.botOf(session.id).id ?? 'aris'}`,
      ])
      .catch((e: unknown) => logger.warn('sổ chi phí: %s', String(e)))
  })

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const disposeProbe = ctx.connection.fetch.register({
        path: '/api/aris/providers/probe',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleProbe(ctx, request),
      })
      const disposeState = ctx.connection.fetch.register({
        path: '/api/aris/providers/state',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleState({ chain, pools, ledger, prices }, request),
      })
      return () => {
        void disposeProbe()
        void disposeState()
      }
    }, 'aris-providers: /api/aris/providers')
  })
}
