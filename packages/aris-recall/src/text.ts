/**
 * Phần thuần của tìm lại: đọc lời người dùng và lời bot từ sự kiện phiên, dựng prompt tóm
 * tắt có dẫn nguồn, định dạng kết quả cho model.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'

export interface Line {
  seq: number
  role: 'user' | 'assistant'
  text: string
}

/** Một phiên tìm thấy, kèm đoạn trích quanh chỗ khớp. */
export interface Source {
  /** Nhãn trích dẫn: S1, S2… */
  label: string
  sessionId: string
  title: string
  /** Thời điểm của tin khớp, Unix ms. */
  time: number
  /** Tin khớp nhất. */
  seq: number
  lines: Line[]
}

/** Tin dài cắt bớt khi đưa vào prompt tóm tắt. */
export const MAX_LINE_CHARS = 1200

const textOf = (blocks: readonly ContentBlock[]) =>
  blocks
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('\n')
    .trim()

/** Lời người dùng hoặc lời bot trong một sự kiện; undefined với sự kiện khác (tool, nhắc…). */
export function lineOf(event: SessionEvent): Line | undefined {
  if (event.type === 'user/message' && event.data.source.kind === 'user') {
    const text = textOf(event.data.content)
    return text ? { seq: event.seq, role: 'user', text } : undefined
  }
  if (event.type === 'assistant/message') {
    const text = textOf(event.data.message.content)
    return text ? { seq: event.seq, role: 'assistant', text } : undefined
  }
  return undefined
}

export function clip(text: string, max = MAX_LINE_CHARS): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

/** Ngày theo giờ máy, dạng 2026-10-23. */
export function dayOf(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const ROLE = { user: 'Người dùng', assistant: 'Bot' } as const

/** Đoạn trích của một phiên, mỗi tin có nhãn `[S1#12]`. */
export function excerpt(source: Source): string {
  const head = `### ${source.label} · ${source.title} · ${dayOf(source.time)}`
  const body = source.lines.map((l) => `[${source.label}#${l.seq}] ${ROLE[l.role]}: ${clip(l.text)}`)
  return [head, ...body].join('\n')
}

/** Prompt cho model tóm tắt: chỉ dùng đoạn trích, dẫn nguồn từng ý. */
export function summaryPrompt(query: string, sources: readonly Source[]): string {
  return `Bạn giúp một trợ lý nhớ lại các cuộc trò chuyện cũ với người dùng. Câu cần trả lời:
"${query}"

Dưới đây là đoạn trích từ các phiên cũ tìm được. Hãy trả lời câu trên CHỈ dựa vào các đoạn trích:
- Viết ngắn gọn, bằng ngôn ngữ của câu hỏi.
- Sau mỗi ý ghi nguồn đúng dạng [S1#12] (nhãn phiên # số tin) lấy từ đoạn trích.
- Có mốc thời gian thì nêu ngày.
- Đoạn trích không có câu trả lời thì nói rõ là không thấy, đừng đoán.

${sources.map(excerpt).join('\n\n')}`
}

/** Danh sách nguồn cho model: nhãn → tên phiên, ngày, mã phiên (để mở nguyên văn). */
export function sourceList(sources: readonly Source[]): string {
  return sources.map((s) => `${s.label} = "${s.title}" · ${dayOf(s.time)} · phiên ${s.sessionId}`).join('\n')
}

export function formatResult(summary: string, sources: readonly Source[]): string {
  return `${summary.trim()}\n\nNguồn:\n${sourceList(sources)}\nCần nguyên văn: recall action=open session=<mã phiên> seq=<số tin>.`
}

/** Khi model tóm tắt lỗi: trả đoạn trích thô để bot vẫn có cái mà trả lời. */
export function formatRaw(sources: readonly Source[], error: string): string {
  return `(Không tóm tắt được: ${error}. Đây là các đoạn trích.)\n\n${sources.map(excerpt).join('\n\n')}\n\nNguồn:\n${sourceList(sources)}`
}
