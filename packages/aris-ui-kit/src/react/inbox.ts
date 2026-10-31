/**
 * Số việc đang chờ duyệt trong Hộp duyệt (trang Tự học): yêu cầu quyền, đề xuất ký ức, đề xuất skill và một thẻ soát bộ
 * não khi còn phát hiện chưa xử lý. Cùng bốn nguồn mà trang Hộp duyệt (`mind/Approvals.tsx`) dùng để ra số `needYou`, nên
 * số trên mục Tự học ở thanh bên khớp với số trong trang.
 */
import { useEffect, useState } from 'react'

export interface InboxCount {
  /** Yêu cầu quyền của bot. */
  actions: number
  /** Đề xuất ký ức. */
  memories: number
  /** Đề xuất skill. */
  skills: number
  /** Số phát hiện của soát bộ não chưa xử lý (cả loạt tính là một thẻ). */
  auditOpen: number
}

/** Tổng số thẻ trong Hộp duyệt: ba loại đề xuất cộng một thẻ soát bộ não khi còn phát hiện. */
export const inboxTotal = (c: InboxCount): number =>
  c.actions + c.memories + c.skills + (c.auditOpen > 0 ? 1 : 0)

const url = (query: string) => {
  const u = new URL('api/aris/', document.baseURI)
  return new URL(query, u)
}

async function get<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(url(path), { credentials: 'same-origin' })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/**
 * Đọc bốn nguồn của Hộp duyệt; nguồn nào lỗi thì giữ số cũ của nguồn đó (`prev`), để một lần mạng chập chờn không làm
 * số nhảy về 0.
 */
export async function fetchInboxCount(prev: InboxCount): Promise<InboxCount> {
  const [a, m, s, b] = await Promise.all([
    get<{ approvals: unknown[] }>('commander?approvals=all'),
    get<{ pending: unknown[] }>('memory?pending=all'),
    get<{ pending: unknown[] }>('skills?pending=all'),
    get<{ open: number }>('brain?audit=summary'),
  ])
  return {
    actions: a?.approvals.length ?? prev.actions,
    memories: m?.pending.length ?? prev.memories,
    skills: s?.pending.length ?? prev.skills,
    auditOpen: b?.open ?? prev.auditOpen,
  }
}

const ZERO: InboxCount = { actions: 0, memories: 0, skills: 0, auditOpen: 0 }

/** Số việc chờ duyệt trong Hộp duyệt, đọc lại mỗi 5 giây. */
export function useInboxCount(): number {
  const [count, setCount] = useState<InboxCount>(ZERO)
  useEffect(() => {
    let alive = true
    let latest = ZERO
    const load = () =>
      void fetchInboxCount(latest).then((c) => {
        if (!alive) return
        latest = c
        setCount(c)
      })
    load()
    const timer = setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  return inboxTotal(count)
}
