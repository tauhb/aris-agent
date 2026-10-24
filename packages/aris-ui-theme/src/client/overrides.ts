/**
 * CSS chỉnh vài mảnh của dsh mà token không với tới: bong bóng tin nhắn của chủ
 * nhân (nền mực như màn R3; cả tin `/goal` và câu trả lời cho câu hỏi của bot, dsh vẽ
 * bằng bong bóng riêng cùng nền nên cũng phải đổi màu chữ) và thẻ duyệt trong ô nhập (nền cam nhạt như thẻ
 * "đợi anh gật đầu" của canvas). Tên lớp là lớp đã băm của dsh bản đang ghim;
 * `overrides.test.ts` kiểm tra chúng còn tồn tại mỗi khi nâng dsh.
 */
import { THEMES } from '@aris/ui-kit'

/** Lớp của dsh mà CSS dưới đây bám vào, theo gói. */
export const DSH_CLASSES = {
  '@deepseek-ai/dsh-client-ui-chat': ['Sixlwa_bubble'],
  '@deepseek-ai/dsh-client-ui-goal': ['oRe1gG_bubble'],
  '@deepseek-ai/dsh-client-ui-user-questions': ['ROF66W_bubble'],
  '@deepseek-ai/dsh-client-ui-approval': [
    'mna1RW_card',
    'mna1RW_strip',
    'mna1RW_body',
    'mna1RW_headline',
    'mna1RW_actionRow',
  ],
} as const

export const OVERRIDES_CSS = `
body :is(.Sixlwa_bubble,.oRe1gG_bubble,.ROF66W_bubble){color:${THEMES.light.panel};border-radius:18px 18px 6px 18px;padding:10px 14px}
body[data-ds-dark-theme] :is(.Sixlwa_bubble,.oRe1gG_bubble,.ROF66W_bubble){color:${THEMES.dark.panel}}
body .mna1RW_card{border:0;border-radius:14px;background:var(--dsw-alias-state-warn-tertiary);box-shadow:none}
body .mna1RW_strip{background:transparent;font-weight:600;padding:12px 16px 0}
body .mna1RW_body{padding:6px 16px 0}
body .mna1RW_headline{font-size:14px}
body .mna1RW_actionRow{flex-direction:row-reverse;justify-content:flex-end;padding:12px 16px 14px}
`
