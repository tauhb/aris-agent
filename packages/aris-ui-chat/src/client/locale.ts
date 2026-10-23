/** Chữ của khung chat aris, tiếng Anh và tiếng Việt (namespace `aris.chat`); tiếng Trung lùi về tiếng Anh. */
export const NS = 'aris.chat'

export const EN = {
  'hero.mark': 'Aris',
  'input.command': 'Commands and skills',
  'input.mention': 'Hand a task to a bot',
  'model.title': '{provider} · {model}',
  'branch.subagent': 'Sub-bot',
  'branch.preparing': 'Handing the task over…',
  'branch.received': 'Got the task',
  'branch.running': 'Working on it',
  'branch.done': 'Done, reported back to Aris',
  'branch.failed': 'Could not start: {error}',
  'branch.stopped': 'Stopped',
  'branch.open': 'View progress',
  'status.working': 'Working',
  'status.waiting': 'Needs you',
  'status.done': 'Done',
  'status.failed': 'Stuck',
  'status.idle': 'Idle',
}

export type ChatKey = keyof typeof EN

export const VI: Record<ChatKey, string> = {
  'hero.mark': 'Aris',
  'input.command': 'Lệnh và skill',
  'input.mention': 'Giao việc cho bot',
  'model.title': '{provider} · {model}',
  'branch.subagent': 'Bot con',
  'branch.preparing': 'Đang giao việc…',
  'branch.received': 'Đã nhận việc',
  'branch.running': 'Đang làm',
  'branch.done': 'Xong, đã báo lại cho Aris',
  'branch.failed': 'Không bắt đầu được: {error}',
  'branch.stopped': 'Đã dừng',
  'branch.open': 'Xem diễn biến',
  'status.working': 'Đang làm',
  'status.waiting': 'Chờ anh',
  'status.done': 'Xong',
  'status.failed': 'Vấp',
  'status.idle': 'Rảnh',
}

export type Translate = (key: ChatKey, params?: Record<string, unknown>) => string
