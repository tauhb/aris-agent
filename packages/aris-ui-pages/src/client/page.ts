/** Hợp đồng chung giữa khung trang và từng trang aris. */
import type { Params, RouteId } from './routes.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PageNav {
  /** Mở trang hoặc hộp thoại aris. */
  go(to: RouteId, params?: Params): void
  /** Mở một trang của dsh (ví dụ `plugins`, `schedules`) hoặc về chat (`null`). */
  openPanel(id: string | null): void
  /** Mở hộp thoại Cài đặt của dsh (ngôn ngữ, giao diện, phím tắt…). */
  openDshSettings(): void
  /** Đóng hộp thoại aris đang mở. */
  close(): void
}

export interface PageProps {
  t: Translate
  nav: PageNav
  params: Params
}

/** Từ điển của một trang: khoá giống nhau ở hai ngôn ngữ. */
export interface PageText<K extends string = string> {
  en: Record<K, string>
  vi: Record<K, string>
}

export function text<K extends string>(en: Record<K, string>, vi: Record<K, string>): PageText<K> {
  return { en, vi }
}
