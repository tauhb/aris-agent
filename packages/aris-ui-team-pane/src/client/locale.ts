/** Chữ của cột phải "Đội bot", tiếng Anh và tiếng Việt (namespace `aris.teamPane`); tiếng Trung lùi về tiếng Anh. */
export const NS = 'aris.teamPane'

export const EN = {
  title: 'Team right now',
  openMap: 'Open map',
  formation: 'Team formation',
  formationHint: 'Hover a bot to see what it is doing',
  recent: 'Recent activity',
  more: 'Open more',
  'status.working': 'Working',
  'status.waiting': 'Needs you',
  'status.done': 'Done',
  'status.failed': 'Stuck',
  'status.idle': 'Idle',
}

export type PaneKey = keyof typeof EN

export const VI: Record<PaneKey, string> = {
  title: 'Đội bot lúc này',
  openMap: 'Mở bản đồ',
  formation: 'Đội hình',
  formationHint: 'Rê chuột vào bot để xem đang làm gì',
  recent: 'Việc gần đây',
  more: 'Mở thêm',
  'status.working': 'Đang làm',
  'status.waiting': 'Chờ anh',
  'status.done': 'Xong',
  'status.failed': 'Vấp',
  'status.idle': 'Rảnh',
}

export type Translate = (key: PaneKey, params?: Record<string, unknown>) => string
