/**
 * Tự trị của aris (giai đoạn 3, đợt 5; đặc tả: docs/specs/aris-autonomy.md).
 * - Giám khảo cho `/goal` của dsh: cuối mỗi lượt của phiên có mục tiêu đang chạy, model rẻ chấm
 *   xong / tiếp / bị chặn; xong thì đánh dấu xong, bị chặn hay không tiến triển thì chặn mục tiêu.
 * - Lệnh `/loop` và `/heartbeat` chạy trên lịch nhắc bền của dsh; vòng lặp tự điều nhịp.
 * - `/api/aris/autonomy` cho màn 3.5 (Việc đang chạy).
 * @module @aris/autonomy
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-goal'
import { createUserMessage, type ContentBlock, type ContextFormed } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-schedule'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import { autonomyDomain, keyOf, type GoalRecord, type LoopRecord, type Table } from './domain.js'
import {
  MARKER_RE,
  MAX_SUBGOALS,
  WAIT_MARKER_RE,
  MIN_SECONDS,
  contractPrompt,
  contractText,
  parseContract,
  parseSubgoal,
  heartbeatPrompt,
  humanInterval,
  isStuck,
  judgePrompt,
  loopPrompt,
  nextAuto,
  parseHeartbeat,
  parseLoop,
  parseVerdict,
  unchanged,
  waitPlan,
  waitPrompt,
  type Verdict,
} from './rules.js'

export * from './rules.js'
export type { GoalRecord, LoopRecord } from './domain.js'

export const name = 'aris-autonomy'
/** Giám khảo chấm lâu hơn mức này thì lượt cứ đóng, mục tiêu chạy tiếp như dsh mặc định. */
const JUDGE_TIMEOUT_MS = 30_000
/** Bước đầu của mục tiêu mới chờ hợp đồng hoàn thành soạn xong tối đa chừng này. */
const CONTRACT_WAIT_MS = 15_000
export const inject = ['storageDomain', 'llm', 'sessionController']

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Lời báo của giám khảo gắn vào lượt kế của mục tiêu. */
    'aris-autonomy': { kind: 'aris-autonomy' } & ContextFormed
  }
}

interface Usage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

interface GoalView {
  id: string
  revision: number
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  blockedReason?: { code: string; message: string }
  maxGoalRounds: number
  roundsStarted: number
}
interface GoalsPort {
  get(agent: Agent): GoalView | undefined
  complete(agent: Agent, ref: { id: string; revision: number }): GoalView
  block(
    agent: Agent,
    ref: { id: string; revision: number },
    reason: { code: string; message: string },
  ): GoalView
  pause(agent: Agent, ref: { id: string; revision: number }): GoalView
  resume(agent: Agent, ref: { id: string; revision: number }): GoalView
  clear(agent: Agent, ref: { id: string; revision: number }): unknown
}
interface ScheduleRecord {
  id: string
  scheduledAt: string
  [k: string]: unknown
}
interface SchedulePort {
  create(
    sessionId: unknown,
    req: { prompt: string; title: string; every_seconds: number },
  ): Promise<ScheduleRecord>
  list(req: { sessionId: unknown }): Promise<ScheduleRecord[]>
  delete(req: { sessionId: unknown; id: unknown }): Promise<unknown>
  update(req: {
    sessionId: unknown
    id: unknown
    expected: ScheduleRecord
    change: { kind: 'every'; every_seconds: number }
  }): Promise<unknown>
}

const textOf = (blocks: readonly ContentBlock[]) =>
  blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim()

/** Lượt đang chạy của một phiên: câu trả lời cuối, công cụ đã gọi, lời nhắc của vòng lặp (nếu có). */
interface TurnState {
  turn: number
  answer: string
  tools: string[]
  loop?: string | undefined
  /** Mục tiêu đang chạy lúc lượt bắt đầu (bot có thể tự đánh dấu xong giữa lượt). */
  goal?: string | undefined
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-autonomy')
  const domain = await ctx.storageDomain.open(autonomyDomain)
  ctx.effect(() => () => void domain.close(), 'aris-autonomy: domain')
  const goals = domain.table('goals') as unknown as Table<GoalRecord>
  const loops = domain.table('loops') as unknown as Table<LoopRecord>

  const goalsPort = () => ctx.get('goals') as GoalsPort | undefined
  const schedule = () => ctx.get('schedule') as SchedulePort | undefined
  const botOf = (sid: string) =>
    (ctx.get('arisBots') as { botOf(id: string): { id: string } } | undefined)?.botOf(sid).id ?? 'aris'
  const now = () => new Date().toISOString()

  // --- Theo dõi lượt --------------------------------------------------------------------
  const turns = new Map<string, TurnState>()
  const turnOf = (sid: string, turn: number) => {
    let t = turns.get(sid)
    if (!t || t.turn !== turn) turns.set(sid, (t = { turn, answer: '', tools: [] }))
    return t
  }
  ctx.on('agent/pre-step', async ({ agent, messages, turn }, next) => {
    const t = turnOf(agent.session.id, turn)
    await wakeFromWait(agent, messages as readonly { role: string; content: readonly ContentBlock[] }[])
    if (!t.goal) {
      const g = goalsPort()?.get(agent)
      if (g?.phase === 'active') t.goal = g.id
    }
    for (const m of messages) {
      const hit = MARKER_RE.exec(textOf(m.content as readonly ContentBlock[]))
      if (hit) t.loop = hit[1]
    }
    // Mục tiêu mới: chờ hợp đồng hoàn thành (soạn nền), rồi gắn lời báo hợp đồng / tiêu chí mới.
    const sid = agent.session.id
    const draft = drafts.get(sid)
    if (draft) await Promise.race([draft, new Promise((r) => setTimeout(r, CONTRACT_WAIT_MS))])
    const decision = await next()
    const note = notices.get(sid)
    if (!note || decision.kind === 'reject') return decision
    notices.delete(sid)
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text: note }],
          source: { kind: 'aris-autonomy', form: 'notice', summary: 'Hợp đồng mục tiêu' },
        }) as (typeof decision.messages)[number],
      ],
    }
  })
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const t = exec.agent ? turns.get(exec.agent.session.id) : undefined
    if (t && !t.tools.includes(exec.name)) t.tools.push(exec.name)
    return next()
  })
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'assistant/message') return
    const t = turns.get(session.id)
    const text = textOf((event.data as { message: { content: readonly ContentBlock[] } }).message.content)
    if (t && text) t.answer = text
  })
  ctx.on('session/disposed', (session) => void turns.delete(session.id))

  // --- Mục tiêu: ghi lại thay đổi, chấm sau mỗi lượt --------------------------------------
  const saveGoal = async (sid: string, g: GoalView | undefined, cleared = false) => {
    const prev = goals.get(keyOf(sid))
    if (!g && !prev) return
    const at = now()
    const same = prev && g && prev.goalId === g.id
    const rec: GoalRecord = {
      sessionId: sid,
      bot: botOf(sid),
      goalId: g?.id ?? prev!.goalId,
      objective: g?.objective ?? prev!.objective,
      phase: cleared ? 'cleared' : (g?.phase ?? prev!.phase),
      rounds: g?.roundsStarted ?? prev!.rounds,
      max: g?.maxGoalRounds ?? prev!.max,
      ...(g?.blockedReason ? { blocked: g.blockedReason } : {}),
      verdicts: same || cleared ? prev!.verdicts : [],
      ...((same || cleared) && prev!.contract ? { contract: prev!.contract } : {}),
      ...((same || cleared) && prev!.subgoals ? { subgoals: prev!.subgoals } : {}),
      ...(same && prev!.waiting ? { waiting: prev!.waiting } : {}),
      ...(same && prev!.waits ? { waits: prev!.waits } : {}),
      createdAt: same || cleared ? prev!.createdAt : at,
      updatedAt: at,
    }
    await goals.put(keyOf(sid), rec)
    return { rec, fresh: !!g && !same }
  }

  // --- Chờ việc chạy nền: tạm dừng mục tiêu, lịch nhắc bền đánh thức lại ---------------------
  /** Bỏ lịch chờ của mục tiêu (nếu có) và xoá dấu chờ trong bản ghi. */
  async function cancelWait(sid: string) {
    const rec = goals.get(keyOf(sid))
    if (!rec?.waiting) return
    const { waiting, ...rest } = rec
    await goals.put(keyOf(sid), { ...rest, updatedAt: now() })
    await schedule()
      ?.delete({ sessionId: SessionId(sid), id: waiting.scheduleId })
      .catch((e: unknown) => logger.warn('xoá lịch chờ: %s', String(e)))
  }

  /**
   * Đầu mỗi bước: lượt do lịch chờ gửi (hay người dùng nhắn vào lúc đang chờ) thì bỏ lịch chờ và cho mục tiêu
   * chạy tiếp; lịch chờ của mục tiêu đã khác (xong, huỷ, đổi) thì chỉ xoá lịch, bỏ qua.
   */
  async function wakeFromWait(
    agent: Agent,
    messages: readonly { role: string; content: readonly ContentBlock[] }[],
  ) {
    const sid = agent.session.id
    const last = messages.findLast((m) => m.role === 'user')
    const text = last ? textOf(last.content) : ''
    const hit = WAIT_MARKER_RE.exec(text)
    const rec = goals.get(keyOf(sid))
    if (!rec?.waiting) {
      // Lịch chờ còn sót (khởi động lại giữa chừng, mục tiêu đã đổi): xoá cho sạch.
      if (hit)
        for (const r of (await schedule()
          ?.list({ sessionId: SessionId(sid) })
          .catch(() => [])) ?? [])
          if (JSON.stringify(r).includes(hit[0]))
            await schedule()?.delete({ sessionId: SessionId(sid), id: r.id })
      return
    }
    // Lượt của vòng lặp / nhịp tim không phải người dùng nhắn: giữ nguyên chờ.
    if (!hit && /\[aris-(loop|goal-wait):/.test(text)) return
    await cancelWait(sid)
    const port = goalsPort()
    const g = port?.get(agent)
    if (port && g && g.id === rec.goalId && g.phase === 'paused')
      try {
        port.resume(agent, { id: g.id, revision: g.revision })
      } catch (e) {
        logger.warn('chạy tiếp mục tiêu sau chờ: %s', String(e))
      }
  }

  // Hợp đồng hoàn thành (đợt 6): mục tiêu mới thì soạn nền; bước đầu của lượt kế chờ và nhận lời báo.
  const drafts = new Map<string, Promise<void>>()
  const notices = new Map<string, string>()
  const addNotice = (sid: string, text: string) =>
    notices.set(sid, notices.has(sid) ? `${notices.get(sid)}\n\n${text}` : text)
  async function draftContract(sid: string, goalId: string, objective: string) {
    const raw = await ask(sid, contractPrompt(objective), 3000)
    const c = raw ? parseContract(raw) : undefined
    const rec = goals.get(keyOf(sid))
    if (!c)
      return void logger.warn(
        'hợp đồng mục tiêu: model không trả JSON dùng được (%s)',
        (raw ?? '').slice(0, 200),
      )
    if (!rec || rec.goalId !== goalId) return
    await goals.put(keyOf(sid), { ...rec, contract: c, updatedAt: now() })
    addNotice(
      sid,
      `Hợp đồng hoàn thành của mục tiêu (giám khảo chỉ chấm xong khi có bằng chứng đúng phần "Chứng minh bằng"):\n${contractText(c, rec.subgoals)}\nLàm theo hợp đồng này; xong thì nêu rõ bằng chứng trong câu trả lời.`,
    )
  }
  ctx.on('goal/changed', ({ agent, change }) => {
    const sid = agent.session.id
    const g = change.goal as unknown as GoalView | undefined
    void saveGoal(sid, g, !g)
      .then(async (r) => {
        // Mục tiêu không còn tạm dừng (người dùng chạy tiếp, xong, bị chặn, bị xoá): bỏ lịch chờ.
        if (goals.get(keyOf(sid))?.waiting && (!g || g.phase !== 'paused')) await cancelWait(sid)
        return r
      })
      .then((r) => {
        if (!r?.fresh || !g || g.phase !== 'active') return
        const p = draftContract(sid, g.id, g.objective)
          .catch((e: unknown) => logger.warn('soạn hợp đồng mục tiêu: %s', String(e)))
          .finally(() => drafts.delete(sid))
        drafts.set(sid, p)
      })
      .catch((e: unknown) => logger.warn('ghi mục tiêu: %s', String(e)))
  })

  let catalog: { at: number; model?: { provider: string; model: string } } | undefined
  async function flash() {
    if (!catalog || Date.now() - catalog.at > 600_000) {
      const c = (await ctx.sessionController.modelCatalog().catch(() => undefined)) as
        | {
            default?: { provider?: string; model?: string }
            groups: { id: string; models: { id: string; name?: string }[] }[]
          }
        | undefined
      let model: { provider: string; model: string } | undefined
      if (c) {
        const home = c.groups.find((g) => g.id === c.default?.provider)
        for (const g of [...(home ? [home] : []), ...c.groups]) {
          const m = g.models.find((x) => /flash/i.test(`${x.id} ${x.name ?? ''}`) && !x.id.endsWith(':batch'))
          if (m) {
            model = { provider: g.id, model: m.id }
            break
          }
        }
        if (!model && c.default?.provider && c.default.model)
          model = { provider: c.default.provider, model: c.default.model }
      }
      catalog = { at: Date.now(), ...(model ? { model } : {}) }
    }
    return catalog.model
  }

  /** Một lần gọi model rẻ, ghi sổ chi phí phạm vi `goal`. Không có model thì undefined. */
  async function ask(sid: string, text: string, maxTokens: number): Promise<string | undefined> {
    const m = await flash()
    if (!m) return undefined
    let raw = ''
    let usage: Usage | undefined
    for await (const c of ctx.llm.stream({
      provider: m.provider,
      model: m.model,
      messages: [{ role: 'user', content: [{ type: 'text', text }] }],
      maxTokens,
    })) {
      if (c.type === 'text-delta') raw += c.text
      else if (c.type === 'usage') usage = c.usage
    }
    if (usage)
      await (
        ctx.get('arisSpend') as
          { charge?(p: string, m: string, u: Usage, s: readonly string[]): Promise<number> } | undefined
      )
        ?.charge?.(m.provider, m.model, usage, ['goal', `bot:${botOf(sid)}`])
        .catch(() => undefined)
    return raw
  }

  async function judge(agent: Agent, t: TurnState) {
    const port = goalsPort()
    const g = port?.get(agent)
    // Bot tự đánh dấu xong trong lượt: vẫn chấm, kết quả chỉ để hiện.
    if (!port || !g || g.id !== t.goal || (g.phase !== 'active' && g.phase !== 'complete')) return
    const rec0 = goals.get(keyOf(agent.session.id))
    // Đã xong và lượt này đã chấm (lượt kéo thêm một bước sau khi xong): không chấm lại câu xác nhận.
    if (
      g.phase === 'complete' &&
      rec0?.goalId === g.id &&
      rec0.verdicts.some((v) => v.round === g.roundsStarted)
    )
      return
    const raw = await ask(
      agent.session.id,
      judgePrompt({
        objective: g.objective,
        round: g.roundsStarted,
        max: g.maxGoalRounds,
        answer: t.answer.slice(-6000),
        tools: t.tools,
        contract: rec0?.goalId === g.id ? rec0.contract : undefined,
        subgoals: rec0?.goalId === g.id ? rec0.subgoals : undefined,
      }),
      3000,
    )
    if (!raw) return
    const v = parseVerdict(raw)
    if (!v) return
    const rec = goals.get(keyOf(agent.session.id))
    const history: Verdict[] = [...(rec?.verdicts ?? []), v]
    // Chờ quá giới hạn thì chặn; còn lại đặt lịch chờ trước khi tạm dừng (lịch ghi cùng bản ghi một lần).
    let wait:
      { waiting: NonNullable<GoalRecord['waiting']>; waits: NonNullable<GoalRecord['waits']> } | undefined
    let tooLong: string | undefined
    if (v.verdict === 'wait' && rec) {
      const plan = waitPlan(rec.waits, v.waitSeconds!, v.waitingFor!)
      if (!plan.ok) tooLong = plan.message
      else {
        const sch = await schedule()
          ?.create(SessionId(agent.session.id), {
            prompt: waitPrompt(g.id, v.waitingFor!),
            title: `Chờ: ${v.waitingFor}`.slice(0, 120),
            every_seconds: v.waitSeconds!,
          })
          .catch((e: unknown) => void logger.warn('đặt lịch chờ: %s', String(e)))
        if (sch)
          wait = {
            waiting: {
              for: v.waitingFor!,
              until: new Date(Date.now() + v.waitSeconds! * 1000).toISOString(),
              scheduleId: String(sch.id),
            },
            waits: plan.tally,
          }
      }
    }
    if (rec) {
      const base: GoalRecord = { ...rec }
      delete base.waiting
      delete base.waits
      await goals.put(keyOf(agent.session.id), {
        ...base,
        verdicts: [...rec.verdicts, { ...v, round: g.roundsStarted, at: now() }].slice(-5),
        // Lượt không phải chờ thì đếm lại từ đầu.
        ...(v.verdict === 'wait' ? (wait ?? (rec.waits ? { waits: rec.waits } : {})) : {}),
        updatedAt: now(),
      })
    }
    // Mục tiêu có thể đã đổi trong lúc chấm (bot tự đánh dấu xong, người dùng tạm dừng).
    const cur = port.get(agent)
    if (!cur || cur.id !== g.id || cur.phase !== 'active') {
      if (wait) await cancelWait(agent.session.id)
      return
    }
    const ref = { id: cur.id, revision: cur.revision }
    try {
      if (tooLong) port.block(agent, ref, { code: 'wait-too-long', message: tooLong })
      else if (v.verdict === 'wait') {
        // Không đặt được lịch thì không tạm dừng: để mục tiêu chạy tiếp như `continue`.
        if (wait) port.pause(agent, ref)
      } else if (v.verdict === 'done') port.complete(agent, ref)
      else if (v.verdict === 'blocked')
        port.block(agent, ref, { code: 'judge-blocked', message: v.missing || v.reason })
      else if (isStuck(history))
        port.block(agent, ref, {
          code: 'no-progress',
          message: `Ba lượt liền vẫn còn thiếu: ${v.missing}`,
        })
      else if (v.missing)
        // Lượt kế (do dsh tự gửi) nhận thêm lời báo để bot tập trung vào điều còn thiếu.
        agent.inject(
          createUserMessage({
            content: [
              { type: 'text', text: `Giám khảo (sau lượt ${g.roundsStarted}): còn thiếu — ${v.missing}` },
            ],
            source: { kind: 'aris-autonomy', form: 'notice', summary: 'Giám khảo mục tiêu' },
          }),
        )
    } catch (e) {
      logger.warn('áp kết quả giám khảo: %s', String(e))
    }
  }

  // --- Vòng lặp: cập nhật sau mỗi lượt của nó -----------------------------------------
  async function afterLoop(sid: string, id: string, answer: string) {
    const l = loops.get(id)
    if (!l || !l.active || l.sessionId !== sid) return
    const same = unchanged(answer, l.lastAnswer)
    const next: LoopRecord = {
      ...l,
      runs: l.runs + 1,
      same: same ? l.same + 1 : 0,
      lastAnswer: answer.slice(0, 2000),
      lastAt: now(),
    }
    if (l.mode === 'auto') {
      const seconds = nextAuto(l.seconds, same)
      if (seconds !== l.seconds) {
        const port = schedule()
        const expected = (await port?.list({ sessionId: SessionId(sid) }).catch(() => []))?.find(
          (r) => r.id === l.scheduleId,
        )
        if (port && expected)
          await port
            .update({
              sessionId: SessionId(sid),
              id: l.scheduleId,
              expected,
              change: { kind: 'every', every_seconds: seconds },
            })
            .then(() => (next.seconds = seconds))
            .catch((e: unknown) => logger.warn('đổi nhịp vòng lặp: %s', String(e)))
      }
    }
    await loops.put(id, next)
  }

  ctx.on('agent/turn-stopping', async ({ agent, turn }) => {
    const t = turns.get(agent.session.id)
    if (!t || t.turn !== turn) return
    if (t.loop)
      void afterLoop(agent.session.id, t.loop, t.answer).catch((e: unknown) =>
        logger.warn('vòng lặp: %s', String(e)),
      )
    // dsh chờ sự kiện này trước khi đóng lượt, nên chấm ngay tại đây: mục tiêu xong / bị chặn
    // được ghi trước khi bộ chạy vòng của dsh quyết định gửi lượt tiếp. Chấm quá lâu thì bỏ qua lần này.
    if (!t.goal) return
    await Promise.race([
      judge(agent, { ...t, tools: [...t.tools] }).catch((e: unknown) =>
        logger.warn('giám khảo mục tiêu: %s', String(e)),
      ),
      new Promise((r) => setTimeout(r, JUDGE_TIMEOUT_MS)),
    ])
  })

  // --- Lệnh /loop và /heartbeat ----------------------------------------------------------
  const newId = () => `l-${Date.now().toString(36)}-${Math.floor(Math.random() * 36 ** 4).toString(36)}`
  const loopsOf = (sid: string, kind?: LoopRecord['kind']) =>
    [...loops.entries()]
      .map(([, l]) => l)
      .filter((l) => l.active && l.sessionId === sid && (!kind || l.kind === kind))

  async function startLoop(o: {
    sessionId: string
    kind: LoopRecord['kind']
    mode: LoopRecord['mode']
    seconds: number
    task: string
    prompt: (id: string) => string
    title: string
  }): Promise<LoopRecord> {
    const port = schedule()
    if (!port) throw new Error('Chưa có lịch nhắc của dsh trong cấu hình này.')
    const id = newId()
    const rec = await port.create(SessionId(o.sessionId), {
      prompt: o.prompt(id),
      title: o.title.slice(0, 120),
      every_seconds: o.seconds,
    })
    const l: LoopRecord = {
      id,
      sessionId: o.sessionId,
      bot: botOf(o.sessionId),
      kind: o.kind,
      mode: o.mode,
      seconds: o.seconds,
      task: o.task,
      scheduleId: String(rec.id),
      runs: 0,
      same: 0,
      active: true,
      createdAt: now(),
    }
    await loops.put(id, l)
    return l
  }

  async function stopLoop(l: LoopRecord) {
    await schedule()
      ?.delete({ sessionId: SessionId(l.sessionId), id: l.scheduleId })
      .catch((e: unknown) => logger.warn('xoá lịch nhắc: %s', String(e)))
    await loops.put(l.id, { ...l, active: false })
  }

  ctx.inject(['commands'], (ctx) => {
    ctx.effect(
      () =>
        ctx.commands.register({
          name: 'subgoal',
          description:
            'Thêm tiêu chí cho mục tiêu đang chạy (/subgoal <tiêu chí>); /subgoal không kèm chữ thì xem hợp đồng hoàn thành',
          input: { hint: '[tiêu chí]' },
          handler: async ({ agent, rawInput }) => {
            const sid = agent.session.id
            const g = goalsPort()?.get(agent)
            const rec = goals.get(keyOf(sid))
            if (!g || g.phase === 'complete' || !rec || rec.goalId !== g.id)
              return {
                kind: 'error',
                text: 'Phiên này chưa có mục tiêu đang chạy. Đặt bằng /goal <mục tiêu> trước.',
              }
            const c = parseSubgoal(rawInput)
            if (c.kind === 'show') {
              const terms = contractText(rec.contract, rec.subgoals)
              return {
                kind: 'success',
                text: terms
                  ? `Mục tiêu: ${rec.objective}\n${terms}`
                  : `Mục tiêu: ${rec.objective}\nChưa có hợp đồng hoàn thành (đang soạn hoặc model rẻ không trả lời được).`,
              }
            }
            const list = rec.subgoals ?? []
            if (list.length >= MAX_SUBGOALS)
              return { kind: 'error', text: `Mỗi mục tiêu tối đa ${MAX_SUBGOALS} tiêu chí thêm.` }
            const subgoals = [...list, c.text]
            await goals.put(keyOf(sid), { ...rec, subgoals, updatedAt: now() })
            addNotice(
              sid,
              `Người dùng thêm tiêu chí ${subgoals.length} cho mục tiêu: ${c.text}\nMục tiêu chỉ xong khi đạt cả tiêu chí này.`,
            )
            return {
              kind: 'success',
              text: `Đã thêm tiêu chí ${subgoals.length}: ${c.text}. Giám khảo sẽ chấm cả tiêu chí này.`,
            }
          },
        }),
      'aris-autonomy: /subgoal',
    )
    ctx.effect(
      () =>
        ctx.commands.register({
          name: 'loop',
          description:
            'Lặp một việc theo nhịp trong phiên này (/loop 5m <việc>, /loop <việc> để tự điều nhịp, /loop dừng)',
          input: { hint: '[5m] <việc> | dừng' },
          handler: async ({ agent, rawInput }) => {
            const sid = agent.session.id
            const c = parseLoop(rawInput)
            if (c.kind === 'error') return { kind: 'error', text: c.message }
            if (c.kind === 'list') {
              const list = loopsOf(sid, 'loop')
              return {
                kind: 'success',
                text: list.length
                  ? list
                      .map(
                        (l) =>
                          `• ${l.task} — ${l.mode === 'auto' ? 'tự điều nhịp, ' : ''}mỗi ${humanInterval(l.seconds)}, ${l.runs} lần`,
                      )
                      .join('\n')
                  : 'Phiên này chưa có vòng lặp nào.',
              }
            }
            if (c.kind === 'stop') {
              const list = loopsOf(sid, 'loop')
              for (const l of list) await stopLoop(l)
              return {
                kind: 'success',
                text: list.length ? `Đã dừng ${list.length} vòng lặp.` : 'Không có vòng lặp nào đang chạy.',
              }
            }
            const auto = c.seconds === undefined
            const seconds = c.seconds ?? MIN_SECONDS
            const l = await startLoop({
              sessionId: sid,
              kind: 'loop',
              mode: auto ? 'auto' : 'fixed',
              seconds,
              task: c.task,
              prompt: (id) => loopPrompt(id, c.task, seconds, auto),
              title: `Vòng lặp: ${c.task}`,
            })
            return {
              kind: 'success',
              text: auto
                ? `Đã bật vòng lặp tự điều nhịp: bắt đầu mỗi 1 phút, kết quả không đổi thì giãn dần tới 15 phút. Dừng: /loop dừng. (${l.id})`
                : `Đã bật vòng lặp mỗi ${humanInterval(seconds)}. Dừng: /loop dừng. (${l.id})`,
            }
          },
        }),
      'aris-autonomy: /loop',
    )
    ctx.effect(
      () =>
        ctx.commands.register({
          name: 'heartbeat',
          description:
            'Nhịp tim: định kỳ hỏi bot có gì cần báo (/heartbeat [30m] [điều cần để ý], /heartbeat tắt)',
          input: { hint: '[30m] [điều cần để ý] | tắt' },
          handler: async ({ agent, rawInput }) => {
            const sid = agent.session.id
            const c = parseHeartbeat(rawInput)
            if (c.kind === 'error') return { kind: 'error', text: c.message }
            const old = loopsOf(sid, 'heartbeat')
            for (const l of old) await stopLoop(l)
            if (c.kind === 'stop')
              return {
                kind: 'success',
                text: old.length ? 'Đã tắt nhịp tim.' : 'Phiên này chưa bật nhịp tim.',
              }
            await startLoop({
              sessionId: sid,
              kind: 'heartbeat',
              mode: 'fixed',
              seconds: c.seconds,
              task: c.focus ?? '',
              prompt: (id) => heartbeatPrompt(id, c.seconds, c.focus),
              title: `Nhịp tim${c.focus ? `: ${c.focus}` : ''}`,
            })
            return {
              kind: 'success',
              text: `Đã bật nhịp tim mỗi ${humanInterval(c.seconds)}${c.focus ? `, để ý: ${c.focus}` : ''}. Không có gì thì bot chỉ trả "ổn". Tắt: /heartbeat tắt.`,
            }
          },
        }),
      'aris-autonomy: /heartbeat',
    )
  })

  // --- Màn 3.5 --------------------------------------------------------------------------
  /** Agent sống của phiên (mở lại phiên nguội khi cần) để đổi mục tiêu. */
  async function agentOf(sid: string): Promise<Agent | undefined> {
    const r = (await (
      ctx.sessionController as unknown as { resolveAgent(id: unknown): Promise<{ agent?: unknown }> }
    )
      .resolveAgent(SessionId(sid))
      .catch(() => undefined)) as { agent?: Agent } | undefined
    return r?.agent
  }

  async function goalOp(sid: string, op: 'pause' | 'resume' | 'clear' | 'check-now') {
    const port = goalsPort()
    const agent = await agentOf(sid)
    const g = agent ? port?.get(agent) : undefined
    if (!port || !agent || !g) throw new Error('Phiên này không còn mục tiêu.')
    const ref = { id: g.id, revision: g.revision }
    if (op === 'check-now') {
      // Kiểm ngay: bỏ lịch chờ, chạy tiếp mục tiêu và nhắc bot xem lại điều đang đợi.
      const w = goals.get(keyOf(sid))?.waiting
      if (!w) throw new Error('Mục tiêu này không đang chờ.')
      await cancelWait(sid)
      addNotice(
        sid,
        `Kiểm tra lại ngay: ${w.for}. Nếu đã có kết quả thì làm tiếp mục tiêu; nếu chưa, nói rõ đang chờ gì.`,
      )
      port.resume(agent, { id: g.id, revision: g.revision })
      return
    }
    // Người dùng tạm dừng hay xoá tay thì bỏ luôn lịch chờ.
    if (op !== 'resume') await cancelWait(sid)
    const live = port.get(agent) ?? g
    const cur = { id: live.id, revision: live.revision }
    if (op === 'pause') port.pause(agent, cur)
    else if (op === 'resume') port.resume(agent, ref)
    else port.clear(agent, cur)
  }

  async function view() {
    const goalList = [...goals.entries()]
      .map(([, g]) => g)
      .filter((g) => g.phase !== 'cleared')
      .sort(
        (a, b) =>
          Number(b.phase === 'active') - Number(a.phase === 'active') ||
          b.updatedAt.localeCompare(a.updatedAt),
      )
      .slice(0, 20)
    const active = [...loops.entries()].map(([, l]) => l).filter((l) => l.active)
    const port = schedule()
    const next = new Map<string, string>()
    for (const sid of new Set(active.map((l) => l.sessionId))) {
      const list = (await port?.list({ sessionId: SessionId(sid) }).catch(() => [])) ?? []
      for (const r of list) next.set(String(r.id), r.scheduledAt)
    }
    return {
      goals: goalList,
      loops: active
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((l) => ({ ...l, nextAt: next.get(l.scheduleId) ?? null, missing: !next.has(l.scheduleId) })),
    }
  }

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/autonomy',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          const json = (v: unknown, status = 200) =>
            new Response(JSON.stringify(v), {
              status,
              headers: { 'content-type': 'application/json; charset=utf-8' },
            })
          if (request.method !== 'POST') return json(await view())
          const b = (await request.json().catch(() => ({}))) as { op?: string; session?: string; id?: string }
          try {
            if (
              b.op === 'goal-pause' ||
              b.op === 'goal-resume' ||
              b.op === 'goal-clear' ||
              b.op === 'goal-check-now'
            ) {
              if (!b.session) return json({ error: 'Thiếu phiên.' }, 400)
              await goalOp(b.session, b.op.slice(5) as 'pause' | 'resume' | 'clear' | 'check-now')
            } else if (b.op === 'loop-stop') {
              const l = b.id ? loops.get(b.id) : undefined
              if (!l) return json({ error: 'Không có vòng lặp này.' }, 404)
              await stopLoop(l)
            } else if (b.op === 'stop-all') {
              for (const g of [...goals.entries()].map(([, g]) => g).filter((g) => g.phase === 'active'))
                await goalOp(g.sessionId, 'pause').catch(() => undefined)
              for (const l of [...loops.entries()].map(([, l]) => l).filter((l) => l.active))
                await stopLoop(l)
            } else return json({ error: 'op không hợp lệ' }, 400)
          } catch (e) {
            return json({ error: e instanceof Error ? e.message : String(e) }, 409)
          }
          return json({ ok: true, ...(await view()) })
        },
      })
      return () => void dispose()
    }, 'aris-autonomy: /api/aris/autonomy')
  })
}
