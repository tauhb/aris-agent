import { FONTS } from '@aris/ui-kit'

/**
 * CSS riêng của đầu khung chat: hàng ngang tên bot và dấu "/" trước tên phiên.
 * Nút, menu, pill lấy từ bộ thành phần (`KIT_CSS` của `@aris/ui-kit/react`).
 */
export const CSS = `
.aris-ch{display:inline-flex;align-items:center;gap:8px;font-size:14px;white-space:nowrap}
.aris-ch .botName{font-family:${FONTS.heading};font-weight:600;font-size:15px}
.aris-ch .stack{display:inline-flex}
.aris-ch .stack>*{margin-left:-7px;border-radius:50%;box-shadow:0 0 0 2px var(--a-bg)}
.aris-ch .stack>*:first-child{margin-left:0}
.aris-ch .members{color:var(--a-muted);font-size:12.5px}
.aris-ch .slash{color:var(--a-muted);font-size:16px;padding:0 2px}
[data-conversation-header-leading]:not(:has(+ * nav)) .aris-ch .slash{display:none}
`
