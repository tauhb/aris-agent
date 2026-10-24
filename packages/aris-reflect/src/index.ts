/**
 * Vòng học nền của aris (giai đoạn 3, đợt 1; đặc tả: docs/specs/aris-reflect.md).
 * - Theo dõi từng lượt của mọi phiên bot: lời người dùng, câu trả lời, công cụ đã gọi.
 * - Cuối lượt có dấu hiệu đáng học (bị sửa sai, dặn nhớ, khen, việc dài, lỗi rồi tìm ra cách, lưới
 *   an toàn) thì chạy nền một lần gọi model rẻ đọc lại các lượt chưa học, đề xuất tối đa 3 ký ức.
 * - Đề xuất vào hàng chờ duyệt của `@aris/memory` (Hộp duyệt, Telegram); không ký ức nào tự có hiệu lực.
 * - Trần: đầu vào ≤ 50.000 ký tự mỗi lần, 0,30 USD mỗi ngày cho cả đội (sổ chi phí của `@aris/providers`).
 * @module @aris/reflect
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, type Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { reflectDomain, type RunRecord, type Table } from './domain.js'
import { MAX_CHARS, parseReflection, reflectPrompt, transcriptOf, type MemoryProposal } from './prompt.js'
import { decide, emptyTurn, type Reason, type TurnLog } from './signals.js'

export * from './signals.js'
export * from './prompt.js'
export type { RunRecord } from './domain.js'

export const name = 'aris-reflect'
export const inject = ['storageDomain', 'llm', 'sessionController']

/** Trần tiền vòng học mỗi ngày cho cả đội (USD). */
export const DAILY_USD = 0.3
/** Trần chữ model trả mỗi lần (model có suy luận tính cả phần suy nghĩ vào đây). */
export const MAX_OUTPUT_TOKENS = 6000

export const REFLECT_RECORD = 'plugin:aris/reflect'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/reflect': {
      reasons: string[]
      chars: number
      proposed: number
      saved: string[]
      error?: string
    }
  }
}

interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Phần dịch vụ của plugin khác mà vòng học dùng (đều có thể chưa nạp). */
interface BotsPort {
  botOf(sessionId: string | undefined): { id: string; name: string; kind: string }
  store: { tagOf(sessionId: string): unknown }
}
interface MemoryPort {
  textsFor(bot: string): string[]
  proposals: {
    propose(
      p: MemoryProposal & { bot: string; sessionId?: string; via: 'reflect' },
    ): Promise<{ id: string } | undefined>
  }
}
interface SpendPort {
  today(): Record<string, number>
  charge(provider: string, model: string, usage: Usage, scope: readonly string[]): Promise<number>
}
interface Catalog {
  default?: { provider?: string; model?: string }
  groups: { id: string; models: { id: string; name?: string }[] }[]
}

/** Model rẻ cho vòng học: model "Flash" của nhà cung cấp mặc định, rồi của bất kỳ nhà nào, rồi model mặc định. */
export function pickModel(c: Catalog): { provider: string; model: string } | undefined {
  const flash = (g: Catalog['groups'][number]) =>
    g.models.find((m) => /flash/i.test(`${m.id} ${m.name ?? ''}`) && !m.id.endsWith(':batch'))
  const home = c.groups.find((g) => g.id === c.default?.provider)
  for (const g of [...(home ? [home] : []), ...c.groups]) {
    const m = flash(g)
    if (m) return { provider: g.id, model: m.id }
  }
  return c.default?.provider && c.default.model
    ? { provider: c.default.provider, model: c.default.model }
    : undefined
}

const textOf = (blocks: readonly ContentBlock[]) =>
  blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim()

const briefOf = (args: unknown) => {
  if (args === undefined || args === null) return ''
  const s = typeof args === 'string' ? args : JSON.stringify(args)
  return s.length > 160 ? `${s.slice(0, 159)}…` : s
}

/** Trạng thái theo dõi của một phiên. */
interface SessionState {
  session: Session
  current?: TurnLog | undefined
  /** Các lượt chưa học. */
  pending: TurnLog[]
  /** Số lượt từ lần học trước (undefined khi phiên chưa học). */
  sinceLast?: number | undefined
}

/** Giữ tối đa ngần này lượt chưa học mỗi phiên. */
const KEEP_TURNS = 30

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-reflect')
  const domain = await ctx.storageDomain.open(reflectDomain)
  ctx.effect(() => () => void domain.close(), 'aris-reflect: domain')
  const runs = domain.table('runs') as unknown as Table<RunRecord>

  const bots = () => ctx.get('arisBots') as BotsPort | undefined
  const memory = () => ctx.get('arisMemory') as MemoryPort | undefined
  const spend = () => ctx.get('arisSpend') as SpendPort | undefined

  // --- Theo dõi lượt -------------------------------------------------------------
  const states = new Map<string, SessionState>()
  const stateOf = (session: Session) => {
    let s = states.get(session.id)
    if (!s) states.set(session.id, (s = { session, pending: [] }))
    return s
  }
  const turnOf = (agent: Agent, turn: number) => {
    const s = stateOf(agent.session)
    if (!s.current || s.current.turn !== turn) s.current = emptyTurn(turn)
    return s.current
  }

  ctx.on('agent/pre-step', ({ agent, messages, turn }, next) => {
    const t = turnOf(agent, turn)
    for (const m of messages) if (m.source.kind === 'user') t.user.push(textOf(m.content))
    return next()
  })

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const t = exec.agent ? states.get(exec.agent.session.id)?.current : undefined
    if (t) {
      t.tools.push({ name: exec.name, ok: !result.isError, brief: briefOf(exec.arguments) })
      const action = (exec.arguments as { action?: unknown } | undefined)?.action
      if (exec.name === 'memory' && action !== 'search') t.memoryWrites++
    }
    return next()
  })

  ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message') return
    const t = states.get(session.id)?.current
    const text = textOf((event.data as { message: { content: readonly ContentBlock[] } }).message.content)
    if (t && text) t.assistant.push(text)
  })

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const s = states.get(agent.session.id)
    if (!s?.current || s.current.turn !== turn) return
    s.pending.push(s.current)
    s.current = undefined
    if (s.pending.length > KEEP_TURNS) s.pending.splice(0, s.pending.length - KEEP_TURNS)
    if (s.sinceLast !== undefined) s.sinceLast++
    const reasons = decide(s.pending, s.sinceLast)
    if (!reasons.length) return
    const turns = s.pending
    s.pending = []
    s.sinceLast = 0
    enqueue(s.session, turns, reasons)
  })
  ctx.on('session/disposed', (session) => void states.delete(session.id))

  // --- Chạy nền, mỗi lúc một lần ---------------------------------------------------
  let chain = Promise.resolve()
  const enqueue = (session: Session, turns: TurnLog[], reasons: Reason[]) => {
    chain = chain
      .then(() => reflect(session, turns, reasons))
      .catch((e: unknown) => logger.warn('vòng học nền: %s', String(e)))
  }

  // Danh sách phiên (phiên cha) đọc lại tối đa mỗi phút: bỏ qua phiên trợ lý ẩn danh.
  let sessionList: { at: number; parents: Map<string, string | undefined> } | undefined
  async function isHelper(sessionId: string): Promise<boolean> {
    if (bots()?.store.tagOf(sessionId)) return false
    if (!sessionList || Date.now() - sessionList.at > 60_000) {
      const v = (await ctx.sessionController
        .list({}, new AbortController().signal)
        .catch(() => undefined)) as { items: { sessionId: string; parentSessionId?: string }[] } | undefined
      sessionList = {
        at: Date.now(),
        parents: new Map((v?.items ?? []).map((i) => [i.sessionId, i.parentSessionId])),
      }
    }
    return !!sessionList.parents.get(sessionId)
  }

  let catalog: { at: number; model: { provider: string; model: string } | undefined } | undefined
  async function model() {
    if (!catalog || Date.now() - catalog.at > 600_000) {
      const c = (await ctx.sessionController.modelCatalog().catch(() => undefined)) as Catalog | undefined
      catalog = { at: Date.now(), model: c ? pickModel(c) : undefined }
    }
    return catalog.model
  }

  let budgetNoted = ''
  async function reflect(session: Session, turns: TurnLog[], reasons: Reason[]) {
    if (await isHelper(session.id)) return
    const bot = bots()?.botOf(session.id) ?? { id: 'aris', name: 'Aris', kind: 'commander' }
    const mem = memory()
    if (!mem) return
    const transcript = transcriptOf(turns, MAX_CHARS)
    const run: RunRecord = {
      id: `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`,
      at: new Date().toISOString(),
      bot: bot.id,
      sessionId: session.id,
      reasons,
      chars: transcript.length,
      proposed: 0,
      saved: [],
    }
    const today = spend()?.today().reflect ?? 0
    if (today >= DAILY_USD) {
      // Ghi một lần mỗi ngày là đủ biết vòng học đang nghỉ vì trần.
      const day = run.at.slice(0, 10)
      if (budgetNoted !== day) {
        budgetNoted = day
        await save({ ...run, skipped: 'budget' })
      }
      return
    }
    const m = await model()
    if (!m) return void (await save({ ...run, skipped: 'no-model' }))
    run.model = `${m.provider}/${m.model}`
    try {
      let raw = ''
      let usage: Usage | undefined
      for await (const chunk of ctx.llm.stream({
        provider: m.provider,
        model: m.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: reflectPrompt({ bot: bot.name, transcript, existing: mem.textsFor(bot.id), reasons }),
              },
            ],
          },
        ],
        maxTokens: MAX_OUTPUT_TOKENS,
      })) {
        if (chunk.type === 'text-delta') raw += chunk.text
        else if (chunk.type === 'usage') usage = chunk.usage
      }
      if (usage) run.usd = await spend()?.charge(m.provider, m.model, usage, ['reflect', `bot:${bot.id}`])
      const { memories } = parseReflection(raw)
      run.proposed = memories.length
      for (const p of memories) {
        const item = await mem.proposals.propose({ ...p, bot: bot.id, sessionId: session.id, via: 'reflect' })
        if (item) run.saved.push(item.id)
      }
    } catch (e) {
      run.error = String(e).split('\n')[0]
    }
    try {
      appendPluginRecord(session, REFLECT_RECORD, {
        reasons,
        chars: run.chars,
        proposed: run.proposed,
        saved: run.saved,
        ...(run.error ? { error: run.error } : {}),
      })
    } catch {
      // Phiên đã đóng: vẫn còn bản ghi trong bảng runs.
    }
    await save(run)
  }

  /** Giữ 500 lần chạy gần nhất. */
  async function save(run: RunRecord) {
    await runs.put(run.id, run)
    const all = [...runs.entries()].map(([, r]) => r).sort((a, b) => b.at.localeCompare(a.at))
    for (const old of all.slice(500)) await runs.delete(old.id)
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/reflect',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async () => {
          const recent = [...runs.entries()]
            .map(([, r]) => r)
            .sort((a, b) => b.at.localeCompare(a.at))
            .slice(0, 20)
          return new Response(
            JSON.stringify({
              today: spend()?.today().reflect ?? 0,
              cap: DAILY_USD,
              model: await model(),
              runs: recent,
            }),
            { headers: { 'content-type': 'application/json; charset=utf-8' } },
          )
        },
      })
      return () => void dispose()
    }, 'aris-reflect: /api/aris/reflect')
  })
}
