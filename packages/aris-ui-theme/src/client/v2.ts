/**
 * Giao diện mới GĐ9 (công tắc "Giao diện mới"): biến màu `--g9-*` trên `body.aris-v2`, biến `--a-*` của bộ
 * thành phần đổi sang bảng màu GĐ9, phông Inter đi kèm app (gói `@fontsource-variable/inter`, OFL-1.1, nhúng
 * thẳng vào `lib/client.js` nên không cần mạng), và kiểu thẻ duyệt, thẻ câu hỏi trong chat theo bản vẽ V3, V9:
 * thẻ bo 18 px, viền cam nhẹ khi chờ duyệt, nút dạng viên, lựa chọn của câu hỏi thành hàng nút viên.
 *
 * Như `overrides.ts`, CSS chỉ bám đuôi tên lớp của dsh (`[class*="_card"]`), không ghi phần băm.
 */
import { G9_FONT, G9_THEMES, g9Vars } from '@aris/ui-kit'
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
import interVietnamese from '@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2'

/** Lớp gắn lên `<body>` khi bật giao diện mới; mọi CSS GĐ9 nằm dưới lớp này. */
export const V2_CLASS = 'aris-v2'

/** Dải ký tự của hai tệp phông, chép từ `@fontsource-variable/inter/wght.css`. */
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const VIETNAMESE =
  'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB'

const face = (src: string, range: string) =>
  `@font-face{font-family:'Inter Variable';font-style:normal;font-display:swap;font-weight:100 900;src:url(${src}) format('woff2-variations');unicode-range:${range}}`

/** Biến `--a-*` của bộ thành phần lấy theo bảng màu GĐ9 (cùng khoá với bảng cũ). */
const kitVars = (theme: 'light' | 'dark') => {
  const g = G9_THEMES[theme]
  const keys = [
    'bg',
    'panel',
    'panel2',
    'hover',
    'ink',
    'muted',
    'line',
    'accent',
    'accentSoft',
    'ok',
    'okSoft',
    'warn',
    'warnSoft',
    'danger',
    'dangerSoft',
  ] as const
  return keys.map((k) => `--a-${k}:${g[k]}`).join(';')
}

const B = `body.${V2_CLASS}`
const DARK = `body.${V2_CLASS}[data-ds-dark-theme]`
/** Thẻ duyệt của dsh: gốc `[data-approval-key]`, thẻ là con trực tiếp. */
const APPROVAL = '[data-approval-key]>[class*="_card"]'

/** Toàn bộ CSS của giao diện mới. */
export const V2_CSS = `
${face(interLatin, LATIN)}
${face(interVietnamese, VIETNAMESE)}
${B}{${g9Vars('light')}font-family:${G9_FONT};font-feature-settings:'cv11' 1}
${DARK}{${g9Vars('dark')}}
${B} .aris{${kitVars('light')};font-family:${G9_FONT}}
${DARK} .aris{${kitVars('dark')}}
${B} header:has(>[data-conversation-header-leading]){position:relative}
${B} [data-conversation-header-leading]~* [class*="_crumbs"]{display:none}
${B} [data-conversation-header-leading]~* [class*="_headerActions"]{margin-left:auto}
${B} [class*="_bubble"]{color:var(--g9-ink);background:var(--g9-ubub);border-radius:18px;padding:11px 15px}
${DARK} [class*="_bubble"]{color:var(--g9-ink)}
${B} ${APPROVAL}{border-radius:18px;background:var(--g9-bub);box-shadow:inset 0 0 0 1px var(--g9-warnline)}
${B} ${APPROVAL}>[class*="_strip"]{color:var(--g9-warn);font-size:12.5px;font-weight:600;padding:14px 16px 0}
${B} [data-approval-scroll]>[class*="_headline"]{font-size:15px;font-weight:600}
${B} ${APPROVAL}>[class*="_actionRow"] button{border-radius:999px;min-height:36px;padding:0 16px;white-space:nowrap}
${B} [class*="_options"]:has(>button[class*="_option"]){flex-direction:row;flex-wrap:wrap;gap:8px;padding:6px 16px 4px}
${B} [class*="_options"]>button[class*="_option"]{width:auto;min-height:36px;align-items:center;border-radius:999px;background:var(--g9-pill);border-color:transparent;padding:6px 16px}
${B} [class*="_options"]>button[class*="_option"] [class*="_number"]{display:none}
${B} [class*="_options"]>button[class*="_optionSelected"]{background:var(--g9-ink);color:var(--g9-inv)}
${B} [class*="_options"]>button[class*="_optionSelected"] *{color:inherit}
`
