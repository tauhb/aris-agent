/** Ký ức theo bot (giai đoạn 2): ai thấy cuốn nào. */
import type { Book, MemoryItem, MemoryStore } from './store.js'

/** Commander. Hồ sơ chủ nhân (cuốn `owner`) của cả đội lưu dưới bot này. */
export const DEFAULT_BOT = 'aris'

/**
 * Cuốn ký ức theo bot: hồ sơ chủ nhân dùng chung cả đội (lưu dưới Commander), ghi chú làm việc
 * riêng từng bot.
 */
export const bookOwner = (bot: string, book: Book) => (book === 'owner' ? DEFAULT_BOT : bot)

/** Mọi ký ức một bot thấy: hồ sơ chủ nhân chung và ghi chú của chính nó. */
export function itemsFor(store: MemoryStore, bot: string): MemoryItem[] {
  return bot === DEFAULT_BOT
    ? store.list(bot)
    : [...store.list(DEFAULT_BOT, { book: 'owner' }), ...store.list(bot, { book: 'notes' })]
}
