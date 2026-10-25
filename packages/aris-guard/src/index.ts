/**
 * Hàng rào cho mọi bot (giai đoạn 7, đợt 7a; đặc tả: docs/specs/aris-guard.md; bản vẽ 6.4):
 * - Trần chi phí cả đội mỗi ngày, báo Telegram khi chạm ngưỡng và khi chạm trần; chạm trần thì dừng việc nền hay
 *   dừng hết.
 * - Dừng khẩn cấp: phiên đang làm bị huỷ, mọi bước model bị chặn, routine, Driver, ứng dụng khác, kênh dừng.
 * - Danh sách cấm cứng cho mọi bot, áp cả khi người dùng đã duyệt.
 * - Chế độ duyệt: hỏi người dùng, hay tự cho việc rủi ro thấp; chờ duyệt quá hạn thì từ chối.
 * - `/api/aris/guard` cho màn 6.4.
 * @module @aris/guard
 */
import { randomUUID } from 'node:crypto'
import type { ArisBots } from '@aris/bots'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { guardDomain, type BlockedRecord, type NoticeRecord, type Table } from './domain.js'
import { cleanGuard, DEFAULT_GUARD, hardVerdict, lowRisk, warnLevel, type GuardSettings } from './policy.js'

export * from './policy.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Báo hết trần chi phí cả đội: hiện thành dòng "notice", model cũng đọc. */
    'aris-guard': { kind: 'aris-guard' } & ContextFormed
  }
}

export const name = 'aris-guard'
export const inject = ['storageDomain', 'sessionController']

/** Giữ nhật ký chặn bấy nhiêu ngày. */
const BLOCKED_DAYS = 7

/** Dịch vụ cho plugin khác: aris có đang dừng khẩn cấp không (routine, Driver, kênh, ứng dụng khác). */
export interface ArisGuard {
  stopped(): boolean
}

interface SpendPort {
  today(): Record<string, number>
  total?(): number
}
type AgentLike = { session: { id: string; header?: { cwd?: string; parentSession?: string } } }

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const usd = (n: number) => n.toFixed(2).replace('.', ',')

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-guard')
  const domain = await ctx.storageDomain.open(guardDomain)
  ctx.effect(() => () => void domain.close(), 'aris-guard: domain')
  const settingsT = domain.table('settings') as unknown as Table<GuardSettings>
  const blockedT = domain.table('blocked') as unknown as Table<BlockedRecord>
  const noticesT = domain.table('notices') as unknown as Table<NoticeRecord>
  const settings = (): GuardSettings => ({ ...DEFAULT_GUARD, ...(settingsT.get('main') ?? {}) })
  const save = (s: GuardSettings) => settingsT.put('main', s)

  const bots = () => ctx.get('arisBots') as ArisBots | undefined
  const spend = () => ctx.get('arisSpend') as SpendPort | undefined
  const totalToday = () => spend()?.total?.() ?? 0
  ctx.provide('arisGuard', { stopped: () => settings().stopped } satisfies ArisGuard)

  /** Việc nền: routine, Thủ thư, kiểm thử skill, phiên khách, thành viên đội và việc được giao. */
  const isBackground = (agent: AgentLike) => {
    const id = agent.session.id
    const has = (svc: string, fn: string) =>
      (ctx.get(svc) as Record<string, ((id: string) => boolean) | undefined> | undefined)?.[fn]?.(id) === true
    if (agent.session.header?.parentSession) return true
    if (has('arisRoutine', 'isRoutine') || has('arisBrain', 'isLibrarian') || has('arisSkills', 'isEval'))
      return true
    if (has('arisAcp', 'isGuest')) return true
    const via = bots()?.store.tagOf(id)?.via
    return via === 'team' || via === 'dispatch'
  }

  // --- Dừng khẩn cấp, trần cả đội: chặn bước model ------------------------------------------------
  const noticed = new Set<string>()
  ctx.on(
    'agent/pre-step',
    async ({ agent, turn, signal }, next) => {
      const s = settings()
      if (s.stopped) return { kind: 'reject' }
      const decision = await next()
      if (decision.kind === 'reject' || signal.aborted) return decision
      const spent = totalToday()
      if (warnLevel(spent, s) !== 'tran') return decision
      const a = agent as unknown as AgentLike
      if (s.capMode === 'bg' && !isBackground(a)) return decision
      const key = `${a.session.id}#${turn}`
      if (noticed.has(key)) return { kind: 'reject' }
      noticed.add(key)
      return {
        ...decision,
        messages: [
          ...decision.messages,
          createUserMessage({
            content: [
              {
                type: 'text',
                text: `Cả đội đã dùng hết trần chi phí hôm nay (${usd(spent)} / ${usd(s.teamCapUsd)} USD). Không làm tiếp việc này, không gọi công cụ; trả lời đúng một câu ngắn báo việc dừng vì hết ngân sách hôm nay.`,
              },
            ],
            source: { kind: 'aris-guard', form: 'notice', summary: 'hết trần chi phí cả đội hôm nay' },
          }),
        ],
      }
    },
    true,
  )

  // Báo khi chạm ngưỡng, chạm trần: mỗi mức một lần mỗi ngày.
  ctx.effect(() => {
    const check = async () => {
      const s = settings()
      const lvl = warnLevel(totalToday(), s)
      if (!lvl) return
      const day = dayKey()
      const prev = noticesT.get(day)
      if (prev?.levels.includes(lvl)) return
      await noticesT.put(day, { day, levels: [...(prev?.levels ?? []), lvl], at: new Date().toISOString() })
      const spent = totalToday()
      const text =
        lvl === 'tran'
          ? `⛔ **Hết trần chi phí hôm nay** (${usd(spent)} / ${usd(s.teamCapUsd)} USD). ${s.capMode === 'all' ? 'aris dừng mọi việc tới 0 giờ.' : 'Việc nền dừng tới 0 giờ; chat vẫn trả lời.'} Sửa trần ở Cài đặt › Ngân sách, duyệt, an toàn.`
          : `⚠️ **Đã dùng ${Math.round((spent / s.teamCapUsd) * 100)}% trần chi phí hôm nay** (${usd(spent)} / ${usd(s.teamCapUsd)} USD).`
      await (ctx.get('arisChannels') as { sendHome?(bot: string, md: string): Promise<unknown> } | undefined)
        ?.sendHome?.('aris', text)
        .catch((e: unknown) => logger.warn('báo ngân sách: %s', String(e)))
    }
    const timer = setInterval(() => void check().catch(() => undefined), 60_000)
    const first = setTimeout(() => void check().catch(() => undefined), 15_000)
    return () => {
      clearInterval(timer)
      clearTimeout(first)
    }
  }, 'aris-guard: báo ngân sách')

  // --- Danh sách cấm cứng, chế độ duyệt, hạn duyệt ------------------------------------------------
  /** Lời gọi vừa qua hàng rào: callId → công cụ, tham số, thư mục (để tự cho việc rủi ro thấp). */
  const calls = new Map<string, { tool: string; args: unknown; cwd?: string | undefined; at: number }>()
  const prune = () => {
    const old = Date.now() - 3_600_000
    for (const [k, v] of calls) if (v.at < old) calls.delete(k)
  }
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const a = exec.agent as unknown as AgentLike | undefined
      const cwd = a?.session.header?.cwd
      const v = hardVerdict(exec.name, exec.arguments, cwd)
      if (v) {
        const id = `b-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
        const sid = a?.session.id ?? ''
        await blockedT
          .put(id, {
            id,
            at: new Date().toISOString(),
            bot: sid ? (bots()?.botOf(sid).name ?? '') : '',
            session: sid,
            tool: exec.name,
            what: v.what,
          })
          .catch(() => undefined)
        return { kind: 'deny', reason: v.reason }
      }
      prune()
      calls.set(String(exec.callId), { tool: exec.name, args: exec.arguments, cwd, at: Date.now() })
      return next()
    },
    true,
  )
  ctx.on(
    'approval/request',
    async (req, next) => {
      const sid = req.agent.session.id
      // Phiên khách của ứng dụng khác: ứng dụng quyết (@aris/acp).
      if ((ctx.get('arisAcp') as { isGuest?(id: string): boolean } | undefined)?.isGuest?.(sid)) return next()
      const s = settings()
      const call = req.callId ? calls.get(String(req.callId)) : undefined
      if (s.mode === 'auto' && call && lowRisk(call.tool, call.args, call.cwd)) return 'allowed-once'
      if (!(s.approvalMin > 0)) return next()
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<'rejected'>((resolve) => {
        timer = setTimeout(() => resolve('rejected'), s.approvalMin * 60_000)
      })
      try {
        return await Promise.race([next(), timeout])
      } finally {
        clearTimeout(timer)
      }
    },
    true,
  )
  // Dọn nhật ký chặn cũ.
  ctx.effect(() => {
    const clean = () => {
      const since = Date.now() - BLOCKED_DAYS * 86_400_000
      for (const [k, r] of blockedT.entries()) if (Date.parse(r.at) < since) void blockedT.delete(k)
      for (const [k] of noticesT.entries())
        if (k < dayKey(new Date(Date.now() - 3 * 86_400_000))) void noticesT.delete(k)
    }
    clean()
    const timer = setInterval(clean, 6 * 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-guard: dọn')

  // --- Dừng khẩn cấp ------------------------------------------------------------------------------
  async function stop() {
    const s = settings()
    if (s.stopped) return { sessions: 0, apps: 0 }
    await save({ ...s, stopped: true, stoppedAt: new Date().toISOString() })
    let sessions = 0
    for (const sid of bots()?.live.runningSessions() ?? []) {
      try {
        await ctx.sessionController.cancel({ sessionId: SessionId(sid) })
        sessions++
      } catch (e) {
        logger.warn('huỷ phiên %s: %s', sid, String(e))
      }
    }
    const apps = (ctx.get('arisAcp') as { disconnectAll?(): number } | undefined)?.disconnectAll?.() ?? 0
    logger.warn('dừng khẩn cấp: %d phiên, %d ứng dụng', sessions, apps)
    return { sessions, apps }
  }
  async function resume() {
    const s = { ...settings(), stopped: false }
    delete s.stoppedAt
    await save(s)
  }

  // --- /api/aris/guard -----------------------------------------------------------------------------
  /** Kho khoá Keychain (@aris/keychain): tên khoá và nơi giữ, chuyển khoá trong tệp sang Keychain. */
  const keys = () => {
    const c = ctx.get('credentials') as
      | {
          listKeys?(): Promise<{ name: string; where: string }[]>
          moveAllToKeychain?(): Promise<number>
        }
      | undefined
    return { list: c?.listKeys?.bind(c), move: c?.moveAllToKeychain?.bind(c) }
  }
  ctx.inject(['connection'], (ctx) => {
    const state = async () => {
      const s = settings()
      const b = bots()
      const scopes = spend()?.today() ?? {}
      const since = Date.now() - BLOCKED_DAYS * 86_400_000
      const blocked = [...blockedT.entries()]
        .map(([, r]) => r)
        .filter((r) => Date.parse(r.at) >= since)
        .sort((a, z) => z.at.localeCompare(a.at))
      return {
        settings: s,
        spent: totalToday(),
        level: warnLevel(totalToday(), s) ?? null,
        departments: (b?.store.departments() ?? []).map((d) => ({
          id: d.id,
          name: d.name,
          spent: scopes[d.id] ?? 0,
          cap: d.policy?.budgetUsd ?? null,
          onBudget: d.policy?.onBudget ?? 'stop',
        })),
        media: { image: scopes['media-image'] ?? 0, video: scopes['media-video'] ?? 0 },
        blocked: blocked.slice(0, 20),
        blockedCount: blocked.length,
        waiting: b?.live.waitingCount() ?? 0,
        keys:
          (await keys()
            .list?.()
            .catch(() => [])) ?? [],
      }
    }
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/guard',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          if (request.method !== 'POST') return json(await state())
          let body: Record<string, unknown>
          try {
            body = (await request.json()) as Record<string, unknown>
          } catch {
            return json({ error: 'JSON không hợp lệ' }, 400)
          }
          switch (body.op) {
            case 'stop': {
              const info = await stop()
              return json({ ...(await state()), stopped: info })
            }
            case 'resume':
              await resume()
              break
            case 'set':
              await save(cleanGuard(body.settings, settings()))
              break
            case 'keys-move': {
              const move = keys().move
              if (!move) return json({ error: 'Kho khoá Keychain chưa chạy.' }, 409)
              const moved = await move()
              return json({ ...(await state()), moved })
            }
            default:
              return json({ error: 'op không hợp lệ' }, 400)
          }
          return json(await state())
        },
      })
      return () => void dispose()
    }, 'aris-guard: /api/aris/guard')
  })
}
