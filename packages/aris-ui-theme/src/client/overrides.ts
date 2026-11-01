/**
 * CSS chỉnh vài mảnh của dsh mà token không với tới: bong bóng tin nhắn của chủ
 * nhân (nền mực như màn R3; cả tin `/goal` và câu trả lời cho câu hỏi của bot, dsh vẽ
 * bằng bong bóng riêng cùng nền nên cũng phải đổi màu chữ) và thẻ duyệt trong ô nhập (nền cam nhạt như thẻ
 * "đợi anh gật đầu" của canvas).
 *
 * Tên lớp của dsh có phần băm phía trước (`Sixlwa_bubble`), mà phần băm phụ thuộc đường dẫn lúc build dsh,
 * nên build lại dsh là tên đổi hết (xem docs/spikes/dsh-build-tu-nguon.md). CSS ở đây vì vậy không ghi phần
 * băm: chỉ bám phần đuôi tên cục bộ (`[class*="_bubble"]`) và, với thẻ duyệt, bám thêm thuộc tính
 * `data-approval-*` mà dsh gắn cố định vào DOM. `brand.test.ts` kiểm các điểm bám này còn đủ và còn duy nhất
 * mỗi khi nâng dsh.
 *
 * Thêm biến `--acc-edge` cho phụ kiện linh vật (`@aris/ui-kit`, `accessories.ts`): viền mảnh để phụ kiện màu tối
 * (tai nghe, mũ tốt nghiệp, máy tính) không chìm vào nền tối. Nền sáng thì trong suốt.
 */
import { THEMES } from '@aris/ui-kit'

/** Các thuộc tính và đuôi tên lớp mà CSS dưới đây bám vào, theo gói client của dsh. */
export const DSH_ANCHORS = {
  /** Mỗi đuôi `_bubble` chỉ có đúng ba lớp trong toàn bộ CSS client của dsh, ở ba gói này. */
  bubble: {
    suffix: '_bubble',
    packages: [
      '@deepseek-ai/dsh-client-ui-chat',
      '@deepseek-ai/dsh-client-ui-goal',
      '@deepseek-ai/dsh-client-ui-user-questions',
    ],
  },
  /** Thẻ duyệt: gốc có `data-approval-key`, thân có `data-approval-scroll`; các đuôi còn lại giới hạn theo gốc. */
  approval: {
    package: '@deepseek-ai/dsh-client-ui-approval',
    attributes: ['data-approval-key', 'data-approval-scroll'],
    suffixes: ['_card', '_strip', '_headline', '_actionRow'],
  },
} as const

/** Thẻ duyệt: gốc `[data-approval-key]`, thẻ là con trực tiếp của gốc. */
const CARD = '[data-approval-key]>[class*="_card"]'

export const OVERRIDES_CSS = `
:root{--acc-edge:transparent}
body[data-ds-dark-theme]{--acc-edge:rgba(255,255,255,.45)}
body [class*="_bubble"]{color:${THEMES.light.panel};border-radius:18px 18px 6px 18px;padding:10px 14px}
body[data-ds-dark-theme] [class*="_bubble"]{color:${THEMES.dark.panel}}
body ${CARD}{border:0;border-radius:14px;background:var(--dsw-alias-state-warn-tertiary);box-shadow:none}
body ${CARD}>[class*="_strip"]{background:transparent;font-weight:600;padding:12px 16px 0}
body [data-approval-scroll]{padding:6px 16px 0}
body [data-approval-scroll]>[class*="_headline"]{font-size:14px}
body ${CARD}>[class*="_actionRow"]{flex-direction:row-reverse;justify-content:flex-end;padding:12px 16px 14px}
`
