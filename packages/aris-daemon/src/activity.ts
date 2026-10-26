/**
 * Hoạt động của phiên giao qua `/ask` (lệnh `aris ask`, script cron): ghi "nhận việc" vào việc gần đây của bot để cột "Vừa làm gì"
 * ở Văn phòng không trống. Bắt đầu và xong do `@aris/bots` tự ghi từ sự kiện lượt của phiên (có việc gắn với phiên là ghi),
 * nên ở đây chỉ gắn việc cho phiên. Dùng kiểu tối thiểu thay vì nhập `@aris/bots` để gói này không phụ thuộc thêm.
 */

/** Phần của `arisBots` mà socket cần. */
export interface ActivitySink {
  botOf(sessionId: string): { id: string }
  live: { assigned(bot: string, task: string, sessionId?: string): void }
}

const MAX_TITLE = 80

/** Một dòng gọn làm tên việc: dòng đầu có chữ của câu giao việc, gom khoảng trắng, cắt ở 80 ký tự. */
export function askTitle(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? ''
  const chars = [...line]
  return chars.length > MAX_TITLE ? `${chars.slice(0, MAX_TITLE - 1).join('')}…` : line
}

/**
 * Ghi "nhận việc" cho phiên `/ask` và gắn việc với phiên (để "bắt đầu" và "xong" cũng được ghi). Không có dịch vụ bot
 * (profile không nạp `@aris/bots`) hay lỗi khi ghi thì bỏ qua: ghi hoạt động không được làm hỏng việc giao.
 */
export function trackAsk(sink: ActivitySink | undefined, sessionId: string, text: string): void {
  if (!sink) return
  const title = askTitle(text)
  if (!title) return
  try {
    sink.live.assigned(sink.botOf(sessionId).id, title, sessionId)
  } catch {
    /* ghi hoạt động chỉ để hiển thị */
  }
}
