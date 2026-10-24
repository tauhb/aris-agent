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
  'project.members': '{n} bots and you',
  'project.label': 'Project {name}, {n} bots and you',
  'more.label': 'More actions',
  'more.profile': 'Open profile',
  'more.download': 'Download session log',
  'export.preparing': 'Exporting session',
  'export.preparingHint': 'Preparing a ZIP with this session, its sub-sessions and attachments.',
  'export.started': 'Session download started',
  'export.startedHint': 'The browser is downloading the session ZIP.',
  'export.failed': 'Session export failed',
  'export.failedHint': 'Could not start the session export.',
  'export.close': 'Close',
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
  'project.members': '{n} bot và {you}',
  'project.label': 'Dự án {name}, {n} bot và {you}',
  'more.label': 'Thao tác khác',
  'more.profile': 'Mở hồ sơ',
  'more.download': 'Tải nhật ký phiên',
  'export.preparing': 'Đang xuất phiên',
  'export.preparingHint': 'Đang chuẩn bị tệp ZIP gồm phiên này, các phiên con và tệp đính kèm.',
  'export.started': 'Đã bắt đầu tải phiên',
  'export.startedHint': 'Trình duyệt đang tải tệp ZIP của phiên.',
  'export.failed': 'Xuất phiên không thành công',
  'export.failedHint': 'Không bắt đầu xuất phiên được.',
  'export.close': 'Đóng',
}

export type Translate = (key: HeaderKey, params?: Record<string, unknown>) => string
