/**
 * Danh bạ của thanh bên giao diện mới (bản vẽ V1): Aris ghim đầu, rồi bot theo phòng ban. Mỗi dòng có chấm
 * trạng thái (đang làm, cần người dùng, lỗi) và dòng việc gần nhất cùng màu. Hàm thuần.
 */
import type { TeamMember } from '../demo.js'
import { getMascot } from '../mascots.js'
import type { PendingApproval } from './external.js'
import type { TeamLive, TeamView } from './team.js'

/** Chấm trạng thái: đang làm, cần người dùng duyệt hay trả lời, lỗi; rảnh thì không chấm. */
export type RowDot = 'run' | 'need' | 'err' | null

export interface RosterRow {
  id: string
  name: string
  mascot: string
  accessory?: string | undefined
  /** Màu riêng của linh vật. */
  color: string
  dot: RowDot
  /** Dòng việc gần nhất; rỗng khi cần người dùng (thành phần tự viết "Cần {you} duyệt N việc"). */
  line: string
  /** Số việc chờ người dùng duyệt (chỉ khi `dot` là `need`). */
  needs: number
}

export interface RosterGroup {
  /** Mã phòng ban; bot chưa vào phòng nào ở nhóm `''`. */
  id: string
  label: string
  rows: RosterRow[]
}

export interface RosterV2 {
  pinned: RosterRow
  groups: RosterGroup[]
}

const FALLBACK_COLOR = '#8A8F98'

/** Việc gần nhất của từng bot theo dòng hoạt động (mới nhất trước). */
function latestTasks(live: TeamLive | null): Map<string, string> {
  const latest = new Map<string, string>()
  for (const a of [...(live?.activity ?? [])].sort((x, y) => y.at - x.at))
    if (a.task && !latest.has(a.bot)) latest.set(a.bot, a.task)
  return latest
}

/** Danh bạ thanh bên GĐ9: Aris ghim đầu, rồi các phòng theo thứ tự, phòng rỗng bỏ, bot không phòng ở cuối. */
export function rosterV2(
  view: TeamView,
  live: TeamLive | null,
  approvals: readonly PendingApproval[],
): RosterV2 {
  const latest = latestTasks(live)
  const row = (m: TeamMember): RosterRow => {
    const l = live?.status[m.id]
    const needs = approvals.filter((a) => a.bot === m.id).length
    const dot: RowDot =
      needs > 0 || l?.status === 'waiting'
        ? 'need'
        : l?.status === 'failed'
          ? 'err'
          : l?.status === 'working'
            ? 'run'
            : null
    const last = latest.get(m.id)
    const task = l?.task?.trim() || undefined
    const line = dot === 'need' ? '' : dot ? (task ?? last ?? m.role) : (last ?? m.role)
    const mascot = m.mascot ?? m.id
    return {
      id: m.id,
      name: m.name,
      mascot,
      accessory: m.accessory,
      color: getMascot(mascot)?.color ?? FALLBACK_COLOR,
      dot,
      line,
      needs: dot === 'need' ? Math.max(needs, 1) : 0,
    }
  }
  return {
    pinned: row(view.commander),
    groups: view.groups
      .filter((g) => g.members.length > 0)
      .map((g) => ({ id: g.id, label: g.label, rows: g.members.map(row) })),
  }
}
