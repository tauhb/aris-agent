/**
 * Thống kê và nhật ký (giai đoạn 7, đợt 7c; đặc tả: docs/specs/aris-stats.md; bản vẽ 6.5 và 6.5b):
 * - Ghi từng lần gọi model (kể cả vòng học nền và chi phí ảnh, video) kèm loại việc (chat, việc được giao, routine,
 *   vòng học) và nguồn (web, Telegram, lịch, Commander, ứng dụng khác, nền, bot khác giao); gộp theo phiên và ngày.
 * - Ghi sự kiện duyệt và hỏi người dùng (không đổi kết quả duyệt), để tính tỉ lệ việc xong không cần người dùng và
 *   để phát lại phiên.
 * - `/api/aris/stats` cho màn 6.5: số liệu theo khoảng (`?range=`) và các bước phát lại một phiên (`?replay=`),
 *   đọc log phiên qua API của dsh, không đụng tệp trực tiếp.
 * @module @aris/stats
 */
import { randomUUID } from 'node:crypto'
import type { ArisBots } from '@aris/bots'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import {
  statsDomain,
  type CallRecord,
  type EventRecord,
  type Kind,
  type SessionRecord,
  type Source,
  type Table,
} from './domain.js'
import {
  addCall,
  buildSteps,
  byModel,
  cacheSavings,
  CALL_DAYS,
  classify,
  classifyNoSession,
  dayKey,
  describeCall,
  EVENT_DAYS,
  expiredKeys,
  FULL_CHARS,
  keepSpecific,
  overview,
  parseRange,
  rangeDays,
  SESSION_DAYS,
  sessionKey,
  tokensOf,
  type Facts,
  type Step,
} from './policy.js'

export * from './policy.js'
export { KINDS, SOURCES, type Kind, type Source } from './domain.js'

export const name = 'aris-stats'
export const inject = ['storageDomain']

/** Một lần gọi model từ `arisSpend.onCall` (@aris/providers). */
interface CallInfo {
  session?: string
  parent?: string
  provider: string
  model: string
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number }
  usd: number
  at: number
  scope: string[]
}
interface SpendPort {
  onCall?(fn: (call: CallInfo) => void): () => void
  priceOf?(
    provider: string,
    model: string,
  ): { input: number; output: number; cacheRead: number; cacheWrite: number } | undefined
}
interface SessionQueryPort {
  observeSession(
    id: unknown,
    o: { projectionMode: 'none' },
  ): Promise<{ events: readonly unknown[]; [Symbol.dispose](): void }>
  readTitleSnapshots?(
    ids: unknown[],
  ): Promise<{ sessionId: string; status: string; value?: { title?: { title?: string } } }[]>
}
interface AgentLike {
  session: { id: string; header?: { parentSession?: string } }
}

const TITLE_TTL_MS = 5 * 60_000
const CLEAN_MS = 12 * 3_600_000

const json = (v: unknown, status = 200) =>
  new Response(JSON.stringify(v), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-stats')
  const domain = await ctx.storageDomain.open(statsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-stats: domain')
  const callsT = domain.table('calls') as unknown as Table<CallRecord>
  const sessionsT = domain.table('sessions') as unknown as Table<SessionRecord>
  const eventsT = domain.table('events') as unknown as Table<EventRecord>

  const bots = () => ctx.get('arisBots') as ArisBots | undefined
  const spend = () => ctx.get('arisSpend') as SpendPort | undefined
  const query = () => ctx.get('sessionQuery') as SessionQueryPort | undefined
  const svc = <T>(name: string) => ctx.get(name) as T | undefined
  const has = (service: string, fn: string, id: string) =>
    svc<Record<string, ((id: string) => boolean) | undefined>>(service)?.[fn]?.(id) === true

  // Ghi tuần tự: hai lần gọi sát nhau của cùng một phiên không dẫm lên tổng của nhau.
  let chain: Promise<unknown> = Promise.resolve()
  const enqueue = (job: () => Promise<void>) => {
    chain = chain.then(job).catch((e: unknown) => logger.warn('ghi thống kê: %s', String(e)))
  }

  // --- Phân loại ----------------------------------------------------------------------------------------
  const factsOf = (sid: string, parent?: string): Facts => ({
    routine: has('arisRoutine', 'isRoutine', sid),
    librarian: has('arisBrain', 'isLibrarian', sid),
    eval: has('arisSkills', 'isEval', sid),
    guest: has('arisAcp', 'isGuest', sid),
    via: bots()?.store.tagOf(sid)?.via,
    parent: !!parent,
    channel: has('arisChannels', 'isChannelSession', sid),
  })
  const botName = (sid: string | undefined) => bots()?.botOf(sid).name ?? ''
  /** Tên bot giao việc: bot của phiên cha, hay bot của phiên Commander đã giao việc lớn này. */
  const giverOf = (sid: string, source: Source, parent?: string): string => {
    if (source === 'commander') {
      const jobs = svc<{ list?(): { session: string; parentSession?: string }[] }>('arisJobs')?.list?.()
      const job = jobs?.find((j) => j.session === sid)
      return botName(job?.parentSession)
    }
    if (source === 'giao') return parent ? botName(parent) : ''
    return ''
  }

  // --- Ghi từng lần gọi ----------------------------------------------------------------------------------
  const onCall = (c: CallInfo) => {
    const sid = c.session ?? ''
    const day = dayKey(c.at)
    const cls = sid ? classify(factsOf(sid, c.parent)) : classifyNoSession(c.scope)
    const botId = sid
      ? (bots()?.botOf(sid).id ?? '')
      : (c.scope.find((s) => s.startsWith('bot:'))?.slice(4) ?? '')
    const by = giverOf(sid, cls.source, c.parent)
    const u = {
      input: c.usage.inputTokens,
      output: c.usage.outputTokens,
      cacheRead: c.usage.cacheReadTokens ?? 0,
      cacheWrite: c.usage.cacheWriteTokens ?? 0,
    }
    const price = spend()?.priceOf?.(c.provider, c.model)
    const save = cacheSavings(price, u)
    enqueue(async () => {
      const key = sessionKey(day, sid, cls.kind === 'hoc' ? 'nen' : 'chat')
      const prev = sessionsT.get(key)
      const kept = keepSpecific(prev, cls)
      await sessionsT.put(
        key,
        addCall(prev ? { ...prev, day } : undefined, {
          at: c.at,
          session: sid,
          bot: botId,
          ...kept,
          by,
          ...u,
          usd: c.usd,
          ...save,
        }),
      )
      const id = `${c.at.toString(36)}-${randomUUID().slice(0, 8)}`
      await callsT.put(id, {
        at: c.at,
        day,
        ...(sid ? { session: sid } : {}),
        ...(botId ? { bot: botId } : {}),
        ...kept,
        provider: c.provider,
        model: c.model,
        ...u,
        usd: c.usd,
      })
    })
  }

  // Gắn vào `arisSpend.onCall`; kiểm lại mỗi 10 giây để gắn lại khi @aris/providers nạp lại hay nạp sau.
  {
    let hooked: SpendPort | undefined
    let off: (() => void) | undefined
    const hook = () => {
      const s = spend()
      if (s === hooked) return
      off?.()
      off = s?.onCall?.(onCall)
      hooked = s
    }
    hook()
    ctx.effect(() => {
      const timer = setInterval(hook, 10_000)
      return () => {
        clearInterval(timer)
        off?.()
      }
    }, 'aris-stats: nghe lần gọi')
  }

  // --- Duyệt và hỏi người dùng ---------------------------------------------------------------------------
  /** Phiên đã phải hỏi người dùng hôm nay: đặt `asked` (tạo bản ghi tạm nếu phiên chưa có lần gọi nào). */
  const markAsked = (sid: string, parent?: string) => {
    const at = Date.now()
    const day = dayKey(at)
    const cls = classify(factsOf(sid, parent))
    const botId = bots()?.botOf(sid).id ?? ''
    const by = giverOf(sid, cls.source, parent)
    enqueue(async () => {
      const key = sessionKey(day, sid)
      const prev = sessionsT.get(key)
      if (prev?.asked) return
      await sessionsT.put(
        key,
        prev
          ? { ...prev, asked: true }
          : {
              day,
              session: sid,
              bot: botId,
              ...cls,
              ...(by ? { by } : {}),
              firstAt: at,
              lastAt: at,
              calls: 0,
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              usd: 0,
              saveUsd: 0,
              fullInUsd: 0,
              asked: true,
            },
      )
    })
  }
  const putEvent = (e: EventRecord) =>
    enqueue(async () => {
      await eventsT.put(`${e.at.toString(36)}-${randomUUID().slice(0, 8)}`, e)
    })

  /** Lời gọi công cụ vừa qua: callId → công cụ và mô tả, để ghi nhãn cho sự kiện duyệt. */
  const seen = new Map<string, { tool: string; what: string; at: number }>()
  const prune = () => {
    const old = Date.now() - 3_600_000
    for (const [k, v] of seen) if (v.at < old) seen.delete(k)
  }
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const a = exec.agent as unknown as AgentLike | undefined
      const sid = a?.session.id
      if (sid) {
        const what = describeCall(exec.name, exec.arguments)
        prune()
        seen.set(String(exec.callId), { tool: exec.name, what, at: Date.now() })
        if (exec.name === 'ask_user_question') {
          putEvent({
            at: Date.now(),
            session: sid,
            type: 'hoi',
            tool: exec.name,
            callId: String(exec.callId),
            what,
          })
          markAsked(sid, a.session.header?.parentSession)
        }
      }
      return next()
    },
    true,
  )
  // Đứng ngoài hàng rào (@aris/guard nạp trước, hook này chen lên đầu): `next()` trả kết quả sau khi hàng rào tự
  // cho hay chờ người dùng. Chỉ ghi lại, không đổi kết quả.
  ctx.on(
    'approval/request',
    async (req, next) => {
      const sid = req.agent.session.id
      const parent = (req.agent as unknown as AgentLike).session.header?.parentSession
      const callId = req.callId ? String(req.callId) : undefined
      const call = callId ? seen.get(callId) : undefined
      const t0 = Date.now()
      // Đánh dấu ngay lúc xin duyệt để phiên đang chờ cũng được tính là có hỏi.
      markAsked(sid, parent)
      let decision = 'cancelled'
      try {
        const outcome = await next()
        decision = String(outcome)
        return outcome
      } finally {
        putEvent({
          at: t0,
          session: sid,
          type: 'duyet',
          tool: req.toolName,
          ...(callId ? { callId } : {}),
          ...(call?.what ? { what: call.what } : {}),
          decision,
          waitedMs: Date.now() - t0,
        })
      }
    },
    true,
  )

  // --- Dọn bản ghi cũ ------------------------------------------------------------------------------------
  ctx.effect(() => {
    const clean = () => {
      for (const k of expiredKeys(callsT.entries(), (r) => r.at, CALL_DAYS)) void callsT.delete(k)
      for (const k of expiredKeys(eventsT.entries(), (r) => r.at, EVENT_DAYS)) void eventsT.delete(k)
      for (const k of expiredKeys(sessionsT.entries(), (r) => r.lastAt, SESSION_DAYS))
        void sessionsT.delete(k)
    }
    clean()
    const timer = setInterval(clean, CLEAN_MS)
    return () => clearInterval(timer)
  }, 'aris-stats: dọn')

  // --- API -----------------------------------------------------------------------------------------------
  /** Tên phiên do dsh đặt (bỏ tiền tố "[Phòng nhóm · …]" của phiên con), nhớ 5 phút. */
  const titles = new Map<string, { title: string; at: number }>()
  async function titlesOf(ids: readonly string[]): Promise<Map<string, string>> {
    const now = Date.now()
    const want = ids.filter((id) => !titles.has(id) || now - titles.get(id)!.at > TITLE_TTL_MS)
    const q = query()
    if (want.length && q?.readTitleSnapshots) {
      const rs = await q.readTitleSnapshots(want.map((id) => SessionId(id))).catch(() => [])
      const got = new Set<string>()
      for (const r of rs)
        if (r.status === 'fulfilled') {
          const t = r.value?.title?.title?.replace(/^\[[^\]]*(\]|$)\s*/, '').trim() ?? ''
          titles.set(r.sessionId, { title: t, at: now })
          got.add(r.sessionId)
        }
      for (const id of want) if (!got.has(id)) titles.set(id, { title: '', at: now })
    }
    return new Map(ids.map((id) => [id, titles.get(id)?.title ?? '']))
  }

  const botView = (id: string) => {
    const b = bots()
      ?.store.list()
      .find((x) => x.id === id)
    return { botName: b?.name ?? id, mascot: b?.mascot ?? id }
  }

  async function statsResponse(rangeParam: string | null) {
    const range = parseRange(rangeParam)
    const now = Date.now()
    const ov = overview(
      (function* () {
        for (const [, r] of sessionsT.entries()) yield r
      })(),
      range,
      now,
    )
    const skills = svc<{ skillEvents?(since: number): { enabled: number; rolledBack: number } }>(
      'arisSkills',
    )?.skillEvents?.(rangeDays(range, now).since) ?? { enabled: 0, rolledBack: 0 }
    const running = new Set(bots()?.live.runningSessions() ?? [])
    const names = await titlesOf(ov.log.map((r) => r.session))
    return {
      ...ov,
      skills,
      // Chi phí theo model trong cùng khoảng, từ từng lần gọi (giữ 30 ngày, đủ cho mọi khoảng).
      byModel: byModel(
        (function* () {
          for (const [, r] of callsT.entries()) yield r
        })(),
        range,
        now,
      ),
      log: ov.log.map((r) => ({
        ...r,
        ...botView(r.bot),
        title: names.get(r.session) ?? '',
        running: running.has(r.session),
      })),
    }
  }

  /** Đọc log phiên qua API của dsh (không đánh thức phiên). */
  async function readLog(sid: string) {
    const q = query()
    if (!q) throw new Error('Chưa có bộ đọc phiên của dsh.')
    const obs = await q.observeSession(SessionId(sid), { projectionMode: 'none' })
    try {
      return [...obs.events] as { type: string; time: number; data?: unknown }[]
    } finally {
      obs[Symbol.dispose]()
    }
  }

  const costOf = (
    provider: string,
    model: string,
    u: { input: number; output: number; cacheRead: number; cacheWrite: number },
  ) => {
    const p = spend()?.priceOf?.(provider, model)
    return p
      ? (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) /
          1_000_000
      : undefined
  }

  async function replay(sid: string, only?: { n: number; full: boolean }) {
    const entries = await readLog(sid)
    if (!entries.length) return undefined
    const calls = [...callsT.entries()].map(([, r]) => r).filter((r) => r.session === sid)
    const events = [...eventsT.entries()].map(([, r]) => r).filter((r) => r.session === sid)
    const blocked =
      svc<{ blocked?(id: string): { at: string; tool: string; what: string }[] }>('arisGuard')?.blocked?.(
        sid,
      ) ?? []
    const steps = buildSteps(entries, calls, events, blocked, {
      ...(only?.full ? { limit: FULL_CHARS } : {}),
      cost: costOf,
    })
    if (only) return steps.find((s) => s.n === only.n)
    const rows = [...sessionsT.entries()].map(([, r]) => r).filter((r) => r.session === sid)
    const last = rows.sort((a, z) => z.lastAt - a.lastAt)[0]
    const bot = last?.bot ?? bots()?.botOf(sid).id ?? ''
    const cls = last ?? { ...classify(factsOf(sid)), by: undefined as string | undefined }
    const fromRows = rows.length > 0
    const tokens = fromRows
      ? rows.reduce((n, r) => n + tokensOf(r), 0)
      : steps.reduce((n, s) => n + (s.input ?? 0) + (s.output ?? 0), 0)
    const usd = fromRows ? rows.reduce((n, r) => n + r.usd, 0) : steps.reduce((n, s) => n + (s.usd ?? 0), 0)
    const title = (await titlesOf([sid])).get(sid) ?? ''
    return {
      session: sid,
      bot,
      ...botView(bot),
      title,
      by: cls.by ?? '',
      kind: cls.kind as Kind,
      source: cls.source as Source,
      firstAt: rows.length ? Math.min(...rows.map((r) => r.firstAt)) : (entries[0]?.time ?? 0),
      lastAt: rows.length ? Math.max(...rows.map((r) => r.lastAt)) : (entries.at(-1)?.time ?? 0),
      usd,
      tokens,
      running: (bots()?.live.runningSessions() ?? []).includes(sid),
      steps: steps as Step[],
    }
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/stats',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const q = new URL(request.url).searchParams
          try {
            const sid = q.get('replay')
            if (!sid) return json(await statsResponse(q.get('range')))
            if (sid.length > 200 || /[\s/\\]/.test(sid)) return json({ error: 'mã phiên không hợp lệ' }, 400)
            const n = Number(q.get('step'))
            if (q.get('step') !== null) {
              if (!Number.isInteger(n) || n < 1) return json({ error: 'bước không hợp lệ' }, 400)
              const step = await replay(sid, { n, full: q.get('full') === '1' })
              return step ? json(step) : json({ error: 'không có bước này' }, 404)
            }
            const out = await replay(sid).catch((e: unknown) => {
              logger.warn('đọc phiên %s: %s', sid, String(e))
              return undefined
            })
            return out ? json(out) : json({ error: 'không đọc được phiên này' }, 404)
          } catch (e) {
            logger.warn('/api/aris/stats: %s', String(e))
            return json({ error: e instanceof Error ? e.message : String(e) }, 500)
          }
        },
      })
      return () => void dispose()
    }, 'aris-stats: /api/aris/stats')
  })
}
