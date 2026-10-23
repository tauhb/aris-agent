/** Lọc danh sách phiên của dsh thành các phiên chat hiển thị trong "Phiên ▾". */
import type { Translate } from './locale.js'

export interface SessionSummaryLike {
  readonly id: string
  readonly displayTitle: string
  readonly origin?: 'subagent'
  readonly running: boolean
  readonly blank: boolean
  readonly updatedAt: number
}

export interface SessionListLike {
  readonly ids: readonly string[]
  readonly byId: Readonly<Record<string, SessionSummaryLike>>
}

/**
 * Phiên chat của chủ nhân, mới nhất trước: bỏ phiên của bot con (subagent) và
 * phiên trống, trừ phiên đang mở; lấy tối đa `limit` phiên.
 */
export function chatSessions(list: SessionListLike, currentId?: string, limit = 8): SessionSummaryLike[] {
  return list.ids
    .map((id) => list.byId[id])
    .filter(
      (s): s is SessionSummaryLike => !!s && s.origin !== 'subagent' && (!s.blank || s.id === currentId),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

/** Nhãn thời gian ngắn: "hôm nay", "hôm qua", hoặc ngày/tháng theo ngôn ngữ đang chọn. */
export function whenLabel(updatedAt: number, t: Translate, now = Date.now()): string {
  const day = (t: number) => {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const diff = Math.round((day(now) - day(updatedAt)) / 86_400_000)
  if (diff <= 0) return t('when.today')
  if (diff === 1) return t('when.yesterday')
  const d = new Date(updatedAt)
  const two = (n: number) => String(n).padStart(2, '0')
  return t('date.short', { day: two(d.getDate()), month: two(d.getMonth() + 1) })
}
