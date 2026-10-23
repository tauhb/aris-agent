import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, pluginRecordOf } from '@deepseek-ai/dsh-session'
import { MemoryStore, type MemoryItem, type MemoryTable } from './store.js'
import { NUDGE_RECORD, REFLECT_RECORD, watchConversation } from './watch.js'

type Handler = (...args: never[]) => unknown

function setup(reply = '[]') {
  const handlers = new Map<string, Handler>()
  const llmCalls: unknown[] = []
  const ctx = {
    logger: () => ({ warn: () => {}, info: () => {} }),
    on: (name: string, fn: Handler) => void handlers.set(name, fn),
    llm: {
      async *stream(options: unknown) {
        llmCalls.push(options)
        yield { type: 'text-delta', index: 0, text: reply }
      },
    },
  }
  const map = new Map<string, MemoryItem>()
  const table: MemoryTable = {
    get: (k) => map.get(k),
    entries: () => map.entries(),
    put: async (k, v) => void map.set(k, v),
  }
  const store = new MemoryStore(table)
  const watch = watchConversation(ctx as unknown as Context, store, () => 'aris')
  const call = (name: string, ...args: unknown[]) =>
    (handlers.get(name) as (...a: unknown[]) => unknown)(...args)
  return { call, store, llmCalls, watch }
}

const userMsg = (text: string) => ({ source: { kind: 'user' }, content: [{ type: 'text', text }] })

describe('tự nhắc lưu', () => {
  it('cài lời nhắc cho lượt sau khi chủ nhân nói điều cần nhớ mà bot chưa lưu', async () => {
    const { call } = setup()
    const session = Session.create(SessionId('nudge-test'))
    const injected: unknown[] = []
    const agent = { session, inject: (m: unknown) => injected.push(m) }
    await call(
      'agent/pre-step',
      { agent, messages: [userMsg('Từ giờ gửi báo cáo bằng tiếng Việt nhé')], turn: 1 },
      async () => 'ok',
    )
    await call('agent/turn-stopping', { agent, turn: 1 })
    expect(injected).toHaveLength(1)
    expect(injected[0]).toMatchObject({ source: { kind: 'aris-memory', form: 'notice' } })
    const records = session
      .ownEvents()
      .map(pluginRecordOf)
      .filter((r) => r !== undefined)
    expect(records[0]).toMatchObject({ type: NUDGE_RECORD, data: { turn: 1, reason: 'cue' } })
  })

  it('không nhắc khi bot đã lưu trong lượt', async () => {
    const { call } = setup()
    const injected: unknown[] = []
    const agent = { session: Session.create(SessionId('nudge-2')), inject: (m: unknown) => injected.push(m) }
    await call(
      'agent/pre-step',
      { agent, messages: [userMsg('Nhớ là anh thích bản ngắn')], turn: 1 },
      async () => 'ok',
    )
    await call(
      'tools/post-execute',
      { agent, name: 'memory', arguments: { action: 'save' } },
      {},
      async () => 'ok',
    )
    await call('agent/turn-stopping', { agent, turn: 1 })
    expect(injected).toHaveLength(0)
  })
})

describe('lưu trước khi nén', () => {
  it('rút ký ức từ đúng đoạn bị nén và cất vào lưu trữ', async () => {
    const reply = '[{"text":"Chủ nhân làm việc chủ yếu buổi sáng","book":"owner","kind":"preference"}]'
    const { call, store, llmCalls, watch } = setup(reply)
    const session = Session.create(SessionId('reflect-test'))
    const long = 'Anh hay làm việc tập trung vào buổi sáng, chiều thì họp. '.repeat(10)
    call('session/event', session, { type: 'user/message', seq: 3, data: userMsg(long) })
    call('session/event', session, {
      type: 'assistant/message',
      seq: 4,
      data: { message: { content: [{ type: 'text', text: 'Dạ em nhớ.' }] } },
    })
    call('session/event', session, {
      type: 'user/message',
      seq: 9,
      data: userMsg('chuyện khác ngoài đoạn nén'),
    })
    call('session/event', session, {
      type: 'compaction/summary',
      seq: 10,
      data: { compactionId: 'c1', shadowedSeqs: [3, 4], provider: 'deepseek', model: 'deepseek-chat' },
    })
    await new Promise((r) => setTimeout(r, 0))
    const prompt = JSON.stringify(llmCalls[0])
    expect(prompt).toContain('buổi sáng')
    expect(prompt).not.toContain('chuyện khác')
    const saved = store.list('aris')
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ tier: 'archive', trust: 'agent-inferred', status: 'active' })
    const records = session
      .ownEvents()
      .map(pluginRecordOf)
      .filter((r) => r !== undefined)
    expect(records[0]).toMatchObject({ type: REFLECT_RECORD, data: { compactionId: 'c1', lines: 2 } })
    expect(watch.lastReflect()).toMatchObject({ compactionId: 'c1', proposed: 1, saved: [saved[0]!.id] })
  })

  it('bỏ qua đoạn nén quá ngắn', async () => {
    const { call, llmCalls, watch } = setup()
    const session = Session.create(SessionId('reflect-short'))
    call('session/event', session, { type: 'user/message', seq: 1, data: userMsg('chào') })
    call('session/event', session, {
      type: 'compaction/summary',
      seq: 2,
      data: { compactionId: 'c2', shadowedSeqs: [1], provider: 'deepseek', model: 'deepseek-chat' },
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(llmCalls).toHaveLength(0)
    expect(watch.lastReflect()).toMatchObject({ compactionId: 'c2', skipped: 'short' })
  })
})
