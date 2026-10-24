/**
 * `/learn` (giai đoạn 3, đợt 6; đặc tả: docs/specs/aris-skills.md): lời nhắc gửi cho bot để tự gom
 * tài liệu bằng công cụ sẵn có rồi viết một skill theo chuẩn của aris, nộp bằng `luu_skill`. Thuần.
 */
import { MAX_BODY, MAX_DESCRIPTION } from './lint.js'

/** Tên công cụ bot dùng để nộp skill vừa học. */
export const LEARN_TOOL = 'luu_skill'

/** Một lượt `/learn` mở cửa cho `luu_skill` tối đa chừng này (bot tự gom tài liệu có thể lâu). */
export const LEARN_WINDOW_MS = 30 * 60_000

/** Số ca thử bot viết kèm skill. */
export const MAX_LEARN_CASES = 3

export function learnPrompt(source: string, existing: readonly string[]): string {
  return [
    `Người dùng gõ /learn: biến nguồn dưới đây thành MỘT skill dùng lại được cho bạn.`,
    ``,
    `Nguồn: ${source}`,
    ``,
    `Cách làm:`,
    `1. Gom tài liệu bằng công cụ bạn đang có: thư mục, tệp thì đọc và tìm trong đó; URL thì đọc trang; quy trình tả bằng lời hay "việc vừa làm trong cuộc này" thì dựa vào lời người dùng và cuộc trò chuyện. Không có cách đọc nguồn thì nói rõ, đừng đoán.`,
    `2. Viết skill theo chuẩn của aris:`,
    `   - Tên: chữ thường không dấu, số, nối bằng "-", tối đa 60 ký tự.${existing.length ? ` Trùng tên một skill đang có (${existing.join(', ')}) thì thành bản vá của skill đó: thân là toàn bộ skill sau khi sửa.` : ''}`,
    `   - Mô tả: một câu, tối đa ${MAX_DESCRIPTION} ký tự, nói skill dùng khi nào.`,
    `   - Thân Markdown, tối đa ${MAX_BODY} ký tự, các mục "## Khi nào dùng", "## Các bước" (đánh số, mỗi bước một việc cụ thể, ghi đúng lệnh, đường dẫn, tham số lấy từ nguồn), "## Lỗi thường gặp", "## Kiểm tra" (cách biết đã làm đúng).`,
    `   - Là cách làm chung, không phải nhật ký: không ghi ngày, không kể "đã làm…", gọi là "người dùng". Không bịa lệnh hay tham số không có trong nguồn.`,
    `3. Gọi công cụ ${LEARN_TOOL} một lần với tên, mô tả, thân và 1–${MAX_LEARN_CASES} yêu cầu mẫu (câu người dùng có thể nhờ mà skill này giúp được; dùng làm ca kiểm thử).`,
    `4. Trả lời ngắn: tên skill, skill giúp việc gì, và skill đang chờ người dùng duyệt ở Hộp duyệt.`,
  ].join('\n')
}
