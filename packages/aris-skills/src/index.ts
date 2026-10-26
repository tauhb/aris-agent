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
import type {} from '@deepseek-ai/dsh-commands'
import { createUserMessage, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type { SkillCandidate, SkillProvider } from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-storage-domain'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { randomUUID } from 'node:crypto'
import { diffStat, lineDiff } from './diff.js'
import { LEARN_TOOL, LEARN_WINDOW_MS, MAX_LEARN_CASES, learnPrompt } from './learn.js'
import { skillsDomain, type CuratorRun } from './domain.js'
import {
  EVAL_PREFIX,
  EVAL_USD,
  MAX_CASES,
  READ_ONLY_TOOLS,
  RUN_TIMEOUT_MS,
  SANDBOX_DENY,
  caseTitle,
  judgePrompt,
  parseJudge,
  readOnlyBash,
  summarize,
  type EvalRecord,
  type RunResult,
} from './eval.js'
import {
  ARCHIVE_DAYS,
  STALE_DAYS,
  SkillError,
  SkillStore,
  skillId,
  type CuratorPlan,
  type ProposeInput,
  type SkillEvent,
  type Table,
} from './store.js'

export * from './lint.js'
export * from './diff.js'
export * from './store.js'
export * from './eval.js'
export * from './learn.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Lượt `/learn`: lời nhắc gom tài liệu và viết skill. */
    'aris-skills': { kind: 'aris-skills' } & ContextFormed
  }
}
export type { CuratorRun } from './domain.js'

/** Số báo cáo của người dọn kho được giữ. */
export const CURATOR_RUNS_KEPT = 30

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
  /** Phiên kiểm thử skill (vòng học nền bỏ qua). */
  isEval(sessionId: string): boolean
  /** Số skill được bật lần đầu và số lần khôi phục bản cũ kể từ một thời điểm (thống kê, @aris/stats). */
  skillEvents(sinceMs: number): { enabled: number; rolledBack: number }
}

interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Model rẻ để chấm: model "Flash" của nhà cung cấp mặc định, không có thì model mặc định. */
function pickFlash(c: {
  default?: { provider?: string; model?: string }
  groups: { id: string; models: { id: string; name?: string }[] }[]
}): { provider: string; model: string } | undefined {
  const home = c.groups.find((g) => g.id === c.default?.provider)
  for (const g of [...(home ? [home] : []), ...c.groups]) {
    const m = g.models.find((x) => /flash/i.test(`${x.id} ${x.name ?? ''}`) && !x.id.endsWith(':batch'))
    if (m) return { provider: g.id, model: m.id }
  }
  return c.default?.provider && c.default.model
    ? { provider: c.default.provider, model: c.default.model }
    : undefined
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-skills')
  const domain = await ctx.storageDomain.open(skillsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-skills: domain')
  const store = new SkillStore(
    domain.table('skills') as unknown as Table<never>,
    domain.table('versions') as unknown as Table<never>,
  )
  const evals = domain.table('evals') as unknown as Table<EvalRecord> & {
    delete(k: string): Promise<boolean>
  }
  /** Phiên kiểm thử đang chạy: nguồn skill chỉ trả đúng bản cần thử (0: không skill nào). */
  const evalMode = new Map<string, { skill: string; version: number }>()
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
    isEval: (sessionId: string) => evalMode.has(sessionId),
    skillEvents: (sinceMs: number) => store.eventsSince(sinceMs),
    answer: async (id: string, approve: boolean, by: 'telegram') => {
      const v = approve ? await store.approve(id, by) : await store.reject(id, by)
      refresh()
      return v
    },
  } satisfies ArisSkills)

  // /learn (đợt 6): lệnh mở một lượt cho bot tự gom tài liệu bằng công cụ sẵn có và viết skill;
  // `luu_skill` chỉ nhận trong lượt đó và nộp thành đề xuất chờ duyệt như mọi đề xuất.
  const learning = new Map<string, { source: string; until: number }>()
  ctx.inject(['commands'], (ctx) => {
    ctx.effect(
      () =>
        ctx.commands.register({
          name: 'learn',
          description: 'Học một skill từ thư mục, tệp, URL hay quy trình tả bằng lời (/learn <nguồn>)',
          input: { hint: '<thư mục, URL hay quy trình>' },
          handler: ({ agent, rawInput }) => {
            const sid = agent.session.id
            const source = rawInput.trim().slice(0, 500)
            if (!source)
              return {
                kind: 'error',
                text: 'Thiếu nguồn, ví dụ: /learn ~/du-an/sdk, phần đăng nhập và phân trang',
              }
            if (evalMode.has(sid)) return { kind: 'error', text: 'Phiên kiểm thử skill không học skill mới.' }
            learning.set(sid, { source, until: Date.now() + LEARN_WINDOW_MS })
            const existing = store.activeFor(botOf(sid)).map(({ skill }) => skill.name)
            agent.followup(
              createUserMessage({
                content: [{ type: 'text', text: learnPrompt(source, existing) }],
                source: {
                  kind: 'aris-skills',
                  form: 'notice',
                  summary: `Học skill từ: ${source.slice(0, 80)}`,
                },
              }),
            )
            return {
              kind: 'success',
              text: 'Bot sẽ gom tài liệu rồi viết skill; skill chờ duyệt ở Hộp duyệt (và Telegram) như mọi đề xuất.',
            }
          },
        }),
      'aris-skills: /learn',
    )
  })
  ctx.on('session/disposed', (session) => void learning.delete(session.id))
  ctx.tools.register(
    defineTool({
      name: LEARN_TOOL,
      description:
        'Chỉ dùng trong lượt người dùng gõ /learn: nộp skill vừa viết từ nguồn người dùng chỉ để người dùng duyệt. Lượt khác bị từ chối.',
      parameters: {
        ten: {
          type: 'string',
          required: true,
          description: 'Tên skill: chữ thường không dấu, số, nối bằng "-".',
        },
        mo_ta: { type: 'string', required: true, description: 'Một câu: skill dùng khi nào.' },
        than: {
          type: 'string',
          required: true,
          description: 'Thân Markdown: ## Khi nào dùng, ## Các bước, ## Lỗi thường gặp, ## Kiểm tra.',
        },
        yeu_cau_mau: {
          type: 'array',
          items: { type: 'string' },
          description: `1–${MAX_LEARN_CASES} câu người dùng có thể nhờ mà skill này giúp được (ca kiểm thử).`,
        },
      },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
      async execute(args, exec) {
        const sid = exec.agent?.session.id
        const l = sid ? learning.get(sid) : undefined
        if (!sid || !l || l.until < Date.now())
          return 'Từ chối: công cụ này chỉ dùng trong lượt người dùng gõ /learn. Muốn lưu cách làm thành skill thì nhờ người dùng gõ /learn <nguồn>.'
        try {
          const v = await store.propose({
            bot: botOf(sid),
            name: args.ten.trim(),
            description: args.mo_ta.trim(),
            body: args.than,
            by: 'user',
            why: `Học từ: ${l.source}`,
            sessionId: sid,
            cases: (args.yeu_cau_mau ?? [])
              .map((c) => c.trim())
              .filter(Boolean)
              .slice(0, MAX_LEARN_CASES),
          })
          if (!v) return 'Thân giống hệt bản đang dùng: không có gì mới để đề xuất.'
          learning.delete(sid)
          return `Đã nộp ${v.name} v${v.version} (${v.from ? 'bản vá' : 'skill mới'}), đang chờ người dùng duyệt ở Hộp duyệt${v.warnings.length ? `. Cảnh báo của bộ kiểm: ${v.warnings.join(' ')}` : ''}.`
        } catch (e) {
          if (e instanceof SkillError) return `Bộ kiểm từ chối: ${e.message} Sửa rồi gọi lại ${LEARN_TOOL}.`
          throw e
        }
      },
    }),
  )

  // Phiên kiểm thử thấy đúng một bản (hoặc không skill nào); phiên thường thấy bản đang dùng của bot.
  const listFor = (sessionId: string) => {
    const mode = evalMode.get(sessionId)
    if (!mode) return store.activeFor(botOf(sessionId))
    const skill = store.get(mode.skill)
    return skill && mode.version ? [{ skill }] : []
  }
  const versionFor = (sessionId: string, skillId: string) => {
    const mode = evalMode.get(sessionId)
    if (!mode) return store.active(skillId)
    const s = store.get(skillId)
    return s && mode.skill === skillId && mode.version
      ? store.version(`${s.bot}--${s.name}--v${mode.version}`)
      : undefined
  }

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
                listFor(config.sessionId).map(({ skill }): SkillCandidate => ({
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
                const v = versionFor(config.sessionId, String(c.locator))
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

  // Lời người dùng gần nhất của mỗi phiên: thành ca thử khi skill được dùng trong lượt đó.
  const lastAsk = new Map<string, string>()
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    for (const m of messages)
      if (m.source.kind === 'user') {
        const text = m.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .join('\n')
          .trim()
        if (text) lastAsk.set(agent.session.id, text)
      }
    return next()
  })
  ctx.on('session/disposed', (session) => void lastAsk.delete(session.id))

  // Đếm lượt dùng: công cụ `skill` của dsh nạp một skill của aris (không tính phiên kiểm thử).
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const sid = exec.agent?.session.id
    if (exec.name === 'skill' && !result.isError && sid && !evalMode.has(sid)) {
      const n = (exec.arguments as { name?: unknown } | undefined)?.name
      if (typeof n === 'string') {
        const bot = botOf(sid)
        await store.recordUse(bot, n).catch((e: unknown) => logger.warn('đếm lượt dùng: %s', String(e)))
        const ask = lastAsk.get(sid)
        if (ask) await store.addCase(skillId(bot, n), { request: ask, sessionId: sid }).catch(() => undefined)
      }
    }
    return next()
  })

  // --- Kiểm thử bằng chạy lại --------------------------------------------------------
  interface RunState {
    steps: number
    tokens: number
    answer: string
    denied: number
    usd: number
    done?: (reason: string) => void
  }
  /** Số liệu của phiên kiểm thử đang chạy, gom từ sự kiện phiên. */
  const runs = new Map<string, RunState>()

  // Hộp cát của phiên kiểm thử: chỉ đọc.
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const sid = exec.agent?.session.id
      if (!sid || !evalMode.has(sid)) return next()
      if (READ_ONLY_TOOLS.has(exec.name)) return next()
      const command = (exec.arguments as { command?: unknown } | undefined)?.command
      if (exec.name === 'bash' && typeof command === 'string' && readOnlyBash(command)) return next()
      const run = runs.get(sid)
      if (run) run.denied++
      return { kind: 'deny', reason: SANDBOX_DENY }
    },
    true,
  )

  ctx.on('session/event', (session, event) => {
    const r = runs.get(session.id)
    if (!r) return
    if (event.type === 'assistant/message') {
      const data = event.data as unknown as {
        usage?: Usage
        message: { content: { type: string; text?: string }[] }
      }
      r.steps++
      const u = data.usage
      if (u) r.tokens += u.totalTokens ?? u.inputTokens + u.outputTokens + (u.cacheReadTokens ?? 0)
      const text = data.message.content
        .map((b) => (b.type === 'text' ? (b.text ?? '') : ''))
        .join('\n')
        .trim()
      if (text) r.answer = text
    } else if (event.type === 'turn/end') {
      r.done?.((event.data as unknown as { reason?: { kind?: string } }).reason?.kind ?? 'completed')
    }
  })

  // Tiền của phiên kiểm thử (sổ chi phí của @aris/providers).
  let offCost: (() => void) | undefined
  ctx.effect(() => () => offCost?.(), 'aris-skills: tiền kiểm thử')
  const spend = () =>
    ctx.get('arisSpend') as
      | {
          onCost?(fn: (session: string, usd: number) => void): () => void
          charge?(provider: string, model: string, usage: Usage, scope: readonly string[]): Promise<number>
        }
      | undefined
  const hookCost = () => {
    offCost ??= spend()?.onCost?.((session, usd) => {
      const r = runs.get(session)
      if (r) r.usd += usd
    })
  }

  interface SessionPort {
    create(req: { workspaceId?: string }): Promise<{ sessionId: string }>
    prompt(
      req: { requestId: string; sessionId: string; mode: 'queue'; content: { type: 'text'; text: string }[] },
      signal: AbortSignal,
    ): Promise<unknown>
    rename?(req: { sessionId: string; title: string }): Promise<unknown>
    cancel?(req: { sessionId: string }): unknown
    modelCatalog(): Promise<Parameters<typeof pickFlash>[0]>
  }
  const sessions = () => ctx.get('sessionController') as SessionPort | undefined

  /** Một lần chạy: phiên mới của bot, đúng bản skill cần thử, gửi yêu cầu, đợi xong. */
  async function runOnce(o: {
    bot: string
    skill: string
    version: number
    request: string
    title: string
    workspaceId?: string | undefined
  }): Promise<RunResult & { usd: number }> {
    const sc = sessions()
    const bots = ctx.get('arisBots') as
      { tag(s: string, b: string, via: 'dispatch'): Promise<void> } | undefined
    if (!sc || !bots) throw new SkillError('Chưa có bộ điều khiển phiên hay dịch vụ đội bot.')
    const { sessionId } = await sc.create(o.workspaceId ? { workspaceId: o.workspaceId } : {})
    evalMode.set(sessionId, { skill: o.skill, version: o.version })
    const r: RunState = { steps: 0, tokens: 0, answer: '', denied: 0, usd: 0 }
    runs.set(sessionId, r)
    try {
      await bots.tag(sessionId, o.bot, 'dispatch')
      await sc.rename?.({ sessionId, title: o.title }).catch(() => undefined)
      const ended = new Promise<string>((resolve) => {
        r.done = resolve
        setTimeout(() => resolve('timeout'), RUN_TIMEOUT_MS)
      })
      await sc.prompt(
        {
          requestId: randomUUID(),
          sessionId,
          mode: 'queue',
          content: [{ type: 'text', text: EVAL_PREFIX + o.request }],
        },
        AbortSignal.timeout(30_000),
      )
      const reason = await ended
      if (reason === 'timeout') sc.cancel?.({ sessionId })
      return {
        session: sessionId,
        steps: r.steps,
        tokens: r.tokens,
        answer: r.answer.slice(0, 4000),
        denied: r.denied,
        usd: r.usd,
        ...(reason !== 'completed' ? { error: reason === 'timeout' ? 'quá 5 phút' : reason } : {}),
      }
    } finally {
      // Giữ chế độ kiểm thử thêm chút để sự kiện cuối (tiền, câu trả lời) về đủ, rồi thả.
      setTimeout(() => {
        runs.delete(sessionId)
        evalMode.delete(sessionId)
      }, 30_000)
    }
  }

  /** Chấm một lần chạy bằng model rẻ; trả kết quả và tiền. */
  async function judge(request: string, skill: { name: string; description: string }, answer: string) {
    const sc = sessions()
    const m = sc ? pickFlash(await sc.modelCatalog()) : undefined
    const llm = ctx.get('llm') as
      | { stream(o: Record<string, unknown>): AsyncIterable<{ type: string; text?: string; usage?: Usage }> }
      | undefined
    if (!m || !llm) return { pass: undefined, note: 'chưa có model để chấm', usd: 0 }
    let raw = ''
    let usage: Usage | undefined
    for await (const c of llm.stream({
      provider: m.provider,
      model: m.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: judgePrompt({ request, skill: skill.name, description: skill.description, answer }),
            },
          ],
        },
      ],
      maxTokens: 3000,
    })) {
      if (c.type === 'text-delta' && c.text) raw += c.text
      else if (c.type === 'usage') usage = c.usage
    }
    const usd = usage ? ((await spend()?.charge?.(m.provider, m.model, usage, ['eval'])) ?? 0) : 0
    const v = parseJudge(raw)
    return { pass: v?.pass, note: v?.note ?? 'không đọc được kết quả chấm', usd }
  }

  let evalRunning: string | undefined
  /** Kiểm thử một skill: bản đề xuất (hoặc bản đang dùng) so với bản đang dùng (hoặc không skill). */
  async function startEval(id: string): Promise<EvalRecord> {
    if (evalRunning) throw new SkillError('Đang có một lần kiểm thử chạy; đợi xong rồi chạy tiếp.')
    const s = store.get(id)
    if (!s) throw new SkillError('Không có skill này.')
    const proposed = store.versionsOf(s.id).find((v) => v.status === 'proposed')
    const cand = proposed?.version ?? (s.status === 'active' ? s.version : 0)
    if (!cand) throw new SkillError('Skill chưa có bản nào để kiểm thử.')
    const base = proposed && s.status === 'active' ? s.version : 0
    const cases = (s.cases ?? []).slice(-MAX_CASES)
    if (!cases.length)
      throw new SkillError(
        'Chưa có ca thử: skill cần được dùng, hoặc được vòng học đề xuất từ một yêu cầu thật.',
      )
    hookCost()
    const e: EvalRecord = {
      id: `e-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`,
      skill: s.id,
      version: cand,
      base,
      at: new Date().toISOString(),
      status: 'running',
      cases: cases.map((c) => ({ request: c.request })),
      usd: 0,
      cap: EVAL_USD,
    }
    await evals.put(e.id, e)
    evalRunning = e.id
    void (async () => {
      const reg = ctx.get('workspaceRegistry') as
        { list(): readonly { id: string; sessionIds: readonly string[] }[] } | undefined
      try {
        for (let i = 0; i < cases.length && e.status === 'running'; i++) {
          const c = cases[i]!
          const workspaceId = c.sessionId
            ? reg?.list().find((w) => w.sessionIds.includes(c.sessionId!))?.id
            : undefined
          for (const side of ['base', 'cand'] as const) {
            if (e.usd >= e.cap) {
              e.status = 'stopped'
              e.note = `chạm trần ${EVAL_USD.toFixed(2).replace('.', ',')} USD sau ${i} ca`
              break
            }
            const version = side === 'base' ? base : cand
            const run = await runOnce({
              bot: s.bot,
              skill: s.id,
              version,
              request: c.request,
              workspaceId,
              title: `Kiểm thử skill · ${s.name} · ca ${i + 1} · ${version ? `v${version}` : 'không skill'} · ${caseTitle(c.request)}`,
            }).catch((err: unknown) => ({
              session: '',
              steps: 0,
              tokens: 0,
              answer: '',
              denied: 0,
              usd: 0,
              error: String(err).slice(0, 200),
            }))
            const { usd, ...result } = run
            e.usd += usd
            if (!result.error) {
              const j = await judge(c.request, s, result.answer).catch(() => ({
                pass: undefined,
                note: 'lỗi khi chấm',
                usd: 0,
              }))
              e.usd += j.usd
              Object.assign(result, { ...(j.pass !== undefined ? { pass: j.pass } : {}), note: j.note })
            }
            e.cases[i] = { ...e.cases[i]!, [side]: result }
            await evals.put(e.id, { ...e })
          }
        }
        if (e.status === 'running') e.status = 'done'
      } catch (err) {
        e.status = 'failed'
        e.note = String(err).slice(0, 200)
      } finally {
        e.finishedAt = new Date().toISOString()
        e.usd = Math.round(e.usd * 10000) / 10000
        await evals.put(e.id, { ...e }).catch(() => undefined)
        evalRunning = undefined
      }
    })()
    return e
  }
  /** Lần kiểm thử gần nhất của một skill (một bản nếu chỉ rõ). */
  const latestEval = (skill: string, version?: number) =>
    [...evals.entries()]
      .map(([, x]) => x)
      .filter((x) => x.skill === skill && (version === undefined || x.version === version))
      .sort((a, b) => b.at.localeCompare(a.at))[0]

  // Đề xuất quá hạn tự bỏ.
  ctx.effect(() => {
    const sweep = () =>
      void store.expire().catch((e: unknown) => logger.warn('bỏ đề xuất quá hạn: %s', String(e)))
    sweep()
    const timer = setInterval(sweep, 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-skills: đề xuất quá hạn')

  // Người dọn kho: mỗi ngày cất skill `ARCHIVE_DAYS` ngày không dùng (trừ skill đã ghim), ghi báo cáo.
  const curatorRuns = domain.table('curator_runs') as unknown as Table<CuratorRun> & {
    delete(k: string): Promise<boolean>
  }
  const lastRun = () =>
    [...curatorRuns.entries()].map(([, r]) => r).sort((a, b) => b.at.localeCompare(a.at))[0]
  const curator = { last: lastRun()?.at ?? '', next: '' }
  ctx.effect(() => {
    const run = () => {
      curator.last = new Date().toISOString()
      curator.next = new Date(Date.now() + 86_400_000).toISOString()
      void store
        .curate()
        .then(async (plan) => {
          const at = curator.last
          // Mã khoá chỉ gồm chữ, số, gạch nối.
          await curatorRuns.put(at.replace(/[^0-9A-Za-z]/g, '-'), { at, ...plan })
          const old = [...curatorRuns.entries()]
            .sort(([, a], [, b]) => b.at.localeCompare(a.at))
            .slice(CURATOR_RUNS_KEPT)
          for (const [k] of old) await curatorRuns.delete(k)
          if (!plan.archive.length) return
          logger.info(
            'cất %d skill lâu không dùng: %s',
            plan.archive.length,
            plan.archive.map((s) => s.id).join(', '),
          )
          refresh()
        })
        .catch((e: unknown) => logger.warn('dọn kho skill: %s', String(e)))
    }
    run()
    const timer = setInterval(run, 86_400_000)
    return () => clearInterval(timer)
  }, 'aris-skills: người dọn kho')

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/skills',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const res = await skillsApi(store, request, {
            startEval,
            latestEval,
            curator: () => ({
              ...curator,
              report: lastRun() ?? null,
              staleDays: STALE_DAYS,
              archiveDays: ARCHIVE_DAYS,
            }),
          })
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
 *   GET ?backup=1             → tệp sao lưu mọi skill và các bản
 *   GET ?curator=preview      → người dọn kho chạy thử: lần tới sẽ cất gì (không đổi gì)
 *   POST { op: approve | reject | restore, id (mã bản) | skill + version, body? }
 *   POST { op: pin | archive | unarchive | eval, skill, on? }
 */
export interface SkillsApiExtras {
  startEval(skill: string): Promise<EvalRecord>
  latestEval(skill: string, version?: number): EvalRecord | undefined
  curator(): CuratorView
}

/** Người dọn kho cho màn 3.2: lần chạy gần nhất / kế, báo cáo gần nhất, các mốc. */
export interface CuratorView {
  last: string
  next: string
  report: CuratorRun | null
  staleDays: number
  archiveDays: number
}

const evalView = (e: EvalRecord | undefined) => (e ? { ...e, summary: summarize(e) } : null)

export async function skillsApi(
  store: SkillStore,
  request: Request,
  ext?: SkillsApiExtras,
): Promise<Response> {
  const q = new URL(request.url).searchParams
  if (request.method !== 'POST') {
    if (q.get('backup'))
      return new Response(JSON.stringify(store.backup(), null, 2), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="aris-skills-${new Date().toISOString().slice(0, 10)}.aris-skills.json"`,
        },
      })
    if (q.get('curator') === 'preview') return json({ plan: store.curatePlan() satisfies CuratorPlan })
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
      return json({
        skill: { ...skill, stale: store.isStale(skill), idleDays: store.idleDays(skill) },
        versions,
        proposed: proposed ? withDiff(store, proposed.id) : null,
        eval: evalView(ext?.latestEval(id, proposed?.version ?? skill.version)),
      })
    }
    return json({
      curator: ext?.curator(),
      skills: store.list().map((s) => {
        const proposed = store.versionsOf(s.id).find((v) => v.status === 'proposed')
        const e = ext?.latestEval(s.id)
        const sum = e && e.status !== 'running' ? summarize(e) : undefined
        return {
          ...s,
          stale: store.isStale(s),
          idleDays: store.idleDays(s),
          proposed: proposed ? { version: proposed.version, why: proposed.why, by: proposed.by } : null,
          // Thành công: tỉ lệ đạt của lần kiểm thử gần nhất (bản so sánh → bản thử).
          success: sum?.cases
            ? {
                base: sum.pass.base / sum.cases,
                cand: sum.pass.cand / sum.cases,
                version: e!.version,
              }
            : null,
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
    on?: unknown
  }
  const skill = typeof body.skill === 'string' ? body.skill : ''
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
      case 'pin':
        return json({ ok: true, skill: await store.pin(skill, body.on !== false) })
      case 'archive':
        return json({ ok: true, skill: await store.archive(skill, 'user') })
      case 'unarchive':
        return json({ ok: true, skill: await store.unarchive(skill) })
      case 'eval':
        if (!ext) return json({ error: 'Chưa bật kiểm thử.' }, 400)
        return json({ ok: true, eval: evalView(await ext.startEval(skill)) })
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
  } catch (e) {
    if (e instanceof SkillError) return json({ error: e.message }, 409)
    throw e
  }
}

export { skillId }
