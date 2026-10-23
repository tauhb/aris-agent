/**
 * Logic thuần của trang Plugin (6.7): phân nhóm gói, trạng thái, kết quả một thay đổi, thẻ chợ.
 * Không phụ thuộc React để kiểm thử.
 */
import type { BundleInfo, ChangeResult, LocalizedText, MarketEntry, PluginEntry } from '../../page.js'

/** Gói tính năng aris cần để chạy (Commander lập đội): khoá như lõi. */
export const REQUIRED_BY_ARIS = new Set(['@deepseek-ai/dsh-experimental-agent-team-profile'])

/** Gói chợ plugin: tắt thì thẻ Chợ mời bật. */
export const MARKET_BUNDLE = '@deepseek-ai/dsh-experimental-plugin-market-bundle'

export type BundleGroup = 'core' | 'builtin' | 'added'

/**
 * Lõi: gói của aris, gói aris cần, gói không cho đổi, và gói nền của bản cài (không phải tính
 * năng, không tắt riêng, không gỡ được). Có sẵn: gói tính năng đi kèm. Còn lại là tự thêm.
 */
export function groupOf(
  b: Pick<BundleInfo, 'name' | 'official' | 'readOnlyReason' | 'optional' | 'removable'>,
): BundleGroup {
  if (b.name.startsWith('@aris/') || REQUIRED_BY_ARIS.has(b.name) || b.readOnlyReason) return 'core'
  if (b.official) return 'builtin'
  return b.optional || b.removable ? 'added' : 'core'
}

export type BundleState = 'active' | 'off' | 'failed' | 'missing'

export function stateOf(b: Pick<BundleInfo, 'enabled' | 'error' | 'availability'>): BundleState {
  if (b.availability === 'missing') return 'missing'
  if (!b.enabled) return 'off'
  return b.error ? 'failed' : 'active'
}

/** Tên ngắn khi gói không khai tên hiển thị: bỏ phạm vi và tiền tố `dsh-`, `experimental-`. */
export const shortName = (moduleName: string) =>
  moduleName
    .replace(/^@[^/]+\//, '')
    .replace(/^dsh-/, '')
    .replace(/^experimental-/, '')
    .replace(/-(bundle|profile)$/, '')
    .replace(/\/.*$/, '')

export const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export interface Texts {
  title: string
  description?: string | undefined
}

type Resolve = (t: LocalizedText) => string

/** Tên riêng của gói đã biết (lõi aris dùng tên gọn), không thì tên ngắn. */
export const slugOf = (name: string) =>
  name === '@aris/bundle' ? 'aris' : name === '@aris/web-bundle' ? 'aris-ui' : shortName(name)

/** Gói có tên và mô tả dịch sẵn trong `pl.b.<slug>`. */
export const NAMED = new Set([
  'aris',
  'aris-ui',
  'base',
  'web-app',
  'headless',
  'sdk-minimal',
  'sdk-app',
  'acp-app',
  'agent-team',
  'voice-input',
  'inspector',
  'auto-review',
  'cot-translation',
  'badge-skill',
  'ralph',
  'session-titles',
  'terminal',
  'session-search',
  'tool-worktree',
  'plugin-market',
  'subagent-claude-code',
  'subagent-codex',
])

export function bundleText(
  b: Pick<BundleInfo, 'name' | 'meta' | 'description'>,
  resolve: Resolve,
  t?: (key: string) => string,
): Texts {
  const slug = slugOf(b.name)
  if (t && NAMED.has(slug)) return { title: t(`pl.b.${slug}`), description: t(`pl.b.${slug}.d`) }
  return {
    title: b.meta?.title ? resolve(b.meta.title) : shortName(b.name),
    description: b.meta?.description ? resolve(b.meta.description) : b.description,
  }
}

export function entryText(p: Pick<PluginEntry, 'moduleName' | 'meta'>, resolve: Resolve): Texts {
  return {
    title: p.meta?.title ? resolve(p.meta.title) : shortName(p.moduleName),
    description: p.meta?.description ? resolve(p.meta.description) : undefined,
  }
}

/** Lõi aris và giao diện đứng đầu nhóm lõi như bản vẽ. */
const rank = (name: string) => {
  const i = ['@aris/bundle', '@aris/web-bundle'].indexOf(name)
  return i < 0 ? 2 : i
}

/** Gói theo ba nhóm như bản vẽ: lõi, có sẵn, tự thêm; mỗi nhóm theo tên. */
export function groupBundles(bundles: readonly BundleInfo[], resolve: Resolve, t?: (key: string) => string) {
  const by = (g: BundleGroup) =>
    bundles
      .filter((b) => groupOf(b) === g)
      .sort(
        (a, b) =>
          rank(a.name) - rank(b.name) ||
          bundleText(a, resolve, t).title.localeCompare(bundleText(b, resolve, t).title, 'vi'),
      )
  return { core: by('core'), builtin: by('builtin'), added: by('added') }
}

/** Một thay đổi xong thì sao: áp dụng ngay, cần khởi động lại, bị đè, hay lỗi (kèm lời báo). */
export type ChangeOutcome =
  | { kind: 'applied' }
  | { kind: 'restart' }
  | { kind: 'overridden' }
  | { kind: 'cancelled' }
  | { kind: 'failed'; detail: string }

export function outcomeOf(r: ChangeResult): ChangeOutcome {
  switch (r.application) {
    case 'applied':
      return { kind: 'applied' }
    case 'restart-required':
      return { kind: 'restart' }
    case 'overridden':
      return { kind: 'overridden' }
    case 'cancelled':
      return { kind: 'cancelled' }
    default:
      return {
        kind: 'failed',
        detail:
          r.error?.diagnostic || r.error?.code || r.packageResult?.kind || r.packageResult?.output || 'lỗi',
      }
  }
}

/** Thẻ chợ: phiên bản sẽ cài, có cài được không, đã cài hay có bản mới. */
export function marketCard(e: MarketEntry) {
  const version = e.versions.find((v) => v.version === e.defaultVersion) ?? e.versions[0]
  const status = e.installation.status
  return {
    version,
    installed: status === 'installed' || status === 'provided',
    update: status === 'update-available',
    incompatible: !!version && !version.compatibility.compatible,
    canInstall:
      !!version &&
      version.compatibility.compatible &&
      (status === 'not-installed' || status === 'update-available'),
  }
}

/** Mã yêu cầu cài (để huỷ và ghép nhật ký). */
export const newRequestId = () => `aris-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Chữ hiện cho người dùng không nhắc tên nền tảng bên dưới: aris là sản phẩm người dùng thấy. */
export const debrand = (s: string) =>
  !/\s/.test(s)
    ? s // tên gói, mã: giữ nguyên
    : s
        .replace(/DeepSeek[\s-]*Harness/gi, 'aris')
        .replace(/DeepSeek/gi, 'aris')
        .replace(/\baris\s+aris\b/gi, 'aris')

/** Chữ cái đầu cho ô biểu tượng. */
export const letterOf = (title: string) =>
  (title.trim().replace(/^@[^/]+\//, '')[0] ?? '?').toLocaleUpperCase('vi')
