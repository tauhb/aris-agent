import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelHub, type LiveAgent, type SessionPort } from '../hub.js'
import { larkThreadKey } from '../store.js'
import { memStore } from '../store.test.js'
import { LarkChannel } from './channel.js'
import {
  LarkError,
  type LarkApi,
  type LarkConnector,
  type LarkCredentials,
  type LarkInbound,
  type LarkOutgoing,
  type LarkSocketHandlers,
  type LarkTarget,
} from './types.js'

const APP_ID = 'cli_a8f2c4d6e0b13579'
const SECRET = 'S3CR3T-never-in-logs-0123456789'
const OWNER = 'ou_owner'
const OTHER = 'ou_other'
const STRANGER = 'ou_stranger'
const GROUP = 'oc_group'
const BOT_OPEN_ID = 'ou_bot'

/** Lark giả: ghi lại mọi tin gửi đi, đẩy sự kiện vào như kết nối dài. Không gọi mạng. */
class FakeLark {
  sent: { to: LarkTarget; msg: LarkOutgoing; replyTo?: string | undefined }[] = []
  reacted: { id: string; emoji: string }[] = []
  unreacted: string[] = []
  opened: LarkCredentials[] = []
  handlers: LarkSocketHandlers | undefined
  closed = 0
  /** Lỗi cho lần `botInfo` kế tiếp (rồi tự hết). */
  botInfoErrors: Error[] = []
  /** Lỗi cho lần `socket.start` kế tiếp (rồi tự hết). */
  startErrors: Error[] = []
  /** Lỗi cho `send` (mỗi phần tử dùng một lần). */
  sendErrors: Error[] = []
  names: Record<string, string> = { [OWNER]: 'Hoàng Bá Tầu', [OTHER]: 'Thơ', [STRANGER]: 'Người lạ' }
  downloads: string[] = []
  private n = 0

  texts(to?: string) {
    return this.sent
      .filter((s) => !to || s.to.id === to)
      .map((s) => JSON.parse(s.msg.content) as { text?: string; body?: { elements: { content: string }[] } })
      .map((c) => c.text ?? c.body?.elements[0]?.content ?? '')
  }

  api: LarkApi = {
    botInfo: async () => {
      const e = this.botInfoErrors.shift()
      if (e) throw e
      return { openId: BOT_OPEN_ID, name: 'Aris' }
    },
    userName: async (id) => this.names[id],
    chatName: async (id) => (id === GROUP ? 'Marketing' : undefined),
    send: async (to, msg, replyTo) => {
      const e = this.sendErrors.shift()
      if (e) throw e
      this.sent.push({ to, msg, replyTo })
      return { messageId: `om_out${++this.n}` }
    },
    react: async (id, emoji) => {
      this.reacted.push({ id, emoji })
      return `r${this.reacted.length}`
    },
    unreact: async (_id, reaction) => void this.unreacted.push(reaction),
    download: async (_m, key) => {
      this.downloads.push(key)
      return new Uint8Array([0x89, 0x50, 1, 2, 3])
    },
    uploadImage: async () => 'img_key',
    uploadFile: async () => 'file_key',
  }

  connector: LarkConnector = {
    open: (c) => {
      this.opened.push(c)
      return {
        api: this.api,
        socket: {
          start: async (h) => {
            const e = this.startErrors.shift()
            if (e) throw e
            this.handlers = h
            h.onState('ready')
          },
          close: () => void this.closed++,
        },
      }
    },
  }

  /** Một sự kiện tin vào. */
  async push(ev: Partial<LarkInbound> & { text?: string }) {
    const { text, ...rest } = ev
    await this.handlers!.onMessage({
      eventId: '',
      messageId: `om_in${++this.n}`,
      chatId: 'oc_dm',
      chatType: 'p2p',
      senderOpenId: OWNER,
      senderType: 'user',
      messageType: 'text',
      content: JSON.stringify({ text: text ?? '' }),
      mentions: [],
      createTime: 0,
      ...rest,
    })
  }

  /** Tin trong nhóm, có @ bot. */
  async group(from: string, text: string, over: Partial<LarkInbound> = {}) {
    await this.push({
      chatId: GROUP,
      chatType: 'group',
      senderOpenId: from,
      text: `@_user_1 ${text}`,
      mentions: [{ key: '@_user_1', openId: BOT_OPEN_ID, name: 'Aris' }],
      ...over,
    })
  }
}

function fakeSessions() {
  const agents = new Map<string, LiveAgent & { inbox: unknown[]; steered: unknown[]; cancelled: number }>()
  let n = 0
  let sessionCount = 0
  const port: SessionPort = {
    async create() {
      const id = `s${++sessionCount}`
      agents.set(id, {
        status: 'idle',
        session: { id },
        inbox: [],
        steered: [],
        cancelled: 0,
        followup(m) {
          this.inbox.push(m)
        },
        steer(m) {
          this.steered.push(m)
        },
        inject() {},
        cancel() {
          this.cancelled++
        },
      })
      return id
    },
    agent: async (id) => {
      const a = agents.get(id)
      if (!a) throw new Error('không có phiên')
      return a
    },
    catalog: async () => [],
    select: async () => {},
    titles: async (ids) => new Map(ids.map((i) => [i, `Phiên ${i}`])),
    message: (content) => ({ id: `m${++n}`, content }),
    notice: (text) => ({ text }),
  }
  return { port, agents }
}

const settle = () => new Promise((r) => setTimeout(r, 30))

let channels: LarkChannel[] = []
afterEach(() => {
  for (const c of channels) c.stop()
  channels = []
})

async function setup(opts: { connect?: boolean; retryMs?: number } = {}) {
  const lark = new FakeLark()
  const store = memStore()
  const secrets = new Map<string, string>()
  const sessions = fakeSessions()
  const logs: string[] = []
  const channel = new LarkChannel({
    store,
    credentials: {
      resolve: async (r) => secrets.get(r),
      set: async (r, v) => void secrets.set(r, v),
      unset: async (r) => void secrets.delete(r),
    },
    sessions: sessions.port,
    logger: {
      info: (m, ...a) => logs.push(String([m, ...a])),
      warn: (m, ...a) => logs.push(String([m, ...a])),
    },
    connector: lark.connector,
    ...(opts.retryMs ? { retryMs: opts.retryMs } : {}),
  })
  channels.push(channel)
  if (opts.connect !== false)
    await channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'lark' })
  return { lark, store, secrets, sessions, channel, logs }
}

type Setup = Awaited<ReturnType<typeof setup>>

async function pair(s: Setup, openId: string, role: 'owner' | 'member' = 'owner') {
  const code = await s.store.createCode(role, 'lark')
  await s.lark.push({ senderOpenId: openId, text: code.code, chatId: `oc_dm_${openId}` })
  await settle()
}

/** Chạy một lượt trả lời của agent cho tin đã vào phiên `sid`. */
function finishTurn(s: Setup, sid: string, answer: string, kind = 'completed') {
  const msg = s.sessions.agents.get(sid)!.inbox.at(-1) as { id: string }
  s.channel.onSessionEvent(sid, { type: 'turn/start' })
  s.channel.onSessionEvent(sid, { type: 'user/message', data: { id: msg.id } })
  if (answer)
    s.channel.onSessionEvent(sid, {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: answer }] } },
    })
  s.channel.onSessionEvent(sid, { type: 'turn/end', data: { reason: { kind } } })
}

describe('kênh Lark', () => {
  it('kết nối: kiểm khoá, App Secret vào kho khoá và không vào bản ghi', async () => {
    const s = await setup()
    expect(s.secrets.get('LARK_ARIS_APP_SECRET')).toBe(SECRET)
    expect(JSON.stringify(s.store.larkApp('aris'))).not.toContain(SECRET)
    expect(s.store.larkApp('aris')).toMatchObject({
      channel: 'lark',
      appId: APP_ID,
      domain: 'lark',
      name: 'Aris',
      botOpenId: BOT_OPEN_ID,
    })
    expect(s.channel.status()).toMatchObject([
      { bot: 'aris', appId: APP_ID, state: 'receiving', running: true },
    ])
    // Bản ghi Lark không lẫn vào danh sách của Telegram.
    expect(s.store.bots()).toEqual([])
  })

  it('kết nối: App ID sai dạng, khoá sai thì từ chối và không lưu gì', async () => {
    const s = await setup({ connect: false })
    await expect(
      s.channel.connect('aris', { appId: 'abc', appSecret: SECRET, domain: 'lark' }),
    ).rejects.toThrow(/cli_/)
    await expect(
      s.channel.connect('aris', { appId: APP_ID, appSecret: ' ', domain: 'lark' }),
    ).rejects.toThrow()
    s.lark.botInfoErrors.push(new LarkError('Lark 10014: app secret invalid', 10014, true))
    await expect(
      s.channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'feishu' }),
    ).rejects.toThrow(/10014/)
    expect(s.store.larkApps()).toEqual([])
    expect(s.secrets.size).toBe(0)
  })

  it('khoá đúng nhưng nối kết nối dài lỗi tạm: vẫn lưu, ghi lỗi và tự thử lại', async () => {
    vi.useFakeTimers()
    try {
      const s = await setup({ connect: false, retryMs: 1_000 })
      s.lark.startErrors.push(new LarkError('mạng lỗi'))
      const rec = await s.channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'lark' })
      expect(rec.error).toBe('mạng lỗi')
      expect(s.secrets.get('LARK_ARIS_APP_SECRET')).toBe(SECRET)
      expect(s.channel.status()[0]).toMatchObject({ state: 'error', running: false })
      await vi.advanceTimersByTimeAsync(1_000)
      expect(s.store.larkApp('aris')?.error).toBeUndefined()
      expect(s.channel.status()[0]).toMatchObject({ state: 'receiving', running: true })
    } finally {
      vi.useRealTimers()
    }
  })

  it('miền Feishu được lưu và chuyển cho SDK', async () => {
    const s = await setup({ connect: false })
    await s.channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'feishu' })
    expect(s.store.larkApp('aris')?.domain).toBe('feishu')
    expect(s.lark.opened.at(-1)).toMatchObject({ domain: 'feishu', appId: APP_ID })
  })

  it('gỡ ứng dụng: xoá khoá, bản ghi, người đã ghép và đóng kết nối', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.channel.disconnect('aris')
    expect(s.secrets.size).toBe(0)
    expect(s.store.larkApps()).toEqual([])
    expect(s.store.larkPeople()).toEqual([])
    expect(s.lark.closed).toBeGreaterThan(0)
  })

  it('ghép đôi Lark: nhắn đúng mã kênh lark trong chat riêng thì thành chủ nhân', async () => {
    const s = await setup()
    await pair(s, OWNER)
    expect(s.store.larkRoleOf(OWNER)).toBe('owner')
    expect(s.store.larkPeople()).toMatchObject([
      { openId: OWNER, name: 'Hoàng Bá Tầu', role: 'owner', channel: 'lark' },
    ])
    expect(s.lark.texts().at(-1)).toContain('người dùng chính')
    // Không lẫn sang Telegram.
    expect(s.store.people()).toEqual([])
    expect(s.store.owners()).toEqual([])
    expect(s.store.roleOf(0)).toBeUndefined()
  })

  it('mã Telegram nhắn sang Lark: "Mã này dành cho kênh khác.", không ghép, mã còn nguyên, không bị khoá', async () => {
    const s = await setup()
    const tg = await s.store.createCode('owner', 'telegram')
    for (let i = 0; i < 7; i++) {
      await s.lark.push({ text: tg.code })
      await settle()
    }
    expect(s.lark.texts().at(-1)).toBe('Mã này dành cho kênh khác.')
    expect(s.store.larkRoleOf(OWNER)).toBeUndefined()
    expect(s.store.activeCodes().some((c) => c.code === tg.code)).toBe(true)
    expect(s.store.pairLocked(`lk-${OWNER}`)).toBe(false)
    await pair(s, OWNER)
    expect(s.store.larkRoleOf(OWNER)).toBe('owner')
  })

  it('tin vào đúng phiên; lượt xong thì trả lời bằng thẻ Markdown và dọn hàng đợi', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'Giá gói Pro là bao nhiêu?', chatId: 'oc_dm' })
    await settle()
    const agent = s.sessions.agents.get('s1')!
    const msg = agent.inbox[0] as { id: string; content: { text: string }[] }
    expect(msg.content[0]!.text).toBe('Giá gói Pro là bao nhiêu?')
    expect(s.store.larkInbox()).toHaveLength(1)
    expect(s.store.thread(larkThreadKey('aris', 'oc_dm'))).toMatchObject({
      sessionId: 's1',
      chatRef: 'oc_dm',
    })
    expect(s.lark.reacted.at(-1)).toMatchObject({ emoji: 'OnIt' })

    finishTurn(s, 's1', '**490k**/tháng')
    await settle()
    const out = s.lark.sent.at(-1)!
    expect(out.to).toEqual({ kind: 'chat', id: 'oc_dm' })
    expect(out.msg.msgType).toBe('interactive')
    expect(JSON.parse(out.msg.content)).toMatchObject({
      schema: '2.0',
      body: { elements: [{ tag: 'markdown', content: '**490k**/tháng' }] },
    })
    expect(out.replyTo).toBeUndefined()
    expect(s.store.larkInbox()).toHaveLength(0)
    expect(s.store.larkOutbox()).toHaveLength(0)
    expect(s.lark.unreacted).toHaveLength(1)
    expect(s.lark.reacted.at(-1)).toMatchObject({ emoji: 'DONE' })
  })

  it('câu trả lời không có Markdown gửi dạng tin chữ thường', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'Chào' })
    await settle()
    finishTurn(s, 's1', 'Chào bạn nhé')
    await settle()
    expect(s.lark.sent.at(-1)!.msg).toEqual({
      msgType: 'text',
      content: JSON.stringify({ text: 'Chào bạn nhé' }),
    })
  })

  it('câu trả lời dài chia nhiều tin, đúng thứ tự', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'viết dài' })
    await settle()
    const para = (i: number) => `Đoạn ${i}: ${'x'.repeat(1500)}`
    finishTurn(s, 's1', [1, 2, 3, 4].map(para).join('\n\n'))
    await settle()
    const texts = s.lark.texts().slice(-3)
    expect(s.lark.sent.length).toBeGreaterThanOrEqual(3)
    expect(texts.join('')).toContain('Đoạn 1')
    expect(texts.join('').indexOf('Đoạn 4')).toBeGreaterThan(texts.join('').indexOf('Đoạn 1'))
  })

  it('Lark gửi lại cùng một tin: chỉ xử lý một lần', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const ev = { text: 'một lần thôi', messageId: 'om_same' }
    await s.lark.push(ev)
    await s.lark.push(ev)
    await settle()
    expect(s.sessions.agents.get('s1')!.inbox).toHaveLength(1)
    expect(s.store.larkInbox()).toHaveLength(1)
  })

  it('nhóm không @ bot thì im lặng: không phiên, không trả lời, không báo ai', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertLarkGroup(GROUP, { title: 'Marketing', allowed: true })
    const before = s.lark.sent.length
    await s.lark.push({ chatId: GROUP, chatType: 'group', senderOpenId: OWNER, text: 'nói chuyện với nhau' })
    await settle()
    expect(s.lark.sent).toHaveLength(before)
    expect(s.sessions.agents.size).toBe(0)
    expect(s.store.larkInbox()).toHaveLength(0)
  })

  it('nhóm lạ gọi bot: im lặng với nhóm, báo chủ nhân; một lần mỗi giờ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.lark.sent.length
    await s.lark.group(OWNER, 'xin chào')
    await s.lark.group(OWNER, 'xin chào lần nữa')
    await settle()
    expect(s.sessions.agents.size).toBe(0)
    const sent = s.lark.sent.slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual({ kind: 'user', id: OWNER })
    expect(s.lark.texts(OWNER).at(-1)).toContain('Marketing')
    expect(s.store.larkGroup(GROUP)).toMatchObject({ allowed: false, title: 'Marketing', channel: 'lark' })
  })

  it('nhóm được phép, chủ nhân @ bot: tin vào phiên kèm tên người nói, trả lời vào đúng tin', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertLarkGroup(GROUP, { title: 'Marketing', allowed: true, prompt: 'Trả lời ngắn' })
    await s.lark.group(OWNER, 'tóm tắt giúp', { messageId: 'om_g1' })
    await settle()
    const agent = s.sessions.agents.get('s1')!
    const msg = agent.inbox[0] as { id: string; content: { text: string }[] }
    expect(msg.content[0]!.text).toBe('[Hoàng Bá Tầu] tóm tắt giúp')
    finishTurn(s, 's1', 'Xong rồi')
    await settle()
    expect(s.lark.sent.at(-1)).toMatchObject({ to: { kind: 'chat', id: GROUP }, replyTo: 'om_g1' })
  })

  it('nhóm: trả lời [SILENT] thì im lặng', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertLarkGroup(GROUP, { title: 'Marketing', allowed: true })
    await s.lark.group(OWNER, 'cảm ơn')
    await settle()
    const before = s.lark.sent.length
    finishTurn(s, 's1', '[SILENT]')
    await settle()
    expect(s.lark.sent).toHaveLength(before)
    expect(s.store.larkInbox()).toHaveLength(0)
  })

  it('nhóm: người chưa ghép đôi bị bỏ qua, trừ khi nhóm cho mọi thành viên (khi đó quyền hạn chế)', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertLarkGroup(GROUP, { title: 'Marketing', allowed: true })
    await s.lark.group(OTHER, 'cho hỏi chút')
    await settle()
    expect(s.sessions.agents.size).toBe(0)

    await s.store.upsertLarkGroup(GROUP, { who: 'everyone' })
    await s.lark.group(OTHER, 'cho hỏi chút')
    await settle()
    const msg = s.sessions.agents.get('s1')!.inbox[0] as { id: string; content: { text: string }[] }
    expect(msg.content[0]!.text).toContain('[Thơ] cho hỏi chút')
    expect(msg.content[0]!.text).toContain('không phải người dùng chính')
    // Trong lượt của người này, quyền bị hạn chế thật; hub Telegram cũng thấy qua kênh gắn cạnh.
    const hub = new ChannelHub({
      store: s.store,
      credentials: { resolve: async () => undefined, set: async () => {}, unset: async () => {} },
      sessions: s.sessions.port,
      logger: { info() {}, warn() {} },
    })
    hub.attachPeer(s.channel)
    s.channel.onSessionEvent('s1', { type: 'turn/start' })
    s.channel.onSessionEvent('s1', { type: 'user/message', data: { id: msg.id } })
    expect(s.channel.restricted('s1')).toBe(true)
    expect(hub.restricted('s1')).toBe(true)
    expect(hub.peerStatus()).toMatchObject({ lark: [{ bot: 'aris' }] })
    s.channel.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    expect(s.channel.restricted('s1')).toBe(false)
    expect(hub.restricted('s1')).toBe(false)
  })

  it('người lạ nhắn riêng: im lặng với họ, báo chủ nhân Lark; một lần mỗi giờ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.lark.sent.length
    await s.lark.push({ senderOpenId: STRANGER, chatId: 'oc_stranger', text: 'bạn là ai?' })
    await s.lark.push({ senderOpenId: STRANGER, chatId: 'oc_stranger', text: 'alo?' })
    await settle()
    const sent = s.lark.sent.slice(before)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.to).toEqual({ kind: 'user', id: OWNER })
    expect(s.lark.texts(OWNER).at(-1)).toContain('Người lạ')
    expect(s.lark.texts(OWNER).at(-1)).toContain('bạn là ai?')
    expect(s.lark.sent.some((x) => x.to.id === 'oc_stranger')).toBe(false)
    expect(s.sessions.agents.size).toBe(0)
  })

  it('tin của bot hay ứng dụng khác bị bỏ qua', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.lark.sent.length
    await s.lark.push({ senderType: 'app', text: 'tự động' })
    await settle()
    expect(s.lark.sent).toHaveLength(before)
    expect(s.sessions.agents.size).toBe(0)
  })

  it('/new, /status, /stop, /sessions, /resume', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: '/status' })
    await settle()
    expect(s.lark.texts().at(-1)).toContain('chưa có phiên')

    await s.lark.push({ text: 'mở đầu' })
    await settle()
    await s.lark.push({ text: '/new' })
    await settle()
    expect(s.sessions.agents.size).toBe(2)
    expect(s.lark.texts().at(-1)).toContain('phiên mới')

    s.sessions.agents.get('s2')!.status = 'running'
    await s.lark.push({ text: '/stop' })
    await settle()
    expect(s.sessions.agents.get('s2')!.cancelled).toBe(1)
    expect(s.lark.texts().at(-1)).toBe('Đã dừng.')
    await s.lark.push({ text: '/status' })
    await settle()
    expect(s.lark.texts().at(-1)).toContain('s2')

    await s.lark.push({ text: '/sessions' })
    await settle()
    expect(s.lark.texts().at(-1)).toContain('2. Phiên s1')
    await s.lark.push({ text: '/resume 2' })
    await settle()
    expect(s.store.thread(larkThreadKey('aris', 'oc_dm'))?.sessionId).toBe('s1')
    await s.lark.push({ text: '/model' })
    await settle()
    expect(s.lark.texts().at(-1)).toContain('chưa có trên Lark')
  })

  it('người được phép chỉ dùng được lệnh cơ bản', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    await s.lark.push({ senderOpenId: OTHER, chatId: 'oc_dm_ou_other', text: '/sessions' })
    await settle()
    expect(s.lark.texts().at(-1)).toBe('Lệnh này chỉ người dùng chính dùng được.')
  })

  it('"Khi bot đang làm mà nhắn thêm": chèn vào việc, hay dừng và làm mới', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'việc dài' })
    await settle()
    const agent = s.sessions.agents.get('s1')!
    agent.status = 'running'
    await s.lark.push({ text: 'à thêm điều này' })
    await settle()
    expect(agent.steered).toHaveLength(1)
    await s.store.updateSettings({ busy: 'interrupt' })
    await s.lark.push({ text: 'thôi làm cái khác' })
    await settle()
    expect(agent.cancelled).toBe(1)
    expect(agent.inbox).toHaveLength(2)
  })

  it('dừng khẩn cấp: tin thường chỉ nhận câu báo, lệnh vẫn chạy', async () => {
    const lark = new FakeLark()
    const store = memStore()
    const sessions = fakeSessions()
    let stopped = false
    const channel = new LarkChannel({
      store,
      credentials: { resolve: async () => SECRET, set: async () => {}, unset: async () => {} },
      sessions: sessions.port,
      logger: { info() {}, warn() {} },
      connector: lark.connector,
      stopped: () => stopped,
    })
    channels.push(channel)
    await channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'lark' })
    const code = await store.createCode('owner', 'lark')
    await lark.push({ text: code.code })
    await settle()
    stopped = true
    await lark.push({ text: 'làm việc đi' })
    await settle()
    expect(sessions.agents.size).toBe(0)
    expect(lark.texts().at(-1)).toContain('dừng khẩn cấp')
    await lark.push({ text: '/help' })
    await settle()
    expect(lark.texts().at(-1)).toContain('Lệnh')
  })

  it('ảnh người dùng gửi được tải về và đưa vào phiên', async () => {
    const lark = new FakeLark()
    const store = memStore()
    const sessions = fakeSessions()
    const saved: unknown[] = []
    const channel = new LarkChannel({
      store,
      credentials: { resolve: async () => SECRET, set: async () => {}, unset: async () => {} },
      sessions: sessions.port,
      logger: { info() {}, warn() {} },
      connector: lark.connector,
      attachments: {
        saveImage: async (i) => (saved.push(i), { id: 'att1' }),
        saveFile: async (i) => (saved.push(i), { id: 'att2' }),
      },
    })
    channels.push(channel)
    await channel.connect('aris', { appId: APP_ID, appSecret: SECRET, domain: 'lark' })
    const code = await store.createCode('owner', 'lark')
    await lark.push({ text: code.code })
    await settle()
    await lark.push({ messageType: 'image', content: JSON.stringify({ image_key: 'img_v2_abc' }) })
    await settle()
    await lark.push({
      messageType: 'file',
      content: JSON.stringify({ file_key: 'file_v2_x', file_name: 'bao-cao.pdf' }),
    })
    await settle()
    expect(lark.downloads).toEqual(['img_v2_abc', 'file_v2_x'])
    expect(saved[0]).toMatchObject({ mediaType: 'image/png' })
    expect(saved[1]).toMatchObject({ name: 'bao-cao.pdf' })
    const first = sessions.agents.get('s1')!.inbox[0] as { content: { type: string }[] }
    expect(first.content.map((c) => c.type)).toEqual(['image'])
  })

  it('loại tin chưa đọc được: báo thay vì im lặng', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ messageType: 'sticker', content: JSON.stringify({ file_key: 'x' }) })
    await settle()
    expect(s.lark.texts().at(-1)).toContain('sticker')
    expect(s.sessions.agents.size).toBe(0)
  })

  it('duyệt việc: người ngoài bị từ chối ngay; chủ nhân được chuyển sang web', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertLarkGroup(GROUP, { title: 'Marketing', allowed: true, who: 'everyone' })
    await s.lark.group(OTHER, 'xoá giúp tệp')
    await settle()
    const m1 = s.sessions.agents.get('s1')!.inbox[0] as { id: string }
    s.channel.onSessionEvent('s1', { type: 'turn/start' })
    s.channel.onSessionEvent('s1', { type: 'user/message', data: { id: m1.id } })
    expect(await s.channel.approve('s1', { toolName: 'rm' })).toBe('rejected')
    expect(s.lark.texts().at(-1)).toContain('cần người dùng chính duyệt')
    s.channel.onSessionEvent('s1', { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    // Phiên không thuộc Lark: để người trả lời khác lo.
    expect(await s.channel.approve('s9', { toolName: 'rm' })).toBeUndefined()

    await s.lark.push({ text: 'việc của tôi' })
    await settle()
    const m2 = s.sessions.agents.get('s2')!.inbox[0] as { id: string }
    s.channel.onSessionEvent('s2', { type: 'turn/start' })
    s.channel.onSessionEvent('s2', { type: 'user/message', data: { id: m2.id } })
    expect(await s.channel.approve('s2', { toolName: 'rm' })).toBeUndefined()
    expect(s.lark.texts().at(-1)).toContain('trên máy')
  })

  it('lượt lỗi hay bị dừng thì báo, không im lặng', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'làm đi' })
    await settle()
    finishTurn(s, 's1', '', 'aborted')
    await settle()
    expect(s.lark.texts().at(-1)).toBe('Đã dừng việc này.')
    expect(s.lark.reacted.at(-1)).toMatchObject({ emoji: 'CrossMark' })
  })

  it('gửi lỗi thì thử lại, tối đa 3 lần rồi bỏ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    vi.useFakeTimers()
    try {
      await s.lark.push({ text: 'hỏi' })
      await vi.advanceTimersByTimeAsync(30)
      for (let i = 0; i < 5; i++) s.lark.sendErrors.push(new Error('mạng lỗi'))
      finishTurn(s, 's1', 'trả lời')
      await vi.advanceTimersByTimeAsync(10)
      expect(s.store.larkOutbox()).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(5_000)
      await vi.advanceTimersByTimeAsync(10_000)
      expect(s.store.larkOutbox()).toHaveLength(0)
      expect(s.lark.sent.at(-1)!.msg.content).not.toContain('trả lời')
    } finally {
      vi.useRealTimers()
    }
  })

  it('khởi động lúc mạng chập chờn: tự thử lại với thời gian chờ tăng dần', async () => {
    vi.useFakeTimers()
    try {
      const s = await setup()
      s.channel.stop()
      s.lark.botInfoErrors.push(new LarkError('không tới được Lark'), new LarkError('không tới được Lark'))
      const ch = new LarkChannel({
        store: s.store,
        credentials: { resolve: async (r) => s.secrets.get(r), set: async () => {}, unset: async () => {} },
        sessions: s.sessions.port,
        logger: { info() {}, warn() {} },
        connector: s.lark.connector,
        retryMs: 1_000,
      })
      channels.push(ch)
      await ch.start()
      expect(s.store.larkApp('aris')?.error).toBeTruthy()
      expect(ch.status()[0]).toMatchObject({ state: 'error' })
      await vi.advanceTimersByTimeAsync(1_000)
      expect(s.store.larkApp('aris')?.error).toBeTruthy()
      await vi.advanceTimersByTimeAsync(2_000)
      expect(s.store.larkApp('aris')?.error).toBeUndefined()
      expect(ch.status()[0]).toMatchObject({ state: 'receiving' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('khoá sai lúc khởi động: báo lỗi và không thử lại', async () => {
    vi.useFakeTimers()
    try {
      const s = await setup()
      s.channel.stop()
      s.lark.botInfoErrors.push(new LarkError('Lark 10014: app secret invalid', 10014, true))
      const opened = s.lark.opened.length
      const ch = new LarkChannel({
        store: s.store,
        credentials: { resolve: async (r) => s.secrets.get(r), set: async () => {}, unset: async () => {} },
        sessions: s.sessions.port,
        logger: { info() {}, warn() {} },
        connector: s.lark.connector,
        retryMs: 1_000,
      })
      channels.push(ch)
      await ch.start()
      await vi.advanceTimersByTimeAsync(600_000)
      expect(s.lark.opened.length).toBe(opened + 1)
      expect(s.store.larkApp('aris')?.error).toContain('10014')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rớt kết nối rồi nối lại: trạng thái đổi theo; SDK bỏ cuộc thì báo lỗi', async () => {
    const s = await setup()
    expect(s.channel.status()[0]!.state).toBe('receiving')
    s.lark.handlers!.onState('reconnecting')
    expect(s.channel.status()[0]!.state).toBe('reconnecting')
    s.lark.handlers!.onState('reconnected')
    expect(s.channel.status()[0]!.state).toBe('receiving')
    s.lark.handlers!.onState('error', new Error('chưa bật kết nối dài'))
    await settle()
    expect(s.channel.status()[0]).toMatchObject({ state: 'error', error: 'chưa bật kết nối dài' })
  })

  it('khởi động lại giữa chừng: gửi nốt câu trả lời dở, làm lại tin chưa xong, không đụng bản ghi Telegram', async () => {
    const s = await setup()
    await pair(s, OWNER)
    s.channel.stop()
    await s.store.putOutbox({
      id: 'lk-old',
      bot: 'aris',
      chatId: 0,
      channel: 'lark',
      chatRef: 'oc_dm',
      chunks: ['Phần một', 'Phần hai'],
      sent: 1,
      state: 'sending',
      attempts: 0,
      createdAt: Date.now(),
    })
    await s.store.enqueue({
      id: 'lk-aris-om_pending',
      bot: 'aris',
      channel: 'lark',
      state: 'running',
      receivedAt: Date.now(),
      update: {
        eventId: '',
        messageId: 'om_pending',
        chatId: 'oc_dm',
        chatType: 'p2p',
        senderOpenId: OWNER,
        senderType: 'user',
        messageType: 'text',
        content: JSON.stringify({ text: 'tin dở' }),
        mentions: [],
        createTime: 0,
      } satisfies LarkInbound,
    })
    // Bản ghi Telegram nằm chung bảng không bị Lark xử lý.
    await s.store.enqueue({ id: 'tg-1', bot: 'aris', update: {}, state: 'queued', receivedAt: 1 })
    const ch = new LarkChannel({
      store: s.store,
      credentials: { resolve: async (r) => s.secrets.get(r), set: async () => {}, unset: async () => {} },
      sessions: s.sessions.port,
      logger: { info() {}, warn() {} },
      connector: s.lark.connector,
    })
    channels.push(ch)
    await ch.start()
    await settle()
    expect(s.lark.texts().some((t) => t.includes('Phần hai'))).toBe(true)
    expect(s.lark.texts().some((t) => t.includes('khôi phục'))).toBe(true)
    expect(s.store.larkOutbox()).toHaveLength(0)
    expect(s.lark.texts().some((t) => t.includes('khởi động lại giữa chừng'))).toBe(true)
    expect(s.sessions.agents.get('s1')!.inbox).toHaveLength(1)
    expect(s.store.inbox().map((r) => r.id)).toEqual(['tg-1'])
  })

  it('aris tắt giữa lượt (interrupted): không báo lỗi, giữ tin trong hàng đợi', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'đang làm dở' })
    await settle()
    const before = s.lark.sent.length
    finishTurn(s, 's1', '', 'interrupted')
    await settle()
    expect(s.lark.sent).toHaveLength(before)
    expect(s.store.larkInbox()).toHaveLength(1)
  })

  it('App Secret không lọt vào log của kênh', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.lark.push({ text: 'hỏi' })
    await settle()
    s.lark.sendErrors.push(new Error('lỗi mạng'))
    finishTurn(s, 's1', 'trả lời')
    await settle()
    expect(s.logs.join('\n')).not.toContain(SECRET)
  })
})
