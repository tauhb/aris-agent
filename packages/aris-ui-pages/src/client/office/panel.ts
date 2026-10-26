/**
 * Trạng thái của cột phải Văn phòng: nhật ký "Vừa làm gì" hay bảng chat với một bot (kèm phiên đang xem). Lưu `view` và bot
 * cuối vào `localStorage` để mở lại trang vẫn ở đúng chỗ; phiên không lưu (phiên đang chạy hay gần nhất sẽ tự được chọn).
 */

export type Panel = { view: 'feed' } | { view: 'chat'; bot: string; session?: string | undefined }

export const PANEL_KEY = 'aris.office.panel'

export const FEED_PANEL: Panel = { view: 'feed' }

/** Đọc trạng thái đã lưu; hỏng hay lạ thì về nhật ký. */
export function parsePanel(raw: string | null): Panel {
  if (!raw) return FEED_PANEL
  try {
    const v = JSON.parse(raw) as { view?: unknown; bot?: unknown }
    if (v.view === 'chat' && typeof v.bot === 'string' && v.bot && v.bot.length <= 200)
      return { view: 'chat', bot: v.bot }
  } catch {
    /* hỏng thì về nhật ký */
  }
  return FEED_PANEL
}

/** Dạng lưu: chỉ `view` và bot, không lưu phiên. */
export const panelJson = (p: Panel): string =>
  JSON.stringify(p.view === 'chat' ? { view: 'chat', bot: p.bot } : { view: 'feed' })

export function loadPanel(): Panel {
  try {
    return parsePanel(localStorage.getItem(PANEL_KEY))
  } catch {
    return FEED_PANEL
  }
}

export function savePanel(p: Panel): void {
  try {
    localStorage.setItem(PANEL_KEY, panelJson(p))
  } catch {
    /* trình duyệt chặn lưu: lần sau mở lại nhật ký */
  }
}
