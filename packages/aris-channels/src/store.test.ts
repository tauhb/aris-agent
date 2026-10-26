import { describe, expect, it } from 'vitest'
import { CODE_MAX_WRONG, ChannelStore, normalizeCode, threadKey, type Table, type Tables } from './store.js'

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
})
