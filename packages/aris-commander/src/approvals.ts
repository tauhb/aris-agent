/**
 * Duyệt tập trung (bước 6 của giai đoạn 2; bản vẽ 2.1c, 7.1): mọi yêu cầu quyền của bot (bot ngoài
 * qua `ApprovalHub`, bot trong đội qua `approval/request` của phiên con) về một danh sách. Web (thanh
 * duyệt, thanh bên) và Telegram (thẻ có nút) cùng đọc danh sách này; bấm ở đâu trước thì ăn, nơi
 * khác được báo để cập nhật.
 */
import type { StepKind } from './claude-driver.js'

/** Ai trả lời: web, Telegram, hết hạn, lần chạy kết thúc (hay bị huỷ). */
export type AnsweredBy = 'user' | 'telegram' | 'timeout' | 'ended'

export interface CentralApproval {
  id: string
  /**
   * Bot ngoài (lần chạy CLI), bot trong đội (phiên con), bot điều khiển máy (@aris/computer), hay phiên chính
   * (duyệt bền GĐ9.7a; `run` là `session:<mã phiên>`, hay `orphan:<mã yêu cầu>` khi lượt đã dừng).
   */
  source: 'external' | 'member' | 'computer' | 'session'
  /** Mã lần chạy (bot ngoài) hoặc `member:<phiên con>`. */
  run: string
  bot: string
  name: string
  handle?: string | undefined
  /** Phiên giao việc: thanh duyệt trên ô nhập của phiên này hiện yêu cầu. */
  parentSession?: string | undefined
  kind: StepKind
  /** Lệnh, tệp… (đã rút gọn). */
  target?: string | undefined
  tool?: string | undefined
  reason?: string | undefined
  /** Điều khiển máy: mã lời gọi để lấy ảnh cửa sổ và chỗ đánh dấu (`/api/aris/computer?preview=`). */
  preview?: string | undefined
  at: string
}

export type ApprovalEvent =
  | { type: 'opened'; item: CentralApproval }
  | { type: 'closed'; item: CentralApproval; allow: boolean; by: AnsweredBy }

export class ApprovalCenter {
  private readonly items = new Map<string, CentralApproval>()
  private readonly listeners = new Set<(e: ApprovalEvent) => void>()
  /** Số yêu cầu người dùng đã trả lời (web, Telegram) trong ngày (giờ máy). */
  private answered = { day: '', n: 0 }

  constructor(private readonly now: () => Date = () => new Date()) {}

  open(item: CentralApproval) {
    this.items.set(item.id, item)
    this.emit({ type: 'opened', item })
  }

  close(id: string, allow: boolean, by: AnsweredBy) {
    const item = this.items.get(id)
    if (!item) return
    this.items.delete(id)
    if (by === 'user' || by === 'telegram') {
      const day = this.now().toDateString()
      this.answered = { day, n: (this.answered.day === day ? this.answered.n : 0) + 1 }
    }
    this.emit({ type: 'closed', item, allow, by })
  }

  /** Số yêu cầu người dùng đã trả lời hôm nay (Hộp duyệt: "Đã xử lý hôm nay"). */
  doneToday(): number {
    return this.answered.day === this.now().toDateString() ? this.answered.n : 0
  }

  /** Yêu cầu đang chờ, cũ trước; lọc theo phiên giao việc nếu cần. */
  list(parentSession?: string): CentralApproval[] {
    return [...this.items.values()]
      .filter((i) => !parentSession || i.parentSession === parentSession)
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  /** Nghe yêu cầu mới và yêu cầu đã xong; trả hàm gỡ. */
  on(fn: (e: ApprovalEvent) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: ApprovalEvent) {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch {
        // Người nghe lỗi không làm hỏng việc duyệt.
      }
    }
  }
}

/** Tham số của lần gọi công cụ (chuỗi JSON của dsh) thành đối tượng để mô tả bước. */
export function callInput(args: unknown): unknown {
  if (typeof args !== 'string') return args ?? {}
  try {
    return JSON.parse(args) as unknown
  } catch {
    return { command: args }
  }
}

/** Tên công cụ của dsh (`bash`, `write`…) sang tên kiểu Claude Code mà `stepOf` hiểu. */
export function toolAlias(name: string): string {
  const map: Record<string, string> = {
    bash: 'Bash',
    pwsh: 'PowerShell',
    terminal_open: 'Bash',
    terminal_send: 'Bash',
    write: 'Write',
    edit: 'Edit',
    str_replace_editor: 'Edit',
    read: 'Read',
    web_fetch: 'WebFetch',
    web_search: 'WebSearch',
  }
  return map[name] ?? name
}
