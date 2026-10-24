/**
 * Theo dõi hội thoại cho trí nhớ:
 * - Tự nhắc lưu: cuối mỗi lượt, lượt có dấu hiệu cần nhớ mà bot chưa ghi thì cài lời nhắc
 *   (`agent.inject`) cho lượt kế tiếp.
 * - Lưu trước khi nén: giữ bản chép gần đây của từng phiên; khi dsh ghi `compaction/summary`,
 *   lấy đúng đoạn vừa bị nén, nhờ model rút ký ức thành đề xuất chờ duyệt (tầng lưu trữ).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-compaction'
import { createUserMessage, type ContentBlock, type ContextFormed } from '@deepseek-ai/dsh-llm'
import { appendPluginRecord, type Session, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import { NUDGE_TEXT, emptyTurn, nudgeReason, type TurnSignals } from './nudge.js'
import { dedupe, parseCandidates, reflectPrompt, transcriptText, type TranscriptLine } from './reflect.js'
import { bookOwner, itemsFor } from './books.js'
import type { Proposals } from './proposals.js'
import type { MemoryStore } from './store.js'

/** Nguồn của lời nhắc trong lịch sử: hiện thành dòng "notice" chứ không thành lời chủ nhân. */
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'aris-memory': { kind: 'aris-memory' } & ContextFormed
  }
}

export const NUDGE_RECORD = 'plugin:aris/memory-nudge'
export const REFLECT_RECORD = 'plugin:aris/memory-reflect'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/memory-nudge': { turn: number; reason: 'cue' | 'long' }
    'plugin:aris/memory-reflect': { compactionId: string; lines: number; saved: string[]; error?: string }
  }
}

/** Số dòng chép giữ lại cho mỗi phiên (đủ phủ một lần nén). */
const KEEP_LINES = 400
/** Đoạn bị nén ngắn hơn ngần này ký tự thì không đáng gọi model. */
const MIN_CHARS = 120

const textOf = (blocks: readonly ContentBlock[]) =>
  blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim()

/** Một dòng chép từ sự kiện tin nhắn của phiên, hoặc undefined với sự kiện khác. */
export function lineOf(event: SessionEvent): TranscriptLine | undefined {
  if (event.type === 'user/message' && event.data.source.kind === 'user') {
    const text = textOf(event.data.content)
    return text ? { seq: event.seq, role: 'user', text } : undefined
  }
  if (event.type === 'assistant/message') {
    const text = textOf(event.data.message.content)
    return text ? { seq: event.seq, role: 'assistant', text } : undefined
  }
  return undefined
}

/** Kết quả lần rút ký ức khi nén gần nhất (hiện trong API để biết vòng này có chạy). */
export interface ReflectStatus {
  at: string
  compactionId: string
  lines: number
  /** Số ký tự đoạn bị nén đọc được. */
  chars: number
  /** Số ký ức model đề xuất (trước khi bỏ trùng). */
  proposed: number
  saved: string[]
  skipped?: 'short' | undefined
  error?: string | undefined
}

export function watchConversation(
  ctx: Context,
  store: MemoryStore,
  proposals: Proposals,
  botOf: (sessionId: string) => string,
): { lastReflect: () => ReflectStatus | undefined } {
  let last: ReflectStatus | undefined
  const logger = ctx.logger('aris-memory')

  // --- Tự nhắc lưu -------------------------------------------------------------
  const turns = new WeakMap<Agent, TurnSignals>()
  const lastNudge = new WeakMap<Agent, number>()
  const signals = (agent: Agent, turn: number) => {
    let s = turns.get(agent)
    if (!s || s.turn !== turn) turns.set(agent, (s = emptyTurn(turn)))
    return s
  }

  ctx.on('agent/pre-step', ({ agent, messages, turn }, next) => {
    const s = signals(agent, turn)
    for (const m of messages) if (m.source.kind === 'user') s.userText.push(textOf(m.content))
    return next()
  })

  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const agent = exec.agent
    if (agent) {
      const s = turns.get(agent)
      if (s) {
        s.toolCalls++
        const action = (exec.arguments as { action?: unknown } | undefined)?.action
        if (exec.name === 'memory' && action !== 'search') s.memoryWrites++
      }
    }
    return next()
  })

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const s = turns.get(agent)
    if (!s || s.turn !== turn) return
    // Phiên kiểm thử skill (@aris/skills): không nhắc, để câu trả lời cuối đúng là kết quả việc.
    if ((ctx.get('arisSkills') as { isEval?(id: string): boolean } | undefined)?.isEval?.(agent.session.id))
      return
    const reason = nudgeReason(s, lastNudge.get(agent))
    if (!reason) return
    lastNudge.set(agent, turn)
    // Chèn cho lượt kế tiếp, không đánh thức bot: không tốn thêm lần gọi model ở lượt này.
    agent.inject(
      createUserMessage({
        content: [{ type: 'text', text: NUDGE_TEXT[reason] }],
        source: { kind: 'aris-memory', form: 'notice', summary: 'Nhắc lưu ký ức' },
      }),
    )
    appendPluginRecord(agent.session, NUDGE_RECORD, { turn, reason })
  })

  // --- Lưu trước khi nén -----------------------------------------------------------
  const transcripts = new Map<string, TranscriptLine[]>()

  async function reflect(session: Session, event: SessionEvent<'compaction/summary'>) {
    const shadowed = new Set<number>(event.data.shadowedSeqs)
    const lines = (transcripts.get(session.id) ?? []).filter((l) => shadowed.has(l.seq))
    const text = transcriptText(lines)
    const status: ReflectStatus = {
      at: new Date().toISOString(),
      compactionId: String(event.data.compactionId),
      lines: lines.length,
      chars: text.length,
      proposed: 0,
      saved: [],
    }
    last = status
    if (text.length < MIN_CHARS) {
      status.skipped = 'short'
      return
    }
    const bot = botOf(session.id)
    const existing = itemsFor(store, bot).map((m) => m.text)
    const record = {
      compactionId: String(event.data.compactionId),
      lines: lines.length,
      saved: [] as string[],
    }
    try {
      let raw = ''
      for await (const chunk of ctx.llm.stream({
        provider: event.data.provider,
        model: event.data.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: reflectPrompt(text, existing) }] }],
        // Model có suy luận tính cả phần suy nghĩ vào trần: trần thấp thì không còn chữ nào.
        maxTokens: 6000,
        sessionId: session.id,
        purpose: 'compaction',
      }))
        if (chunk.type === 'text-delta') raw += chunk.text
      const proposed = parseCandidates(raw)
      status.proposed = proposed.length
      // Bot tự suy ra nên thành đề xuất chờ người dùng duyệt (Hộp duyệt, Telegram).
      for (const c of dedupe(proposed, existing)) {
        const m = await proposals.propose({
          bot: bookOwner(bot, c.book),
          text: c.text,
          book: c.book,
          kind: c.kind,
          tier: 'archive',
          trust: 'agent-inferred',
          sessionId: session.id,
          proposal: { by: bot, via: 'compaction' },
        })
        if (!m) continue
        record.saved.push(m.id)
        status.saved.push(m.id)
      }
      appendPluginRecord(session, REFLECT_RECORD, record)
    } catch (err) {
      logger.warn('rút ký ức trước khi nén thất bại: %s', err)
      status.error = String(err)
      appendPluginRecord(session, REFLECT_RECORD, { ...record, error: String(err) })
    }
  }

  ctx.on('session/event', (session, event) => {
    const line = lineOf(event)
    if (line) {
      const list = transcripts.get(session.id) ?? []
      list.push(line)
      if (list.length > KEEP_LINES) list.splice(0, list.length - KEEP_LINES)
      transcripts.set(session.id, list)
    } else if (event.type === 'compaction/summary') {
      // Chạy nền: không giữ khoá nén, không làm chậm lượt chat.
      void reflect(session, event as SessionEvent<'compaction/summary'>)
    }
  })
  ctx.on('session/disposed', (session) => void transcripts.delete(session.id))

  return { lastReflect: () => last }
}
