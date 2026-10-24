/**
 * Skill tự tạo và tự vá của aris (giai đoạn 3, đợt 3; đặc tả: docs/specs/aris-skills.md).
 * - Kho skill theo bot và theo bản; vòng học nền (`@aris/reflect`) đề xuất qua `arisSkills.propose`.
 * - Mỗi agent được gắn một nguồn skill trong phạm vi của nó: chỉ thấy bản đang dùng của skill thuộc
 *   bot của phiên; dsh hiện trong danh mục skill và nạp bằng công cụ `skill`.
 * - Duyệt ở Hộp duyệt, màn 3.3 (`/api/aris/skills`) và Telegram (`arisSkills.on`, `answer`).
 * @module @aris/skills
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { SkillCandidate, SkillProvider } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { diffStat, lineDiff } from './diff.js'
import { skillsDomain } from './domain.js'
import { SkillError, SkillStore, skillId, type ProposeInput, type SkillEvent, type Table } from './store.js'

export * from './lint.js'
export * from './diff.js'
export * from './store.js'

export const name = 'aris-skills'
export const inject = ['storageDomain', 'tools']

/** Ưu tiên của skill aris trong danh mục (nhỏ thắng; skill dự án của dsh là 100). */
export const SKILL_RANK = 50
const PROVIDER = 'aris'

/** Dịch vụ cho plugin khác (vòng học nền đề xuất, Telegram duyệt). */
export interface ArisSkills {
  propose(input: ProposeInput): Promise<{ id: string; version: number } | undefined>
  /** Skill đang dùng của bot cho lời nhắc vòng học: tên, mô tả, thân. */
  activeFor(bot: string): { name: string; description: string; body: string; version: number }[]
  on(fn: (e: SkillEvent) => void): () => void
  answer(id: string, approve: boolean, by: 'telegram'): Promise<unknown>
  /** Mã các bản đang chờ duyệt (Telegram tìm lại thẻ sau khi aris khởi động lại). */
  pending(): string[]
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-skills')
  const domain = await ctx.storageDomain.open(skillsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-skills: domain')
  const store = new SkillStore(
    domain.table('skills') as unknown as Table<never>,
    domain.table('versions') as unknown as Table<never>,
  )
  const botOf = (sessionId: string | undefined) =>
    (ctx.get('arisBots') as { botOf(id: string | undefined): { id: string } } | undefined)?.botOf(sessionId)
      .id ?? 'aris'

  // Nguồn skill đang gắn ở các agent: làm mới danh mục khi bản đang dùng đổi.
  const invalidators = new Set<() => void>()
  const refresh = () => {
    for (const fn of invalidators) fn()
  }

  ctx.provide('arisSkills', {
    propose: async (input: ProposeInput) => {
      const v = await store.propose(input)
      return v ? { id: v.id, version: v.version } : undefined
    },
    activeFor: (bot: string) =>
      store.activeFor(bot).map(({ skill, version }) => ({
        name: skill.name,
        description: skill.description,
        body: version.body,
        version: version.version,
      })),
    on: (fn: (e: SkillEvent) => void) => store.on(fn),
    pending: () => store.pending().map((v) => v.id),
    answer: async (id: string, approve: boolean, by: 'telegram') => {
      const v = approve ? await store.approve(id, by) : await store.reject(id, by)
      refresh()
      return v
    },
  } satisfies ArisSkills)

  // Plugin con mount trong phạm vi agent: nguồn skill chỉ agent đó thấy.
  const agentPlugin = {
    name: 'aris-skills-agent',
    inject: ['skills'],
    apply(actx: Context, config: { sessionId: string }) {
      actx.effect(
        () =>
          actx.skills.registerProvider((control): SkillProvider => {
            invalidators.add(control.invalidate)
            control.signal.addEventListener('abort', () => invalidators.delete(control.invalidate), {
              once: true,
            })
            return {
              name: PROVIDER,
              list: async () =>
                store.activeFor(botOf(config.sessionId)).map(({ skill }): SkillCandidate => ({
                  name: skill.name,
                  description: skill.description,
                  ...(skill.whenToUse ? { whenToUse: skill.whenToUse } : {}),
                  invocation: { modelInvocable: true, userInvocable: true },
                  source: 'aris',
                  provider: PROVIDER,
                  rank: SKILL_RANK,
                  locator: skill.id,
                })),
              get: async (c) => {
                const v = store.active(String(c.locator))
                return v
                  ? {
                      name: c.name,
                      description: c.description,
                      ...(c.whenToUse ? { whenToUse: c.whenToUse } : {}),
                      invocation: c.invocation,
                      source: c.source,
                      provider: PROVIDER,
                      content: v.body,
                    }
                  : undefined
              },
            }
          }),
        'aris-skills: nguồn skill của agent',
      )
    },
  }
  ctx.on('agent/created', ({ agent }) => {
    try {
      ;(agent.ctx as unknown as { plugin(p: unknown, c: unknown): unknown }).plugin(agentPlugin, {
        sessionId: agent.session.id,
      })
    } catch (e) {
      logger.warn('gắn nguồn skill: %s', String(e))
    }
  })

  // Đếm lượt dùng: công cụ `skill` của dsh nạp một skill của aris.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    if (exec.name === 'skill' && !result.isError && exec.agent) {
      const n = (exec.arguments as { name?: unknown } | undefined)?.name
      if (typeof n === 'string')
        await store
          .recordUse(botOf(exec.agent.session.id), n)
          .catch((e: unknown) => logger.warn('đếm lượt dùng: %s', String(e)))
    }
    return next()
  })

  // Đề xuất quá hạn tự bỏ.
  ctx.effect(() => {
    const sweep = () =>
      void store.expire().catch((e: unknown) => logger.warn('bỏ đề xuất quá hạn: %s', String(e)))
    sweep()
    const timer = setInterval(sweep, 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-skills: đề xuất quá hạn')

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/skills',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const res = await skillsApi(store, request)
          if (request.method === 'POST' && res.ok) refresh()
          return res
        },
      })
      return () => void dispose()
    }, 'aris-skills: /api/aris/skills')
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** Một bản đề xuất kèm so sánh với bản đang dùng (Hộp duyệt, màn 3.3). */
function withDiff(store: SkillStore, id: string) {
  const v = store.version(id)
  if (!v) return undefined
  const base = store.active(v.skill)
  const diff = lineDiff(base && base.id !== v.id ? base.body : '', v.body)
  return { ...v, base: base && base.id !== v.id ? base.version : 0, stat: diffStat(diff), diff }
}

/**
 * Đường `/api/aris/skills` (dsh đã kiểm cookie và quyền chủ nhân).
 *   GET                       → mọi skill, kèm bản đề xuất đang chờ
 *   GET ?pending=all          → bản chờ duyệt (Hộp duyệt), số đã xử lý hôm nay
 *   GET ?id=<bot>--<tên>      → một skill, các bản, bản chờ so với bản đang dùng
 *   POST { op: approve | reject | restore, id (mã bản) | skill + version, body? }
 */
export async function skillsApi(store: SkillStore, request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams
  if (request.method !== 'POST') {
    if (q.get('pending') === 'all')
      return json({
        pending: store.pending().map((v) => withDiff(store, v.id)),
        doneToday: store.reviewedToday(),
      })
    const id = q.get('id')
    if (id) {
      const skill = store.get(id)
      if (!skill) return json({ error: 'Không có skill này.' }, 404)
      const versions = store.versionsOf(id)
      const proposed = versions.find((v) => v.status === 'proposed')
      return json({ skill, versions, proposed: proposed ? withDiff(store, proposed.id) : null })
    }
    return json({
      skills: store.list().map((s) => {
        const proposed = store.versionsOf(s.id).find((v) => v.status === 'proposed')
        return {
          ...s,
          proposed: proposed ? { version: proposed.version, why: proposed.why, by: proposed.by } : null,
        }
      }),
    })
  }
  const body = (await request.json().catch(() => ({}))) as {
    op?: unknown
    id?: unknown
    skill?: unknown
    version?: unknown
    body?: unknown
  }
  const id = typeof body.id === 'string' ? body.id : ''
  try {
    switch (body.op) {
      case 'approve':
        return json({
          ok: true,
          version: await store.approve(id, 'user', typeof body.body === 'string' ? body.body : undefined),
        })
      case 'reject':
        return json({ ok: true, version: await store.reject(id, 'user') })
      case 'restore': {
        if (typeof body.skill !== 'string' || typeof body.version !== 'number')
          return json({ error: 'Thiếu skill hoặc bản.' }, 400)
        return json({ ok: true, version: await store.restore(body.skill, body.version) })
      }
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
  } catch (e) {
    if (e instanceof SkillError) return json({ error: e.message }, 409)
    throw e
  }
}

export { skillId }
