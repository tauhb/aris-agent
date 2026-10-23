/** Hợp đồng chung giữa khung trang và từng trang aris. */
import type { ReactNode } from 'react'
import type { Params, RouteId } from './routes.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PageNav {
  /** Mở trang hoặc hộp thoại aris. */
  go(to: RouteId, params?: Params): void
  /** Mở một trang của dsh (ví dụ `plugins`, `schedules`) hoặc về chat (`null`). */
  openPanel(id: string | null): void
  /** Đóng hộp thoại aris đang mở. */
  close(): void
}

export interface PageProps {
  t: Translate
  nav: PageNav
  params: Params
  /** Các mục cài đặt của dsh (chỉ trang Cài đặt nhận). */
  system?: SystemSettings | undefined
  /** Danh mục model và cấu hình model theo việc (chỉ trang Cài đặt nhận). */
  models?: ModelSettings | undefined
}

/** Một nhà cung cấp và các model dsh đang phục vụ (`session.modelCatalog`). */
export interface ModelGroup {
  id: string
  name: string
  models: readonly { id: string; name: string }[]
}

/** Thao tác ghi cấu hình của dsh (đường dẫn tính trong namespace). */
export type SettingsOp = { op: 'set'; path: string[]; value: string } | { op: 'unset'; path: string[] }

/** Một namespace cấu hình của dsh (`ctx.configForms.get`). */
export interface ConfigFormLike {
  getSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; value: unknown; writable: boolean }
  subscribe(listener: () => void): () => void
  mutate(ops: readonly SettingsOp[]): Promise<boolean>
}

export interface ModelSettings {
  catalog(): Promise<readonly ModelGroup[]>
  form(namespace: string): ConfigFormLike
}

/** Một mục cài đặt dsh đăng ký vào `settings.section` (Chung, Model, Tài khoản…). */
export interface SystemSection {
  id: string
  label: string
}

/** Các mục cài đặt của dsh, vẽ ngay trong trang Cài đặt của aris thay cho hộp thoại riêng. */
export interface SystemSettings {
  sections: readonly SystemSection[]
  render(id: string): ReactNode
}

/** Từ điển của một trang: khoá giống nhau ở hai ngôn ngữ. */
export interface PageText<K extends string = string> {
  en: Record<K, string>
  vi: Record<K, string>
}

export function text<K extends string>(en: Record<K, string>, vi: Record<K, string>): PageText<K> {
  return { en, vi }
}
