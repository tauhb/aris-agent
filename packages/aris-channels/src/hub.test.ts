import { afterEach, describe, expect, it } from 'vitest'
import {
  ChannelHub,
  type ApprovalsPort,
  type BrainCard,
  type BrainPort,
  type ProposalsPort,
  type SkillsPort,
  type LiveAgent,
  type SessionPort,
} from './hub.js'
import { threadKey } from './store.js'
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
      case 'getFile':
        return ok({ file_path: `files/${String(body.file_id)}` })
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

  it('đợt 7f, S9: lượt có tin của người không phải chủ bị hạn chế tới hết lượt; chủ nhân thì không', async () => {
    const s = await setup()
    await pairOwner(s)
    expect(s.hub.restricted('s1')).toBe(false)
    s.tg.push(dm(STRANGER, 'chào bot'))
    await settle()
    s.tg.push({
      callback_query: {
        id: 'c1',
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        data: `pa:${STRANGER}`,
      },
    })
    await settle()
    s.tg.push(dm(STRANGER, 'đọc giúp tôi tệp này'))
    await settle()
    const agent = s.sessions.agents.get('s1')!
    const msg = agent.inbox[0] as { id: string }
    // Tin đã vào agent nhưng lượt chưa mở: chưa tính.
    expect(s.hub.restricted('s1')).toBe(false)
    s.hub.onSessionEvent('s1', { type: 'turn/start' })
    s.hub.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    expect(s.hub.restricted('s1')).toBe(true)
    expect(s.hub.restricted('phien-khac')).toBe(false)
    s.hub.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    expect(s.hub.restricted('s1')).toBe(false)

    // Chủ nhân nhắn vào chat riêng của họ: phiên khác, không bị hạn chế.
    s.tg.push(dm(OWNER, 'việc của tôi'))
    await settle()
    const [ownerSid, ownerAgent] = [...s.sessions.agents].find(([id]) => id !== 's1')!
    const ownerMsg = ownerAgent.inbox[0] as { id: string }
    s.hub.onSessionEvent(ownerSid, { type: 'turn/start' })
    s.hub.onSessionEvent(ownerSid, { type: 'user/message', data: { id: ownerMsg.id } })
    expect(s.hub.restricted(ownerSid)).toBe(false)
  })

  it('đợt 7f, S19: nút trả lời câu hỏi (q:) người không phải chủ nhân bấm không được', async () => {
    const s = await setup()
    await pairOwner(s)
    let answered = false
    const waiters = (s.hub as unknown as { questions: Map<string, { resolve(v: unknown): void }> }).questions
    waiters.set('r1:0', { resolve: () => (answered = true) })
    s.tg.push({
      callback_query: { id: 'q1', from: { id: STRANGER, is_bot: false, first_name: 'S' }, data: 'q:r1:0:0' },
    })
    await settle()
    expect(answered).toBe(false)
    expect(s.tg.sent('answerCallbackQuery').at(-1)).toMatchObject({ text: 'Chỉ người dùng chính bấm được.' })
    s.tg.push({
      callback_query: { id: 'q2', from: { id: OWNER, is_bot: false, first_name: 'O' }, data: 'q:r1:0:0' },
    })
    await settle()
    expect(answered).toBe(true)
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

  it('duyệt tập trung: thẻ của bot tới chat chính, bấm trả lời về hộp chung, xong thì sửa thẻ', async () => {
    const s = await setup()
    await pairOwner(s)
    type Ev = Parameters<Parameters<ApprovalsPort['on']>[0]>[0]
    let emit: (e: Ev) => void = () => undefined
    const answers: [string, boolean, string][] = []
    s.hub.watchApprovals({
      on: (fn) => ((emit = fn), () => undefined),
      answer: (id, allow, by) => (answers.push([id, allow, by]), true),
    })
    const item = {
      id: 'r1',
      source: 'member' as const,
      bot: 'b-1',
      name: 'Minh',
      kind: 'run',
      target: 'ls ~/Desktop',
    }
    emit({ type: 'opened', item })
    await settle()
    const card = s.tg.sent().at(-1)!
    expect(card.chat_id).toBe(OWNER)
    expect(String(card.text)).toContain('CẦN DUYỆT')
    expect(String(card.text)).toContain('Chạy lệnh')
    expect(String(card.text)).toContain('<code>ls ~/Desktop</code>')
    const data = (card.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard[0]![0]!.callback_data
    s.tg.push({ callback_query: { id: 'c9', from: { id: OWNER, is_bot: false, first_name: 'O' }, data } })
    await settle()
    expect(answers).toEqual([['r1', true, 'telegram']])
    emit({ type: 'closed', item, allow: true, by: 'user' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Đã cho phép trên web')
  })

  it('đề xuất ký ức: thẻ GHI NHỚ, Lưu / Sửa / Bỏ, lõi đầy thì lưu vào lưu trữ, xong ở web thì sửa thẻ', async () => {
    const s = await setup()
    await pairOwner(s)
    type Ev = Parameters<Parameters<ProposalsPort['on']>[0]>[0]
    let emit: (e: Ev) => void = () => undefined
    const answers: unknown[][] = []
    let full = true
    s.hub.watchProposals({
      on: (fn) => ((emit = fn), () => undefined),
      answer: async (id, decision, by, patch) => {
        answers.push([id, decision, by, patch])
        if (full && !patch) {
          full = false
          throw new Error('Cuốn owner đã đầy trần lõi')
        }
        return {}
      },
    })
    const tap = async (data: string) => {
      s.tg.push({
        callback_query: { id: `c-${data}`, from: { id: OWNER, is_bot: false, first_name: 'O' }, data },
      })
      await settle()
    }
    const buttons = () =>
      (s.tg.sent().at(-1)!.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
        .inline_keyboard[0]!
    const item = { id: 'm-1', bot: 'b-1', text: 'Người dùng không họp trước 9 giờ', why: 'Từ chối họp 8 giờ' }
    emit({ type: 'opened', item })
    await settle()
    const card = s.tg.sent().at(-1)!
    expect(String(card.text)).toContain('GHI NHỚ')
    expect(String(card.text)).toContain('Người dùng không họp trước 9 giờ')
    expect(buttons().map((b) => b.text)).toEqual(['Lưu', 'Sửa', 'Bỏ'])
    // Lưu khi lõi đầy: thẻ báo lỗi, nút đổi thành "Lưu vào lưu trữ".
    await tap(buttons()[0]!.callback_data)
    const edited = s.tg.sent('editMessageText').at(-1)!
    expect(String(edited.text)).toContain('đầy')
    const again = (edited.reply_markup as { inline_keyboard: { callback_data: string }[][] })
      .inline_keyboard[0]![0]!
    await tap(again.callback_data)
    expect(answers.at(-1)).toEqual(['m-1', 'saved', 'telegram', { tier: 'archive' }])
    emit({ type: 'closed', item, decision: 'saved', by: 'telegram' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Đã lưu')
    // Sửa: tin kế tiếp của người dùng là câu mới.
    const item2 = { id: 'm-2', bot: 'b-1', text: 'Người dùng thích cà phê' }
    emit({ type: 'opened', item: item2 })
    await settle()
    await tap(buttons()[1]!.callback_data)
    expect(String(s.tg.sent().at(-1)!.text)).toContain('Gõ câu mới')
    s.tg.push({
      message: {
        message_id: 77,
        chat: { id: OWNER, type: 'private' },
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        date: 0,
        text: 'Người dùng thích cà phê đen',
      },
    })
    await settle()
    expect(answers.at(-1)).toEqual(['m-2', 'saved', 'telegram', { text: 'Người dùng thích cà phê đen' }])
    // Trả lời trên web: thẻ được sửa.
    const item3 = { id: 'm-3', bot: 'b-1', text: 'x' }
    emit({ type: 'opened', item: item3 })
    await settle()
    emit({ type: 'closed', item: item3, decision: 'discarded', by: 'user' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Đã bỏ trên web')
  })

  it('thẻ ghi nhớ gửi trước khi khởi động lại vẫn bấm được', async () => {
    const s = await setup()
    await pairOwner(s)
    const answers: unknown[][] = []
    s.hub.watchProposals({
      on: () => () => undefined,
      answer: async (id, decision, by, patch) => void answers.push([id, decision, by, patch]),
    })
    s.tg.push({
      callback_query: {
        id: 'c-old',
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        data: 'mm:m-old:s',
        message: { message_id: 5, chat: { id: OWNER, type: 'private' }, date: 0, text: 'GHI NHỚ · Aris' },
      },
    })
    await settle()
    expect(answers).toEqual([['m-old', 'saved', 'telegram', undefined]])
  })

  it('đề xuất skill: thẻ ĐỀ XUẤT SKILL, mã ngắn vừa callback_data, bật trên Telegram, xong ở web thì sửa thẻ', async () => {
    const s = await setup()
    await pairOwner(s)
    type Ev = Parameters<Parameters<SkillsPort['on']>[0]>[0]
    let emit: (e: Ev) => void = () => undefined
    const answers: unknown[][] = []
    const v = {
      id: 'b-fe2ae2--bao-cao-doanh-thu-tuan-theo-kenh-ban-hang-va-so-sanh--v3',
      bot: 'b-fe2ae2',
      name: 'bao-cao-doanh-thu-tuan-theo-kenh-ban-hang-va-so-sanh',
      version: 3,
      why: 'Người dùng thêm cột so sánh',
    }
    s.hub.watchSkills({
      on: (fn) => ((emit = fn), () => undefined),
      answer: async (id, approve, by) => void answers.push([id, approve, by]),
      pending: () => [v.id],
    })
    emit({ type: 'opened', version: v, patch: true })
    await settle()
    const card = s.tg.sent().at(-1)!
    expect(String(card.text)).toContain('ĐỀ XUẤT SKILL')
    expect(String(card.text)).toContain('Bản vá')
    const buttons = (card.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
      .inline_keyboard[0]!
    expect(buttons.map((b) => b.text)).toEqual(['Bật v3', 'Không'])
    expect(Buffer.byteLength(buttons[0]!.callback_data)).toBeLessThanOrEqual(64)
    s.tg.push({
      callback_query: {
        id: 'c-sx',
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        data: buttons[0]!.callback_data,
      },
    })
    await settle()
    expect(answers).toEqual([[v.id, true, 'telegram']])
    emit({ type: 'closed', version: v, decision: 'approved', by: 'telegram' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Đã bật v3')
  })

  it('thẻ báo cáo routine: ghi bot làm việc khi gửi qua Aris; Hỏi bot chuyển chat sang phiên; gợi ý như tự gõ', async () => {
    const s = await setup()
    await pairOwner(s)
    await s.sessions.port.create()
    s.sessions.agents.set('session-abc', s.sessions.agents.get('s1')!)
    s.hub.watchRoutine({
      card: (sid) =>
        sid === 'session-abc'
          ? {
              title: 'Báo cáo chi tiêu tuần',
              bot: 'tin',
              name: 'Tín',
              answer: 'Chi 18 triệu.',
              suggestion: 'Đề xuất cắt quảng cáo',
            }
          : undefined,
    })
    expect(
      await s.hub.sendRoutine('aris', {
        title: 'Báo cáo chi tiêu tuần',
        worker: 'Tín',
        relay: true,
        at: new Date(2026, 9, 26, 8, 0),
        answer: 'Chi **18 triệu**.',
        sessionId: 'session-abc',
        suggestion: 'Đề xuất cắt quảng cáo',
      }),
    ).toBe('Đã gửi.')
    const card = s.tg.sent().at(-1)!
    expect(String(card.text)).toContain('<b>ROUTINE · Báo cáo chi tiêu tuần</b> · Tín')
    expect(String(card.text)).toContain('Thứ 2, 26/10 · 08:00')
    expect(String(card.text)).toContain('<b>18 triệu</b>')
    const rows = (card.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
      .inline_keyboard
    expect(rows.map((r) => r.map((b) => b.text))).toEqual([['Hỏi Tín'], ['Đề xuất cắt quảng cáo']])
    for (const b of rows.flat()) expect(Buffer.byteLength(b.callback_data)).toBeLessThanOrEqual(64)
    const press = (id: string, data: string) =>
      s.tg.push({
        callback_query: {
          id,
          from: { id: OWNER, is_bot: false, first_name: 'O' },
          message: { message_id: 77, chat: { id: OWNER, type: 'private' }, date: 0 },
          data,
        },
      })
    press('c-h', rows[0]![0]!.callback_data)
    await settle()
    expect(s.store.thread(threadKey(BOT_ID, OWNER))?.sessionId).toBe('session-abc')
    expect(String(s.tg.sent().at(-1)!.text)).toContain('hỏi tiếp Tín về «Báo cáo chi tiêu tuần»')
    press('c-s', rows[1]![0]!.callback_data)
    await settle()
    const inbox = s.sessions.agents.get('session-abc')!.inbox as { content: { text: string }[] }[]
    expect(inbox.at(-1)!.content[0]!.text).toBe('Đề xuất cắt quảng cáo')
    press('c-x', 'rt:khong-con:h')
    await settle()
    expect(s.tg.sent('answerCallbackQuery').at(-1)).toMatchObject({
      text: 'Lần chạy này không còn để xem lại.',
    })
  })

  it('bộ não: /note, chuyển tiếp thì hỏi, tệp kèm "lưu" và trả lời "lưu" thì lưu luôn', async () => {
    const s = await setup()
    await pairOwner(s)
    const added: unknown[] = []
    const notes: string[] = []
    const card = (id: string, title: string): BrainCard => ({
      id,
      status: 'moi',
      title,
      kind: 'ghi-chu',
      from: 'telegram',
      by: 'aris',
      place: 'Cá nhân',
      ops: [],
      conflicts: 0,
    })
    s.hub.watchBrain({
      on: () => () => undefined,
      add: async (i) => (added.push(i), card('n-1', i.text.split('\n')[0]!)),
      addFile: async (i) => (added.push({ name: i.name, by: i.by }), card('n-2', i.name)),
      note: async (t) => (notes.push(t), 'ca-nhan/nhat-ky/x.md'),
      approve: async () => card('n-1', ''),
      keep: async () => card('n-1', ''),
      get: () => undefined,
      waiting: () => [],
    })
    const last = () => String(s.tg.sent().at(-1)!.text)

    s.tg.push(
      dm(OWNER, '/note mai gọi chị Hà chốt giá', {
        entities: [{ type: 'bot_command', offset: 0, length: 5 }],
      }),
    )
    await settle()
    expect(notes).toEqual(['mai gọi chị Hà chốt giá'])
    expect(last()).toContain('Đã ghi vào nhật ký hôm nay')

    // Chuyển tiếp: hỏi lại, chưa vào phiên; bấm Lưu thì vào Hộp thư vào kèm nguồn gốc.
    s.tg.push(
      dm(OWNER, '5 xu hướng video ngắn 2026', {
        message_id: 70,
        forward_origin: { type: 'channel', date: 0, chat: { id: -5, type: 'channel', title: 'Kênh tin' } },
      }),
    )
    await settle()
    expect(last()).toContain('Lưu vào bộ não')
    expect(s.sessions.agents.size).toBe(0)
    s.tg.push({
      callback_query: {
        id: 'c1',
        from: { id: OWNER, is_bot: false, first_name: 'O' },
        message: { message_id: 101, chat: { id: OWNER, type: 'private' }, date: 0 },
        data: 'bf:70:y',
      },
    })
    await settle()
    expect(added.at(-1)).toEqual({
      text: '5 xu hướng video ngắn 2026\n\n(Chuyển tiếp từ Kênh tin)',
      by: 'aris',
    })
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Đã vào Hộp thư vào')

    // Ghi âm kèm chữ "lưu": tải tệp, gửi vào bộ não, không vào phiên.
    s.tg.push(
      dm(OWNER, '', {
        text: undefined,
        caption: 'Lưu',
        voice: { file_id: 'v1.oga', file_unique_id: 'v1', duration: 102 },
      }),
    )
    await settle()
    expect((added.at(-1) as { name: string }).name).toMatch(/^ghi-am-\d{4}\.oga$/)
    expect(last()).toContain('ghi âm 1:42')
    expect(s.sessions.agents.size).toBe(0)

    // Trả lời "lưu" vào một tin cũ: lưu tin đó.
    s.tg.push(
      dm(OWNER, 'lưu vào bộ não', {
        reply_to_message: {
          message_id: 40,
          chat: { id: OWNER, type: 'private' },
          date: 0,
          text: 'Quy tắc đặt tên video',
        },
      }),
    )
    await settle()
    expect(added.at(-1)).toEqual({ text: 'Quy tắc đặt tên video', by: 'aris' })

    // Tin thường vẫn là trò chuyện.
    s.tg.push(dm(OWNER, 'lưu ý giúp tôi lịch mai'))
    await settle()
    expect(s.sessions.agents.size).toBe(1)
  })

  it('bộ não: thẻ bản nạp theo mức duyệt, Đồng ý trên Telegram, xong ở web thì sửa thẻ, nhắc chờ lâu', async () => {
    const s = await setup()
    await pairOwner(s)
    type Ev = Parameters<Parameters<BrainPort['on']>[0]>[0]
    let emit: (e: Ev) => void = () => undefined
    const approved: string[] = []
    const base: BrainCard = {
      id: 'n-1',
      status: 'cho-duyet',
      title: 'Xu hướng video ngắn 2026',
      kind: 'link',
      from: 'telegram',
      by: 'aris',
      place: 'Cá nhân',
      summary: '5 xu hướng',
      level: 'nhanh',
      ops: [
        { title: 'Tóm tắt · Xu hướng video ngắn 2026', kind: 'moi' },
        { title: 'Video ngắn', kind: 'bo-sung' },
      ],
      conflicts: 0,
    }
    s.hub.watchBrain({
      on: (fn) => ((emit = fn), () => undefined),
      add: async () => base,
      addFile: async () => base,
      note: async () => '',
      approve: async (id) => (approved.push(id), base),
      keep: async () => base,
      get: () => base,
      waiting: () => [base],
    })
    const buttons = () =>
      (s.tg.sent().at(-1)!.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] })
        .inline_keyboard[0]!
    const tap = async (data: string, messageId: number) => {
      s.tg.push({
        callback_query: {
          id: `c-${data}`,
          from: { id: OWNER, is_bot: false, first_name: 'O' },
          message: { message_id: messageId, chat: { id: OWNER, type: 'private' }, date: 0 },
          data,
        },
      })
      await settle()
    }

    // Nguồn từ web: không gửi thẻ.
    emit({ type: 'status', batch: { ...base, id: 'n-0', from: 'web' }, prev: 'dang-lap' })
    await settle()
    const before = s.tg.sent().length

    emit({ type: 'status', batch: base, prev: 'dang-lap' })
    await settle()
    expect(s.tg.sent()).toHaveLength(before + 1)
    const sent = s.tg.sent().at(-1)!
    expect(String(sent.text)).toContain('BẢN NẠP · duyệt nhanh')
    expect(String(sent.text)).toContain('＋ Trang mới: Tóm tắt · Xu hướng video ngắn 2026')
    expect(buttons().map((b) => b.text)).toEqual(['Đồng ý', 'Xem trên web', 'Chỉ lưu'])
    await tap(buttons()[0]!.callback_data, 102)
    expect(approved).toEqual(['n-1'])
    emit({ type: 'status', batch: { ...base, status: 'da-nap' }, prev: 'cho-duyet' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('ĐÃ NẠP')
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('Ghép 2 trang')

    // Duyệt kỹ: không có nút Đồng ý, có dòng ⚠.
    const careful: BrainCard = {
      ...base,
      id: 'n-2',
      level: 'ky',
      ops: [{ title: 'Chị Hà', kind: 'sua-y', flag: 'giá cũ 1,5 triệu, nguồn mới 2 triệu' }],
    }
    emit({ type: 'status', batch: careful, prev: 'dang-lap' })
    await settle()
    expect(String(s.tg.sent().at(-1)!.text)).toContain('⚠ Chị Hà: giá cũ 1,5 triệu')
    expect(buttons().map((b) => b.text)).toEqual(['Xem trên web', 'Chỉ lưu'])
    // Chỉ lưu trên web: sửa thẻ.
    emit({ type: 'status', batch: { ...careful, status: 'chi-luu' }, prev: 'cho-duyet' })
    await settle()
    expect(String(s.tg.sent('editMessageText').at(-1)!.text)).toContain('CHỈ LƯU NGUỒN')

    // Tự nạp: không thẻ, chỉ báo đã nạp.
    const auto: BrainCard = { ...base, id: 'n-3', level: 'tu-nap' }
    const n = s.tg.sent().length
    emit({ type: 'status', batch: { ...auto }, prev: 'dang-lap' })
    emit({ type: 'status', batch: { ...auto, status: 'da-nap' }, prev: 'cho-duyet' })
    await settle()
    expect(s.tg.sent()).toHaveLength(n + 1)
    expect(String(s.tg.sent().at(-1)!.text)).toContain('ĐÃ NẠP')

    // Nhắc chờ lâu: nút gửi lại các thẻ đang chờ.
    emit({ type: 'remind', batches: [base, careful] })
    await settle()
    expect(String(s.tg.sent().at(-1)!.text)).toContain('2 bản nạp chờ duyệt hơn 7 ngày')
    await tap('bn:list', 200)
    expect(String(s.tg.sent().at(-1)!.text)).toContain('BẢN NẠP')
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
