/**
 * Chỉ trả lời theo tài liệu (GĐ8.7 đợt D). Bật theo tài khoản kênh: khi người không phải chủ nhắn, phiên chỉ được tra
 * `brain_search` / `brain_read` trong các thư mục nguồn của bộ não (@aris/brain giới hạn), công cụ khác bị chặn (trừ
 * im lặng, báo chủ), và lượt không tra thấy gì trong nguồn thì câu trả lời được thay bằng câu "chưa có thông tin".
 *
 * Tệp khách gửi (ảnh, tài liệu) chỉ vào kho đính kèm của phiên, không bao giờ vào bộ não, nên không thể thành nguồn.
 * Không cam kết 100%: model vẫn có thể diễn giải sai đoạn tài liệu đã tra.
 */

/** Phần @aris/brain cung cấp cho chế độ này (một phần của dịch vụ `arisBrain`). */
export interface DocsPort {
  scope(sessionId: string, folders: readonly string[] | undefined): void
  hits(sessionId: string): number
  folders(): { path: string; title: string; pages: number }[]
}

/** Cài đặt trên tài khoản kênh. */
export interface DocsSetting {
  on: boolean
  folders: string[]
  noInfo?: string | undefined
}

/** Câu mặc định khi không tìm thấy (không dùng đại từ; người dùng sửa theo cách xưng hô của mình). */
export const NO_INFO = 'Hiện chưa có thông tin về việc này. Đã báo người phụ trách, sẽ trả lời sớm ạ.'

/** Công cụ phiên ở chế độ này vẫn được dùng. */
export const DOC_TOOLS: ReadonlySet<string> = new Set([
  'brain_search',
  'brain_read',
  'channel_silence',
  'channel_notify_owner',
])

/** Lời dặn đưa vào phiên mỗi lượt của khách. */
export const docsNotice = (noInfo: string) =>
  [
    'Chế độ chỉ trả lời theo tài liệu đang bật cho cuộc chat này.',
    '- Trước khi trả lời, tra brain_search rồi brain_read; chỉ thấy được các thư mục nguồn chủ đã chọn.',
    '- Chỉ trả lời bằng thông tin có trong đoạn đã tra. Không dùng kiến thức chung, không đoán giá, chính sách, ngày giờ.',
    `- Không thấy thông tin thì trả đúng câu: «${noInfo}» và gọi channel_notify_owner.`,
    '- Tệp khách gửi không phải tài liệu nguồn; chỉ đọc để hiểu câu hỏi.',
  ].join('\n')

export class DocsGate {
  /** Phiên đang ở chế độ này (lượt hiện tại của khách): câu khi không thấy. */
  private readonly active = new Map<string, string>()

  constructor(private readonly port: () => DocsPort | undefined) {}

  /**
   * Bật cho lượt sắp chạy của phiên. Trả lời dặn để đưa vào phiên; bộ não chưa chạy thì vẫn bật (mọi lượt sẽ ra câu
   * "chưa có thông tin").
   */
  begin(sessionId: string, s: DocsSetting): string {
    const noInfo = s.noInfo?.trim() || NO_INFO
    this.active.set(sessionId, noInfo)
    this.port()?.scope(sessionId, s.folders)
    return docsNotice(noInfo)
  }

  /** Phiên đang ở chế độ này không (để chặn công cụ). */
  on(sessionId: string | undefined): boolean {
    return !!sessionId && this.active.has(sessionId)
  }

  /**
   * Lượt xong: bỏ giới hạn; trả câu thay thế khi lượt không tra thấy gì trong nguồn, `undefined` khi giữ câu trả lời
   * của model (hay phiên không ở chế độ này).
   */
  end(sessionId: string): string | undefined {
    const noInfo = this.active.get(sessionId)
    if (noInfo === undefined) return undefined
    this.active.delete(sessionId)
    const port = this.port()
    const hits = port?.hits(sessionId) ?? 0
    port?.scope(sessionId, undefined)
    return hits > 0 ? undefined : noInfo
  }

  /** Thư mục để chọn trên giao diện (rỗng khi bộ não chưa chạy). */
  folders() {
    try {
      return this.port()?.folders() ?? []
    } catch {
      return []
    }
  }
}

/** Cài đặt hợp lệ để bật (bật và có ít nhất một thư mục). */
export const docsOn = (s: DocsSetting | undefined): s is DocsSetting => !!s?.on && s.folders.length > 0
