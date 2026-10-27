import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveAgent, SessionPort } from '../hub.js'
import { zaloThreadKey } from '../store.js'
import { memStore } from '../store.test.js'
import { DocsGate, type DocsPort } from '../docs.js'
import { ZALO_LIMITS } from './access.js'
import { HAND_MS, PING_MS, ZaloChannel } from './channel.js'
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
  sent: { thread: string; isGroup: boolean; text: string; mention?: { uid: string; len: number } }[] = []
  /** Nhãn trên app Zalo. */
  labelList: { name: string; threads: string[] }[] = []
  labelReads = 0
  sentIds: string[] = []
  files: { thread: string; filename: string }[] = []
  typed: string[] = []
  opened: ZaloSession[] = []
  handlers: ZaloListenerHandlers | undefined
  /** Trình nghe theo imei của dữ liệu đăng nhập (mỗi tài khoản một imei). */
  handlersBy = new Map<string, ZaloListenerHandlers>()
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
    send: async (thread, isGroup, text, mention) => {
      this.sent.push({ thread, isGroup, text, ...(mention ? { mention } : {}) })
      this.sentIds.push(`out${++this.n}`)
      return { messageId: this.sentIds.at(-1)! }
    },
    sendFile: async (thread, _g, _d, filename) => {
      this.files.push({ thread, filename })
      return { messageId: `out${++this.n}` }
    },
    labels: async () => {
      this.labelReads++
      return this.labelList
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
            this.handlersBy.set(s.imei, h)
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
async function setup(opts: { account?: boolean; session?: boolean; retryMs?: number; docs?: DocsGate } = {}) {
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
    ...(opts.docs ? { docs: opts.docs } : {}),
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

  it('đăng nhập bằng QR (thêm tài khoản mới): ảnh QR, đã quét, xong thì có mã tài khoản riêng, khoá ở kho khoá', async () => {
    const s = await setup({ account: false })
    const qr = await s.channel.loginStart('mai', { label: 'CSKH 1' })
    expect(qr.qrPng).toBe('QR-PNG-BASE64')
    expect(qr.expiresAt).toBeGreaterThan(s.zalo.clock.t)
    expect(qr.key).toBe('new-mai')
    expect(s.channel.loginStatus(qr.key)).toMatchObject({ status: 'waiting', qrPng: 'QR-PNG-BASE64' })
    s.zalo.qr!.onScanned({ name: 'Tài khoản phụ', avatar: 'https://a/b.png' })
    expect(s.channel.loginStatus(qr.key)).toMatchObject({ status: 'scanned', name: 'Tài khoản phụ' })
    expect(s.channel.loginStatus(qr.key)!.qrPng).toBeUndefined()
    s.zalo.qrDone!.resolve({
      session: SESSION,
      profile: { id: SELF, name: 'Tài khoản phụ', avatar: 'https://a/b.png' },
    })
    await settle()
    const st = s.channel.loginStatus(qr.key)!
    expect(st).toMatchObject({ status: 'done', name: 'Tài khoản phụ' })
    const acc = st.account!
    expect(acc).toMatch(/^acc-/)
    const rec = s.store.zaloAccount(acc)!
    expect(rec).toMatchObject({ channel: 'zalo', bot: 'mai', account: acc, label: 'CSKH 1', botOpenId: SELF })
    expect(JSON.parse(s.secrets.get(rec.tokenRef)!)).toEqual(SESSION)
    expect(JSON.stringify(rec)).not.toContain(COOKIE)
    expect(s.channel.status()[0]).toMatchObject({
      account: acc,
      label: 'CSKH 1',
      bot: 'mai',
      state: 'listening',
    })
  })

  it('mã QR hết hạn: trạng thái hết hạn, "Tạo mã mới" huỷ lần cũ và bắt đầu lại', async () => {
    const s = await setup({ account: false })
    const { key } = await s.channel.loginStart('aris')
    s.zalo.qr!.onExpired()
    expect(s.channel.loginStatus(key)).toMatchObject({ status: 'expired' })
    expect(s.channel.loginStatus(key)!.qrPng).toBeUndefined()
    s.zalo.qrDone!.reject(new ZaloError('hết hạn', true))
    await settle()
    expect(s.channel.loginStatus(key)!.status).toBe('expired')
    const again = await s.channel.loginStart('aris')
    expect(again.qrPng).toBe('QR-PNG-BASE64')
    expect(s.zalo.qrAborted).toBe(1)
    expect(s.channel.loginStatus(key)!.status).toBe('waiting')
  })

  it('quét lại một tài khoản bằng cùng Zalo thì giữ người đã ghép đôi; bằng Zalo khác thì bỏ người riêng của nó', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    expect(s.store.zaloRoleOf(OTHER, 'aris')).toBe('member')
    await s.channel.loginStart('aris', { account: 'aris' })
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: SELF, name: 'A', avatar: '' } })
    await settle()
    expect(s.store.zaloRoleOf(OTHER, 'aris')).toBe('member')
    await s.channel.loginStart('aris', { account: 'aris' })
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: '7777', name: 'B', avatar: '' } })
    await settle()
    expect(s.store.zaloRoleOf(OTHER, 'aris')).toBeUndefined()
  })

  it('thêm tài khoản bằng một Zalo đã có trong aris thì dùng lại tài khoản đó, không tạo trùng', async () => {
    const s = await setup()
    await s.channel.loginStart('aris')
    s.zalo.qrDone!.resolve({ session: SESSION, profile: { id: SELF, name: 'A', avatar: '' } })
    await settle()
    expect(s.store.zaloAccounts()).toHaveLength(1)
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
    // Câu trả lời trong nhóm @nhắc thật người hỏi.
    expect(s.zalo.sent.at(-1)).toMatchObject({
      thread: GROUP,
      isGroup: true,
      text: '@Hoàng Bá Tầu Đây là tóm tắt.',
      mention: { uid: OWNER, len: '@Hoàng Bá Tầu'.length },
    })
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

describe('kênh Zalo · GĐ8.7 nhiều tài khoản', () => {
  const CUSTOMER = '3001'
  async function twoAccounts() {
    const s = await setup({ account: false })
    for (const [acc, imei] of [
      ['acc-aaaaaa', 'imei-a'],
      ['acc-bbbbbb', 'imei-b'],
    ] as const) {
      await s.store.putZaloAccount({
        bot: 'mai',
        account: acc,
        label: acc === 'acc-aaaaaa' ? 'CSKH 1' : 'CSKH 2',
        tgId: 0,
        username: SELF,
        name: 'x',
        tokenRef: `ZALO_${acc.toUpperCase().replace('-', '_')}_SESSION`,
        canReadAll: true,
        offset: 0,
        voice: false,
        addedAt: 'x',
        channel: 'zalo',
        botOpenId: `${SELF}-${imei}`,
      })
      s.secrets.set(
        `ZALO_${acc.toUpperCase().replace('-', '_')}_SESSION`,
        JSON.stringify({ ...SESSION, imei }),
      )
    }
    s.channel.stop()
    await s.channel.start()
    const push = (imei: string, ev: Partial<ZaloInbound> & { text?: string }) => {
      const { text, ...rest } = ev
      return s.zalo.handlersBy.get(imei)!.onMessage({
        messageId: `m${Math.random()}`,
        threadId: ev.senderId ?? CUSTOMER,
        isGroup: false,
        senderId: CUSTOMER,
        senderName: '',
        msgType: 'webchat',
        content: text ?? '',
        mentions: [],
        createTime: s.zalo.clock.t + 1,
        ...rest,
      })
    }
    return { s, push }
  }

  it('hai tài khoản cùng bot chạy song song; trạng thái theo từng tài khoản', async () => {
    const { s } = await twoAccounts()
    expect(s.zalo.handlersBy.size).toBe(2)
    expect(s.channel.status().map((a) => [a.account, a.label, a.bot, a.state])).toEqual([
      ['acc-aaaaaa', 'CSKH 1', 'mai', 'listening'],
      ['acc-bbbbbb', 'CSKH 2', 'mai', 'listening'],
    ])
  })

  it('người được phép, nhóm, phiên theo tài khoản; mã của tài khoản A không dùng được ở B', async () => {
    const { s, push } = await twoAccounts()
    const code = await s.store.createCode('member', 'zalo', 'acc-aaaaaa')
    await push('imei-b', { text: code.code })
    await settle()
    expect(s.zalo.texts(CUSTOMER).at(-1)).toBe('Mã này dành cho tài khoản khác.')
    await push('imei-a', { text: code.code })
    await settle()
    expect(s.store.zaloRoleOf(CUSTOMER, 'acc-aaaaaa')).toBe('member')
    expect(s.store.zaloRoleOf(CUSTOMER, 'acc-bbbbbb')).toBeUndefined()
    // Trên tài khoản B khách vẫn là người lạ: bot im, báo chủ.
    const n = s.zalo.sent.length
    await push('imei-b', { text: 'alo' })
    await settle()
    expect(s.zalo.sent).toHaveLength(n)
    expect(s.notices.some((x) => x.includes('nhắn Zalo'))).toBe(true)
    // Trên tài khoản A: vào phiên của bot Mai, khoá cuộc chat theo tài khoản A.
    await push('imei-a', { text: 'cho hỏi giá' })
    await settle()
    expect(s.store.thread(zaloThreadKey('acc-aaaaaa', CUSTOMER))!.bot).toBe('mai')
    expect(s.store.thread(zaloThreadKey('acc-bbbbbb', CUSTOMER))).toBeUndefined()
    // Nhóm thấy ở tài khoản A chỉ nằm ở tài khoản A.
    await push('imei-a', { threadId: GROUP, isGroup: true, text: 'chào nhóm' })
    await settle()
    expect(s.store.zaloGroups('acc-aaaaaa').map((g) => g.account)).toEqual(['acc-aaaaaa'])
    expect(s.store.zaloGroups('acc-bbbbbb')).toEqual([])
  })

  it('chế độ "mọi người nhắn riêng là khách": người lạ được trả lời với quyền khách', async () => {
    const { s, push } = await twoAccounts()
    await s.channel.updateAccount('acc-bbbbbb', { mode: 'guests' })
    await push('imei-b', { text: 'shop ơi' })
    await settle()
    const t = s.store.thread(zaloThreadKey('acc-bbbbbb', CUSTOMER))!
    const msg = s.sessions.agents.get(t.sessionId)!.inbox[0] as { content: { text: string }[] }
    expect(msg.content[0]!.text).toContain('không phải người dùng chính')
  })

  it('đăng xuất một tài khoản chỉ xoá người và nhóm riêng của nó; tài khoản kia giữ nguyên', async () => {
    const { s } = await twoAccounts()
    await s.store.redeemZalo(
      (await s.store.createCode('member', 'zalo', 'acc-aaaaaa')).code,
      {
        zaloId: '1',
        name: 'A',
      },
      'acc-aaaaaa',
    )
    await s.store.redeemZalo(
      (await s.store.createCode('member', 'zalo', 'acc-bbbbbb')).code,
      {
        zaloId: '2',
        name: 'B',
      },
      'acc-bbbbbb',
    )
    await s.channel.logout('acc-aaaaaa')
    expect(s.store.zaloAccounts().map((a) => a.account)).toEqual(['acc-bbbbbb'])
    expect(s.store.zaloRoleOf('1', 'acc-aaaaaa')).toBeUndefined()
    expect(s.store.zaloRoleOf('2', 'acc-bbbbbb')).toBe('member')
  })
})

describe('kênh Zalo · bán hàng (GĐ8.7 đợt C)', () => {
  /** Tin khách (người được phép) trong chat riêng; trả mã phiên của cuộc chat. */
  async function guest(s: Setup, text: string) {
    await s.zalo.push({ senderId: OTHER, text })
    await settle()
    return s.store.thread(zaloThreadKey('aris', OTHER))?.sessionId
  }
  /** Chủ tự gõ trên điện thoại trong cuộc chat với khách. */
  async function ownerTypes(s: Setup, text: string) {
    await s.zalo.push({ senderId: SELF, threadId: OTHER, fromSelf: true, text })
    await settle()
  }
  const hhmm = (t: number) => {
    const d = new Date(t)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  it('nhường tay: chủ tự gõ thì bot im 10 phút, giữ tin khách; hết giờ mà chủ không gõ thêm thì trả lời cả loạt', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    await ownerTypes(s, 'Chào bạn, để mình tư vấn nhé')
    expect(await guest(s, 'giá bao nhiêu')).toBeUndefined()
    await guest(s, 'có ship không')
    expect(s.sessions.agents.size).toBe(0)
    // Tin đang giữ vẫn nằm trong hàng đợi bền.
    expect(s.store.zaloInbox()).toHaveLength(2)
    s.zalo.clock.t += HAND_MS
    s.channel.releaseDue()
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(2)
  })

  it('nhường tay: chủ gõ thêm trong lúc giữ thì tin đang giữ coi như chủ đã lo, bot không trả lời', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    await ownerTypes(s, 'Chào bạn')
    await guest(s, 'giá bao nhiêu')
    await ownerTypes(s, 'Dạ 200 nghìn ạ')
    expect(s.store.zaloInbox()).toHaveLength(0)
    s.zalo.clock.t += HAND_MS
    s.channel.releaseDue()
    await settle()
    expect(s.sessions.agents.size).toBe(0)
  })

  it('nhường tay: chủ gõ khi bot đang soạn thì dừng lượt đó, không gửi câu trả lời cũ', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    const sid = (await guest(s, 'giá bao nhiêu'))!
    const agent = s.sessions.agents.get(sid)!
    const msg = agent.inbox.at(-1) as { id: string }
    s.channel.onSessionEvent(sid, { type: 'turn/start' })
    s.channel.onSessionEvent(sid, { type: 'user/message', data: { id: msg.id } })
    agent.status = 'running'
    const n = s.zalo.sent.length
    await ownerTypes(s, 'Để mình trả lời')
    expect(agent.cancelled).toBe(1)
    s.channel.onSessionEvent(sid, { type: 'turn/end', data: { reason: { kind: 'aborted' } } })
    await settle()
    expect(s.zalo.sent).toHaveLength(n)
  })

  it('tiếng vọng tin aris vừa gửi không phải chủ gõ; tắt nhường tay thì chủ gõ cũng không giữ', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    const sid = (await guest(s, 'chào shop'))!
    finishTurn(s, sid, 'Chào bạn!')
    await settle()
    // Zalo báo lại tin aris vừa gửi (cùng mã tin), rồi một bản không có mã khớp nhưng cùng chữ.
    await s.zalo.push({ senderId: SELF, threadId: OTHER, fromSelf: true, messageId: s.zalo.sentIds.at(-1)! })
    await s.zalo.push({ senderId: SELF, threadId: OTHER, fromSelf: true, text: 'Chào bạn!' })
    await settle()
    await guest(s, 'cho hỏi giá')
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(2)

    await s.channel.updateAccount('aris', { hand: false })
    await ownerTypes(s, 'mình gõ tay')
    await guest(s, 'còn hàng không')
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(3)
  })

  it('giờ trực: ngoài giờ giữ tin khách, gửi câu ngoài giờ một lần; vào giờ thì trả lời; chủ nhân không bị giữ', async () => {
    const s = await setup()
    await pair(s, OWNER)
    await pair(s, OTHER, 'member')
    const t = s.zalo.clock.t
    await s.channel.updateAccount('aris', {
      hours: {
        days: [0, 1, 2, 3, 4, 5, 6],
        from: hhmm(t + 2 * 3_600_000),
        to: hhmm(t + 4 * 3_600_000),
        offReply: 'Shop sẽ trả lời trong giờ làm việc.',
      },
    })
    await guest(s, 'giá bao nhiêu')
    await guest(s, 'có ship không')
    expect(s.zalo.texts(OTHER).filter((x) => x.startsWith('Shop sẽ'))).toHaveLength(1)
    expect(s.store.thread(zaloThreadKey('aris', OTHER))).toBeUndefined()
    await s.zalo.push({ senderId: OWNER, text: 'tóm tắt việc hôm nay' })
    await settle()
    expect(s.store.thread(zaloThreadKey('aris', OWNER))).toBeDefined()
    s.zalo.clock.t = t + 2 * 3_600_000 + 60_000
    s.channel.releaseDue()
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId
    expect(s.sessions.agents.get(sid)!.inbox).toHaveLength(2)
    await expect(
      s.channel.updateAccount('aris', { hours: { days: [], from: '08:00', to: '17:00' } }),
    ).rejects.toThrow()
  })

  it('nhãn bỏ qua: cuộc chat mang nhãn thì bot không trả lời; đọc lại nhãn mỗi 5 phút', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    s.zalo.labelList = [{ name: 'Khách VIP', threads: [OTHER] }]
    await s.channel.updateAccount('aris', { skipLabels: ['khách vip'] })
    expect(await guest(s, 'giá bao nhiêu')).toBeUndefined()
    await guest(s, 'còn hàng không')
    expect(s.zalo.labelReads).toBe(1)
    s.zalo.labelList = []
    s.zalo.clock.t += 5 * 60_000
    expect(await guest(s, 'cho hỏi')).toBeDefined()
    expect(s.zalo.labelReads).toBe(2)
  })

  it('gặp nhân viên: báo chủ, trả một câu, rồi bot im cuộc chat đó', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    expect(await guest(s, 'cho mình gặp nhân viên tư vấn')).toBeUndefined()
    expect(s.notices.at(-1)).toContain('muốn gặp người thật')
    expect(s.zalo.texts(OTHER).at(-1)).toBe('Đã báo người phụ trách, sẽ có người trả lời sớm.')
    const n = s.zalo.sent.length
    expect(await guest(s, 'alo')).toBeUndefined()
    expect(s.zalo.sent).toHaveLength(n)
  })

  it('công cụ im lặng: lượt đó không gửi gì; báo chủ: nhiều nhất 10 phút một lần mỗi cuộc chat', async () => {
    const s = await setup()
    await pair(s, OTHER, 'member')
    const sid = (await guest(s, 'ok cảm ơn'))!
    const msg = s.sessions.agents.get(sid)!.inbox.at(-1) as { id: string }
    s.channel.onSessionEvent(sid, { type: 'turn/start' })
    s.channel.onSessionEvent(sid, { type: 'user/message', data: { id: msg.id } })
    expect(s.channel.silence('khác')).toBe(false)
    expect(s.channel.silence(sid)).toBe(true)
    expect(await s.channel.ping(sid, 'Khách hỏi giá sỉ 500 cái')).toBe('Đã báo chủ.')
    expect(s.notices.at(-1)).toBe('Zalo Tài khoản phụ, chat với Thơ: Khách hỏi giá sỉ 500 cái')
    expect(await s.channel.ping(sid, 'lần nữa')).toContain('chưa báo lại')
    const n = s.zalo.sent.length
    s.channel.onSessionEvent(sid, {
      type: 'assistant/message',
      data: { message: { content: [{ type: 'text', text: 'Không có gì!' }] } },
    })
    s.channel.onSessionEvent(sid, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
    await settle()
    expect(s.zalo.sent).toHaveLength(n)
    expect(PING_MS).toBe(10 * 60_000)
  })
})

describe('kênh Zalo · chỉ trả lời theo tài liệu (GĐ8.7 đợt D)', () => {
  function brain() {
    const scopes = new Map<string, readonly string[] | undefined>()
    const hits = new Map<string, number>()
    const port: DocsPort = {
      scope: (sid, f) => {
        scopes.set(sid, f)
        hits.set(sid, 0)
      },
      hits: (sid) => hits.get(sid) ?? 0,
      folders: () => [],
    }
    return { port, scopes, hits }
  }

  it('khách hỏi: phiên được giới hạn nguồn và dặn; tra thấy thì giữ câu trả lời, không thấy thì thay và báo chủ; chủ và người đã ghép đôi không bị giới hạn', async () => {
    const b = brain()
    const s = await setup({ docs: new DocsGate(() => b.port) })
    await pair(s, OWNER)
    await pair(s, OTHER, 'member')
    // Mọi người nhắn riêng là khách: người lạ thành khách, chế độ tài liệu áp cho khách.
    await s.channel.updateAccount('aris', {
      mode: 'guests',
      docs: { on: true, folders: ['cong-ty/wiki/san-pham'], noInfo: 'Chưa có thông tin ạ.' },
    })
    await s.zalo.push({ senderId: STRANGER, text: 'khoá AI giá bao nhiêu' })
    await settle()
    const sid = s.store.thread(zaloThreadKey('aris', STRANGER))!.sessionId
    expect(b.scopes.get(sid)).toEqual(['cong-ty/wiki/san-pham'])
    b.hits.set(sid, 1)
    finishTurn(s, sid, 'Khoá AI cơ bản giá 2 triệu.')
    await settle()
    expect(s.zalo.texts(STRANGER).at(-1)).toBe('Khoá AI cơ bản giá 2 triệu.')
    // Xong lượt thì bỏ giới hạn.
    expect(b.scopes.get(sid)).toBeUndefined()

    await s.zalo.push({ senderId: STRANGER, text: 'có học bổng không' })
    await settle()
    finishTurn(s, sid, 'Có học bổng 50% (bịa).')
    await settle()
    expect(s.zalo.texts(STRANGER).at(-1)).toBe('Chưa có thông tin ạ.')
    expect(s.notices.at(-1)).toContain('chưa có thông tin')

    // Người đã ghép đôi không bị giới hạn.
    await s.zalo.push({ senderId: OTHER, text: 'giá sỉ thế nào' })
    await settle()
    expect(b.scopes.has(s.store.thread(zaloThreadKey('aris', OTHER))!.sessionId)).toBe(false)

    await s.zalo.push({ senderId: OWNER, text: 'tóm tắt việc' })
    await settle()
    const own = s.store.thread(zaloThreadKey('aris', OWNER))!.sessionId
    expect(b.scopes.has(own)).toBe(false)
  })
})
