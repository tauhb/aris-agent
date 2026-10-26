/**
 * Logic thuần của danh sách chuỗi model ở mục Model. Chuỗi chat gồm model chính (dòng 1, lưu ở
 * `agent-default-model`) và các dòng dự phòng 2, 3… (lưu ở API chuỗi của `@aris/providers`); giao diện coi cả
 * hai là một danh sách, còn khi lưu thì tách lại thành hai phần.
 */
import type { ProviderStatus } from './provider-data.js'
import type { Link, Price } from './providers-api.js'

export const linkKey = (l: Link) => `${l.provider}\u0000${l.model}`
export const sameLink = (a: Link, b: Link) => a.provider === b.provider && a.model === b.model

/** Danh sách hiển thị: model chính (nếu có) rồi các dòng dự phòng, bỏ trùng. */
export function joinChain(main: Link | undefined, fallback: readonly Link[]): Link[] {
  const seen = new Set<string>()
  return [...(main ? [main] : []), ...fallback].filter((l) => !seen.has(linkKey(l)) && seen.add(linkKey(l)))
}

/** Tách danh sách hiển thị thành model chính (dòng 1) và chuỗi dự phòng (dòng 2 trở đi). */
export function splitChain(list: readonly Link[]): { main: Link | undefined; fallback: Link[] } {
  return { main: list[0], fallback: list.slice(1) }
}

/** Đổi chỗ dòng `i` với dòng kề (`d` = -1 lên, 1 xuống). Ngoài phạm vi thì giữ nguyên. */
export function moveLink<T>(list: readonly T[], i: number, d: -1 | 1): T[] {
  const next = [...list]
  const j = i + d
  if (i < 0 || i >= next.length || j < 0 || j >= next.length) return next
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

/**
 * Bỏ dòng `i`. Dòng 1 (model chính) chỉ bỏ được khi còn dòng dự phòng để thế chỗ: ngoài ra giữ nguyên, vì
 * model chính không được để trống khi chuỗi còn model.
 */
export function removeLink<T>(list: readonly T[], i: number): T[] {
  if (i < 0 || i >= list.length || (i === 0 && list.length < 2)) return [...list]
  return list.filter((_, j) => j !== i)
}

export interface ChainPlan {
  main: Link | undefined
  fallback: Link[]
  /** Model chính đổi, cần ghi `agent-default-model`. */
  mainChanged: boolean
  /** Chuỗi dự phòng đổi, cần ghi API chuỗi. */
  fallbackChanged: boolean
}

/** So danh sách mới với giá trị đang lưu để biết phải ghi chỗ nào. Đưa dòng 2 lên dòng 1 thì ghi cả hai. */
export function planChain(
  current: { main: Link | undefined; fallback: readonly Link[] },
  next: readonly Link[],
): ChainPlan {
  const { main, fallback } = splitChain(joinChain(undefined, next))
  const sameMain =
    main === undefined ? current.main === undefined : !!current.main && sameLink(main, current.main)
  const sameFallback =
    fallback.length === current.fallback.length && fallback.every((l, i) => sameLink(l, current.fallback[i]!))
  return { main, fallback, mainChanged: !sameMain, fallbackChanged: !sameFallback }
}

/** Trạng thái một dòng chuỗi chat: provider có chạy và có khoá không, model có giá không. */
export type LinkStatus = 'ready' | 'nokey' | 'off' | 'error' | 'noprice'

/**
 * `provider` là trạng thái provider ở mục Provider và khoá (không có thì chưa biết); `price` là giá của model:
 * `undefined` khi chưa tải được bảng giá (không kết luận), `null` khi bảng giá không có model này.
 * Khoá hay provider chưa dùng được chặn trước thiếu giá.
 */
export function linkStatus(
  provider: ProviderStatus | undefined,
  price: Price | null | undefined,
): LinkStatus | undefined {
  if (provider === undefined) return undefined
  if (provider === 'nokey' || provider === 'off' || provider === 'error') return provider
  if (price === undefined) return undefined
  return price === null ? 'noprice' : 'ready'
}
