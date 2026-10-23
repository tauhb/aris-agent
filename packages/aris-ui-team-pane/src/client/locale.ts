/** Chữ của cột phải "Đội bot", tiếng Anh và tiếng Việt (namespace `aris.teamPane`); tiếng Trung lùi về tiếng Anh. */
export const NS = 'aris.teamPane'

export const EN = {
  title: 'Team right now',
  openMap: 'Open map',
  commander: '{name} · Commander',
  orbit: '3D team map: {name} leads in the middle; {members}. Drag to rotate.',
  orbitHint: 'Drag to rotate · hover a bot to see its role',
  'orbit.working': 'working',
  'orbit.waiting': 'needs you',
  'orbit.done': 'done',
  'orbit.failed': 'stuck',
  'orbit.idle': 'idle',
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
  commander: '{name} · Chỉ huy',
  orbit: 'Sơ đồ đội 3D: {name} chỉ huy ở giữa; {members}. Kéo để xoay.',
  orbitHint: 'Kéo để xoay · rê chuột vào bot để xem vai trò',
  'orbit.working': 'đang làm',
  'orbit.waiting': 'chờ anh',
  'orbit.done': 'xong',
  'orbit.failed': 'vấp',
  'orbit.idle': 'rảnh',
  recent: 'Việc gần đây',
  more: 'Mở thêm',
  'status.working': 'Đang làm',
  'status.waiting': 'Chờ anh',
  'status.done': 'Xong',
  'status.failed': 'Vấp',
  'status.idle': 'Rảnh',
}

export type Translate = (key: PaneKey, params?: Record<string, unknown>) => string
