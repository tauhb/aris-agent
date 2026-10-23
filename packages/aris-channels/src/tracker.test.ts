import { describe, expect, it } from 'vitest'
import { TurnTracker, type Pending } from './tracker.js'

const p = (messageId: string): Pending => ({
  messageId,
  inboxId: `in-${messageId}`,
  threadKey: 'k',
  bot: 'aris',
  chatId: 1,
  tgMessageId: 10,
  group: false,
  trust: 'owner',
})
const text = (t: string) => ({
  type: 'assistant/message',
  data: { message: { content: [{ type: 'text', text: t }] } },
})

describe('theo dõi lượt', () => {
  it('lượt chứa tin của kênh: giao câu trả lời cuối có chữ', () => {
    const t = new TurnTracker()
    t.expect(p('m1'))
    t.onEvent('s', { type: 'turn/start' })
    t.onEvent('s', { type: 'user/message', data: { id: 'm1' } })
    t.onEvent('s', text('Đang tra cứu…'))
    t.onEvent('s', { type: 'assistant/message', data: { message: { content: [{ type: 'tool-call' }] } } })
    t.onEvent('s', text('Xong: 490k'))
    const r = t.onEvent('s', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(r).toMatchObject({ sessionId: 's', text: 'Xong: 490k', ours: [{ messageId: 'm1' }] })
  })

  it('lượt anh gõ trên web vào cùng phiên: không giao ra kênh', () => {
    const t = new TurnTracker()
    t.onEvent('s', { type: 'turn/start' })
    t.onEvent('s', { type: 'user/message', data: { id: 'web' } })
    t.onEvent('s', text('trả lời web'))
    expect(t.onEvent('s', { type: 'turn/end', data: { reason: { kind: 'completed' } } })).toBeUndefined()
  })

  it('tin chèn giữa lượt thuộc lượt đang chạy', () => {
    const t = new TurnTracker()
    t.expect(p('m1'))
    t.expect(p('m2'))
    t.onEvent('s', { type: 'turn/start' })
    t.onEvent('s', { type: 'user/message', data: { id: 'm1' } })
    t.onEvent('s', { type: 'user/message', data: { id: 'm2' } })
    const r = t.onEvent('s', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    expect(r?.ours.map((x) => x.messageId)).toEqual(['m1', 'm2'])
    expect(t.pendingFor('k')).toEqual([])
  })

  it('chữ đang viết: chỉ cho lượt của kênh, mỗi lần gọi model bắt đầu lại', () => {
    const t = new TurnTracker()
    const chunk = (attemptId: string, s: string) => ({
      type: 'chunk',
      attemptId,
      chunk: { type: 'text-delta', text: s },
    })
    expect(t.onStream('s', chunk('a', 'x'))).toBeUndefined()
    t.expect(p('m1'))
    t.onEvent('s', { type: 'turn/start' })
    t.onEvent('s', { type: 'user/message', data: { id: 'm1' } })
    t.onStream('s', { type: 'start', attemptId: 'a' })
    expect(t.onStream('s', chunk('a', 'Xin '))).toBe('Xin ')
    expect(t.onStream('s', chunk('a', 'chào'))).toBe('Xin chào')
    expect(
      t.onStream('s', { type: 'chunk', attemptId: 'a', chunk: { type: 'reasoning-delta', text: '…' } }),
    ).toBeUndefined()
    expect(t.onStream('s', chunk('b', 'Bước 2'))).toBe('Bước 2')
  })
})
