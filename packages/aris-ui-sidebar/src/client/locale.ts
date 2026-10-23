/**
 * Chữ của thanh bên aris, tiếng Anh và tiếng Việt. Namespace riêng `aris.sidebar`
 * (không dùng `sidebar` của dsh để không đụng gói ngôn ngữ). Tiếng Trung lùi về
 * tiếng Anh. `number.locale` là thẻ ngôn ngữ cho `Intl` khi định dạng số.
 */
export const NS = 'aris.sidebar'

export const EN = {
  'number.locale': 'en-US',
  'nav.label': 'aris navigation',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'session.new': 'New task',
  'panels.label': 'Pages',
  'panel.schedules': 'Routines',
  'panel.map': 'Team map',
  'panel.brain': 'Second Brain',
  'panel.kanban': 'Kanban',
  search: 'Search all sessions',
  'team.title': 'Team',
  'team.add': 'Add a bot to the team',
  'projects.title': 'Projects',
  'projects.add': 'New project',
  'project.label': 'Project {name}',
  'project.sessions': '{count} sessions',
  'approvals.waiting': '{count} tasks waiting for your OK',
  'owner.name': 'Owner',
  'owner.cost': '${spent} of ${budget} today',
  settings: 'Settings',
  'status.working': 'Working',
  'status.waiting': 'Needs you',
  'status.done': 'Done',
  'status.failed': 'Stuck',
  'status.idle': 'Idle',
}

export type SidebarKey = keyof typeof EN

export const VI: Record<SidebarKey, string> = {
  'number.locale': 'vi-VN',
  'nav.label': 'Điều hướng aris',
  'toggle.open': 'Mở thanh bên',
  'toggle.collapse': 'Thu gọn thanh bên',
  'session.new': 'Việc mới',
  'panels.label': 'Các trang',
  'panel.schedules': 'Routine',
  'panel.map': 'Bản đồ đội',
  'panel.brain': 'Second Brain',
  'panel.kanban': 'Kanban',
  search: 'Tìm trong mọi phiên',
  'team.title': 'Đội hình',
  'team.add': 'Thêm bot vào đội',
  'projects.title': 'Dự án',
  'projects.add': 'Tạo dự án mới',
  'project.label': 'Dự án {name}',
  'project.sessions': '{count} phiên',
  'approvals.waiting': '{count} việc đợi anh gật đầu',
  'owner.name': 'Chủ nhân',
  'owner.cost': '{spent} / {budget} USD hôm nay',
  settings: 'Cài đặt',
  'status.working': 'Đang làm',
  'status.waiting': 'Chờ anh',
  'status.done': 'Xong',
  'status.failed': 'Vấp',
  'status.idle': 'Rảnh',
}

export type Translate = (key: SidebarKey, params?: Record<string, unknown>) => string
