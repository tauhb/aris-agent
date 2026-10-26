/**
 * Đội hình theo trạng thái ở thanh bên: bot đang làm hoặc đang đợi người dùng nằm ở nhóm "Cần chú ý"
 * (kèm tên phòng ban và một dòng việc), các bot còn lại gom thành một dải "Rảnh". Hàm thuần.
 */
import type { TeamGroup, TeamMember } from '@aris/ui-kit'

export interface AttentionRow {
  member: TeamMember
  /** Phòng ban của bot; bot chưa vào phòng thì `null`. */
  department: { id: string; label: string } | null
  state: 'working' | 'waiting'
}

export interface Roster {
  attention: AttentionRow[]
  rest: TeamMember[]
}

/**
 * Tách đội (đã gom theo phòng ban, không gồm Commander) thành hai phần. Trong "Cần chú ý", bot đang làm
 * đứng trước bot đang đợi, mỗi loại giữ thứ tự phòng ban; "Rảnh" giữ nguyên thứ tự đó.
 */
export function splitRoster(groups: readonly TeamGroup[]): Roster {
  const rows: AttentionRow[] = []
  const rest: TeamMember[] = []
  for (const g of groups) {
    const department = g.id ? { id: g.id, label: g.label } : null
    for (const member of g.members) {
      if (member.status === 'working' || member.status === 'waiting')
        rows.push({ member, department, state: member.status })
      else rest.push(member)
    }
  }
  const order = (r: AttentionRow) => (r.state === 'working' ? 0 : 1)
  // Sắp ổn định: `Array.prototype.sort` giữ thứ tự cũ khi bằng nhau.
  return { attention: rows.sort((a, b) => order(a) - order(b)), rest }
}

/** Số bot đang làm (không đếm bot đang đợi người dùng). */
export const countWorking = (groups: readonly TeamGroup[]): number =>
  groups.reduce((n, g) => n + g.members.filter((m) => m.status === 'working').length, 0)

/**
 * Dòng việc của một bot: việc được giao; chưa có thì tên phiên đang chạy (hay đang đợi); không có
 * gì thì trống.
 */
export function workLine(
  live: { task?: string | undefined; sessions?: readonly string[] | undefined } | undefined,
  titles: Readonly<Record<string, string>> | undefined,
): string {
  const task = live?.task?.trim()
  if (task) return task
  for (const id of live?.sessions ?? []) {
    const title = titles?.[id]?.trim()
    if (title) return title
  }
  return ''
}
