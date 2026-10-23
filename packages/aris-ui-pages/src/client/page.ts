/** Hợp đồng chung giữa khung trang và từng trang aris. */
import type { ReactNode } from 'react'
import type { Params, RouteId } from './routes.js'

export type Translate = (key: string, params?: Record<string, unknown>) => string

export interface PageNav {
  /** Mở trang hoặc hộp thoại aris. */
  go(to: RouteId, params?: Params): void
  /** Mở một trang của dsh (ví dụ `plugins`, `schedules`) hoặc về chat (`null`). */
  openPanel(id: string | null): void
  /** Mở một phiên chat (đóng hộp thoại đang mở). */
  openSession(sessionId: string): void
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
  models: readonly { id: string; name: string; reasoning?: boolean | undefined }[]
}

/** Thao tác ghi cấu hình của dsh (đường dẫn tính trong namespace). */
export type SettingsOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }

/** Một namespace cấu hình của dsh (`ctx.configForms.get`). */
export interface ConfigFormLike {
  getSnapshot(): { status: 'loading' | 'ready' | 'unavailable'; value: unknown; writable: boolean }
  subscribe(listener: () => void): () => void
  mutate(ops: readonly SettingsOp[]): Promise<boolean>
}

/** Một route trong danh bạ nhà cung cấp của dsh (`llm.listConfigurableProviders` + `llm.listProviders`). */
export interface ProviderEntry {
  id: string
  name: string
  /** Namespace cấu hình của gói lo route này; rỗng khi route không cấu hình được. */
  ns: string
  /** Đường tới hồ sơ route trong namespace; rỗng khi cả namespace là hồ sơ. */
  path: readonly string[]
  /** Route đang chạy. */
  active: boolean
  /** Route có do người dùng tự khai (cổng riêng, máy chủ tự dựng). */
  declared?: boolean | undefined
  defaultBaseURL?: string | undefined
  /** Biến môi trường route tự đọc khoá khi hồ sơ không ghi tên khoá. */
  nativeEnv: readonly string[]
  error?: string | undefined
}

/** Trạng thái một khoá trong kho bí mật: chỉ biết có hay không. */
export interface CredentialState {
  configured: boolean
  writable: boolean
  source?: string | undefined
}

export interface DiscoveredModel {
  id: string
  name?: string | undefined
  contextWindow?: number | undefined
  maxTokens?: number | undefined
  inputModalities?: readonly string[] | undefined
}

export type Outcome<T = undefined> = { ok: true; value: T } | { ok: false; error: string }

export interface ModelSettings {
  catalog(): Promise<readonly ModelGroup[]>
  form(namespace: string): ConfigFormLike
  /** Danh bạ route của dsh. */
  providers(): Promise<Outcome<readonly ProviderEntry[]>>
  credentials(refs: readonly string[]): Promise<Outcome<Readonly<Record<string, CredentialState>>>>
  setCredential(ref: string, value: string): Promise<Outcome>
  /** Dò model của một route có sẵn, hoặc của một endpoint đang nhập (không lưu khoá). */
  discover(
    namespace: string,
    request: { provider?: string; baseURL?: string; api?: string; apiKey?: string },
  ): Promise<Outcome<readonly DiscoveredModel[]>>
  /** Gọi thử một model (plugin @aris/providers), đo thời gian tới chữ đầu. */
  probe(provider: string, model: string): Promise<{ ok: boolean; ms: number; error?: string | undefined }>
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
