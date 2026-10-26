/**
 * Gửi tin vào một phiên từ Văn phòng (`/api/aris/commander`, thao tác `session-send`): đúng cách Telegram và Lark gửi tin vào
 * phiên của bot (`@aris/channels`). Bot đang chạy và chọn "Chèn vào việc" thì chen vào lượt đang chạy (`steer`); còn lại xếp
 * hàng làm tiếp (`followup`), phiên đang rảnh thì chạy luôn. Hàm thuần theo cổng nhận vào; nguồn ở `index.ts`.
 */

/** Tối đa số ký tự một tin gửi từ Văn phòng (như `session-steer`). */
export const SEND_MAX_CHARS = 4000

export type SendMode = 'steer' | 'queue'

/** Agent sống của phiên (dạng tối thiểu dùng ở đây). */
export interface SendAgent {
  readonly status: string
  steer(message: unknown): void
  followup(message: unknown): void
}

export interface SendDeps {
  /** Đã bấm dừng khẩn cấp (`@aris/guard`): không nhận tin mới. */
  stopped(): boolean
  /** Mở agent của phiên (mở lại phiên nguội); không mở được thì `undefined`. */
  agentOf(session: string): Promise<SendAgent | undefined>
  /** Tin người dùng theo định dạng của dsh, như tin gõ trong chat. */
  message(text: string): unknown
  /**
   * Ghi lượt sắp chạy vào "Vừa làm gì" (nhận việc với tên việc là câu gửi; bắt đầu, xong hay vấp do `@aris/bots` tự ghi
   * từ sự kiện lượt). Chỉ gọi khi tin tạo ra một lượt mới.
   */
  track?(session: string, title: string): void
}

const MAX_TITLE = 80

/** Một dòng gọn làm tên việc: dòng đầu có chữ, gom khoảng trắng, cắt ở 80 ký tự (như `askTitle` của `aris ask`). */
export function sendTitle(text: string): string {
  const line =
    text
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? ''
  const chars = [...line]
  return chars.length > MAX_TITLE ? `${chars.slice(0, MAX_TITLE - 1).join('')}…` : line
}

export interface SendResult {
  status: number
  body: { ok: true; mode: 'steer' | 'followup'; running: boolean } | { error: string }
}

/**
 * Kiểm tra rồi gửi. Lỗi: 400 tin trống, quá dài hay chế độ lạ; 423 đã dừng khẩn cấp; 404 không mở được phiên (mã sai, phiên
 * đã xoá, mã lần chạy của bot ngoài vốn không có phiên chat).
 */
export async function sessionSend(
  deps: SendDeps,
  body: { session?: unknown; text?: unknown; mode?: unknown },
): Promise<SendResult> {
  const session = typeof body.session === 'string' ? body.session : ''
  const text = String(body.text ?? '').trim()
  if (!session || session.length > 200 || /[\s/\\]/.test(session))
    return { status: 400, body: { error: 'Mã phiên không hợp lệ.' } }
  if (!text || text.length > SEND_MAX_CHARS)
    return { status: 400, body: { error: 'Tin nhắn trống hoặc quá dài.' } }
  const mode = body.mode === undefined ? 'steer' : body.mode
  if (mode !== 'steer' && mode !== 'queue')
    return { status: 400, body: { error: 'Chế độ gửi không hợp lệ.' } }
  if (deps.stopped()) return { status: 423, body: { error: 'Đã dừng khẩn cấp, chưa nhận việc mới.' } }
  const agent = await deps.agentOf(session).catch(() => undefined)
  if (!agent) return { status: 404, body: { error: 'Không mở được phiên này.' } }
  const message = deps.message(text)
  const running = agent.status === 'running'
  if (running && mode === 'steer') {
    agent.steer(message)
    return { status: 200, body: { ok: true, mode: 'steer', running } }
  }
  // Tin tạo lượt mới (phiên rảnh) thì ghi vào nhật ký; chèn hay xếp sau lúc bot đang chạy không tạo dòng mới.
  if (!running) {
    try {
      deps.track?.(session, sendTitle(text))
    } catch {
      /* ghi hoạt động chỉ để hiển thị, không được làm hỏng việc gửi */
    }
  }
  agent.followup(message)
  return { status: 200, body: { ok: true, mode: 'followup', running } }
}
