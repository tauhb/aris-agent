import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAgent, SessionPort } from '../hub.js'
import { zaloThreadKey } from '../store.js'
import { memStore } from '../store.test.js'
import { ZALO_LIMITS } from './access.js'
import { ZaloChannel } from './channel.js'
import {
  ZaloError,
  type ZaloApi,
  type ZaloConnector,
  type ZaloInbound,
  type ZaloListenerHandlers,
  type ZaloQrHandlers,
  type ZaloQrResult,
  type ZaloSession,
} from './types.js'

const SELF = '1001'
const OWNER = '2001'
const OTHER = '2002'
const STRANGER = '2999'
const GROUP = '5001'
const COOKIE = 'COOKIE-never-in-records-0123456789'
const SESSION: ZaloSession = { imei: 'imei-1', userAgent: 'UA', cookie: [{ key: 'zpsid', value: COOKIE }] }

/** Zalo giả: ghi lại mọi tin gửi đi, đẩy tin vào như trình nghe. Không gọi mạng. */
class FakeZalo {
  sent: { thread: string; isGroup: boolean; text: string }[] = []
  sentIds: string[] = []
  files: { thread: string; filename: string }[] = []
  typed: string[] = []
  opened: ZaloSession[] = []
  handlers: ZaloListenerHandlers | undefined
  closed = 0
  /** Lỗi cho lần `open` kế tiếp (mỗi phần tử dùng một lần). */
  openErrors: Error[] = []
  names: Record<string, string> = { [OWNER]: 'Hoàng Bá Tầu', [OTHER]: 'Thơ', [STRANGER]: 'Người lạ' }
  downloads: string[] = []
  qr: ZaloQrHandlers | undefined
  qrDone: { resolve(r: ZaloQrResult): void; reject(e: Error): void } | undefined
  qrAborted = 0
  /** Giả lập mạng chết im: kết nối vẫn mở nhưng gọi Zalo không được. */
  profileDown = false
  /** Đồng hồ giả, đặt giữa trưa để một loạt tin trong test không vượt nửa đêm. */
  clock = { t: 1_700_049_600_000 }
  private n = 0

  api: ZaloApi = {
    selfId: () => SELF,
    profile: async () => {
      if (this.profileDown) throw new Error('mạng chết im')
      return { id: SELF, name: 'Tài khoản phụ', avatar: 'https://a/b.png' }
    },
    userName: async (id) => this.names[id],
    groupName: async (id) => (id === GROUP ? 'Marketing' : undefined),
    send: async (thread, isGroup, text) => {
      this.sent.push({ thread, isGroup, text })
      this.sentIds.push(`out${++this.n}`)
      return { messageId: this.sentIds.at(-1)! }
    },
    sendFile: async (thread, _g, _d, filename) => {
      this.files.push({ thread, filename })
      return { messageId: `out${++this.n}` }
    },
    typing: async (thread) => void this.typed.push(thread),
    download: async (url) => {
      this.downloads.push(url)
      return new Uint8Array([0x89, 0x50, 1, 2, 3])
    },
  }

  connector: ZaloConnector = {
    open: async (s) => {
      this.opened.push(s)
      const e = this.openErrors.shift()
      if (e) throw e
      return {
        api: this.api,
        listener: {
          start: (h) => {
            this.handlers = h
            h.onConnected()
          },
          close: () => void this.closed++,
        },
      }
    },
    loginQR: (h) => {
      this.qr = h
      const done = new Promise<ZaloQrResult>((resolve, reject) => (this.qrDone = { resolve, reject }))
      h.onQr('QR-PNG-BASE64')
      return { done, abort: () => void this.qrAborted++ }
    },
  }

  /** Một tin vào (mặc định: chữ, chat riêng, từ chủ nhân, mới hơn lúc kết nối). */
  async push(ev: Partial<ZaloInbound> & { text?: string }) {
    const { text, ...rest } = ev
    await this.handlers!.onMessage({
      messageId: `in${++this.n}`,
      threadId: ev.senderId ?? OWNER,
      isGroup: false,
      senderId: OWNER,
      senderName: '',
      msgType: 'webchat',
      content: text ?? '',
      mentions: [],
      createTime: this.clock.t + 1,
      ...rest,
    })
  }

  /** Tin trong nhóm, có @ tài khoản (chỗ @ ở đầu chữ). */
  async group(from: string, text: string, over: Partial<ZaloInbound> = {}) {
    await this.push({
      threadId: GROUP,
      isGroup: true,
      senderId: from,
      text: `@Aris ${text}`,
      mentions: [{ uid: SELF, pos: 0, len: 5 }],
      ...over,
    })
  }

  texts(thread?: string) {
    return this.sent.filter((s) => !thread || s.thread === thread).map((s) => s.text)
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

let channels: ZaloChannel[] = []
afterEach(() => {
  vi.useRealTimers()
  for (const c of channels) c.stop()
  channels = []
})

/**
 * Dựng kênh. Mặc định đã có tài khoản và dữ liệu đăng nhập trong kho khoá (như sau một lần quét QR) và đã `start()`.
 * `sleep` giả cộng thẳng vào đồng hồ giả, nên giới hạn tần suất không chờ thật.
 */
async function setup(opts: { account?: boolean; session?: boolean; retryMs?: number } = {}) {
  const zalo = new FakeZalo()
  const store = memStore(() => zalo.clock.t)
  const secrets = new Map<string, string>()
  const sessions = fakeSessions()
  const logs: string[] = []
  const notices: string[] = []
  const waits: number[] = []
  if (opts.account !== false) {
    await store.putZaloAccount({
      bot: 'aris',
      tgId: 0,
      username: SELF,
      name: 'Tài khoản phụ',
      tokenRef: 'ZALO_ARIS_SESSION',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
      channel: 'zalo',
      botOpenId: SELF,
    })
    if (opts.session !== false) secrets.set('ZALO_ARIS_SESSION', JSON.stringify(SESSION))
  }
  const channel = new ZaloChannel({
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
    connector: zalo.connector,
    now: () => zalo.clock.t,
    sleep: async (ms) => {
      waits.push(ms)
      zalo.clock.t += ms
    },
    notify: async (t) => void notices.push(t),
    ...(opts.retryMs ? { retryMs: opts.retryMs } : {}),
  })
  channels.push(channel)
  await channel.start()
  return { zalo, store, secrets, sessions, channel, logs, notices, waits }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** Kênh tối giản với kho riêng, đã có tài khoản và dữ liệu đăng nhập, rồi `start()`. */
async function bare(zalo: FakeZalo, extra: Partial<ConstructorParameters<typeof ZaloChannel>[0]> = {}) {
  const store = memStore()
  await store.putZaloAccount({
    bot: 'aris',
    tgId: 0,
    username: SELF,
    name: 'x',
    tokenRef: 'R',
    canReadAll: true,
    offset: 0,
    voice: false,
    addedAt: 'x',
    channel: 'zalo',
    botOpenId: SELF,
  })
  const ch = new ZaloChannel({
    store,
    credentials: { resolve: async () => JSON.stringify(SESSION), set: async () => {}, unset: async () => {} },
    sessions: fakeSessions().port,
    logger: { info() {}, warn() {} },
    connector: zalo.connector,
    ...extra,
  })
  channels.push(ch)
  await ch.start()
  return ch
}

async function pair(s: Setup, zaloId: string, role: 'owner' | 'member' = 'owner') {
  const code = await s.store.createCode(role, 'zalo')
  await s.zalo.push({ senderId: zaloId, text: code.code })
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

describe('kênh Zalo · đăng nhập và kết nối', () => {
  it('khởi động: đăng nhập từ dữ liệu đã lưu trong kho khoá, không cần quét QR', async () => {
    const s = await setup()
    expect(s.zalo.opened).toEqual([SESSION])
    expect(s.channel.status()).toMatchObject([{ bot: 'aris', id: SELF, state: 'listening', running: true }])
    // Cookie không bao giờ nằm trong bản ghi tài khoản.
    expect(JSON.stringify(s.store.zaloAccount('aris'))).not.toContain(COOKIE)
  })

  it('chưa có dữ liệu đăng nhập: "Cần quét lại QR" và báo chủ đúng một lần', async () => {
    const s = await setup({ session: false })
    expect(s.zalo.opened).toHaveLength(0)
    expect(s.channel.status()[0]).toMatchObject({ state: 'needs-qr', running: false })
    expect(s.notices).toHaveLength(1)
    expect(s.notices[0]).toContain('quét lại')
  })

  it('Zalo từ chối dữ liệu đăng nhập: cần quét lại QR, không thử lại', async () => {
    const zalo = new FakeZalo()
    zalo.openErrors.push(new ZaloError('cookie hết hạn', true))
    const notices: string[] = []
    const ch = await bare(zalo, { notify: async (t) => void notices.push(t), retryMs: 5 })
    await new Promise((r) => setTimeout(r, 40))
    expect(zalo.opened).toHaveLength(1)
    expect(ch.status()[0]).toMatchObject({ state: 'needs-qr' })
    expect(notices).toHaveLength(1)
  })

  it('lỗi mạng khi đăng nhập: thử lại chậm, gấp đôi mỗi lần, rồi nghe được', async () => {
    vi.useFakeTimers()
    const zalo = new FakeZalo()
    zalo.openErrors.push(new Error('mạng'), new Error('mạng'))
    const ch = await bare(zalo, { retryMs: 1000 })
    expect(zalo.opened).toHaveLength(1)
    expect(ch.status()[0]!.state).toBe('retrying')
    await vi.advanceTimersByTimeAsync(999)
    expect(zalo.opened).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(zalo.opened).toHaveLength(2)
    // Lần thử lại thứ hai chờ gấp đôi.
    await vi.advanceTimersByTimeAsync(1999)
    expect(zalo.opened).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(zalo.opened).toHaveLength(3)
    expect(ch.status()[0]!.state).toBe('listening')
  })

  it('Zalo Web đang mở: tạm ngừng nghe, thử lại chậm, nghe lại được', async () => {
    vi.useFakeTimers()
    const s = await setup({ retryMs: 120_000 })
    s.zalo.handlers!.onClosed('duplicate', '3000')
    await vi.advanceTimersByTimeAsync(0)
    expect(s.channel.status()[0]).toMatchObject({ state: 'web', running: false })
    expect(s.zalo.closed).toBe(1)
    await vi.advanceTimersByTimeAsync(119_999)
    expect(s.zalo.opened).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.zalo.opened).toHaveLength(2)
    expect(s.channel.status()[0]!.state).toBe('listening')
    // Lại bị đóng lần nữa: lần này chờ 4 phút... rồi tăng dần tới trần 30 phút.
    s.zalo.handlers!.onClosed('duplicate', '3000')
    await vi.advanceTimersByTimeAsync(239_999)
    expect(s.zalo.opened).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.zalo.opened).toHaveLength(3)
  })

  it('thời gian chờ tăng gấp đôi mỗi lần nhưng không quá 30 phút', async () => {
    vi.useFakeTimers()
    const s = await setup({ retryMs: 120_000 })
    const waits: number[] = []
    for (let i = 0; i < 7; i++) {
      const before = s.zalo.opened.length
      s.zalo.handlers!.onClosed('duplicate', '3000')
      await vi.advanceTimersByTimeAsync(0)
      let waited = 0
      while (s.zalo.opened.length === before) {
        await vi.advanceTimersByTimeAsync(60_000)
        waited += 60_000
      }
      waits.push(waited)
    }
    expect(waits.map((w) => w / 60_000)).toEqual([2, 4, 8, 16, 30, 30, 30])
  })

  it('mất kết nối không do Zalo Web: trạng thái "đang thử lại"', async () => {
    const s = await setup({ retryMs: 100_000 })
    s.zalo.handlers!.onClosed('other', '1006')
    await settle()
    expect(s.channel.status()[0]!.state).toBe('retrying')
  })

  it('đăng nhập bằng QR: ảnh QR, đã quét, xong thì lưu vào kho khoá và nghe', async () => {
    const s = await setup({ account: false })
    const qr = await s.channel.loginStart('aris')
    expect(qr.qrPng).toBe('QR-PNG-BASE64')
    expect(qr.expiresAt).toBeGreaterThan(s.zalo.clock.t)
    expect(s.channel.loginStatus('aris')).toMatchObject({ status: 'waiting', qrPng: 'QR-PNG-BASE64' })
    s.zalo.qr!.onScanned({ name: 'Tài khoản phụ', avatar: 'https://a/b.png' })
    expect(s.channel.loginStatus('aris')).toMatchObject({ status: 'scanned', name: 'Tài khoản phụ' })
    expect(s.channel.loginStatus('aris')!.qrPng).toBeUndefined()
    s.zalo.qrDone!.resolve({
      session: SESSION,
      profile: { id: SELF, name: 'Tài khoản phụ', avatar: 'https://a/b.png' },
    })
    await settle()
    expect(s.channel.loginStatus('aris')).toMatchObject({ status: 'done', name: 'Tài khoản phụ' })
    expect(JSON.parse(s.secrets.get('ZALO_ARIS_SESSION')!)).toEqual(SESSION)
    expect(JSON.stringify(s.store.zaloAccount('aris'))).not.toContain(COOKIE)
    expect(s.store.zaloAccount('aris')).toMatchObject({
      channel: 'zalo',
      botOpenId: SELF,
      avatar: 'https://a/b.png',
    })
    expect(s.channel.status()[0]).toMatchObject({ state: 'listening', name: 'Tài khoản phụ' })
  })

  it('mã QR hết hạn: trạng thái hết hạn, "Tạo mã mới" huỷ lần cũ và bắt đầu lại', async () => {
    const s = await setup({ account: false })
    await s.channel.loginStart('aris')
    s.zalo.qr!.onExpired()
    expect(s.channel.loginStatus('aris')).toMatchObject({ status: 'expired' })
    expect(s.channel.loginStatus('aris')!.qrPng).toBeUndefined()
    s.zalo.qrDone!.reject(new ZaloError('hết hạn', true))
    await settle()
    expect(s.channel.loginStatus('aris')!.status).toBe('expired')
    const again = await s.channel.loginStart('aris')
    expect(again.qrPng).toBe('QR-PNG-BASE64')
    expect(s.zalo.qrAborted).toBe(1)
    expect(s.channel.loginStatus('aris')!.status).toBe('waiting')
  })

  it('quét lại bằng cùng tài khoản thì giữ người đã ghép đôi; tài khoản khác thì bỏ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    expect(s.store.zaloRoleOf(OWNER)).toBe('owner')
    await s.channel.loginStart('aris')
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: SELF, name: 'A', avatar: '' } })
    await settle()
    expect(s.store.zaloRoleOf(OWNER)).toBe('owner')
    await s.channel.loginStart('aris')
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: '7777', name: 'B', avatar: '' } })
    await settle()
    expect(s.store.zaloRoleOf(OWNER)).toBeUndefined()
  })

  it('đăng xuất: xoá dữ liệu đăng nhập, tài khoản, người đã ghép đôi và nhóm', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertZaloGroup(GROUP, { title: 'Marketing', allowed: true })
    await s.channel.logout('aris')
    expect(s.secrets.has('ZALO_ARIS_SESSION')).toBe(false)
    expect(s.store.zaloAccounts()).toHaveLength(0)
    expect(s.store.zaloPeople()).toHaveLength(0)
    expect(s.store.zaloGroups()).toHaveLength(0)
    expect(s.zalo.closed).toBe(1)
  })
})

describe('kênh Zalo · ghép đôi và người lạ', () => {
  it('nhắn đúng mã ghép đôi của Zalo thì thành người dùng chính', async () => {
    const s = await setup()
    await pair(s, OWNER)
    expect(s.store.zaloRoleOf(OWNER)).toBe('owner')
    expect(s.zalo.texts(OWNER).at(-1)).toContain('Đã ghép đôi')
    expect(s.store.zaloPeople()).toMatchObject([{ channel: 'zalo', openId: OWNER, name: 'Hoàng Bá Tầu' }])
  })

  it('mã của kênh khác: "Mã này dành cho kênh khác."', async () => {
    const s = await setup()
    const code = await s.store.createCode('owner', 'telegram')
    await s.zalo.push({ senderId: OWNER, text: code.code })
    await settle()
    expect(s.zalo.texts(OWNER)).toEqual(['Mã này dành cho kênh khác.'])
    expect(s.store.zaloRoleOf(OWNER)).toBeUndefined()
  })

  it('mã Zalo nhắn sang Telegram hay Lark cũng bị từ chối (kênh khác)', async () => {
    const s = await setup()
    const code = await s.store.createCode('owner', 'zalo')
    expect(await s.store.redeem(code.code, { id: 1, name: 'x' }, 'telegram')).toBe('other-channel')
    expect(await s.store.redeemLark(code.code, { openId: 'ou_x', name: 'x' })).toBe('other-channel')
  })

  it('người lạ: bot im lặng, không mở phiên, báo chủ một lần mỗi người mỗi ngày', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.zalo.sent.length
    const long =
      'Chào bạn, mình muốn hỏi giá khoá học tuần này còn ưu đãi gì không ạ, cảm ơn nhiều lắm nhé bạn'
    await s.zalo.push({ senderId: STRANGER, text: long })
    await settle()
    expect(s.zalo.sent).toHaveLength(before)
    expect(s.sessions.agents.size).toBe(0)
    expect(s.notices).toHaveLength(1)
    expect(s.notices[0]).toContain('Người lạ nhắn Zalo')
    expect(s.notices[0]).toContain(long.slice(0, 80))
    expect(s.notices[0]).not.toContain(long.slice(0, 82))
    // Cùng người nhắn thêm trong ngày: không báo nữa.
    await s.zalo.push({ senderId: STRANGER, text: 'alo' })
    await settle()
    expect(s.notices).toHaveLength(1)
    // Hơn một ngày sau thì báo lại.
    s.zalo.clock.t += 25 * 3_600_000
    await s.zalo.push({ senderId: STRANGER, text: 'alo alo', createTime: s.zalo.clock.t + 1 })
    await settle()
    expect(s.notices).toHaveLength(2)
    expect(s.zalo.sent).toHaveLength(before)
  })
})

describe('kênh Zalo · nhận tin và trả lời', () => {
  it('tin của người đã ghép đôi vào đúng phiên; xong lượt thì trả lời chữ thường, Markdown được gỡ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ text: 'Chào Mai' })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OWNER))!.sessionId
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(1)
    expect(s.zalo.typed).toEqual([OWNER])
    finishTurn(s, sid, '**Xong** rồi.\n\n| Việc | Hạn |\n|---|---|\n| Gửi thư | mai |')
    await settle()
    expect(s.zalo.texts(OWNER).at(-1)).toBe('Xong rồi.\n\n- Việc: Gửi thư; Hạn: mai')
    expect(s.store.zaloOutbox()).toHaveLength(0)
    expect(s.store.zaloInbox()).toHaveLength(0)
  })

  it('bỏ qua tin của chính tài khoản, tin aris vừa gửi, và tin cũ hơn lúc kết nối', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.zalo.sent.length
    await s.zalo.push({ senderId: SELF, text: 'tin của mình' })
    await s.zalo.push({ messageId: s.zalo.sentIds.at(-1)!, text: 'echo của tin aris vừa gửi' })
    await s.zalo.push({ text: 'tin cũ', createTime: s.zalo.clock.t - 60_000 })
    await settle()
    expect(s.sessions.agents.size).toBe(0)
    expect(s.zalo.sent).toHaveLength(before)
  })

  it('tin trùng (gửi lại hai lần) chỉ xử lý một lần', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ messageId: 'dup', text: 'một lần thôi' })
    await s.zalo.push({ messageId: 'dup', text: 'một lần thôi' })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OWNER))!.sessionId
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(1)
  })

  it('ảnh và tệp: tải về, lưu thành đính kèm; tin thoại: chép lời', async () => {
    const saved: unknown[] = []
    const s = await setup()
    await pair(s, OWNER)
    // Gắn kho đính kèm giả vào kênh mới dựng riêng cho test này.
    s.channel.stop()
    const zalo = s.zalo
    const store = s.store
    const ch = new ZaloChannel({
      store,
      credentials: {
        resolve: async () => JSON.stringify(SESSION),
        set: async () => {},
        unset: async () => {},
      },
      sessions: s.sessions.port,
      attachments: {
        saveImage: async (i) => void saved.push(['image', i.mediaType]),
        saveFile: async (i) => void saved.push(['file', i.name]),
      },
      stt: { transcribe: async () => 'xin chào' } as never,
      logger: { info() {}, warn() {} },
      connector: zalo.connector,
      now: () => zalo.clock.t,
      sleep: async (ms) => void (zalo.clock.t += ms),
    })
    channels.push(ch)
    await ch.start()
    await zalo.push({
      msgType: 'chat.photo',
      content: JSON.stringify({ href: 'https://cdn/z.jpg', title: 'ảnh nè' }),
    })
    await zalo.push({
      msgType: 'share.file',
      content: JSON.stringify({ href: 'https://cdn/f.pdf', title: 'bao-cao.pdf' }),
    })
    await settle()
    expect(zalo.downloads).toEqual(['https://cdn/z.jpg', 'https://cdn/f.pdf'])
    expect(saved).toEqual([
      ['image', 'image/png'],
      ['file', 'bao-cao.pdf'],
    ])
  })

  it('loại tin chưa đọc được (sticker): báo rõ, không vào phiên', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ msgType: 'chat.sticker', content: '{}' })
    await settle()
    expect(s.zalo.texts(OWNER).at(-1)).toContain('chưa đọc được loại tin này')
    expect(s.sessions.agents.size).toBe(0)
  })

  it('lệnh /new mở phiên mới, /help liệt kê lệnh có trên Zalo', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ text: '/help' })
    await settle()
    expect(s.zalo.texts(OWNER).at(-1)).toContain('/new')
    expect(s.zalo.texts(OWNER).at(-1)).not.toContain('/sethome')
    await s.zalo.push({ text: '/new' })
    await settle()
    expect(s.zalo.texts(OWNER).at(-1)).toContain('Đã mở phiên mới')
    expect(s.sessions.agents.size).toBe(1)
  })

  it('dừng khẩn cấp: tin thường chỉ nhận câu báo', async () => {
    const s = await setup()
    await pair(s, OWNER)
    s.channel.stop()
    const ch = new ZaloChannel({
      store: s.store,
      credentials: {
        resolve: async () => JSON.stringify(SESSION),
        set: async () => {},
        unset: async () => {},
      },
      sessions: s.sessions.port,
      logger: { info() {}, warn() {} },
      connector: s.zalo.connector,
      now: () => s.zalo.clock.t,
      sleep: async () => {},
      stopped: () => true,
    })
    channels.push(ch)
    await ch.start()
    await s.zalo.push({ text: 'làm gì đó' })
    await settle()
    expect(s.zalo.texts(OWNER).at(-1)).toContain('dừng khẩn cấp')
    expect(s.sessions.agents.size).toBe(0)
  })

  it('người được phép (không phải chủ) bị hạn chế quyền trong lượt trả lời', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    await s.zalo.push({ senderId: OTHER, text: 'hỏi chút' })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId
    const sent = s.sessions.agents.get(sid)!.inbox[0] as { id: string; content: { text: string }[] }
    expect(sent.content[0]!.text).toContain('không phải người dùng chính')
    // Trong lượt của người này, quyền bị hạn chế thật; hết lượt thì hết hạn chế.
    s.channel.onSessionEvent(sid, { type: 'turn/start' })
    s.channel.onSessionEvent(sid, { type: 'user/message', data: { id: sent.id } })
    expect(s.channel.restricted(sid)).toBe(true)
    expect(await s.channel.approve(sid, { toolName: 'bash' })).toBe('rejected')
    s.channel.onSessionEvent(sid, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    expect(s.channel.restricted(sid)).toBe(false)
  })
})

describe('kênh Zalo · nhóm', () => {
  it('nhóm mặc định tắt: im lặng, nhưng được ghi nhận để hiện trong danh sách', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const before = s.zalo.sent.length
    await s.zalo.group(OWNER, 'ai đó giúp với')
    await settle()
    expect(s.zalo.sent).toHaveLength(before)
    expect(s.sessions.agents.size).toBe(0)
    expect(s.notices).toHaveLength(0)
    expect(s.store.zaloGroups()).toMatchObject([{ chatRef: GROUP, title: 'Marketing', allowed: false }])
  })

  it('nhóm bật nhưng không @ nhắc tài khoản: im lặng', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertZaloGroup(GROUP, { title: 'Marketing', allowed: true })
    await s.zalo.push({ threadId: GROUP, isGroup: true, senderId: OWNER, text: 'nói chuyện với nhau thôi' })
    await settle()
    expect(s.sessions.agents.size).toBe(0)
  })

  it('nhóm bật và được @ nhắc: trả lời trong nhóm, bot biết ai đang nói; người lạ trong nhóm thì im', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.store.upsertZaloGroup(GROUP, { title: 'Marketing', allowed: true })
    await s.zalo.group(OWNER, 'tóm tắt giúp')
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', GROUP))!.sessionId
    const sent = s.sessions.agents.get(sid)!.inbox[0] as { content: { text: string }[] }
    expect(sent.content[0]!.text).toBe('[Hoàng Bá Tầu] tóm tắt giúp')
    finishTurn(s, sid, 'Đây là tóm tắt.')
    await settle()
    expect(s.zalo.sent.at(-1)).toMatchObject({ thread: GROUP, isGroup: true, text: 'Đây là tóm tắt.' })
    const n = s.zalo.sent.length
    await s.zalo.group(STRANGER, 'cho hỏi với')
    await settle()
    expect(s.zalo.sent).toHaveLength(n)
    expect(s.notices).toHaveLength(0)
  })
})

describe('kênh Zalo · gửi tin và giới hạn tần suất', () => {
  it('câu trả lời dài chia theo 1.500 ký tự, ngắt ở ranh giới đoạn, mỗi phần cách một nhịp', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ text: 'viết dài đi' })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OWNER))!.sessionId
    const para = (c: string) => c.repeat(900)
    s.waits.length = 0
    finishTurn(s, sid, `${para('a')}\n\n${para('b')}\n\n${para('c')}`)
    await settle()
    // Ba đoạn 900 ký tự: không ghép được hai đoạn vào một tin 1.500, nên mỗi đoạn một tin, không cắt giữa đoạn.
    expect(s.zalo.texts(OWNER).slice(-3)).toEqual([para('a'), para('b'), para('c')])
    for (const t of s.zalo.texts(OWNER)) expect(t.length).toBeLessThanOrEqual(1500)
    // Giữa các phần có nhịp nghỉ (giới hạn 3 giây một tin mỗi cuộc chat).
    expect(s.waits.filter((w) => w > 0).length).toBeGreaterThanOrEqual(2)
  })

  it('cách nhau ít nhất 3 giây trong một cuộc trò chuyện (xếp hàng, không bỏ tin)', async () => {
    const s = await setup()
    await pair(s, OWNER)
    s.waits.length = 0
    await s.zalo.push({ text: '/help' })
    await s.zalo.push({ text: '/whoami' })
    await settle()
    expect(s.waits.some((w) => w > 0 && w <= ZALO_LIMITS.perChatMs)).toBe(true)
    expect(s.zalo.texts(OWNER).slice(-2)[0]).toContain('Lệnh')
    expect(s.zalo.texts(OWNER).at(-1)).toContain('Vai')
  })

  it('hết hạn mức 300 tin/ngày: dừng gửi, báo chủ một lần; sang ngày mới gửi lại được', async () => {
    const s = await setup()
    await pair(s, OWNER)
    const sentToday = () => s.zalo.sent.length
    for (let i = 0; i < 320; i++) await s.zalo.push({ text: '/whoami', createTime: s.zalo.clock.t + 1 })
    await settle()
    await settle()
    expect(sentToday()).toBe(ZALO_LIMITS.perDay)
    expect(s.notices.filter((n) => n.includes('giới hạn ngày'))).toHaveLength(1)
    s.zalo.clock.t += 24 * 3_600_000
    await s.zalo.push({ text: '/whoami', createTime: s.zalo.clock.t + 1 })
    await settle()
    expect(sentToday()).toBe(ZALO_LIMITS.perDay + 1)
  })

  it('không bao giờ tự nhắn trước cho người chưa ghép đôi', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await s.zalo.push({ senderId: STRANGER, text: 'alo' })
    await s.zalo.push({
      senderId: STRANGER,
      threadId: GROUP,
      isGroup: true,
      text: '@Aris alo',
      mentions: [{ uid: SELF, pos: 0, len: 5 }],
    })
    await settle()
    expect(s.zalo.texts(STRANGER)).toHaveLength(0)
    expect(s.zalo.texts(GROUP)).toHaveLength(0)
  })
})

describe('kênh Zalo · khởi động lại', () => {
  it('gửi nốt câu trả lời dở trong hộp thư ra', async () => {
    const s = await setup()
    await s.store.putOutbox({
      id: 'zc-1',
      bot: 'aris',
      chatId: 0,
      channel: 'zalo',
      chatRef: OWNER,
      chunks: ['trả lời dở'],
      sent: 0,
      state: 'sending',
      attempts: 0,
      createdAt: s.zalo.clock.t,
    })
    s.channel.stop()
    await s.channel.start()
    expect(s.zalo.texts(OWNER).at(-1)).toContain('trả lời dở')
    expect(s.store.zaloOutbox()).toHaveLength(0)
  })
})

describe('kênh Zalo · GĐ8.7 đợt A', () => {
  it('bị đá phiên (Zalo Web mở): báo chủ, tối đa 6 giờ một lần', async () => {
    vi.useFakeTimers()
    const s = await setup({ retryMs: 1000 })
    const kicked = () => s.notices.filter((n) => n.includes('đang mở ở nơi khác')).length
    s.zalo.handlers!.onClosed('duplicate', '3000')
    await vi.advanceTimersByTimeAsync(0)
    expect(kicked()).toBe(1)
    // Nối lại rồi lại bị đá trong vòng 6 giờ: không báo nữa.
    await vi.advanceTimersByTimeAsync(1000)
    expect(s.zalo.opened).toHaveLength(2)
    s.zalo.handlers!.onClosed('duplicate', '3000')
    await vi.advanceTimersByTimeAsync(0)
    expect(kicked()).toBe(1)
    // Hơn 6 giờ sau: báo lại.
    s.zalo.clock.t += 6 * 3_600_000 + 1
    await vi.advanceTimersByTimeAsync(2000)
    s.zalo.handlers!.onClosed('duplicate', '3000')
    await vi.advanceTimersByTimeAsync(0)
    expect(kicked()).toBe(2)
  })

  it('mạng chết im: bộ canh 5 phút một lần, lỗi hai lần liền thì đóng trình nghe cũ và thử lại', async () => {
    vi.useFakeTimers()
    const s = await setup({ retryMs: 120_000 })
    s.zalo.profileDown = true
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(s.channel.status()[0]!.state).toBe('listening')
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(s.channel.status()[0]!.state).toBe('retrying')
    expect(s.zalo.closed).toBe(1)
    // Mạng về: lần thử lại sau 2 phút nghe được, bộ canh chạy lại từ đầu.
    s.zalo.profileDown = false
    await vi.advanceTimersByTimeAsync(120_000)
    expect(s.zalo.opened).toHaveLength(2)
    expect(s.channel.status()[0]!.state).toBe('listening')
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(s.channel.status()[0]!.state).toBe('listening')
  })

  it('một lần canh lỗi rồi lại được thì không coi là mất kết nối', async () => {
    vi.useFakeTimers()
    const s = await setup({ retryMs: 120_000 })
    s.zalo.profileDown = true
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    s.zalo.profileDown = false
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    s.zalo.profileDown = true
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(s.channel.status()[0]!.state).toBe('listening')
    expect(s.zalo.closed).toBe(0)
  })

  it('gom tin dồn dập: khách gửi 3 tin liền thì đợi 5 giây im lặng rồi mới vào phiên; chủ không bị đợi', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    s.waits.length = 0
    await s.zalo.push({ senderId: OTHER, text: 'chào shop' })
    await s.zalo.push({ senderId: OTHER, text: 'cho hỏi giá' })
    await s.zalo.push({ senderId: OTHER, text: 'khoá AI cơ bản' })
    await settle()
    expect(s.waits).toContain(5000)
    const sid = s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(3)
    // Chủ nhân: không đợi.
    await pair(s, OWNER)
    s.waits.length = 0
    await s.zalo.push({ text: 'việc gấp' })
    await settle()
    expect(s.waits.filter((w) => w === 5000)).toHaveLength(0)
  })

  it('khách nhắn thêm khi bot đang soạn: dừng lượt cũ, không gửi câu trả lời cũ, lượt mới trả lời', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    await s.zalo.push({ senderId: OTHER, text: 'câu một', createTime: s.zalo.clock.t + 1 })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId
    const agent = s.sessions.agents.get(sid)! as unknown as {
      status: string
      inbox: { id: string }[]
      cancelled: number
    }
    s.channel.onSessionEvent(sid, { type: 'turn/start' })
    s.channel.onSessionEvent(sid, { type: 'user/message', data: { id: agent.inbox[0]!.id } })
    agent.status = 'running'
    await s.zalo.push({ senderId: OTHER, text: 'thêm câu hai', createTime: s.zalo.clock.t + 1 })
    await settle()
    expect(agent.cancelled).toBe(1)
    expect(agent.inbox).toHaveLength(2)
    const before = s.zalo.sent.length
    s.channel.onSessionEvent(sid, {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: 'trả lời câu một (cũ)' }] } },
    })
    s.channel.onSessionEvent(sid, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
    await settle()
    expect(s.zalo.sent.length).toBe(before)
    agent.status = 'idle'
    finishTurn(s, sid, 'trả lời cả hai câu')
    await settle()
    expect(s.zalo.texts(OTHER).at(-1)).toBe('trả lời cả hai câu')
  })

  it('mở trình nghe mới thì trình nghe cũ (nếu còn) đóng trước', async () => {
    const s = await setup()
    await s.channel.loginStart('aris')
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: SELF, name: 'A', avatar: '' } })
    await settle()
    expect(s.zalo.opened).toHaveLength(2)
    expect(s.zalo.closed).toBe(1)
  })
})
