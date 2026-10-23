/**
 * Bảng ghi đè token `--dsw-*` của dsh bằng màu aris (`@aris/ui-kit`). Mỗi token có
 * giá trị cho cả sáng và tối, theo yêu cầu của `ctx.theme.overrideTokens`.
 * Thang xanh `static-deepseek-*` được thay bằng thang xanh nhấn của aris để mọi
 * chỗ dsh dùng màu thương hiệu đổi theo.
 */
import { FONTS, THEMES } from '@aris/ui-kit'

export interface TokenModes {
  light: string
  dark: string
}

const L = THEMES.light
const D = THEMES.dark
const pair = (light: string, dark: string): TokenModes => ({ light, dark })
const same = (v: string): TokenModes => ({ light: v, dark: v })
/** Lấy cùng một khoá token của aris cho hai giao diện. */
const k = (key: keyof typeof L): TokenModes => pair(L[key], D[key])

/** Thang xanh nhấn của aris, thay thang `static-deepseek-*`. */
const ACCENT_SCALE: Record<string, string> = {
  '50': '#F1F6FE',
  '100': '#E6F0FE',
  '200': '#CFE1FC',
  '300': '#A9C9F8',
  '400': '#5AA5FF',
  '450': '#3B8AF0',
  '500': '#1D6FE0',
  '600': '#1859B8',
  '700-delete': '#164A96',
  '800': '#16263F',
  '900': '#122033',
}

export const ARIS_TOKENS: Record<string, TokenModes> = {
  // Nền và lớp
  '--dsw-alias-bg-base': k('bg'),
  '--dsw-alias-bg-layer-1': k('panel'),
  '--dsw-alias-bg-layer-2': k('panel'),
  '--dsw-alias-bg-layer-3': pair(L.panel, D.panel2),
  '--dsw-alias-bg-module-platform': k('panel2'),
  '--dsw-alias-bg-multi-select': k('panel2'),
  '--dsw-alias-bg-overlay': k('hover'),
  '--dsw-alias-bg-document-preview': pair(L.panel2, D.bg),
  '--dsw-alias-bg-skeleton': pair('rgba(22,23,27,.05)', 'rgba(255,255,255,.07)'),
  // Viền: một nét ấm thay cho xám xanh
  '--dsw-alias-border-l1': pair('rgba(22,23,27,.05)', 'rgba(255,255,255,.05)'),
  '--dsw-alias-border-l2': k('line'),
  '--dsw-alias-border-l2-darkmode-thin': k('line'),
  '--dsw-alias-border-l3': pair('#D9D6CF', '#343842'),
  '--dsw-alias-border-l4': pair('#CBC8C0', '#40444F'),
  // Chữ
  '--dsw-alias-label-primary': k('ink'),
  '--dsw-alias-label-primary-dimmed': pair('#2A2C32', '#D9DBE0'),
  '--dsw-alias-label-secondary': k('muted'),
  '--dsw-alias-label-tertiary': pair('#767B86', '#8A909C'),
  '--dsw-alias-label-caption': pair('#9A9EA7', '#6B717D'),
  '--dsw-alias-label-dimmed': pair('#C9C7C1', '#3A3E48'),
  '--dsw-alias-label-primary-inverted': pair(L.panel, D.panel),
  '--dsw-alias-label-primary-foreground': pair(L.panel, D.ink),
  '--dsw-alias-label-primary-bluish': k('ink'),
  '--dsw-alias-menu-icon': pair('#2A2C32', '#D9DBE0'),
  '--dsw-alias-link': k('accent'),
  // Thương hiệu và nút: nút chính màu mực như canvas, nút thông tin màu nhấn
  '--dsw-alias-brand-primary': k('ink'),
  '--dsw-alias-brand-primary-invert': pair(L.panel, D.bg),
  '--dsw-alias-brand-text': k('ink'),
  '--dsw-alias-brand-primary-new-colorprimary-new-color': k('accent'),
  '--dsw-alias-button-primary-fill': k('ink'),
  '--dsw-alias-button-primary-hover': pair('#2E3038', '#FFFFFF'),
  '--dsw-alias-button-primary-dimmed': k('panel2'),
  '--dsw-alias-button-contrast-fill': pair(L.muted, D.ink),
  '--dsw-alias-button-elevated-fill': pair(L.panel, D.panel2),
  '--dsw-alias-button-floating-fill': k('panel'),
  '--dsw-alias-button-floating-hover': k('hover'),
  '--dsw-alias-button-ghost-active-fill': k('panel2'),
  '--dsw-alias-button-ghost-active-hover': k('hover'),
  '--dsw-alias-button-ghost-active-border': pair('#CBC8C0', '#40444F'),
  '--dsw-alias-button-info-fill': k('accent'),
  '--dsw-alias-button-info-hover': pair('#1859B8', '#7CB8FF'),
  // Tương tác
  '--dsw-alias-interactive-bg-hover': pair('rgba(22,23,27,.05)', 'rgba(255,255,255,.06)'),
  '--dsw-alias-interactive-bg-hover-solid': k('hover'),
  '--dsw-alias-interactive-bg-active': pair('rgba(22,23,27,.09)', 'rgba(255,255,255,.11)'),
  '--dsw-alias-interactive-bg-hover-accent': pair('rgba(29,111,224,.12)', 'rgba(90,165,255,.18)'),
  // Trạng thái theo 5 trạng thái của aris
  '--dsw-alias-state-business-primary': k('accent'),
  '--dsw-alias-state-business-tertiary': k('accentSoft'),
  '--dsw-alias-state-success-primary': k('ok'),
  '--dsw-alias-state-success-secondary': k('ok'),
  '--dsw-alias-state-success-tertiary': k('okSoft'),
  '--dsw-alias-state-warn-primary': k('warn'),
  '--dsw-alias-state-warn-secondary': k('warn'),
  '--dsw-alias-state-warn-label': k('warn'),
  '--dsw-alias-state-warn-tertiary': k('warnSoft'),
  '--dsw-alias-state-error-primary': k('danger'),
  '--dsw-alias-state-error-secondary': k('danger'),
  // Ô nhập, bong bóng tin nhắn, thanh bên, menu, gợi ý
  '--dsw-specific-input-major': k('panel'),
  '--dsw-specific-login-input': k('panel2'),
  '--dsw-specific-bubble': k('panel2'),
  '--dsw-specific-bubble-highlight': k('accentSoft'),
  '--dsw-specific-sidebar-fill': k('panel'),
  '--dsw-specific-sidebar-nav-item-active': k('accentSoft'),
  '--dsw-specific-sidebar-nav-item-active-accent': k('accentSoft'),
  '--dsw-specific-sidebar-nav-item-hover': k('hover'),
  '--dsw-specific-selector': k('panel2'),
  '--dsw-specific-tip': k('panel2'),
  '--dsw-menu-surface-fill': pair('rgba(255,255,255,.92)', 'rgba(30,33,39,.92)'),
  '--dsw-alias-menu-group-header-fill': pair('rgba(246,245,242,.96)', 'rgba(23,25,30,.96)'),
  '--dsw-specific-menu': pair('rgba(255,255,255,.92)', 'rgba(30,33,39,.92)'),
  '--dsw-alias-tooltip-bg': pair('#16171B', '#2A2D35'),
  '--dsw-alias-toast-bg': pair('#16171B', '#2A2D35'),
  '--dsw-alias-toast-label': same('#FFFFFF'),
  '--dsw-alias-switch-thumb': pair('#FFFFFF', '#D9DBE0'),
  // Markdown và mã
  '--dsw-alias-markdown-code-block': k('panel2'),
  '--dsw-alias-markdown-code-block-banner': k('panel2'),
  '--dsw-alias-markdown-inline-code': k('panel2'),
  '--dsw-alias-markdown-citation': k('panel2'),
  '--dsw-alias-markdown-tag': k('panel2'),
  '--dsw-alias-markdown-placeholder': k('panel2'),
  '--dsw-alias-markdown-code-segment-selected': k('panel'),
  '--dsw-alias-markdown-code-segment-unselected': k('panel2'),
  // Thanh cuộn
  '--dsw-alias-scrollbar-bg-l1': pair('#DEDBD4', '#2E323A'),
  '--dsw-alias-scrollbar-bg-l2': pair('#DEDBD4', '#2E323A'),
  '--dsw-alias-scrollbar-hover-l1': pair('#C9C6BE', '#3C414B'),
  '--dsw-alias-scrollbar-hover-l2': pair('#C9C6BE', '#3C414B'),
  // Phông: mặc định của aris; người dùng vẫn đổi được trong Cài đặt
  '--dsh-font-family-text-default': same(
    `${FONTS.body.replace(', sans-serif', '')}, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`,
  ),
  '--dsh-font-family-code-default': same(
    `${FONTS.mono.replace(', monospace', '')}, "SF Mono", Menlo, Consolas, monospace`,
  ),
  '--dsw-font-family-brand': same(FONTS.heading),
}

for (const [step, value] of Object.entries(ACCENT_SCALE)) {
  ARIS_TOKENS[`--dsw-static-deepseek-${step}`] =
    step === '400' || step === '450' ? same(value) : pair(value, value)
}
