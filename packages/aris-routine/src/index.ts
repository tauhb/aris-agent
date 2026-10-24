/**
 * Routine của aris (giai đoạn 4, đợt 1; đặc tả: docs/specs/aris-routine.md): việc chạy theo lịch
 * cron ở một phiên mới của bot, quyền chặt, kết quả gửi về Telegram, chạy bù, cảnh báo lỗi liên tiếp.
 * @module @aris/routine
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { READ_ONLY_TOOLS, readOnlyBash } from '@aris/skills'
import { randomUUID } from 'node:crypto'
import { CronError, DEFAULT_TZ, humanCron, nextRun, parseCron } from './cron.js'
import { routineDomain, type RoutineRecord, type RunRecord, type StateRecord, type Table } from './domain.js'
import {
  CATCHUP_HOURS,
  FAIL_ALERT,
  ROUTINE_USD,
  RUNS_KEPT,
  RUN_TIMEOUT_MS,
  TICK_MS,
  decide,
  fixPrompt,
  routinePrompt,
  streakAfter,
  type RunStatus,
  type Trigger,
} from './rules.js'

export * from './cron.js'
export * from './rules.js'
export type { RoutineRecord, RunRecord } from './domain.js'

export const name = 'aris-routine'
export const inject = ['storageDomain']

/** Câu `sendHome` của kênh trả khi đã gửi; câu khác là lý do không gửi được. */
const SENT = 'Đã gửi.'

/** Công cụ đọc web: routine như "tin đối thủ" cần, vẫn là chỉ đọc. */
const WEB_READ = new Set(['web_search', 'web_fetch'])

/** Dịch vụ cho plugin khác: vòng học nền, lời nhắc ký ức bỏ qua phiên routine. */
export interface ArisRoutine {
  isRoutine(sessionId: string): boolean
}

interface SessionPort {
  prompt(
    req: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] },
    signal: AbortSignal,
  ): Promise<unknown>
  rename?(req: { sessionId: string; title: string }): Promise<unknown>
  cancel?(req: { sessionId: string }): unknown
}
interface BotsPort {
  open(botId: string): Promise<string>
  store: { get(id: string): { id: string; name: string } | undefined }
}
interface ChannelsPort {
  sendHome(bot: string, markdown: string): Promise<string>
  approveHome(
    bot: string,
    req: { toolName: string; reason?: string; displayReason?: Record<string, string>; signal?: AbortSignal },
  ): Promise<'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'>
}
interface SpendPort {
  onCost?(fn: (session: string, usd: number) => void): () => void
}

/** Một lần chạy đang diễn ra. */
interface Live {
  run: string
  routine: string
  bot: string
  readOnly: boolean
  cap: number
  usd: number
  answer: string
  /** Lý do kết thúc do aris đặt (chạm trần, quá giờ). */
  forced?: 'cap' | 'timeout' | 'stop'
  done?: (reason: string) => void
}

export class RoutineError extends Error {}

const textOf = (content: readonly { type: string; text?: string }[]) =>
  content
    .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
    .join('\n')
    .trim()

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-routine')
  const domain = await ctx.storageDomain.open(routineDomain)
  ctx.effect(() => () => void domain.close(), 'aris-routine: domain')
  const routines = domain.table('routines') as unknown as Table<RoutineRecord>
  const runs = domain.table('runs') as unknown as Table<RunRecord>
  const state = domain.table('state') as unknown as Table<StateRecord>
  const now = () => new Date()
  const iso = () => now().toISOString()
  const paused = () => state.get('main')?.paused ?? false

  const sessions = () => ctx.get('sessionController') as SessionPort | undefined
  const bots = () => ctx.get('arisBots') as BotsPort | undefined
  const channels = () => ctx.get('arisChannels') as ChannelsPort | undefined

  /** Phiên routine đang chạy, theo mã phiên. */
  const live = new Map<string, Live>()
  /** Mọi phiên từng là phiên routine (vòng học nền chạy sau khi lượt xong vẫn phải nhận ra). */
  const known = new Set([...runs.entries()].flatMap(([, r]) => (r.sessionId ? [r.sessionId] : [])))
  ctx.provide('arisRoutine', { isRoutine: (sid: string) => known.has(sid) } satisfies ArisRoutine)

  const runsOf = (routine: string) =>
    [...runs.entries()]
      .map(([, r]) => r)
      .filter((r) => r.routine === routine)
      .sort((a, b) => b.at.localeCompare(a.at))
  const running = (routine: string) => [...live.values()].some((l) => l.routine === routine)

  const prune = async (routine: string) => {
    for (const r of runsOf(routine).slice(RUNS_KEPT)) await runs.delete(r.id)
  }

  const next = (r: Pick<RoutineRecord, 'cron' | 'tz'>, after = now()) =>
    nextRun(parseCron(r.cron), after, r.tz)?.toISOString()

  // --- Theo dõi phiên routine -----------------------------------------------------------
  ctx.on('session/event', (session, event) => {
    const l = live.get(session.id)
    if (!l) return
    if (event.type === 'assistant/message') {
      const text = textOf(
        (event.data as { message: { content: readonly { type: string; text?: string }[] } }).message.content,
      )
      if (text) l.answer = text
    } else if (event.type === 'turn/end') {
      l.done?.((event.data as unknown as { reason?: { kind?: string } }).reason?.kind ?? 'completed')
    }
  })

  let offCost: (() => void) | undefined
  ctx.effect(() => () => offCost?.(), 'aris-routine: tiền')
  const hookCost = () => {
    offCost ??= (ctx.get('arisSpend') as SpendPort | undefined)?.onCost?.((session, usd) => {
      const l = live.get(session)
      if (!l) return
      l.usd += usd
      if (l.usd > l.cap && !l.forced) {
        l.forced = 'cap'
        sessions()?.cancel?.({ sessionId: session })
      }
    })
  }

  // Quyền "chỉ đọc": công cụ đọc chạy luôn, công cụ khác thành hỏi (thẻ duyệt về Telegram).
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const sid = exec.agent?.session.id
      const l = sid ? live.get(sid) : undefined
      const decision = await next()
      if (!l?.readOnly || decision.kind !== 'allow') return decision
      if (READ_ONLY_TOOLS.has(exec.name) || WEB_READ.has(exec.name)) return decision
      const command = (exec.arguments as { command?: unknown } | undefined)?.command
      if (exec.name === 'bash' && typeof command === 'string' && readOnlyBash(command)) return decision
      return {
        kind: 'ask',
        reason: `Routine chỉ đọc: ${exec.name} cần người dùng duyệt.`,
        displayReason: {
          en: `Read-only routine: ${exec.name} needs your approval.`,
          vi: `Routine chỉ đọc: ${exec.name} cần duyệt.`,
        },
      }
    },
    true,
  )
  // Hỏi duyệt của phiên routine: không ai trông phiên, nên gửi thẻ về Telegram của bot.
  ctx.on(
    'approval/request',
    async (req, next) => {
      const l = live.get(req.agent.session.id)
      if (!l) return next()
      const ch = channels()
      if (!ch) return 'unavailable' as never
      return (await ch.approveHome(l.bot, req as never)) as never
    },
    true,
  )

  // --- Một lần chạy ------------------------------------------------------------------------
  async function finish(run: RunRecord, status: RunStatus, extra: Partial<RunRecord> = {}) {
    const done: RunRecord = { ...run, ...extra, status, finishedAt: iso() }
    await runs.put(done.id, done)
    await prune(run.routine)
    const r = routines.get(run.routine)
    if (!r) return done
    const failStreak = streakAfter(r.failStreak, status)
    let alerted = failStreak === 0 ? false : (r.alerted ?? false)
    if (failStreak >= FAIL_ALERT && !alerted) {
      alerted = true
      await channels()
        ?.sendHome(
          r.bot,
          `⚠️ Routine «${r.title}» lỗi ${failStreak} lần liên tiếp: ${done.error ?? status}. Mở trang Routine để xem lần chạy hoặc nhờ bot sửa.`,
        )
        .catch((e: unknown) => logger.warn('gửi cảnh báo routine: %s', String(e)))
    }
    await routines.put(r.id, { ...r, failStreak, alerted, updatedAt: iso() })
    return done
  }

  async function runRoutine(r: RoutineRecord, trigger: Trigger, at: string): Promise<RunRecord> {
    const sc = sessions()
    const b = bots()
    const run: RunRecord = {
      id: `${r.id}-${Date.now().toString(36)}`,
      routine: r.id,
      bot: r.bot,
      at,
      trigger,
      status: 'running',
      usd: 0,
    }
    if (!sc || !b) return finish(run, 'failed', { error: 'Chưa có bộ điều khiển phiên hay dịch vụ đội bot.' })
    hookCost()
    let sessionId: string
    try {
      sessionId = await b.open(r.bot)
    } catch (e) {
      return finish(run, 'failed', { error: `Không mở được phiên cho bot: ${String(e)}` })
    }
    const l: Live = {
      run: run.id,
      routine: r.id,
      bot: r.bot,
      readOnly: r.perms === 'read',
      cap: r.capUsd,
      usd: 0,
      answer: '',
    }
    live.set(sessionId, l)
    known.add(sessionId)
    const started: RunRecord = { ...run, sessionId, startedAt: iso() }
    await runs.put(started.id, started)
    try {
      await sc.rename?.({ sessionId, title: `Routine · ${r.title}` }).catch(() => undefined)
      const ended = new Promise<string>((resolve) => {
        l.done = resolve
        setTimeout(() => {
          if (l.forced) return
          l.forced = 'timeout'
          sc.cancel?.({ sessionId })
          resolve('timeout')
        }, RUN_TIMEOUT_MS)
      })
      await sc.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: routinePrompt(r.title, r.task, r.perms === 'read') }],
        },
        AbortSignal.timeout(30_000),
      )
      const reason = await ended
      // Sự kiện tiền về sau câu trả lời cuối chút ít.
      await new Promise((res) => setTimeout(res, 1500))
      const answer = l.answer.slice(0, 4000)
      const status: RunStatus =
        l.forced === 'cap'
          ? 'cap'
          : l.forced === 'stop'
            ? 'stopped'
            : l.forced === 'timeout'
              ? 'failed'
              : reason === 'completed'
                ? 'done'
                : 'failed'
      const error =
        status === 'cap'
          ? `chạm trần ${r.capUsd.toFixed(2)} USD`
          : l.forced === 'timeout'
            ? 'quá 15 phút'
            : status === 'failed'
              ? `lượt kết thúc: ${reason}`
              : undefined
      if (status === 'done' && r.deliver === 'telegram' && answer)
        await channels()
          ?.sendHome(r.bot, `**ROUTINE · ${r.title}**\n\n${answer}`)
          .then((res) => res === SENT || logger.warn('gửi kết quả routine %s: %s', r.id, res))
          .catch((e: unknown) => logger.warn('gửi kết quả routine: %s', String(e)))
      return await finish(started, status, { answer, usd: l.usd, ...(error ? { error } : {}) })
    } catch (e) {
      return finish(started, 'failed', { usd: l.usd, error: String(e) })
    } finally {
      live.delete(sessionId)
    }
  }

  // --- Bộ hẹn giờ ----------------------------------------------------------------------
  async function tick() {
    if (paused()) return
    for (const [, r] of routines.entries()) {
      if (r.enabled && !r.nextAt) {
        await routines.put(r.id, { ...r, nextAt: next(r) })
        continue
      }
      const what = decide(r, now(), running(r.id))
      if (!what) continue
      const at = r.nextAt!
      await routines.put(r.id, { ...r, nextAt: next(r), updatedAt: iso() })
      if (what === 'missed') {
        await runs.put(`${r.id}-${Date.now().toString(36)}`, {
          id: `${r.id}-${Date.now().toString(36)}`,
          routine: r.id,
          bot: r.bot,
          at,
          trigger: 'schedule',
          status: 'missed',
          usd: 0,
          finishedAt: iso(),
          error: `trễ quá ${r.catchupHours} giờ (máy tắt hay aris dừng)`,
        })
        continue
      }
      void runRoutine(r, what, at).catch((e: unknown) => logger.warn('chạy routine %s: %s', r.id, String(e)))
    }
  }
  ctx.effect(() => {
    // Lần chạy dở khi daemon dừng: không còn phiên theo dõi, ghi là lỗi.
    void (async () => {
      for (const [, run] of runs.entries())
        if (run.status === 'running') await finish(run, 'failed', { error: 'aris khởi động lại giữa lượt' })
    })().catch((e: unknown) => logger.warn('dọn lần chạy dở: %s', String(e)))
    let busy = false
    const loop = () => {
      if (busy) return
      busy = true
      void tick()
        .catch((e: unknown) => logger.warn('vòng kiểm routine: %s', String(e)))
        .finally(() => (busy = false))
    }
    const first = setTimeout(loop, 5_000)
    const timer = setInterval(loop, TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, 'aris-routine: bộ hẹn giờ')

  // --- API -------------------------------------------------------------------------------
  const view = (r: RoutineRecord) => {
    const last = runsOf(r.id)[0]
    return { ...r, when: humanCron(r.cron), running: running(r.id), last: last ?? null }
  }

  function clean(input: Record<string, unknown>, prev?: RoutineRecord): RoutineRecord {
    const str = (k: string, max: number) => {
      const v = input[k]
      return typeof v === 'string' ? v.trim().slice(0, max) : undefined
    }
    const bot = str('bot', 60) ?? prev?.bot
    if (!bot || !bots()?.store.get(bot)) throw new RoutineError('Không có bot này.')
    const title = str('title', 120) ?? prev?.title
    if (!title) throw new RoutineError('Thiếu tên routine.')
    const task = str('task', 4000) ?? prev?.task
    if (!task) throw new RoutineError('Thiếu việc cần làm.')
    const cron = str('cron', 120) ?? prev?.cron
    if (!cron) throw new RoutineError('Thiếu lịch.')
    const tz = str('tz', 60) ?? prev?.tz ?? DEFAULT_TZ
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      parseCron(cron)
    } catch (e) {
      throw new RoutineError(e instanceof CronError ? e.message : `Múi giờ không hợp lệ: ${tz}.`)
    }
    const num = (k: string, lo: number, hi: number, d: number) => {
      const v = input[k]
      if (v === undefined) return d
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)
        throw new RoutineError(`${k} phải từ ${lo} tới ${hi}.`)
      return v
    }
    const pick = <T extends string>(k: string, list: readonly T[], d: T): T => {
      const v = input[k]
      if (v === undefined) return d
      if (!list.includes(v as T)) throw new RoutineError(`${k} không hợp lệ.`)
      return v as T
    }
    const enabled = typeof input.enabled === 'boolean' ? input.enabled : (prev?.enabled ?? true)
    const at = iso()
    const base = {
      id: prev?.id ?? `r-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
      bot,
      title,
      task,
      cron,
      tz,
      deliver: pick('deliver', ['telegram', 'none'] as const, prev?.deliver ?? 'telegram'),
      perms: pick('perms', ['read', 'bot'] as const, prev?.perms ?? 'read'),
      capUsd: num('capUsd', 0.01, 5, prev?.capUsd ?? ROUTINE_USD),
      catchupHours: num('catchupHours', 0, 48, prev?.catchupHours ?? CATCHUP_HOURS),
      enabled,
      failStreak: prev?.failStreak ?? 0,
      ...(prev?.alerted ? { alerted: true } : {}),
      createdAt: prev?.createdAt ?? at,
      updatedAt: at,
    }
    const nextAt = enabled ? next(base) : undefined
    return { ...base, ...(nextAt ? { nextAt } : {}) }
  }

  const alerts = () =>
    [...routines.entries()]
      .map(([, r]) => r)
      .filter((r) => r.failStreak >= FAIL_ALERT)
      .map((r) => {
        const failed = runsOf(r.id).filter((x) => x.status === 'failed' || x.status === 'cap')
        return {
          routine: r.id,
          title: r.title,
          bot: r.bot,
          streak: r.failStreak,
          error: failed[0]?.error ?? '',
          session: failed[0]?.sessionId ?? null,
        }
      })

  async function api(request: Request): Promise<Response> {
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      })
    const q = new URL(request.url).searchParams
    if (request.method !== 'POST') {
      const one = q.get('runs')
      if (one) return json({ runs: runsOf(one) })
      const list = [...routines.entries()]
        .map(([, r]) => view(r))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      const upcoming = list
        .filter((r) => r.enabled && r.nextAt)
        .sort((a, b) => a.nextAt!.localeCompare(b.nextAt!))[0]
      return json({
        routines: list,
        paused: paused(),
        next: upcoming ? { routine: upcoming.id, bot: upcoming.bot, at: upcoming.nextAt } : null,
        alerts: alerts(),
      })
    }
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
      op?: string
      id?: string
    }
    try {
      const r = b.id ? routines.get(b.id) : undefined
      if (b.op !== 'create' && b.op !== 'pause-all' && !r)
        return json({ error: 'Không có routine này.' }, 404)
      switch (b.op) {
        case 'create': {
          const rec = clean(b)
          await routines.put(rec.id, rec)
          return json({ ok: true, routine: view(rec) })
        }
        case 'update': {
          const rec = clean(b, r)
          await routines.put(rec.id, rec)
          return json({ ok: true, routine: view(rec) })
        }
        case 'toggle': {
          const on = b.on === true
          const nextAt = on ? next(r!) : undefined
          const rest: RoutineRecord = { ...r! }
          delete rest.nextAt
          const rec: RoutineRecord = { ...rest, enabled: on, updatedAt: iso(), ...(nextAt ? { nextAt } : {}) }
          await routines.put(rec.id, rec)
          return json({ ok: true, routine: view(rec) })
        }
        case 'delete': {
          await routines.delete(r!.id)
          for (const x of runsOf(r!.id)) await runs.delete(x.id)
          return json({ ok: true })
        }
        case 'run': {
          if (running(r!.id)) return json({ error: 'Routine này đang chạy.' }, 409)
          void runRoutine(r!, 'manual', iso()).catch((e: unknown) =>
            logger.warn('chạy tay routine: %s', String(e)),
          )
          return json({ ok: true })
        }
        case 'stop': {
          const found = [...live.entries()].find(([, x]) => x.routine === r!.id)
          if (!found) return json({ error: 'Routine này không chạy.' }, 409)
          found[1].forced ??= 'stop'
          sessions()?.cancel?.({ sessionId: found[0] })
          found[1].done?.('cancelled')
          return json({ ok: true })
        }
        case 'pause-all': {
          await state.put('main', { paused: b.on === true })
          // Chạy lại: hẹn lại từ bây giờ, không chạy bù những lần đã bỏ khi tạm dừng.
          if (b.on !== true)
            for (const [, x] of routines.entries())
              if (x.enabled) await routines.put(x.id, { ...x, nextAt: next(x), updatedAt: iso() })
          return json({ ok: true, paused: b.on === true })
        }
        case 'fix': {
          const failed = runsOf(r!.id).filter((x) => x.status === 'failed' || x.status === 'cap')
          const sid = failed[0]?.sessionId
          const sc = sessions()
          if (!sid || !sc) return json({ error: 'Chưa có lần chạy lỗi nào để xem.' }, 409)
          await sc.prompt(
            {
              requestId: randomUUID(),
              sessionId: sid,
              mode: 'queue',
              content: [
                {
                  type: 'text',
                  text: fixPrompt(
                    r!.title,
                    failed.slice(0, r!.failStreak || 1).map((x) => `${x.at}: ${x.error ?? x.status}`),
                  ),
                },
              ],
            },
            AbortSignal.timeout(30_000),
          )
          return json({ ok: true, session: sid })
        }
        default:
          return json({ error: 'op không hợp lệ' }, 400)
      }
    } catch (e) {
      if (e instanceof RoutineError) return json({ error: e.message }, 400)
      throw e
    }
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/routines',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: api,
      })
      return () => void dispose()
    }, 'aris-routine: /api/aris/routines')
  })
}
