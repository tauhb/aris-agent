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

describe('kho kênh · Zalo', () => {
  it('người, nhóm, tài khoản, hàng đợi của Zalo nằm riêng, không lẫn Telegram và Lark', async () => {
    const s = memStore()
    const zalo = await s.redeemZalo((await s.createCode('owner', 'zalo')).code, { zaloId: '2001', name: 'A' })
    expect(zalo).toMatchObject({ channel: 'zalo', openId: '2001', role: 'owner' })
    await s.redeemLark((await s.createCode('owner', 'lark')).code, { openId: 'ou_a', name: 'B' })
    await s.redeem((await s.createCode('owner')).code, { id: 7, name: 'C' })
    expect(s.zaloPeople().map((p) => p.openId)).toEqual(['2001'])
    expect(s.larkPeople().map((p) => p.openId)).toEqual(['ou_a'])
    expect(s.people().map((p) => p.userId)).toEqual([7])
    expect(s.zaloRoleOf('2001')).toBe('owner')
    expect(s.zaloOwners()).toHaveLength(1)

    await s.upsertZaloGroup('5001', { title: 'Z' })
    await s.upsertLarkGroup('oc_g', { title: 'L' })
    await s.upsertGroup(-100, { title: 'T' })
    expect(s.zaloGroups().map((g) => g.title)).toEqual(['Z'])
    expect(s.larkGroups().map((g) => g.title)).toEqual(['L'])
    expect(s.groups().map((g) => g.title)).toEqual(['T'])
    // Nhóm Zalo mặc định tắt.
    expect(s.zaloGroupRule('5001')).toEqual({ allowed: false, who: 'allowed' })

    for (const [i, channel] of (['zalo', 'lark', undefined] as const).entries()) {
      await s.enqueue({ id: `i${i}`, bot: 'aris', update: {}, state: 'queued', receivedAt: i, channel })
      await s.putOutbox({
        id: `o${i}`,
        bot: 'aris',
        chatId: 0,
        chunks: [],
        sent: 0,
        state: 'pending',
        attempts: 0,
        createdAt: i,
        channel,
      })
    }
    expect(s.zaloInbox().map((r) => r.id)).toEqual(['i0'])
    expect(s.larkInbox().map((r) => r.id)).toEqual(['i1'])
    expect(s.inbox().map((r) => r.id)).toEqual(['i2'])
    expect(s.zaloOutbox().map((r) => r.id)).toEqual(['o0'])
    expect(s.larkOutbox().map((r) => r.id)).toEqual(['o1'])
    expect(s.outbox().map((r) => r.id)).toEqual(['o2'])

    const base = {
      tgId: 0,
      username: 'u',
      name: 'n',
      tokenRef: 'r',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
    }
    await s.putZaloAccount({ ...base, bot: 'aris', channel: 'zalo' })
    await s.putLarkApp({ ...base, bot: 'aris', channel: 'lark' })
    expect(s.zaloAccounts()).toHaveLength(1)
    expect(s.larkApps()).toHaveLength(1)
    expect(s.bots()).toEqual([])
    expect(s.zaloAccount('aris')?.channel).toBe('zalo')
    await s.removeZaloAccount('aris')
    expect(s.zaloAccount('aris')).toBeUndefined()
  })

  it('mã Zalo chỉ dùng được trên Zalo; sai mã nhiều lần thì khoá người đó', async () => {
    const s = memStore()
    const code = await s.createCode('member', 'zalo')
    expect(await s.redeem(code.code, { id: 1, name: 'x' })).toBe('other-channel')
    expect(await s.redeemZalo(code.code, { zaloId: '9', name: 'x' })).toMatchObject({ role: 'member' })
    expect(await s.redeemZalo(code.code, { zaloId: '9', name: 'x' })).toBeUndefined()
  })

  it('báo người lạ theo cửa sổ riêng: mặc định 1 giờ, Zalo 24 giờ', async () => {
    let now = 1_000_000
    const s = memStore(() => now)
    expect(await s.shouldNotifyStranger('zc-1', 24 * 3_600_000)).toBe(true)
    now += 3_600_001
    expect(await s.shouldNotifyStranger('zc-1', 24 * 3_600_000)).toBe(false)
    expect(await s.shouldNotifyStranger('zc-1')).toBe(true)
    now += 24 * 3_600_000
    expect(await s.shouldNotifyStranger('zc-1', 24 * 3_600_000)).toBe(true)
  })
})

describe('kho kênh · GĐ8.7 tài khoản kênh', () => {
  it('dữ liệu cũ (trước GĐ8.7) đọc như trước: tài khoản mang mã bot, người và nhóm dùng chung mọi tài khoản', async () => {
    const s = memStore()
    const base = {
      tgId: 9,
      username: 'u',
      name: 'n',
      tokenRef: 'r',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
    }
    // Bản ghi cũ: không có `account`, khoá là mã bot.
    await s.t.bots.put('aris', { ...base, bot: 'aris' })
    await s.t.people.put('tg-5', { userId: 5, name: 'Cũ', role: 'member', pairedAt: 'x' })
    await s.t.groups.put('tg-n100', {
      chatId: -100,
      title: 'Nhóm cũ',
      allowed: true,
      who: 'allowed',
      seenAt: 'x',
    })
    expect(s.bot('aris')).toMatchObject({ bot: 'aris' })
    expect(s.accountOf('aris')?.bot).toBe('aris')
    // Người, nhóm cũ dùng được trên mọi tài khoản, kể cả tài khoản mới.
    expect(s.roleOf(5, 'aris')).toBe('member')
    expect(s.roleOf(5, 'acc-moi123')).toBe('member')
    expect(s.groupRule(-100, 'acc-moi123')).toEqual({ allowed: true, who: 'allowed' })
    // Sửa nhóm cũ qua một tài khoản: vẫn sửa bản ghi dùng chung, không tạo bản trùng.
    await s.upsertGroup(-100, { prompt: 'ngắn' }, 'acc-moi123')
    expect(s.groups()).toHaveLength(1)
    expect(s.group(-100)).toMatchObject({ prompt: 'ngắn' })
    expect(s.group(-100)?.account).toBeUndefined()
  })

  it('người được phép mới chỉ trên tài khoản của mã; chủ nhân dùng chung', async () => {
    const s = memStore()
    const m = await s.redeem((await s.createCode('member', 'telegram', 'acc-a')).code, { id: 1, name: 'M' })
    expect(m).toMatchObject({ role: 'member', account: 'acc-a' })
    expect(s.roleOf(1, 'acc-a')).toBe('member')
    expect(s.roleOf(1, 'acc-b')).toBeUndefined()
    expect(s.people('acc-b')).toEqual([])
    const o = await s.redeem((await s.createCode('owner', 'telegram', 'acc-a')).code, { id: 2, name: 'O' })
    expect(o).toMatchObject({ role: 'owner' })
    expect((o as { account?: string }).account).toBeUndefined()
    expect(s.roleOf(2, 'acc-b')).toBe('owner')
    // Mã của tài khoản A nhắn ở tài khoản B: không dùng, không xoá mã, không tính sai.
    const code = await s.createCode('member', 'telegram', 'acc-a')
    expect(await s.redeem(code.code, { id: 3, name: 'X' }, 'telegram', 'acc-b')).toBe('other-account')
    expect(await s.redeem(code.code, { id: 3, name: 'X' }, 'telegram', 'acc-a')).toMatchObject({
      account: 'acc-a',
    })
  })

  it('nhóm mới theo tài khoản; gỡ tài khoản xoá người, nhóm, mã riêng của nó', async () => {
    const s = memStore()
    await s.upsertGroup(-200, { title: 'A' }, 'acc-a')
    await s.upsertGroup(-200, { title: 'B' }, 'acc-b')
    expect(s.groups()).toHaveLength(2)
    expect(s.group(-200, 'acc-a')?.title).toBe('A')
    expect(s.group(-200, 'acc-b')?.title).toBe('B')
    await s.redeem((await s.createCode('member', 'telegram', 'acc-a')).code, { id: 1, name: 'M' })
    await s.createCode('member', 'telegram', 'acc-a')
    await s.forgetAccount('telegram', 'acc-a')
    expect(s.group(-200, 'acc-a')).toBeUndefined()
    expect(s.group(-200, 'acc-b')?.title).toBe('B')
    expect(s.roleOf(1, 'acc-a')).toBeUndefined()
    expect(s.activeCodes().filter((c) => c.account === 'acc-a')).toEqual([])
  })

  it('tài khoản Zalo khoá theo mã tài khoản; bản ghi cũ khoá theo mã bot vẫn đọc được', async () => {
    const s = memStore()
    const base = {
      tgId: 0,
      username: 'u',
      name: 'n',
      tokenRef: 'r',
      canReadAll: true,
      offset: 0,
      voice: false,
      addedAt: 'x',
      channel: 'zalo' as const,
    }
    await s.putZaloAccount({ ...base, bot: 'aris' })
    await s.putZaloAccount({ ...base, bot: 'mai', account: 'acc-z1' })
    expect(s.zaloAccount('aris')?.bot).toBe('aris')
    expect(s.zaloAccount('acc-z1')?.bot).toBe('mai')
    expect(s.zaloAccounts()).toHaveLength(2)
  })
})
