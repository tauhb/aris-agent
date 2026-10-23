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

/** Phông chữ: Lexend cho tiêu đề, Be Vietnam Pro cho nội dung, JetBrains Mono cho mã. */
export const FONTS = {
  heading: "'Lexend', sans-serif",
  body: "'Be Vietnam Pro', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
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
