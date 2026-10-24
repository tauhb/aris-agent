/** Chọn phiên để mở khi bấm vào một dự án. */

export interface SessionBrief {
  readonly blank: boolean
  readonly updatedAt: number
  readonly origin?: string | undefined
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

/** Phiên có nội dung (không phải phiên bot con), mới nhất trước: ứng viên phiên của Aris. */
export function recentSessions(
  sessionIds: readonly string[],
  byId: Readonly<Record<string, SessionBrief>>,
  limit = 50,
): string[] {
  return sessionIds
    .filter((id) => {
      const s = byId[id]
      return !!s && !s.blank && s.origin !== 'subagent'
    })
    .sort((a, b) => byId[b]!.updatedAt - byId[a]!.updatedAt)
    .slice(0, limit)
}
