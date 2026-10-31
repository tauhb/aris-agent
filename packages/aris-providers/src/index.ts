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
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { chainOf, handleState } from './api.js'
import {
  providersDomain,
  type Link,
  type MediaFileRecord,
  type MediaRecord,
  type SwitchRecord,
  type Table,
} from './domain.js'
import {
  chainFor,
  cleanLinks,
  DEFAULT_MEDIA,
  extOf,
  FAIL_TEXT,
  generate,
  hasMediaKey,
  MEDIA_KINDS,
  MEDIA_MODELS,
  VIDEO_SECONDS,
  MEDIA_ONLY_PROVIDERS,
  type MediaKind,
  type MediaPolicy,
} from './media.js'
import { classify, Router, type Failure } from './fallback.js'
import { KeyPools } from './keys.js'
import { dayOf, Ledger } from './ledger.js'
import { costOf, createPrices, type Price } from './prices.js'
import { EMBED_MODELS, embed, GOOGLE_KEY_REFS, type EmbedRequest } from './embed.js'
import { probe, probeInputError } from './probe.js'

export * from './probe.js'
export * from './embed.js'
export * from './media.js'
export { classify, nextLink, Router } from './fallback.js'
export { KeyPools, fingerprint } from './keys.js'
export { Ledger, dayOf } from './ledger.js'
export { costOf, createPrices } from './prices.js'

export const name = 'aris-providers'
export const inject = ['llm', 'storageDomain', 'credentials', 'tools']

/** Bản ghi trong log phiên mỗi lần chuyển dự phòng. */
export const SWITCH_RECORD = 'plugin:aris/provider-switch'
/** Bản ghi ảnh, video bot vừa tạo: khung chat vẽ thành dòng riêng của lượt, không gập vào phần gọi công cụ. */
export const MEDIA_RECORD = 'plugin:aris/media'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/provider-switch': { from: Link; to: Link; code: string; message: string }
    'plugin:aris/media': {
      kind: 'image' | 'video'
      ids: string[]
      model: string
      usd: number
      prompt: string
    }
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

/** Một lần gọi model (hay một khoản chi ảnh, video) gửi cho `arisSpend.onCall`. */
export interface CallInfo {
  /** Phiên gọi; vắng khi gọi ngoài phiên (vòng học nền). */
  session?: string
  /** Phiên cha của phiên gọi (phiên được tách ra từ phiên khác), nếu có. */
  parent?: string
  provider: string
  model: string
  usage: Usage
  /** Tiền theo bảng giá (0 khi model chưa có giá hay chỉ là chi phí ảnh, video đã tính sẵn). */
  usd: number
  at: number
  /** Các phạm vi chi phí được cộng (phòng ban, `bot:<mã>`, `reflect`, `media-image`…). */
  scope: string[]
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
            get(
              id: string,
            ):
              | { models?: { goal?: Link; fallback?: Link }; media?: Partial<Record<MediaKind, MediaPolicy>> }
              | undefined
            list(): { id: string; name: string; kind: string; mascot?: string; department?: string }[]
            update(id: string, patch: { media?: Partial<Record<MediaKind, unknown>> }): Promise<unknown>
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
  const costListeners = new Set<(session: string, usd: number) => void>()
  // Từng lần gọi model (và chi phí ảnh, video) cho @aris/stats ghi thống kê.
  const callListeners = new Set<(call: CallInfo) => void>()
  const emitCall = (call: CallInfo) => {
    for (const fn of callListeners) {
      try {
        fn(call)
      } catch (e) {
        logger.warn('người nghe lần gọi: %s', String(e))
      }
    }
  }
  ctx.provide('arisSpend', {
    today: () => ledger.spentToday(),
    /** Tổng chi phí hôm nay của cả đội: mọi lần gọi model cộng ảnh, video (trần cả đội, @aris/guard). */
    total: () => {
      const scopes = ledger.spentToday()
      return ledger.summary().today + (scopes['media-image'] ?? 0) + (scopes['media-video'] ?? 0)
    },
    /** Chi phí 7 ngày của một bot (cột phải hồ sơ bot). */
    botWeek: (bot: string) => ledger.spentWeek(`bot:${bot}`),
    /** Tiền của từng lần gọi model theo phiên (Commander áp trần tiền mỗi việc); trả về hàm huỷ. */
    onCost(fn: (session: string, usd: number) => void): () => void {
      costListeners.add(fn)
      return () => void costListeners.delete(fn)
    },
    /**
     * Từng lần gọi model: trong phiên, ngoài phiên (`charge`) và chi phí ảnh, video; trả về hàm huỷ.
     * Ngoài phiên thì không có `session`; ảnh, video thì `usage` bằng 0 và `model` là model ảnh hay video.
     */
    onCall(fn: (call: CallInfo) => void): () => void {
      callListeners.add(fn)
      return () => void callListeners.delete(fn)
    },
    /** Giá một model (USD cho mỗi 1 triệu token); chưa có giá thì undefined. */
    priceOf: (provider: string, model: string): Price | undefined => prices.of(provider, model),
    /**
     * Ghi một lần gọi model ngoài phiên (vòng học nền) vào sổ chi phí, cộng vào các phạm vi
     * (`reflect`, `bot:<mã>`); trả số tiền theo bảng giá (0 khi chưa có giá).
     */
    async charge(provider: string, model: string, usage: Usage, scope: readonly string[]): Promise<number> {
      const at = Date.now()
      await ledger.record(provider, model, usage, at, scope)
      const price = prices.of(provider, model)
      const usd = price ? costOf(price, usage) : 0
      emitCall({ provider, model, usage: { ...usage }, usd, at, scope: [...scope] })
      return usd
    },
  })
  const pools = new KeyPools(t('pools'), {
    resolve: async (ref) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
    set: (ref, value) => ctx.credentials.set(credentialRef(ref), value),
    unset: (ref) => ctx.credentials.unset(credentialRef(ref)),
  })

  // Nhúng cho tìm theo nghĩa (@aris/brain): khoá đọc ở máy chủ, không rời máy ngoài lần gọi tới Google.
  ctx.provide('arisEmbed', {
    models: () => EMBED_MODELS.map((m) => ({ provider: m.provider, model: m.model, dims: m.dims })),
    async hasKey(provider: string) {
      if (provider !== 'google') return false
      for (const ref of GOOGLE_KEY_REFS)
        if ((await ctx.credentials.resolve(credentialRef(ref)))?.value) return true
      return false
    },
    embed: (r: EmbedRequest) =>
      embed(
        {
          fetch: (...a) => fetch(...a),
          key: async (ref) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
        },
        r,
      ),
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
    const at = Date.now()
    const scope = [departmentOf(session.id), `bot:${arisBots()?.store.botOf(session.id).id ?? 'aris'}`]
    ledger
      .record(provider, model, usage, at, scope)
      .catch((e: unknown) => logger.warn('sổ chi phí: %s', String(e)))
    const price = costListeners.size || callListeners.size ? prices.of(provider, model) : undefined
    const usd = price ? costOf(price, usage) : 0
    if (price) for (const fn of costListeners) fn(session.id, usd)
    if (callListeners.size) {
      const parent = (session as unknown as { header?: { parentSession?: string } }).header?.parentSession
      emitCall({
        session: session.id,
        ...(parent ? { parent: String(parent) } : {}),
        provider,
        model,
        usage: { ...usage },
        usd,
        at,
        scope: scope.filter((x): x is string => !!x),
      })
    }
  })

  // --- Ảnh và video (đợt 5c) --------------------------------------------------------------------
  const mediaT = t('media') as Table<MediaRecord>
  const files = t('media_files') as Table<MediaFileRecord>
  const mediaSettings = (): MediaRecord => mediaT.get('main') ?? DEFAULT_MEDIA
  const mediaDeps = {
    fetch: (...a: Parameters<typeof fetch>) => fetch(...a),
    key: async (ref: string) => (await ctx.credentials.resolve(credentialRef(ref)))?.value,
  }
  /** Tệp vừa tạo theo phiên, chờ kênh nhắn tin (Telegram) gửi kèm câu trả lời. */
  const fresh = new Map<string, string[]>()
  const KIND_TEXT: Record<MediaKind, { one: string; dir: string; tool: string }> = {
    image: { one: 'ảnh', dir: 'anh', tool: 'generate_image' },
    video: { one: 'video', dir: 'video', tool: 'generate_video' },
  }
  const slugOf = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'tep'
  const usdText = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

  async function runMedia(
    kind: MediaKind,
    args: { prompt: string; ratio?: string | undefined; count?: number | undefined },
    exec: { agent?: unknown },
  ): Promise<string> {
    const agent = exec.agent as { session: { id: string; header?: { cwd?: string } } } | undefined
    const sid = agent?.session.id ?? ''
    const bot = arisBots()?.store.botOf(sid) ?? { id: 'aris', kind: 'commander' }
    const rec = arisBots()?.store.get(bot.id)
    const name =
      arisBots()
        ?.store.list()
        .find((b) => b.id === bot.id)?.name ?? bot.id
    const policy = rec?.media?.[kind]
    const settings = mediaSettings()
    const chain = chainFor(kind, settings, policy)
    const word = KIND_TEXT[kind].one
    if (!chain.length)
      return policy?.mode === 'off'
        ? `${name} chưa được bật tạo ${word}. Người dùng bật ở Hồ sơ bot · tab Model, hay Cài đặt › Model.`
        : `Chưa có model tạo ${word} nào trong danh sách. Người dùng thêm ở Cài đặt › Model.`
    const spent = ledger.spentToday()
    const capAll = settings.caps[kind]
    if ((spent[`media-${kind}`] ?? 0) >= capAll)
      return `Đã chạm trần tạo ${word} hôm nay của cả đội (${usdText(capAll)} USD). Báo người dùng; đừng thử cách khác.`
    if (policy?.capUsd !== undefined && (spent[`media-${kind}:bot:${bot.id}`] ?? 0) >= policy.capUsd)
      return `${name} đã chạm trần tạo ${word} riêng hôm nay (${usdText(policy.capUsd)} USD). Báo người dùng.`
    const prompt = args.prompt.trim()
    if (!prompt) return `Cần mô tả ${word} muốn tạo.`
    const out = await generate(mediaDeps, chain, { kind, prompt, ratio: args.ratio, count: args.count })
    const failed = out.tried.map((a) => `${a.link.model}: ${FAIL_TEXT[a.kind]} (${a.message.slice(0, 160)})`)
    for (const a of out.tried)
      logger.warn('tạo %s: %s/%s %s: %s', kind, a.link.provider, a.link.model, a.kind, a.message)
    if (!out.ok)
      return [
        `Chưa tạo được ${word}: đã thử ${out.tried.length} model theo thứ tự.`,
        ...failed.map((f) => `- ${f}`),
        `Báo người dùng lý do; họ bật thanh toán, nạp tiền hay thêm model ở Cài đặt › Model.`,
        `[aris-media] ${JSON.stringify({ kind, ids: [], tried: out.tried.map((a) => ({ model: a.link.model, kind: a.kind, message: a.message.slice(0, 160) })) })}`,
      ].join('\n')
    const day = dayOf(Date.now())
    const dir = join(
      agent?.session.header?.cwd ?? join(homedir(), 'aris', 'workspace'),
      KIND_TEXT[kind].dir,
      day,
    )
    await mkdir(dir, { recursive: true })
    const base = slugOf(prompt)
    const made: MediaFileRecord[] = []
    for (const [i, f] of out.files.entries()) {
      const id = `m-${randomUUID().slice(0, 12)}`
      const path = join(dir, `${base}-${Date.now().toString(36)}-${i + 1}.${extOf(f.mime)}`)
      await writeFile(path, f.data)
      const r: MediaFileRecord = {
        id,
        kind,
        path,
        mime: f.mime,
        bot: bot.id,
        sessionId: sid,
        at: new Date().toISOString(),
        prompt: prompt.slice(0, 1000),
        provider: out.link.provider,
        model: out.link.model,
        usd: out.usd / out.files.length,
      }
      await files.put(id, r)
      made.push(r)
    }
    const mediaScope = [`media-${kind}`, `media-${kind}:bot:${bot.id}`, `bot:${bot.id}`, departmentOf(sid)]
    await ledger.addUsd(out.usd, mediaScope)
    emitCall({
      ...(sid ? { session: sid } : {}),
      provider: out.link.provider,
      model: out.link.model,
      usage: { inputTokens: 0, outputTokens: 0 },
      usd: out.usd,
      at: Date.now(),
      scope: mediaScope.filter((x): x is string => !!x),
    })
    if (sid) fresh.set(sid, [...(fresh.get(sid) ?? []), ...made.map((m) => m.id)])
    try {
      if (agent)
        appendPluginRecord(agent.session as never, MEDIA_RECORD, {
          kind,
          ids: made.map((m) => m.id),
          model: out.link.model,
          usd: out.usd,
          prompt: prompt.slice(0, 500),
        })
    } catch (e) {
      logger.warn('ghi bản ghi ảnh, video: %s', String(e))
    }
    return [
      `Đã tạo ${made.length} ${word}${kind === 'video' ? ` dài ${secondsOf(out.link.model)} giây` : ''} bằng ${out.link.model} (khoảng ${usdText(out.usd)} USD). Người dùng đã thấy ${word} trong khung chat; đừng chép lại đường dẫn hay mô tả lại từng ${word}, chỉ nói ngắn khác nhau ở đâu nếu có nhiều.`,
      ...(failed.length ? [`Trước đó đã thử: ${failed.join('; ')}.`] : []),
      // Đường dẫn tương đối: đường dẫn tuyệt đối trong câu trả lời bị dsh vẽ thành ảnh lần nữa.
      `Tệp (trong thư mục làm việc, chỉ dùng khi cần cho việc khác, không đưa vào câu trả lời): ${made.map((m) => join(KIND_TEXT[kind].dir, day, basename(m.path))).join(', ')}`,
      `[aris-media] ${JSON.stringify({ kind, ids: made.map((m) => m.id), model: out.link.model, usd: out.usd, tried: out.tried.map((a) => ({ model: a.link.model, kind: a.kind, message: a.message.slice(0, 160) })) })}`,
    ].join('\n')
  }

  // Mỗi model video làm một độ dài cố định (Kling 5 giây); báo đúng để bot không nói theo lời người dùng xin.
  const secondsOf = (model: string) =>
    MEDIA_MODELS.find((m) => m.kind === 'video' && m.model === model)?.seconds ?? VIDEO_SECONDS
  const ratioEnum = (kind: MediaKind) => [
    ...new Set(MEDIA_MODELS.filter((m) => m.kind === kind).flatMap((m) => m.ratios)),
  ]
  ctx.tools.register(
    defineTool({
      name: 'generate_image',
      description:
        'Tạo ảnh từ lời mô tả (ảnh bìa, minh hoạ, ảnh sản phẩm…). Riêng tham số prompt viết bằng tiếng Anh (model ảnh hiểu tiếng Anh tốt nhất); trả lời người dùng vẫn bằng ngôn ngữ của họ. Mô tả cụ thể: chủ thể, bố cục, phong cách, màu; chữ cần có trên ảnh giữ nguyên tiếng Việt đúng dấu trong ngoặc kép. Ảnh lưu vào thư mục làm việc và hiện ngay trong khung chat. Chỉ dùng khi người dùng muốn có ảnh.',
      parameters: {
        prompt: {
          type: 'string',
          required: true,
          description: 'Mô tả ảnh cần tạo, viết bằng tiếng Anh (chỉ tham số này).',
        },
        aspect_ratio: { type: 'string', enum: ratioEnum('image'), description: 'Tỉ lệ khung, mặc định 1:1.' },
        count: { type: 'number', description: 'Số phương án (1–4, mặc định 1).' },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        return runMedia(
          'image',
          {
            prompt: String(args.prompt ?? ''),
            ratio: typeof args.aspect_ratio === 'string' ? args.aspect_ratio : undefined,
            count: Math.min(4, Math.max(1, Math.round(Number(args.count) || 1))),
          },
          exec,
        )
      },
    }),
  )
  ctx.tools.register(
    defineTool({
      name: 'generate_video',
      description:
        'Tạo một đoạn video ngắn (5–8 giây tuỳ model, không chọn được độ dài) từ lời mô tả (tham số prompt viết bằng tiếng Anh; trả lời người dùng vẫn bằng ngôn ngữ của họ): cảnh, chuyển động máy quay, ánh sáng, âm thanh nếu cần. Tốn tiền hơn ảnh nhiều; chỉ dùng khi người dùng muốn có video. Video lưu vào thư mục làm việc và hiện trong khung chat.',
      parameters: {
        prompt: {
          type: 'string',
          required: true,
          description: 'Mô tả video cần tạo, viết bằng tiếng Anh (chỉ tham số này).',
        },
        aspect_ratio: {
          type: 'string',
          enum: ratioEnum('video'),
          description: 'Khung ngang 16:9 hay dọc 9:16, mặc định 16:9.',
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        return runMedia(
          'video',
          {
            prompt: String(args.prompt ?? ''),
            ratio: typeof args.aspect_ratio === 'string' ? args.aspect_ratio : undefined,
          },
          exec,
        )
      },
    }),
  )

  // Kênh nhắn tin lấy tệp vừa tạo của phiên để gửi kèm câu trả lời.
  ctx.provide('arisMedia', {
    takeFresh(sessionId: string): MediaFileRecord[] {
      const ids = fresh.get(sessionId) ?? []
      fresh.delete(sessionId)
      return ids.flatMap((id) => {
        const r = files.get(id)
        return r ? [r] : []
      })
    },
    async read(id: string): Promise<{ rec: MediaFileRecord; data: Uint8Array } | undefined> {
      const rec = files.get(id)
      if (!rec) return undefined
      const data = await readFile(rec.path).catch(() => undefined)
      return data ? { rec, data: new Uint8Array(data) } : undefined
    },
  })

  /** Trạng thái cho Cài đặt › Model và tab Model của hồ sơ bot. */
  async function mediaState() {
    const providers = [...new Set(MEDIA_MODELS.map((m) => m.provider))]
    const keys = Object.fromEntries(
      await Promise.all(providers.map(async (p) => [p, await hasMediaKey(mediaDeps, p)] as const)),
    )
    const spent = ledger.spentToday()
    const bots = arisBots()?.store
    return {
      settings: mediaSettings(),
      models: MEDIA_MODELS.map((m) => ({ ...m, hasKey: keys[m.provider] ?? false })),
      // Nhà cung cấp chỉ cho ảnh, video: khoá nhập ở mục này (không bao giờ trả giá trị khoá).
      keys: Object.entries(MEDIA_ONLY_PROVIDERS).map(([id, p]) => ({
        provider: id,
        ...p,
        hasKey: keys[id] ?? false,
      })),
      today: { image: spent['media-image'] ?? 0, video: spent['media-video'] ?? 0 },
      bots: (bots?.list() ?? []).map((b) => ({
        id: b.id,
        name: b.name,
        kind: b.kind,
        media: bots?.get(b.id)?.media ?? {},
        today: {
          image: spent[`media-image:bot:${b.id}`] ?? 0,
          video: spent[`media-video:bot:${b.id}`] ?? 0,
        },
      })),
    }
  }

  async function mediaApi(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'POST') {
      const id = url.searchParams.get('file')
      if (id) {
        const f = /^m-[a-f0-9-]{6,20}$/.test(id) ? files.get(id) : undefined
        const data = f ? await readFile(f.path).catch(() => undefined) : undefined
        if (!f || !data) return json({ error: 'không thấy tệp' }, 404)
        return new Response(new Uint8Array(data), {
          headers: { 'content-type': f.mime, 'cache-control': 'private, max-age=86400' },
        })
      }
      const info = url.searchParams.get('info')
      if (info) {
        const f = files.get(info)
        return f
          ? json({ ...f, path: undefined, name: f.path.split('/').pop() })
          : json({ error: 'không thấy tệp' }, 404)
      }
      return json(await mediaState())
    }
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const cur = mediaSettings()
    switch (b.op) {
      case 'chain': {
        const kind = MEDIA_KINDS.find((k) => k === b.kind)
        if (!kind) return json({ error: 'loại không hợp lệ' }, 400)
        await mediaT.put('main', { ...cur, [kind]: cleanLinks(kind, b.links) })
        return json({ ok: true, ...(await mediaState()) })
      }
      case 'caps': {
        const c = (b.caps ?? {}) as Partial<Record<MediaKind, unknown>>
        const num = (v: unknown, d: number) => (typeof v === 'number' && v >= 0 && v <= 1000 ? v : d)
        await mediaT.put('main', {
          ...cur,
          caps: { image: num(c.image, cur.caps.image), video: num(c.video, cur.caps.video) },
        })
        return json({ ok: true, ...(await mediaState()) })
      }
      case 'key': {
        const p = MEDIA_ONLY_PROVIDERS[String(b.provider ?? '')]
        if (!p) return json({ error: 'nhà cung cấp không hợp lệ' }, 400)
        const value = typeof b.value === 'string' ? b.value.trim() : ''
        if (value.length > 500 || /\s/.test(value)) return json({ error: 'khoá không hợp lệ' }, 400)
        if (value) await ctx.credentials.set(credentialRef(p.ref), value)
        else await ctx.credentials.unset(credentialRef(p.ref))
        return json({ ok: true, ...(await mediaState()) })
      }
      case 'bot': {
        const store = arisBots()?.store
        const id = String(b.bot ?? '')
        const kind = MEDIA_KINDS.find((k) => k === b.kind)
        if (!store || !kind || !store.get(id)) return json({ error: 'bot hay loại không hợp lệ' }, 400)
        const p = (b.policy ?? null) as Record<string, unknown> | null
        const policy = p && { ...p, ...(p.list ? { list: cleanLinks(kind, p.list) } : {}) }
        await store.update(id, { media: { [kind]: policy } })
        return json({ ok: true, ...(await mediaState()) })
      }
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const disposeMedia = ctx.connection.fetch.register({
        path: '/api/aris/media',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => mediaApi(request),
      })
      return () => void disposeMedia()
    }, 'aris-providers: /api/aris/media')
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
