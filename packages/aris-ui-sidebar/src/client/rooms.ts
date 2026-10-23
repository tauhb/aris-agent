/** Chọn phiên để mở khi bấm vào một phòng. */

export interface SessionBrief {
  readonly blank: boolean
  readonly updatedAt: number
}

/** Phiên có nội dung, cập nhật gần nhất trong phòng; không có thì undefined. */
export function latestRoomSession(
  sessionIds: readonly string[],
  byId: Readonly<Record<string, SessionBrief>>,
): string | undefined {
  let best: string | undefined
  let bestAt = -Infinity
  for (const id of sessionIds) {
    const s = byId[id]
    if (!s || s.blank || s.updatedAt <= bestAt) continue
    best = id
    bestAt = s.updatedAt
  }
  return best
}
