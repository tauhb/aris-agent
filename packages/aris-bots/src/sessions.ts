/**
 * Danh sách phiên gần đây của một bot cho ô chọn phiên ở bảng chat Văn phòng (`/api/aris/bots?sessions=<bot>`). Hàm thuần;
 * danh sách phiên và tên phiên đọc ở `index.ts`.
 */

/** Một dòng của danh sách phiên dsh (`sessionController.list`), chỉ phần dùng tới. */
export interface SessionRow {
  sessionId: string
  updatedAt: number
  running?: boolean
  blank?: boolean
  parentSessionId?: string | undefined
  origin?: string | undefined
}

export interface RecentSession {
  id: string
  /** Tên phiên do dsh đặt; phiên chưa có tên thì trống. */
  title: string
  /** Lần sửa cuối (ms). */
  at: number
  running: boolean
}

/**
 * Chọn `max` phiên mới sửa nhất trong `ids`: bỏ phiên không còn trong danh sách của dsh, phiên trống (chưa có tin) và
 * phiên bot con ẩn danh; mỗi mã chỉ một lần.
 */
export function pickSessions(
  ids: readonly string[],
  rows: ReadonlyMap<string, SessionRow>,
  titles: Readonly<Record<string, string>>,
  max: number,
): RecentSession[] {
  const out: RecentSession[] = []
  for (const id of new Set(ids)) {
    const r = rows.get(id)
    if (!r || r.blank || r.origin === 'subagent') continue
    out.push({ id, title: titles[id] ?? '', at: r.updatedAt, running: !!r.running })
  }
  return out.sort((a, z) => z.at - a.at).slice(0, max)
}
