/**
 * Chữ của đầu khung chat aris, tiếng Anh và tiếng Việt (namespace `aris.chatHeader`).
 * Tiếng Trung lùi về tiếng Anh.
 */
export const NS = 'aris.chatHeader'

export const EN = {
  'date.short': '{month}/{day}',
  'bot.chattingWith': 'Chatting with {name}, {role}',
  'switcher.open': 'Switch session with {name}',
  'switcher.list': 'Sessions with {name}',
  'switcher.empty': 'No other sessions yet.',
  'session.new': 'New session',
  'session.newWith': 'New session with {name}',
  'meta.open': 'open',
  'meta.running': 'running',
  'when.today': 'today',
  'when.yesterday': 'yesterday',
}

export type HeaderKey = keyof typeof EN

export const VI: Record<HeaderKey, string> = {
  'date.short': '{day}/{month}',
  'bot.chattingWith': 'Đang chat với {name}, {role}',
  'switcher.open': 'Đổi phiên với {name}',
  'switcher.list': 'Các phiên với {name}',
  'switcher.empty': 'Chưa có phiên nào khác.',
  'session.new': 'Phiên mới',
  'session.newWith': 'Phiên mới với {name}',
  'meta.open': 'đang mở',
  'meta.running': 'đang chạy',
  'when.today': 'hôm nay',
  'when.yesterday': 'hôm qua',
}

export type Translate = (key: HeaderKey, params?: Record<string, unknown>) => string
