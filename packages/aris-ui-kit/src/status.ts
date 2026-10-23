/**
 * Ngữ pháp 5 trạng thái của bot. Mỗi trạng thái có một glyph 16×16 riêng, phân
 * biệt được cả khi không nhìn màu: vòng quay, nửa tròn, dấu tích, tam giác, vòng nét đứt.
 */
export type BotStatus = 'working' | 'waiting' | 'done' | 'failed' | 'idle'

export interface StatusSpec {
  /** Nhãn tiếng Việt hiện cạnh glyph và dùng làm aria-label. */
  label: string
  /** Token màu của trạng thái. */
  color: 'accent' | 'warn' | 'ok' | 'danger' | 'muted'
  /** Nội dung bên trong `<svg viewBox="0 0 16 16">`, tô bằng `currentColor`. */
  body: string
}

export const STATUSES: Record<BotStatus, StatusSpec> = {
  working: {
    label: 'Đang làm',
    color: 'accent',
    body: '<circle cx="8" cy="8" r="6" fill="none" stroke="var(--line)" stroke-width="2.4"/><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  },
  waiting: {
    label: 'Chờ duyệt',
    color: 'warn',
    body: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor"/>',
  },
  done: {
    label: 'Xong',
    color: 'ok',
    body: '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5 8.2l2 2 4-4.2" stroke="var(--panel)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  },
  failed: {
    label: 'Vấp',
    color: 'danger',
    body: '<path d="M8 1.8L15 14H1z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6v3.6" stroke="var(--panel)" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.7" r=".9" fill="var(--panel)"/>',
  },
  idle: {
    label: 'Rảnh',
    color: 'muted',
    body: '<circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray="2.5 2.5"/>',
  },
}

/** SVG hoàn chỉnh của một trạng thái. */
export function statusSvg(status: BotStatus, size = 14): string {
  const s = STATUSES[status]
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" role="img" aria-label="${s.label}" style="color: var(--${s.color})">${s.body}</svg>`
}
