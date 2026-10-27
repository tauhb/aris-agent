/**
 * Luật cho bot điều khiển máy (GĐ8.3, B-3): cài đặt theo bot, chặn cứng (áp cả khi người dùng đã duyệt, kể cả chế độ
 * trong phạm vi), và phán quyết của chế độ "trong phạm vi". Học ý tưởng ba chế độ quyền của Hermes Agent (chỉ đọc tài
 * liệu, xem docs/clean-room-log.md), viết theo kiểu aris: không có chế độ "không hỏi gì". Thuần.
 */
import { dangerousCombo, type Combo } from './keys.js'
import type { El } from './types.js'

/** Loại thao tác, để chọn trong chế độ "trong phạm vi". */
export const ACTIONS = ['xem', 'bam', 'go', 'phim', 'mo'] as const
export type Action = (typeof ACTIONS)[number]

export const ACTION_TEXT: Record<Action, string> = {
  xem: 'xem màn hình, tìm phần tử',
  bam: 'bấm, kéo, cuộn',
  go: 'gõ chữ',
  phim: 'bấm phím tắt',
  mo: 'mở ứng dụng',
}

/** Công cụ của bot → loại thao tác. */
export const TOOL_ACTION: Record<string, Action> = {
  man_hinh_xem: 'xem',
  man_hinh_tim: 'xem',
  man_hinh_bam: 'bam',
  man_hinh_keo: 'bam',
  man_hinh_cuon: 'bam',
  man_hinh_go: 'go',
  man_hinh_phim: 'phim',
  ung_dung_mo: 'mo',
}

export const COMPUTER_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_ACTION))

/** Cài đặt điều khiển máy của một bot. Mặc định tắt. */
export interface ComputerSettings {
  on: boolean
  /** `ask`: hỏi từng bước (mặc định). `bounded`: trong phạm vi tự làm, ngoài phạm vi từ chối. */
  mode: 'ask' | 'bounded'
  /** Ứng dụng được phép trong chế độ trong phạm vi: tên hay bundle id, không phân biệt hoa thường. */
  apps: string[]
  /** Loại thao tác được phép trong chế độ trong phạm vi. */
  actions: Action[]
}

export const DEFAULT_SETTINGS: ComputerSettings = {
  on: false,
  mode: 'ask',
  apps: [],
  actions: ['xem', 'bam', 'go'],
}

/** Cài đặt từ dữ liệu gửi lên; trường thiếu hay sai giữ giá trị cũ. */
export function cleanSettings(input: unknown, prev: ComputerSettings = DEFAULT_SETTINGS): ComputerSettings {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const apps = Array.isArray(r.apps)
    ? [
        ...new Set(
          r.apps
            .filter((a): a is string => typeof a === 'string')
            .map((a) => a.trim())
            .filter((a) => a && a.length <= 120),
        ),
      ].slice(0, 50)
    : prev.apps
  const actions = Array.isArray(r.actions)
    ? ACTIONS.filter((a) => (r.actions as unknown[]).includes(a))
    : prev.actions
  return {
    on: typeof r.on === 'boolean' ? r.on : prev.on,
    mode: r.mode === 'ask' || r.mode === 'bounded' ? r.mode : prev.mode,
    apps,
    actions,
  }
}

/** Ứng dụng bị chặn cứng: cài đặt hệ thống, kho mật khẩu, dòng lệnh, trình cài đặt. */
export const BLOCKED_APPS: readonly { name: string; ids: readonly string[]; names: readonly string[] }[] = [
  {
    name: 'Cài đặt hệ thống',
    ids: ['com.apple.systempreferences', 'com.apple.settings', 'com.apple.preferences'],
    names: [
      'system settings',
      'system preferences',
      'cài đặt hệ thống',
      'tùy chọn hệ thống',
      'tuỳ chọn hệ thống',
    ],
  },
  {
    name: 'Keychain Access',
    ids: ['com.apple.keychainaccess'],
    names: ['keychain access', 'truy cập chuỗi khóa', 'truy cập chuỗi khoá'],
  },
  { name: 'Mật khẩu', ids: ['com.apple.passwords'], names: ['passwords', 'mật khẩu'] },
  { name: '1Password', ids: ['com.1password.1password', 'com.agilebits.onepassword7'], names: ['1password'] },
  { name: 'Bitwarden', ids: ['com.bitwarden.desktop'], names: ['bitwarden'] },
  { name: 'Terminal', ids: ['com.apple.terminal'], names: ['terminal', 'thiết bị đầu cuối'] },
  { name: 'iTerm', ids: ['com.googlecode.iterm2'], names: ['iterm', 'iterm2'] },
  { name: 'Trình cài đặt', ids: ['com.apple.installer'], names: ['installer', 'trình cài đặt'] },
]

const low = (s: string | undefined) => (s ?? '').trim().toLowerCase()

/** Ứng dụng có nằm trong danh sách chặn cứng không; trả tên hiển thị. */
export function blockedApp(app: {
  name?: string | undefined
  bundleId?: string | undefined
}): string | undefined {
  const id = low(app.bundleId)
  const name = low(app.name).replace(/\.app$/, '')
  return BLOCKED_APPS.find((b) => (id && b.ids.includes(id)) || (name && b.names.includes(name)))?.name
}

/** Ô nhập mật khẩu (phần tử bảo mật). */
export function secureField(e: El | undefined): boolean {
  if (!e) return false
  const role = low(e.role)
  if (/secure/.test(role)) return true
  return (
    /text ?field|textfield|entry|edit|ô nhập/.test(role) &&
    /mật khẩu|password|passcode|mã pin|\bpin\b/.test(low(e.label))
  )
}

/** Phần tử là Thùng rác (kéo vào là xoá). */
export const trashTarget = (e: El | undefined) => !!e && /^(trash|thùng rác|bin)$/.test(low(e.label))

export type Verdict = { what: string; reason: string } | undefined

const deny = (what: string): Verdict => ({
  what,
  reason: `Hàng rào của aris chặn: ${what} nằm trong danh sách cấm cứng khi điều khiển máy (áp cả khi người dùng đã duyệt). Đừng tìm cách khác để làm; báo người dùng nếu việc này thật sự cần, họ sẽ tự làm.`,
})

/** Bối cảnh của một thao tác, đã tra từ lõi (ứng dụng đích, phần tử dưới chỗ bấm…). */
export interface ActContext {
  action: Action
  app?: { name?: string | undefined; bundleId?: string | undefined } | undefined
  /** Phần tử sẽ bấm hay gõ vào. */
  element?: El | undefined
  /** Phần tử ở điểm thả khi kéo. */
  dropOn?: El | undefined
  combo?: Combo | undefined
  locked?: boolean | undefined
}

/** Chặn cứng: ứng dụng nhạy cảm, ô mật khẩu, phím khoá máy/đăng xuất/tắt máy, màn hình khoá, kéo vào Thùng rác. */
export function hardVerdict(c: ActContext): Verdict {
  if (c.locked) return deny('thao tác khi màn hình đang khoá')
  const app = c.app ? blockedApp(c.app) : undefined
  if (app) return deny(`thao tác trong ${app}`)
  if ((c.action === 'go' || c.action === 'bam') && secureField(c.element))
    return deny('gõ hay bấm vào ô mật khẩu')
  if (c.action === 'bam' && trashTarget(c.dropOn)) return deny('kéo thả vào Thùng rác')
  if (c.combo) {
    const d = dangerousCombo(c.combo)
    if (d) return deny(`phím tắt ${d}`)
  }
  return undefined
}

/** Ứng dụng có nằm trong danh sách được phép (so tên hay bundle id). */
export function appAllowed(
  s: Pick<ComputerSettings, 'apps'>,
  app: { name?: string | undefined; bundleId?: string | undefined } | undefined,
): boolean {
  if (!app) return false
  const id = low(app.bundleId)
  const name = low(app.name).replace(/\.app$/, '')
  return s.apps.some((a) => {
    const x = low(a).replace(/\.app$/, '')
    return (id && x === id) || (name && x === name)
  })
}

/** Chế độ trong phạm vi: ngoài phạm vi thì từ chối, không hỏi. `undefined` là được làm. */
export function boundedVerdict(s: ComputerSettings, c: ActContext): Verdict {
  if (!s.actions.includes(c.action))
    return {
      what: `${ACTION_TEXT[c.action]} ngoài phạm vi`,
      reason: `Chế độ "trong phạm vi" của bot này không cho ${ACTION_TEXT[c.action]}. Không hỏi lại, không tìm cách khác; báo người dùng nếu cần đổi phạm vi.`,
    }
  if (!appAllowed(s, c.app)) {
    const name = c.app?.name || c.app?.bundleId || 'ứng dụng chưa rõ'
    return {
      what: `${name} ngoài phạm vi`,
      reason: `${name} không nằm trong danh sách ứng dụng bot được tự làm (${s.apps.join(', ') || 'chưa chọn ứng dụng nào'}). Không hỏi lại, không tìm cách khác; báo người dùng nếu cần thêm ứng dụng.`,
    }
  }
  return undefined
}
