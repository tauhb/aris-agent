import { afterEach, describe, expect, it } from 'vitest'
import { ChannelHub, type LiveAgent, type SessionPort } from './hub.js'
import { memStore } from './store.test.js'
import type { Fetch } from './telegram/api.js'
import type { TgMessage, TgUpdate } from './telegram/types.js'

const BOT_ID = 900
const OWNER = 1
const STRANGER = 3
const GROUP = -100

/** Telegram giả: trả getUpdates từ hàng đợi, ghi lại mọi lời gọi. */
class FakeTelegram {
  calls: { method: string; body: Record<string, unknown> }[] = []
  private queue: TgUpdate[] = []
  private wake?: () => void
  private nextId = 1
  private msgId = 100
  /** Độ trễ của sendMessage (ms), để thử lúc tin còn đang gửi. */
  slowSend = 0

  push(u: Omit<TgUpdate, 'update_id'>) {
    this.queue.push({ update_id: this.nextId++, ...u })
    this.wake?.()
  }

  sent(method = 'sendMessage') {
    return this.calls.filter((c) => c.method === method).map((c) => c.body)
  }

  fetch: Fetch = async (url, init) => {
    const method = url.split('/').pop()!
    const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    this.calls.push({ method, body })
    const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }))
    switch (method) {
      case 'getMe':
        // Token bắt đầu bằng 456 là bot riêng của Thơ, còn lại là bot của Aris.
        return url.includes('/bot456:')
          ? ok({
              id: 901,
              is_bot: true,
              first_name: 'Thơ',
              username: 'tho_noidung_bot',
              can_read_all_group_messages: true,
            })
          : ok({
              id: BOT_ID,
              is_bot: true,
              first_name: 'Aris',
              username: 'aris_chunhan_bot',
              can_read_all_group_messages: true,
            })
      case 'getUpdates': {
        if (!this.queue.length)
          await new Promise<void>((r) => {
            this.wake = r
            init.signal?.addEventListener('abort', () => r())
          })
        if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError')
        const out = this.queue
        this.queue = []
        return ok(out)
      }
      case 'sendMessage':
        if (this.slowSend) await new Promise((r) => setTimeout(r, this.slowSend))
        return ok({ message_id: this.msgId++, chat: { id: body.chat_id }, date: 0, text: body.text })
      default:
        return ok(true)
    }
  }
}

function fakeSessions() {
  const agents = new Map<string, LiveAgent & { inbox: unknown[]; steered: unknown[] }>()
  let n = 0
  const port: SessionPort = {
    async create() {
      const id = `s${++n}`
      agents.set(id, {
        status: 'idle',
        session: { id },
        inbox: [],
        steered: [],
        followup(m) {
          this.inbox.push(m)
        },
        steer(m) {
          this.steered.push(m)
        },
        inject() {},
        cancel() {},
      })
      return id
    },
    agent: async (id) => {
      const a = agents.get(id)
      if (!a) throw new Error('không có phiên')
      return a
    },
    catalog: async () => [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'flash', name: 'Flash' }] }],
    select: async () => {},
    titles: async (ids) => new Map(ids.map((i) => [i, `Phiên ${i}`])),
    message: (content) => ({ id: `m${++n}`, content }),
    notice: (text) => ({ text }),
  }
  return { port, agents }
}

const settle = () => new Promise((r) => setTimeout(r, 30))

function dm(from: number, text: string, extra: Partial<TgMessage> = {}): Omit<TgUpdate, 'update_id'> {
  return {
    message: {
      message_id: 50,
      from: { id: from, is_bot: false, first_name: `U${from}` },
      chat: { id: from, type: 'private' },
      date: 0,
      text,
      ...extra,
    },
  }
}

function groupMsg(from: number, text: string): Omit<TgUpdate, 'update_id'> {
  const entities = [...text.matchAll(/@\w+/g)].map((m) => ({
    type: 'mention',
    offset: m.index,
    length: m[0].length,
  }))
  return {
    message: {
      message_id: 60,
      from: { id: from, is_bot: false, first_name: `U${from}` },
      chat: { id: GROUP, type: 'supergroup', title: 'Marketing' },
      date: 0,
      text,
      entities,
    },
  }
}

let hubs: ChannelHub[] = []
afterEach(() => {
  for (const h of hubs) h.stop()
  hubs = []
})

async function setup() {
  const tg = new FakeTelegram()
  const store = memStore()
  const secrets = new Map<string, string>()
  const sessions = fakeSessions()
  const hub = new ChannelHub({
    store,
    credentials: {
      resolve: async (r) => secrets.get(r),
      set: async (r, v) => void secrets.set(r, v),
      unset: async (r) => void secrets.delete(r),
    },
    sessions: sessions.port,
    logger: { info() {}, warn() {} },
    fetchImpl: tg.fetch,
  })
  hubs.push(hub)
  await hub.connect('aris', '123:TOKEN')
  return { tg, store, hub, secrets, sessions }
}

async function pairOwner(s: Awaited<ReturnType<typeof setup>>) {
  const code = await s.store.createCode('owner')
  s.tg.push(dm(OWNER, code.code))
  await settle()
}

describe('trung tâm kênh', () => {
  it('kết nối: lưu token vào kho khoá, không lưu trong bản ghi bot', async () => {
    const s = await setup()
    expect(s.secrets.get('TELEGRAM_ARIS_BOT_TOKEN')).toBe('123:TOKEN')
    expect(JSON.stringify(s.store.bot('aris'))).not.toContain('123:TOKEN')
    expect(s.store.bot('aris')).toMatchObject({
      tgId: BOT_ID,
      username: 'aris_chunhan_bot',
      canReadAll: true,
    })
  })

  it('ghép đôi rồi chat: tin vào phiên, lượt xong thì trả lời và dọn hàng đợi', async () => {
    const s = await setup()
    await pairOwner(s)
    expect(s.store.roleOf(OWNER)).toBe('owner')
    expect(String(s.tg.sent().at(-1)!.text)).toContain('người dùng chính')
    expect(s.store.bot('aris')?.home).toEqual({ chatId: OWNER })

    s.tg.push(dm(OWNER, 'Giá gói Pro là bao nhiêu?'))
    await settle()
    const agent = s.sessions.agents.get('s1')!
    const msg = agent.inbox[0] as { id: string; content: { text: string }[] }
    expect(msg.content[0]!.text).toBe('Giá gói Pro là bao nhiêu?')
    expect(s.store.inbox()).toHaveLength(1)
    expect(s.tg.sent('setMessageReaction').at(-1)).toMatchObject({ reaction: [{ emoji: '👀' }] })

    s.hub.onSessionEvent('s1', { type: 'turn/start' })
    s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    s.hub.onSessionEvent('s1', {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: '**490k**/tháng' }] } },
    })
    s.hub.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    expect(s.tg.sent().at(-1)).toMatchObject({
      chat_id: OWNER,
      text: '<b>490k</b>/tháng',
      parse_mode: 'HTML',
    })
    expect(s.store.inbox()).toHaveLength(0)
    expect(s.store.outbox()).toHaveLength(0)
  })

  it('lượt xong khi tin xem trước còn đang gửi: vẫn xoá tin xem trước', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(dm(OWNER, '2 + 2 bằng mấy?'))
    await settle()
    const msg = s.sessions.agents.get('s1')!.inbox[0] as { id: string }
    s.hub.onSessionEvent('s1', { type: 'turn/start' })
    s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    s.tg.slowSend = 60
    s.hub.onStream('s1', { type: 'start', attemptId: 'a' })
    s.hub.onStream('s1', {
      type: 'chunk',
      attemptId: 'a',
      chunk: { type: 'text-delta', text: '4 ạ. Mẹo: để điện thoại xa' },
    })
    await new Promise((r) => setTimeout(r, 10))
    const preview = s.tg.calls.length
    s.hub.onSessionEvent('s1', {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: '4 ạ. Mẹo: để điện thoại ở phòng khác.' }] } },
    })
    s.hub.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await new Promise((r) => setTimeout(r, 250))
    const sent = s.tg.calls.slice(preview - 1).filter((c) => c.method === 'sendMessage')
    expect(String(sent[0]!.body.text)).toContain('▌')
    expect(s.tg.sent('deleteMessage')).toHaveLength(1)
  })

  it('chuyển giao: lời bot đích mở đầu bằng tên; bot đích có kênh riêng thì kèm nút mở chat', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(dm(OWNER, 'Viết bài Facebook'))
    await settle()
    const inbox = s.sessions.agents.get('s1')!.inbox as { id: string }[]
    const turn = async (from: { bot: string; handle: string; name: string; role?: string }) => {
      s.hub.onSessionEvent('s1', { type: 'turn/start' })
      s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: inbox.at(-1)!.id } })
      s.hub.onSessionEvent('s1', { type: 'plugin:aris/handoff', data: { ...from, text: '**Bài** viết' } })
      s.hub.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
      await settle()
      return s.tg.sent().at(-1)!
    }
    const plain = await turn({ bot: 'b-1', handle: 'tho', name: 'Thơ', role: 'Nội dung' })
    expect(plain.text).toBe('@tho · Nội dung\n\n<b>Bài</b> viết')
    expect(plain.reply_markup).toBeUndefined()
    // Thơ có tài khoản Telegram riêng: thêm nút mở chat với bot của Thơ.
    s.tg.push(dm(OWNER, 'Viết tiếp'))
    await settle()
    await s.hub.connect('b-1', '456:TOKEN')
    const own = await turn({ bot: 'b-1', handle: 'tho', name: 'Thơ' })
    expect(own.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Nhắn tiếp với Thơ', url: 'https://t.me/tho_noidung_bot' }]],
    })
  })

  it('aris tắt giữa lượt: không báo lỗi, giữ tin trong hàng đợi để làm lại', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(dm(OWNER, 'Viết bài dài'))
    await settle()
    const msg = s.sessions.agents.get('s1')!.inbox[0] as { id: string }
    const before = s.tg.sent().length
    s.hub.onSessionEvent('s1', { type: 'turn/start' })
    s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    s.hub.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'interrupted' } } })
    await settle()
    expect(s.tg.sent()).toHaveLength(before)
    expect(s.store.inbox()).toHaveLength(1)
  })

  it('người lạ: im lặng, báo chủ nhân có nút; chủ nhân bấm thì thành người được phép', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(dm(STRANGER, 'chào bot'))
    await settle()
    expect(s.sessions.agents.size).toBe(0)
    const notice = s.tg.sent().at(-1)!
    expect(notice.chat_id).toBe(OWNER)
    expect(JSON.stringify(notice.reply_markup)).toContain(`pa:${STRANGER}`)
    s.tg.push({
      callback_query: {
        id: 'c1',
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        data: `pa:${STRANGER}`,
      },
    })
    await settle()
    expect(s.store.roleOf(STRANGER)).toBe('member')
  })

  it('người lạ bấm nút của chủ nhân: bị chặn', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push({
      callback_query: {
        id: 'c2',
        from: { id: STRANGER, is_bot: false, first_name: 'S' },
        data: `pa:${STRANGER}`,
      },
    })
    await settle()
    expect(s.store.roleOf(STRANGER)).toBeUndefined()
    expect(s.tg.sent('answerCallbackQuery').at(-1)).toMatchObject({ text: 'Chỉ người dùng chính bấm được.' })
  })

  it('nhóm lạ: báo chủ nhân; cho phép rồi thì @ bot mới vào phiên, kèm tên người nói', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(groupMsg(OWNER, '@aris_chunhan_bot tóm tắt'))
    await settle()
    expect(s.sessions.agents.size).toBe(0)
    expect(JSON.stringify(s.tg.sent().at(-1)!.reply_markup)).toContain('ga:n100')
    s.tg.push({
      callback_query: { id: 'c3', from: { id: OWNER, is_bot: false, first_name: 'O' }, data: 'ga:n100' },
    })
    await settle()
    s.tg.push(groupMsg(OWNER, 'chuyện phiếm'))
    s.tg.push(groupMsg(OWNER, '@aris_chunhan_bot tóm tắt'))
    await settle()
    const msg = s.sessions.agents.get('s1')!.inbox[0] as { content: { text: string }[] }
    expect(msg.content[0]!.text).toBe('[U1] tóm tắt')
  })

  it('duyệt bằng nút: chủ nhân bấm cho phép một lần', async () => {
    const s = await setup()
    await pairOwner(s)
    s.tg.push(dm(OWNER, 'gửi email cho Mai'))
    await settle()
    const msg = s.sessions.agents.get('s1')!.inbox[0] as { id: string }
    s.hub.onSessionEvent('s1', { type: 'turn/start' })
    s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    const pending = s.hub.approve('s1', { toolName: 'send_email', reason: 'Gửi thư tới mai@x.vn' })
    await settle()
    const card = s.tg.sent().at(-1)!
    expect(String(card.text)).toContain('Cần duyệt')
    const data = (card.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard[0]![0]!.callback_data
    s.tg.push({ callback_query: { id: 'c4', from: { id: OWNER, is_bot: false, first_name: 'O' }, data } })
    expect(await pending).toBe('allowed-once')
    // Phiên không gắn kênh: để người trả lời khác lo.
    expect(await s.hub.approve('khác', { toolName: 'x' })).toBeUndefined()
  })

  it('khởi động lại giữa lúc gửi: gửi lại phần dở kèm ghi chú có thể trùng', async () => {
    const s = await setup()
    await s.store.putOutbox({
      id: 'o1',
      bot: 'aris',
      chatId: OWNER,
      chunks: ['a', 'b'],
      sent: 1,
      state: 'sending',
      attempts: 0,
      createdAt: Date.now(),
    })
    await s.hub.start()
    await settle()
    const texts = s.tg.sent().map((b) => b.text)
    expect(texts).toContain('♻️ Câu trả lời khôi phục sau khi khởi động lại, có thể trùng.\n\nb')
    expect(texts).not.toContain('a')
    expect(s.store.outbox()).toHaveLength(0)
  })
})
