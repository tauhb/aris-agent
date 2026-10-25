/**
 * Điểm khôi phục tệp của aris (giai đoạn 4, đợt 5; đặc tả: docs/specs/aris-checkpoints.md): chụp thư
 * mục làm việc vào kho git ẩn trước khi bot sửa tệp (mỗi thư mục mỗi lượt một lần), `/rollback`, API
 * cho màn 3.5.
 * @module @aris/checkpoints
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-commands'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { z } from 'zod'
import { CheckpointError, ShadowStore, type Change } from './git.js'
import { detailOf, mutates, toPrune, tooBroad } from './rules.js'

export * from './rules.js'
export { ShadowStore, CheckpointError, type Change } from './git.js'

export const name = 'aris-checkpoints'
export const inject = ['storageDomain']

/** Chụp lâu hơn chừng này thì để công cụ chạy tiếp (không chặn bot). */
const SNAPSHOT_TIMEOUT_MS = 20_000

const pointRecord = z.object({
  id: z.string(),
  dir: z.string(),
  commit: z.string(),
  at: z.string(),
  bot: z.string(),
  sessionId: z.string(),
  tool: z.string(),
  detail: z.string(),
  /** Điểm chụp trước khi khôi phục (để khôi phục lại lần khôi phục). */
  restore: z.boolean().optional(),
})
export type PointRecord = z.infer<typeof pointRecord>

const checkpointsDomain = defineDomain({
  name: 'aris_checkpoints',
  version: 1,
  layout: 'per-record',
  tables: { points: domainTable<string, PointRecord>(pointRecord) },
})

interface Table<V> {
  get(k: string): V | undefined
  entries(): Iterable<[string, V]>
  put(k: string, v: V): Promise<void>
  delete(k: string): Promise<boolean>
}

type AgentLike = { session: { id: string; header?: { cwd?: string } } }

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-checkpoints')
  const domain = await ctx.storageDomain.open(checkpointsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-checkpoints: domain')
  const points = domain.table('points') as unknown as Table<PointRecord>
  const shadow = new ShadowStore()
  const hasGit = await shadow.available()
  if (!hasGit) logger.warn('không có git trên máy: tắt điểm khôi phục')
  const botOf = (sid: string) =>
    (ctx.get('arisBots') as { botOf(id: string): { id: string; name: string } } | undefined)?.botOf(sid) ?? {
      id: 'aris',
      name: 'Aris',
    }

  const all = () => [...points.entries()].map(([, p]) => p)
  const ofDir = (dir: string) =>
    all()
      .filter((p) => p.dir === dir)
      .sort((a, b) => b.at.localeCompare(a.at))
  const newId = () => `cp-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

  async function take(
    dir: string,
    o: { bot: string; sessionId: string; tool: string; detail: string; restore?: boolean },
  ) {
    const last = ofDir(dir)[0]
    const message = `${o.restore ? 'trước khi khôi phục' : `trước khi ${o.tool}`}: ${o.detail}`.slice(0, 200)
    const commit = await shadow.snapshot(dir, message, last?.commit)
    if (!commit) return undefined
    const p: PointRecord = { id: newId(), dir, commit, at: new Date().toISOString(), ...o }
    await points.put(p.id, p)
    return p
  }

  // --- Chụp trước khi sửa: mỗi thư mục mỗi lượt một lần ----------------------------------
  const turnOf = new Map<string, number>()
  const done = new Set<string>()
  ctx.on('agent/pre-step', ({ agent, turn }, next) => {
    turnOf.set(agent.session.id, turn)
    return next()
  })
  ctx.on('session/disposed', (session) => {
    turnOf.delete(session.id)
    for (const k of done) if (k.startsWith(`${session.id}#`)) done.delete(k)
  })
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const decision = await next()
      if (!hasGit || decision.kind === 'deny' || !mutates(exec.name, exec.arguments)) return decision
      const agent = exec.agent as AgentLike | undefined
      const sid = agent?.session.id
      const cwd = agent?.session.header?.cwd
      if (!sid || !cwd || tooBroad(cwd, homedir())) return decision
      const dir = resolve(cwd)
      const key = `${sid}#${turnOf.get(sid) ?? 0}#${dir}`
      if (done.has(key)) return decision
      done.add(key)
      const bot = botOf(sid)
      await Promise.race([
        take(dir, {
          bot: bot.id,
          sessionId: sid,
          tool: exec.name,
          detail: detailOf(exec.name, exec.arguments),
        }).catch((e: unknown) =>
          logger.warn('chụp %s: %s', dir, e instanceof Error ? e.message.split('\n')[0] : String(e)),
        ),
        new Promise((r) => setTimeout(r, SNAPSHOT_TIMEOUT_MS)),
      ])
      return decision
    },
    true,
  )

  // Dọn mỗi ngày: quá 7 ngày hay ngoài 20 điểm mỗi thư mục.
  ctx.effect(() => {
    const sweep = async () => {
      const gone = toPrune(all(), new Date())
      for (const p of gone) {
        await shadow.drop(p.dir, p.commit)
        await points.delete(p.id)
      }
      if (gone.length) await shadow.gc().catch((e: unknown) => logger.warn('gc: %s', String(e)))
    }
    const first = setTimeout(() => void sweep().catch(() => undefined), 60_000)
    const timer = setInterval(() => void sweep().catch(() => undefined), 86_400_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, 'aris-checkpoints: dọn')

  // --- Xem, khôi phục ------------------------------------------------------------------
  /** Tệp mà lượt sau điểm đã đổi: tới điểm kế của thư mục, hay tới hiện tại với điểm mới nhất. */
  async function touched(p: PointRecord): Promise<Change[]> {
    const list = ofDir(p.dir)
    const i = list.findIndex((x) => x.id === p.id)
    const after = i > 0 ? list[i - 1] : undefined
    return after ? shadow.between(p.dir, p.commit, after.commit) : shadow.changes(p.dir, p.commit)
  }

  async function restore(p: PointRecord, sessionId: string, file?: string): Promise<number> {
    await take(p.dir, { bot: 'aris', sessionId, tool: 'khôi phục', detail: `về điểm ${p.id}`, restore: true })
    return shadow.restore(p.dir, p.commit, file)
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    const two = (n: number) => String(n).padStart(2, '0')
    return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
  }

  ctx.inject(['commands'], (ctx) => {
    ctx.effect(
      () =>
        ctx.commands.register({
          name: 'rollback',
          description:
            'Điểm khôi phục tệp của thư mục phiên (/rollback, /rollback diff <n>, /rollback <n> [tệp])',
          input: { hint: '[diff] [n] [tệp]' },
          handler: async ({ agent, rawInput }) => {
            const a = agent as unknown as AgentLike
            const cwd = a.session.header?.cwd
            if (!cwd) return { kind: 'error', text: 'Phiên này không có thư mục làm việc.' }
            const list = ofDir(resolve(cwd))
            if (!list.length) return { kind: 'success', text: `Chưa có điểm khôi phục nào cho ${cwd}.` }
            const [first, second, ...rest] = rawInput.trim().split(/\s+/).filter(Boolean)
            if (!first)
              return {
                kind: 'success',
                text: [
                  `Điểm khôi phục của ${cwd} (mới trước):`,
                  ...list
                    .slice(0, 20)
                    .map(
                      (p, i) =>
                        `${i + 1}. ${fmt(p.at)} · ${p.restore ? 'trước khi khôi phục' : `trước khi ${p.tool}`}: ${p.detail}`,
                    ),
                  '/rollback diff <n> xem khác biệt · /rollback <n> khôi phục · /rollback <n> <tệp> khôi phục một tệp',
                ].join('\n'),
              }
            const isDiff = first === 'diff'
            const n = Number(isDiff ? second : first)
            const p = list[n - 1]
            if (!p) return { kind: 'error', text: `Không có điểm số ${isDiff ? second : first}.` }
            try {
              if (isDiff) {
                const d = await shadow.diff(p.dir, p.commit)
                return { kind: 'success', text: d.stat.trim() || 'Không có gì khác từ lúc chụp.' }
              }
              const file = [second, ...rest].filter(Boolean).join(' ') || undefined
              const count = await restore(p, a.session.id, file)
              return {
                kind: 'success',
                text: `Đã đưa ${count} tệp về như lúc ${fmt(p.at)}. Đã chụp trạng thái trước khi khôi phục (điểm số 1) nếu cần quay lại.`,
              }
            } catch (e) {
              return { kind: 'error', text: e instanceof Error ? e.message.split('\n')[0]! : String(e) }
            }
          },
        }),
      'aris-checkpoints: /rollback',
    )
  })

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/checkpoints',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          const q = new URL(request.url).searchParams
          try {
            if (request.method !== 'POST') {
              const diffId = q.get('diff')
              if (diffId) {
                const p = points.get(diffId)
                if (!p) return json({ error: 'Không có điểm này.' }, 404)
                return json(await shadow.diff(p.dir, p.commit))
              }
              const recent = all()
                .sort((a, b) => b.at.localeCompare(a.at))
                .slice(0, 20)
              const rows = await Promise.all(
                recent.map(async (p) => {
                  const files = await touched(p).catch(() => [] as Change[])
                  return { ...p, files: files.length, paths: files.slice(0, 5).map((f) => f.path) }
                }),
              )
              return json({ enabled: hasGit, points: rows })
            }
            const b = (await request.json().catch(() => ({}))) as { op?: string; id?: string; file?: string }
            if (b.op !== 'restore') return json({ error: 'op không hợp lệ' }, 400)
            const p = b.id ? points.get(b.id) : undefined
            if (!p) return json({ error: 'Không có điểm này.' }, 404)
            const count = await restore(p, p.sessionId, b.file)
            return json({ ok: true, count })
          } catch (e) {
            if (e instanceof CheckpointError) return json({ error: e.message.split('\n')[0] }, 409)
            throw e
          }
        },
      })
      return () => void dispose()
    }, 'aris-checkpoints: /api/aris/checkpoints')
  })
}
