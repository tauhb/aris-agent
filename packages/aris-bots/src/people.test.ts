import { describe, expect, it } from 'vitest'
import type { Table } from './domain.js'
import { OWNER_ID, PeopleStore, threadId, type PersonRecord, type ThreadRecord } from './people.js'

const memTable = <V>(): Table<V> => {
  const m = new Map<string, V>()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    put: async (k, v) => void m.set(k, structuredClone(v)),
    delete: async (k) => m.delete(k),
  }
}
const store = () => new PeopleStore(memTable<PersonRecord>(), memTable<ThreadRecord>())

describe('người', () => {
  it('chủ có danh tính web; chủ nhắn qua Telegram thì nối vào cùng người', async () => {
    const s = store()
    await s.ensureOwner('Tầu')
    const p = await s.personFor({ channel: 'telegram', ref: '111', name: 'Tầu', role: 'owner' })
    expect(p.id).toBe(OWNER_ID)
    expect(p.ids.map((i) => i.channel)).toEqual(['web', 'telegram'])
    // Lần sau tìm theo danh tính.
    expect((await s.personFor({ channel: 'telegram', ref: '111', name: 'x', role: 'guest' })).id).toBe(
      OWNER_ID,
    )
  })

  it('khách mỗi người một bản ghi; ghép đôi thì lên thành viên; cùng số khác tài khoản là người khác', async () => {
    const s = store()
    const a = await s.personFor({ channel: 'zalo', ref: 'u1', account: 'shop', name: 'Lan', role: 'guest' })
    expect(a.role).toBe('guest')
    const b = await s.personFor({ channel: 'zalo', ref: 'u1', account: 'shop', name: 'Lan', role: 'member' })
    expect(b.id).toBe(a.id)
    expect(b.role).toBe('member')
    const c = await s.personFor({ channel: 'zalo', ref: 'u1', account: 'khac', name: 'Lan', role: 'guest' })
    expect(c.id).not.toBe(a.id)
  })
})

describe('luồng', () => {
  it('trang mới đẩy trang cũ xuống, tìm luồng theo phiên, quay về trang cũ thì không trùng', async () => {
    const s = store()
    await s.touch({ bot: 'mai', person: OWNER_ID, kind: 'direct', channel: 'web', session: 's1' })
    await s.touch({ bot: 'mai', person: OWNER_ID, kind: 'direct', channel: 'web', session: 's2' })
    const t = s.thread(threadId('mai', OWNER_ID, 'direct', 'web'))!
    expect(t.session).toBe('s2')
    expect(t.pages).toEqual(['s1'])
    expect(s.threadOfSession('s1')?.id).toBe(t.id)
    await s.touch({ bot: 'mai', person: OWNER_ID, kind: 'direct', channel: 'web', session: 's1' })
    expect(s.thread(t.id)).toMatchObject({ session: 's1', pages: ['s2'] })
  })

  it('luồng riêng từng kênh và luồng chung là hai luồng khác nhau', async () => {
    const s = store()
    await s.touch({ bot: 'mai', person: OWNER_ID, kind: 'direct', channel: 'telegram', session: 'tg' })
    await s.touch({
      bot: 'mai',
      person: OWNER_ID,
      kind: 'direct',
      channel: 'shared',
      session: 'web',
      via: 'web',
    })
    expect(s.current('mai', OWNER_ID, 'direct', 'telegram')).toBe('tg')
    expect(s.current('mai', OWNER_ID, 'direct', 'shared')).toBe('web')
    const shared = await s.touch({
      bot: 'mai',
      person: OWNER_ID,
      kind: 'direct',
      channel: 'shared',
      session: 'web',
      via: 'telegram',
    })
    expect(shared.lastChannel).toBe('telegram')
  })
})
