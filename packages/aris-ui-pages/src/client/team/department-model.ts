/** Logic thuần của trang Phòng ban (2.6): số ngân sách kiểu Việt, so chính sách đã đổi chưa. */
import type { PolicyData } from '@aris/ui-kit/react'

/** Chính sách khi phòng chưa có (giống mặc định của `@aris/bots`). */
export const DEFAULT_POLICY: PolicyData = { web: true, write: true, shell: false, onBudget: 'stop' }

/** Ô ngân sách: trống là không giới hạn (`undefined`), số hợp lệ (`2`, `2,5`, `2.50`), sai là `null`. */
export function parseBudget(s: string): number | undefined | null {
  const v = s.trim().replace(/\s/g, '').replace(',', '.')
  if (!v) return undefined
  if (!/^\d+(\.\d{0,2})?$/.test(v)) return null
  const n = Number(v)
  return n <= 1000 ? n : null
}

/** USD hai chữ số thập phân, dấu phẩy như tiếng Việt; không có số thì chuỗi rỗng. */
export const budgetText = (n: number | undefined) => (n === undefined ? '' : n.toFixed(2).replace('.', ','))

export function samePolicy(a: PolicyData, b: PolicyData): boolean {
  const m = (p: PolicyData) => (p.model ? `${p.model.provider}\u0000${p.model.model}` : '')
  return (
    a.web === b.web &&
    a.write === b.write &&
    a.shell === b.shell &&
    a.onBudget === b.onBudget &&
    a.budgetUsd === b.budgetUsd &&
    m(a) === m(b)
  )
}
