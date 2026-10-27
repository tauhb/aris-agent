import { describe, expect, it } from 'vitest'
import type { GroupRule, Role } from '../access.js'
import { decideZalo, ZALO_LIMITS, ZaloThrottle, type ZaloAccessState } from './access.js'
import { parseMessage } from './content.js'
import type { ZaloInbound } from './types.js'

const SELF = '1001'
const ev = (over: Partial<ZaloInbound>): ZaloInbound => ({
  messageId: 'm',
  threadId: '2001',
  isGroup: false,
  senderId: '2001',
  senderName: '',
  msgType: 'webchat',
  content: 'chào',
  mentions: [],
  createTime: 0,
  ...over,
})
const state = (roles: Record<string, Role>, groups: Record<string, GroupRule> = {}): ZaloAccessState => ({
  roleOf: (id) => roles[id],
  groupRule: (id) => groups[id],
})
const decide = (e: ZaloInbound, s: ZaloAccessState) => decideZalo(e, parseMessage(e, SELF), s)
const MENTION = { content: '@Aris chào', mentions: [{ uid: SELF, pos: 0, len: 5 }] }

describe('quyết định ở cửa vào Zalo', () => {
  it('chat riêng: người đã ghép đôi được nhận, người lạ thì im lặng (stranger)', () => {
    expect(decide(ev({}), state({ '2001': 'owner' }))).toMatchObject({
      kind: 'accept',
      trust: 'owner',
      text: 'chào',
    })
    expect(decide(ev({}), state({ '2001': 'member' }))).toMatchObject({ kind: 'accept', trust: 'member' })
    expect(decide(ev({}), state({}))).toEqual({ kind: 'stranger' })
    expect(decide(ev({ senderId: '' }), state({}))).toMatchObject({ kind: 'ignore' })
  })

  it('lệnh được nhận ra', () => {
    expect(decide(ev({ content: '/new' }), state({ '2001': 'owner' }))).toMatchObject({
      kind: 'accept',
      command: { name: 'new', args: '' },
    })
  })

  it('nhóm mặc định tắt: ignore, kể cả khi được @ và người gửi là chủ', () => {
    const e = ev({ isGroup: true, threadId: '5001', ...MENTION })
    expect(decide(e, state({ '2001': 'owner' }))).toMatchObject({ kind: 'ignore' })
    expect(
      decide(e, state({ '2001': 'owner' }, { '5001': { allowed: false, who: 'allowed' } })),
    ).toMatchObject({
      kind: 'ignore',
    })
  })

  it('nhóm bật nhưng không @ nhắc tài khoản: ignore', () => {
    const e = ev({ isGroup: true, threadId: '5001', content: 'nói chuyện' })
    expect(
      decide(e, state({ '2001': 'owner' }, { '5001': { allowed: true, who: 'allowed' } })),
    ).toMatchObject({
      kind: 'ignore',
    })
  })

  it('nhóm bật và được @ nhắc: người ghép đôi được nhận; người ngoài chỉ khi nhóm cho mọi người', () => {
    const e = ev({ isGroup: true, threadId: '5001', senderId: '2002', ...MENTION })
    const rule = (who: GroupRule['who']) => ({ '5001': { allowed: true, who } })
    expect(decide(e, state({ '2002': 'member' }, rule('allowed')))).toMatchObject({
      kind: 'accept',
      trust: 'member',
    })
    expect(decide(e, state({}, rule('allowed')))).toMatchObject({ kind: 'ignore' })
    expect(decide(e, state({}, rule('everyone')))).toMatchObject({ kind: 'accept', trust: 'member' })
  })
})

describe('giới hạn tần suất gửi tin', () => {
  /** Đồng hồ giả: `sleep` đẩy giờ đi, nên không chờ thật. */
  function clock(start = new Date(2026, 9, 27, 12, 0, 0).getTime()) {
    const c = { t: start, waits: [] as number[] }
    const t = new ZaloThrottle(
      () => c.t,
      async (ms) => {
        c.waits.push(ms)
        c.t += ms
      },
    )
    return { c, t }
  }

  it('hằng số theo plan: 3 giây một cuộc, 20 tin mỗi phút, 300 tin mỗi ngày', () => {
    expect(ZALO_LIMITS).toEqual({ perChatMs: 3000, perMinute: 20, perDay: 300 })
  })

  it('tin đầu đi ngay; tin kế trong cùng cuộc phải chờ đủ 3 giây', async () => {
    const { c, t } = clock()
    await t.take('a')
    expect(c.waits).toEqual([])
    await t.take('a')
    expect(c.waits).toEqual([3000])
  })

  it('cuộc trò chuyện khác không bị tính 3 giây của nhau (nhưng vẫn nối đuôi, không gửi chồng)', async () => {
    const { c, t } = clock()
    await t.take('a')
    await t.take('b')
    expect(c.waits).toEqual([])
    await t.take('a')
    expect(c.waits).toEqual([3000])
  })

  it('không quá 20 tin mỗi phút cho cả tài khoản: tin thứ 21 xếp hàng tới hết phút', async () => {
    const { c, t } = clock()
    const start = c.t
    for (let i = 0; i < 20; i++) await t.take(`chat-${i}`)
    expect(c.t - start).toBe(0)
    await t.take('chat-x')
    expect(c.t - start).toBe(60_000)
    // Trong mọi cửa sổ 60 giây có nhiều nhất 20 tin.
    const times: number[] = []
    const k = clock()
    for (let i = 0; i < 100; i++) {
      await k.t.take(`c${i}`)
      times.push(k.c.t)
    }
    for (let i = 0; i + 20 < times.length; i++)
      expect(times[i + 20]! - times[i]!).toBeGreaterThanOrEqual(60_000)
  })

  it('hết 300 tin trong ngày thì từ chối (false) tới sang ngày mới', async () => {
    const { c, t } = clock()
    for (let i = 0; i < ZALO_LIMITS.perDay; i++) expect(await t.take(`c${i}`)).toBe(true)
    expect(t.leftToday()).toBe(0)
    expect(t.dayExhausted).toBe(true)
    // Cùng ngày: dù đã trôi giờ vẫn bị từ chối.
    c.t = new Date(
      new Date(c.t).getFullYear(),
      new Date(c.t).getMonth(),
      new Date(c.t).getDate(),
      23,
      59,
      0,
    ).getTime()
    expect(await t.take('x')).toBe(false)
    c.t += 120_000
    expect(await t.take('x')).toBe(true)
    expect(t.leftToday()).toBe(ZALO_LIMITS.perDay - 1)
  })
})
