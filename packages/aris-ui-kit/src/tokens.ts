/** Màu và bóng của hai giao diện sáng/tối, lấy từ canvas thiết kế. */
export const THEMES = {
  light: {
    bg: '#F6F5F2',
    panel: '#FFFFFF',
    panel2: '#F0EFEB',
    hover: '#EAE9E4',
    ink: '#16171B',
    muted: '#5C616C',
    line: '#E4E2DC',
    accent: '#1D6FE0',
    accentSoft: '#E6F0FE',
    ok: '#15803D',
    okSoft: '#E2F3E9',
    warn: '#B45309',
    warnSoft: '#FCEFDF',
    danger: '#C0262D',
    dangerSoft: '#FCEBE9',
  },
  dark: {
    bg: '#0F1013',
    panel: '#17191E',
    panel2: '#1E2127',
    hover: '#252830',
    ink: '#EDEEF1',
    muted: '#9CA3B0',
    line: '#2A2D35',
    accent: '#5AA5FF',
    accentSoft: '#16263F',
    ok: '#4ADE9B',
    okSoft: '#15302A',
    warn: '#F5A35C',
    warnSoft: '#3A2614',
    danger: '#F97066',
    dangerSoft: '#3A1A18',
  },
} as const

export type ThemeName = keyof typeof THEMES
export type Token = keyof (typeof THEMES)['light']

/**
 * Bảng màu giao diện mới GĐ9 (kiểu OpenMausBot), chép từ `design/gd9/gd9.css` (khối `.t-dark`, `.t-light`).
 * Đủ các khoá của {@link THEMES} (để ghi đè token dsh và biến `--a-*` của bộ thành phần) cộng các khoá riêng
 * của bản vẽ: `win` nền cửa sổ và thanh bên, `pane` nền khung chat và khung phải, `card` nhóm dòng, `pill`
 * nút viên, `bub`/`ubub` bong bóng bot/người dùng, `ink2`/`ink3` chữ phụ, `inv` chữ trên nút chính.
 */
export const G9_THEMES = {
  light: {
    bg: '#f1f1f1',
    panel: '#ffffff',
    panel2: '#f5f5f5',
    hover: '#ededed',
    ink: '#111111',
    muted: '#5e5e5e',
    line: '#e6e6e6',
    accent: '#0b62c4',
    accentSoft: '#e3eefb',
    ok: '#15803d',
    okSoft: '#e2f3e9',
    warn: '#9a5b00',
    warnSoft: '#fbefdc',
    danger: '#c02b3a',
    dangerSoft: '#fbe9eb',
    win: '#f1f1f1',
    pane: '#ffffff',
    card: '#f5f5f5',
    card2: '#ffffff',
    pill: '#ededed',
    pill2: '#e4e4e4',
    bub: '#f2f2f2',
    ubub: '#e3e3e3',
    ink2: '#5e5e5e',
    ink3: '#7d7d7d',
    inv: '#ffffff',
    acc: '#0b62c4',
    acc2: '#0b5cb8',
    err: '#c02b3a',
    warnline: '#c9851f66',
    scrim: '#0000004d',
  },
  dark: {
    bg: '#000000',
    panel: '#0e0e0e',
    panel2: '#191919',
    hover: '#232323',
    ink: '#f2f2f2',
    muted: '#a3a3a3',
    line: '#262626',
    accent: '#3b8bff',
    accentSoft: '#0f2342',
    ok: '#4ade9b',
    okSoft: '#15302a',
    warn: '#ff9f1a',
    warnSoft: '#33240e',
    danger: '#ff5c6c',
    dangerSoft: '#3a1a1d',
    win: '#000000',
    pane: '#0e0e0e',
    card: '#191919',
    card2: '#1f1f1f',
    pill: '#232323',
    pill2: '#2c2c2c',
    bub: '#1c1c1c',
    ubub: '#343434',
    ink2: '#a3a3a3',
    ink3: '#7a7a7a',
    inv: '#000000',
    acc: '#3b8bff',
    acc2: '#7fb4ff',
    err: '#ff5c6c',
    warnline: '#ff9f1a59',
    scrim: '#000000a6',
  },
} as const satisfies Record<ThemeName, Record<Token, string> & Record<string, string>>

export type G9Key = keyof (typeof G9_THEMES)['dark']

/** Phông giao diện mới: Inter (gói `@aris/ui-theme` nạp kèm app), thiếu thì phông hệ thống. */
export const G9_FONT = '"Inter Variable", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif'

/** Khai báo biến CSS giao diện mới cho một nền, ví dụ `--g9-win:#000000;--g9-pane:#0e0e0e;…`. */
export const g9Vars = (theme: ThemeName, prefix = '--g9-'): string =>
  Object.entries(G9_THEMES[theme])
    .map(([k, v]) => `${prefix}${k}:${v};`)
    .join('')

/**
 * Phông chữ: dùng đúng bộ phông mặc định của DeepSeek Harness — phông hệ thống của máy
 * (San Francisco trên Mac, Segoe UI trên Windows) cho chữ và tiêu đề, SF Mono cho mã.
 * Không tải phông từ mạng.
 */
const SYSTEM =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'

export const FONTS = {
  heading: SYSTEM,
  body: SYSTEM,
  mono: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  /** Cho vẽ canvas 2D (chỉ nhận tên phông thường gặp). */
  canvas: 'system-ui, -apple-system, "Segoe UI", sans-serif',
} as const

/** Khai báo biến CSS cho một giao diện, ví dụ `--a-bg:#F6F5F2;--a-panel:#FFFFFF…`. */
export function cssVars(theme: ThemeName, prefix = '--'): string {
  return Object.entries(THEMES[theme])
    .map(([k, v]) => `${prefix}${k}:${v}`)
    .join(';')
}

/**
 * CSS cho một khối giao diện aris cắm vào Web UI của dsh: biến màu sáng dưới
 * `selector`, biến màu tối khi theme dsh đặt `data-ds-dark-theme` trên `<body>`.
 */
export function dshScopedVars(selector: string, prefix = '--a-'): string {
  return `${selector}{${cssVars('light', prefix)}}\n[data-ds-dark-theme] ${selector}{${cssVars('dark', prefix)}}`
}

/** CSS khai báo token thành biến `--tên` dưới selector của từng giao diện. */
export function themeCss(
  selectors: Record<ThemeName, string> = { light: '.t-light', dark: '.t-dark' },
): string {
  return (Object.keys(THEMES) as ThemeName[])
    .map((theme) => `${selectors[theme]}{${cssVars(theme)}}`)
    .join('\n')
}
