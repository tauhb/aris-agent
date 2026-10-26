import { describe, expect, it } from 'vitest'
import {
  CODE_MAX_WRONG,
  ChannelStore,
  larkKey,
  larkThreadKey,
  normalizeCode,
  threadKey,
  type Table,
  type Tables,
} from './store.js'

export function memTable<V>(): Table<V> {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, v),
    delete: async (k) => m.delete(k),
  }
}

export function memStore(now: () => number = Date.now) {
  const t: Tables = {
    bots: memTable(),
    people: memTable(),
    groups: memTable(),
    codes: memTable(),
    threads: memTable(),
    inbox: memTable(),
    outbox: memTable(),
    settings: memTable(),
  }
  return new ChannelStore(t, now)
}

describe('kho kênh', () => {
  it('khoá cuộc trò chuyện gồm bot, chat, chủ đề; số âm hợp lệ với storage', () => {
    expect(threadKey(900, -1001, 7)).toBe('tg-900-n1001-t7')
    expect(threadKey(900, 55)).toBe('tg-900-55')
  })

  it('mã ghép đôi: dùng một lần, có hạn, chuẩn hoá cách gõ', async () => {
    let now = 1_000
    const s = memStore(() => now)
    const code = await s.createCode('owner')
    expect(code.code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/)
    expect(normalizeCode(code.code.toLowerCase().replace('-', ' '))).toBe(code.code)
    expect(normalizeCode('xin chào')).toBeUndefined()
    const p = await s.redeem(code.code, { id: 1, name: 'Tầu' })
    expect(p).toMatchObject({ userId: 1, role: 'owner' })
    expect(s.roleOf(1)).toBe('owner')
    expect(await s.redeem(code.code, { id: 2, name: 'B' })).toBeUndefined()
    const late = await s.createCode('member')
    now += 11 * 60_000
    expect(await s.redeem(late.code, { id: 3, name: 'C' })).toBeUndefined()
  })

  it('mã gắn kênh: mã Telegram dùng được trên Telegram; mã kênh khác bị từ chối, không tính là nhập sai', async () => {
    const s = memStore()
    const tg = await s.createCode('owner', 'telegram')
    expect(tg.channel).toBe('telegram')
    expect((await s.createCode('member')).channel).toBe('telegram')
    expect(await s.redeem(tg.code, { id: 1, name: 'A' }, 'telegram')).toMatchObject({
      userId: 1,
      role: 'owner',
    })

    const lark = await s.createCode('owner', 'lark')
    // Nhắn mã Lark vào Telegram quá ngưỡng khoá vẫn không bị khoá và mã còn nguyên.
    for (let i = 0; i < CODE_MAX_WRONG + 3; i++)
      expect(await s.redeem(lark.code, { id: 2, name: 'B' }, 'telegram')).toBe('other-channel')
    expect(s.pairLocked(2)).toBe(false)
    expect(s.roleOf(2)).toBeUndefined()
    expect(s.activeCodes().some((c) => c.code === lark.code)).toBe(true)
    // Vẫn ghép được mã Telegram ngay sau đó.
    const tg2 = await s.createCode('member')
    expect(await s.redeem(tg2.code, { id: 2, name: 'B' }, 'telegram')).toMatchObject({
      userId: 2,
      role: 'member',
    })
    // Đúng kênh của mã thì dùng được.
    expect(await s.redeem(lark.code, { id: 3, name: 'C' }, 'lark')).toMatchObject({ userId: 3 })
  })

  it('mã cũ không có trường channel vẫn dùng được trên Telegram, và coi là mã Telegram', async () => {
    const s = memStore()
    await s.t.codes.put('3333AAAA', { code: '3333-AAAA', role: 'owner', expiresAt: Date.now() + 60_000 })
    expect(s.activeCodes()[0]).toMatchObject({ code: '3333-AAAA', channel: 'telegram' })
    expect(await s.redeem('3333-AAAA', { id: 1, name: 'A' }, 'lark')).toBe('other-channel')
    expect(await s.redeem('3333-AAAA', { id: 1, name: 'A' }, 'telegram')).toMatchObject({ role: 'owner' })
  })

  it('mã người được phép không hạ quyền chủ nhân', async () => {
    const s = memStore()
    await s.redeem((await s.createCode('owner')).code, { id: 1, name: 'A' })
    await s.redeem((await s.createCode('member')).code, { id: 1, name: 'A' })
    expect(s.roleOf(1)).toBe('owner')
  })

  it('báo người lạ tối đa một lần mỗi giờ', async () => {
    let now = 0
    const s = memStore(() => now)
    expect(await s.shouldNotifyStranger(9)).toBe(true)
    expect(await s.shouldNotifyStranger(9)).toBe(false)
    now += 3_600_001
    expect(await s.shouldNotifyStranger(9)).toBe(true)
  })

  it('đợt 7f, S18: sai mã ghép đôi 5 lần thì khoá chat một giờ, kể cả gõ đúng; hết giờ thì thử lại được', async () => {
    let now = 1_000
    const s = memStore(() => now)
    const code = await s.createCode('owner')
    for (let i = 0; i < 5; i++) expect(await s.redeem('2222-2222', { id: 7, name: 'K' })).toBeUndefined()
    expect(s.pairLocked(7)).toBe(true)
    expect(await s.redeem(code.code, { id: 7, name: 'K' })).toBeUndefined()
    // Chat khác không bị ảnh hưởng.
    expect(await s.redeem(code.code, { id: 8, name: 'L' })).toMatchObject({ userId: 8 })
    now += 3_600_001
    const again = await s.createCode('member')
    expect(s.pairLocked(7)).toBe(false)
    expect(await s.redeem(again.code, { id: 7, name: 'K' })).toMatchObject({ userId: 7, role: 'member' })
  })

  it('đợt 7f, S18: nhắn đúng trước khi đủ 5 lần sai thì đếm lại từ đầu; tin không giống mã không tính', async () => {
    const s = memStore()
    const code = await s.createCode('owner')
    for (let i = 0; i < 4; i++) await s.redeem('2222-2222', { id: 7, name: 'K' })
    for (let i = 0; i < 10; i++) await s.redeem('xin chào bạn', { id: 7, name: 'K' })
    expect(s.pairLocked(7)).toBe(false)
    expect(await s.redeem(code.code, { id: 7, name: 'K' })).toMatchObject({ role: 'owner' })
  })

  it('đợt 7f, S18: bảng người lạ dọn bản ghi quá 30 ngày', async () => {
    const now = 40 * 86_400_000
    const s = memStore(() => now)
    await s.updateSettings({ strangers: { '1': 0, '2': now - 29 * 86_400_000 } })
    expect(await s.shouldNotifyStranger(3)).toBe(true)
    expect(Object.keys(s.settings().strangers).sort()).toEqual(['2', '3'])
  })

  it('đổi phiên giữ lịch sử để /sessions, /resume', async () => {
    const s = memStore()
    const base = { key: 'k', bot: 'aris', chatId: 1 }
    await s.bindThread({ ...base, sessionId: 's1' })
    await s.bindThread({ ...base, sessionId: 's2' })
    const t = await s.bindThread({ ...base, sessionId: 's1' })
    expect(t).toMatchObject({ sessionId: 's1', history: ['s2'] })
    expect(s.threadOfSession('s1')?.key).toBe('k')
  })

  it('Lark: khoá hợp lệ với storage dsh (chỉ chữ, số, gạch nối)', () => {
    expect(larkKey('ou_7d8a6e6df7621556')).toBe('ou-7d8a6e6df7621556')
    expect(larkThreadKey('aris', 'oc_abc123')).toBe('lk-aris-oc-abc123')
    expect(larkKey('ou_a')).toMatch(/^[A-Za-z0-9-]+$/)
  })

  it('Lark: ghép đôi bằng open_id, mã dùng một lần, mã Telegram bị từ chối, không lẫn vào người của Telegram', async () => {
    const s = memStore()
    const lark = await s.createCode('owner', 'lark')
    const tg = await s.createCode('owner', 'telegram')
    expect(await s.redeemLark(tg.code, { openId: 'ou_a', name: 'A' })).toBe('other-channel')
    expect(s.pairLocked('lk-ou_a')).toBe(false)
    expect(await s.redeemLark(lark.code, { openId: 'ou_a', name: 'A' })).toMatchObject({
      openId: 'ou_a',
      role: 'owner',
      channel: 'lark',
      userId: 0,
    })
    expect(await s.redeemLark(lark.code, { openId: 'ou_b', name: 'B' })).toBeUndefined()
    expect(s.larkRoleOf('ou_a')).toBe('owner')
    expect(s.larkOwners().map((p) => p.openId)).toEqual(['ou_a'])
    expect(s.people()).toEqual([])
    expect(s.owners()).toEqual([])
    expect(s.roleOf(0)).toBeUndefined()
    // Mã người được phép không hạ quyền chủ nhân.
    await s.redeemLark((await s.createCode('member', 'lark')).code, { openId: 'ou_a', name: 'A' })
    expect(s.larkRoleOf('ou_a')).toBe('owner')
    expect(await s.revokeLark('ou_a')).toBe(true)
    expect(s.larkPeople()).toEqual([])
  })

  it('Lark: sai mã nhiều lần khoá riêng người đó, không ảnh hưởng người khác hay Telegram', async () => {
    const s = memStore()
    const code = await s.createCode('owner', 'lark')
    for (let i = 0; i < CODE_MAX_WRONG; i++) await s.redeemLark('2222-2222', { openId: 'ou_a', name: 'A' })
    expect(s.pairLocked('lk-ou_a')).toBe(true)
    expect(await s.redeemLark(code.code, { openId: 'ou_a', name: 'A' })).toBeUndefined()
    expect(await s.redeemLark(code.code, { openId: 'ou_b', name: 'B' })).toMatchObject({ openId: 'ou_b' })
  })

  it('Lark: ứng dụng, nhóm, tin vào, tin ra nằm riêng, Telegram không thấy', async () => {
    const s = memStore()
    await s.putBot({
      bot: 'aris',
      tgId: 1,
      username: 'u',
      name: 'n',
      tokenRef: 'T',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
    })
    await s.putLarkApp({
      bot: 'aris',
      tgId: 0,
      username: 'Aris',
      name: 'Aris',
      tokenRef: 'LARK_ARIS_APP_SECRET',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
      appId: 'cli_a8f2c4d6e0b13579',
      domain: 'lark',
    })
    expect(s.bots().map((b) => b.bot)).toEqual(['aris'])
    expect(s.bot('aris')?.tgId).toBe(1)
    expect(s.larkApps().map((b) => [b.bot, b.channel])).toEqual([['aris', 'lark']])
    await s.patchLarkApp('aris', { error: 'x' })
    expect(s.larkApp('aris')?.error).toBe('x')
    expect(s.larkApp('aris')?.channel).toBe('lark')

    await s.upsertGroup(-5, { title: 'TG' })
    const g = await s.upsertLarkGroup('oc_g', { title: 'Lark nhóm', allowed: true, prompt: 'ngắn' })
    expect(g).toMatchObject({ chatRef: 'oc_g', channel: 'lark', allowed: true, prompt: 'ngắn' })
    expect(s.groups().map((x) => x.title)).toEqual(['TG'])
    expect(s.larkGroups().map((x) => x.title)).toEqual(['Lark nhóm'])
    expect(s.larkGroupRule('oc_g')).toEqual({ allowed: true, who: 'allowed' })
    expect((await s.upsertLarkGroup('oc_g', { prompt: '' })).prompt).toBeUndefined()
    expect(await s.shouldNotifyLarkGroup('oc_x', 'X')).toBe(true)
    expect(await s.shouldNotifyLarkGroup('oc_x', 'X')).toBe(false)
    expect(await s.removeLarkGroup('oc_g')).toBe(true)

    await s.enqueue({ id: 'a', bot: 'aris', update: 1, state: 'queued', receivedAt: 1 })
    await s.enqueue({ id: 'b', bot: 'aris', update: 2, state: 'queued', receivedAt: 2, channel: 'lark' })
    expect(s.inbox().map((r) => r.id)).toEqual(['a'])
    expect(s.larkInbox().map((r) => r.id)).toEqual(['b'])
    const out = {
      bot: 'aris',
      chatId: 0,
      chunks: [],
      sent: 0,
      state: 'pending',
      attempts: 0,
      createdAt: 1,
    } as const
    await s.putOutbox({ ...out, id: 'x' })
    await s.putOutbox({ ...out, id: 'y', channel: 'lark' })
    expect(s.outbox().map((r) => r.id)).toEqual(['x'])
    expect(s.larkOutbox().map((r) => r.id)).toEqual(['y'])
  })
})
