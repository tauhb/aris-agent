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
  /** Danh sách plugin của bản cài (chỉ trang Cài đặt nhận). */
  plugins?: PluginSource | undefined
  /** Trang cấu hình riêng của plugin (chỉ trang Cài đặt nhận). */
  pluginConfig?: PluginConfig | undefined
  /** Mẫu bot của bản cài (chỉ trang Cài đặt nhận). */
  presets?: PresetSource | undefined
}

/** Chữ có thể theo ngôn ngữ (`{ en, vi… }`) trong mô tả plugin. */
export type LocalizedText = string | { readonly en: string; readonly [locale: string]: string }

/** Một plugin trong bản cài (`remote.pluginInventory` của dsh). */
export interface PluginEntry {
  readonly entryId: string
  readonly moduleName: string
  readonly meta?: { title?: LocalizedText; description?: LocalizedText; error?: string }
  readonly enabled: boolean
  readonly fiberPhase: 'pending' | 'loading' | 'active' | 'failed' | 'unloading' | null
}

/** Một mẫu bot (preset) và các plugin nó dùng. */
export interface PluginPreset {
  readonly id: string
  readonly name?: string
  readonly isDefault: boolean
  readonly broken?: string
  readonly rows: readonly (Omit<PluginEntry, 'entryId' | 'enabled'> & {
    entryId: string | null
    enabled: boolean | 'conditional'
  })[]
}

export interface PluginSnapshot {
  readonly entries: readonly PluginEntry[]
  readonly agentPresets?: readonly PluginPreset[]
}

/** Một gói tính năng của bản cài (`pluginManager.listBundles`). */
export interface BundleInfo {
  name: string
  official: boolean
  availability: 'installation' | 'profile' | 'missing'
  /** Gói chính thức chưa cài: bản cài sẵn sàng cài theo yêu cầu. */
  installTarget?: { spec: string; version: string; registry?: string }
  version?: string
  meta?: { title?: LocalizedText; description?: LocalizedText; error?: string }
  description?: string
  enabled: boolean
  installed: boolean
  source?: string
  optional: boolean
  removable: boolean
  readOnlyReason?: string
  error?: ManagementError
  rows: { rowId: string; moduleName: string; meta?: PluginEntry['meta']; entryId?: string }[]
}

export interface ManagementError {
  code: string
  diagnostic?: string
}

/** Một mục lẻ và quyền bật/tắt của nó (`pluginManager.listPlugins`). */
export type PluginInfo = PluginEntry & { patchId?: string; readOnlyReason?: string }

/** Kết quả một thay đổi: áp dụng ngay, cần khởi động lại, hay lỗi. */
export interface ChangeResult {
  changed: boolean
  application: 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
  restartReason?: string
  target: string
  enabled?: boolean
  error?: ManagementError
  bundle?: string
  version?: string
  packageResult?: { output: string; kind?: string }
}

/** Đọc trước một gói sắp cài. */
export type SpecInspection =
  | {
      status: 'accepted'
      kind: 'registry' | 'path' | 'git' | 'tarball'
      name?: string
      version?: string
      description?: string
      bundle: boolean | null
      host?: string
    }
  | { status: 'refused'; problem: string; reason: string }

export interface InstallLogChunk {
  requestId?: string
  text: string
  exitCode?: number | null
}

export interface InstallProgress {
  requestId: string
  phase: 'installing' | 'cancelling' | 'applying'
  attempt?: { index: number; total: number }
}

/** Chợ plugin (`pluginMarket`). */
export interface MarketIndexSummary {
  url: string
  title?: LocalizedText
  description?: LocalizedText
  error?: string
}

export interface MarketEntry {
  name: string
  title?: LocalizedText
  description?: LocalizedText
  icon?: string
  author?: string
  metadata: { category?: string; labels: readonly string[]; keywords: readonly string[] }
  versions: readonly {
    version: string
    install: { spec: string; registry?: string }
    compatibility: { compatible: boolean }
  }[]
  defaultVersion?: string
  installation: {
    status: 'not-installed' | 'installed' | 'update-available' | 'different-version' | 'provided'
    installedVersion?: string
  }
}

export interface MarketSearch {
  url: string
  title: LocalizedText
  metadata: { categories: Readonly<Record<string, { title: LocalizedText }>> }
  entries: readonly MarketEntry[]
  total: number
  nextOffset: number | null
  /** Thời điểm đọc danh mục; gửi lại khi lấy trang sau để các trang cùng một bản. */
  fetchedAt?: number
}

export interface MarketQuery {
  text?: string
  category?: string
  sort: { kind: 'relevance' | 'index' | 'published'; direction?: 'asc' | 'desc' }
  offset: number
  /** 1–100. */
  limit: number
  fetchedAt?: number
}

export interface PluginSource {
  /** Mọi mục lẻ và mẫu bot (chỉ đọc). */
  list(): Promise<Outcome<PluginSnapshot>>
  /** Mục lẻ kèm quyền bật/tắt. */
  plugins(): Promise<Outcome<readonly PluginInfo[]>>
  bundles(): Promise<Outcome<readonly BundleInfo[]>>
  setBundle(name: string, enabled: boolean): Promise<Outcome<ChangeResult>>
  setPlugin(entryId: string, enabled: boolean): Promise<Outcome<ChangeResult>>
  remove(name: string): Promise<Outcome<ChangeResult>>
  inspect(spec: string): Promise<Outcome<SpecInspection>>
  install(spec: string, requestId: string, registry?: string): Promise<Outcome<ChangeResult>>
  cancel(requestId: string): Promise<Outcome<{ status: string }>>
  /** Nhật ký cài, pha cài, thay đổi của bản cài; trả hàm huỷ theo dõi. */
  on(event: 'log', fn: (c: InstallLogChunk) => void): () => void
  on(event: 'state', fn: (p: InstallProgress) => void): () => void
  on(event: 'changed', fn: () => void): () => void
  /** Chợ plugin; không có khi bản cài không bật dịch vụ chợ. */
  readonly market:
    | {
        indexes(): Promise<Outcome<readonly MarketIndexSummary[]>>
        search(url: string, query: MarketQuery): Promise<Outcome<MarketSearch>>
        setIndexes(urls: readonly string[]): Promise<Outcome<unknown>>
      }
    | undefined
  /** Khởi động lại aris (chạy ngầm); chạy tay thì không được. */
  restart(): Promise<Outcome<{ restarting: boolean }>>
  resolveText(text: LocalizedText): string
}

/**
 * Các trang cấu hình plugin tự đăng ký vào khe của trang Plugin: `plugins.item` (plugin chính thức,
 * ví dụ Shell, Bot con), `plugins.bundle.config` (theo tên gói), `plugins.row.config`
 * (`<tên gói>#<mã hàng>`). Plugin tự giữ form, trang chỉ vẽ.
 */
export interface ConfigLedger {
  items: readonly { id: string; label: string }[]
  bundles: ReadonlySet<string>
  rows: ReadonlySet<string>
}

export type ConfigView = 'page' | 'summary'

export type ConfigTarget =
  { kind: 'item'; id: string } | { kind: 'bundle'; key: string } | { kind: 'row'; key: string }

export interface PluginConfig {
  ledger: { getSnapshot(): ConfigLedger; subscribe(fn: () => void): () => void }
  render(target: ConfigTarget, view: ConfigView): ReactNode
}

/** Một mẫu bot (`agentPresets.list` của dsh): chế độ làm việc một phiên bắt đầu với. */
export interface PresetRow {
  id: string
  isDefault: boolean
  /** Tên mẫu tự đặt; mẫu có sẵn không có. */
  name?: string
  description?: string
  /** Vì sao mẫu không dùng được. */
  broken?: string
}

export interface PresetSource {
  list(): Promise<Outcome<readonly PresetRow[]>>
  /** Danh sách plugin mẫu khai báo, dạng YAML để đọc. */
  read(id: string): Promise<Outcome<{ name?: string; content: string }>>
  /** Mẫu mặc định cho việc mới (phiên đang chạy giữ mẫu của nó). */
  setDefault(id: string): Promise<Outcome<unknown>>
  /** Mở việc mới ở chế độ Sáng tạo để bot tạo mẫu bot hoặc plugin. */
  startCreator(): void
  /** Công cụ lập trình (mục Chung) đang bật: hiện thêm PTC và Tối giản. */
  codingTools: { getSnapshot(): boolean; subscribe(fn: () => void): () => void }
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
