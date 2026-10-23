import { describe, expect, it } from 'vitest'
import { bookOwner, itemsFor } from './books.js'
import { MemoryStore } from './store.js'

const table = () => {
  const map = new Map()
  return {
    get: (k: string) => map.get(k),
    entries: () => map.entries(),
    put: async (k: string, v: unknown) => void map.set(k, v),
    delete: async (k: string) => map.delete(k),
  }
}

describe('ký ức theo bot', () => {
  it('hồ sơ chủ nhân dùng chung cả đội, ghi chú riêng từng bot', async () => {
    const store = new MemoryStore(table() as never)
    const save = (bot: string, book: 'owner' | 'notes', text: string) =>
      store.save({ bot: bookOwner(bot, book), book, text, tier: 'core', kind: 'fact', trust: 'user-stated' })
    await save('b-minh', 'owner', 'Chủ nhân thích báo cáo ngắn')
    await save('b-minh', 'notes', 'Nguồn đối thủ ở thư mục research')
    await save('b-tho', 'notes', 'Giọng văn: thân mật, xưng em')
    const texts = (bot: string) => itemsFor(store, bot).map((m) => m.text)
    expect(texts('b-tho')).toEqual(['Chủ nhân thích báo cáo ngắn', 'Giọng văn: thân mật, xưng em'])
    expect(texts('b-minh')).toEqual(['Chủ nhân thích báo cáo ngắn', 'Nguồn đối thủ ở thư mục research'])
    expect(texts('aris')).toEqual(['Chủ nhân thích báo cáo ngắn'])
  })
})
