/** Chọn phiên để mở khi bấm vào một dự án. */

export interface SessionBrief {
  readonly blank: boolean
  readonly updatedAt: number
}

/** Phiên có nội dung, cập nhật gần nhất trong dự án; không có thì undefined. */
export function latestProjectSession(
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
