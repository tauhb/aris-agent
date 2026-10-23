/**
 * Linh vật phong cách Grokbot: một khối màu phẳng, đúng hai mắt trắng, không
 * miệng hay phụ kiện. Chỉ dùng cho bot (không dùng cho nút đồ thị).
 */
import { MASCOTS } from './mascots.generated.js'

export interface Mascot {
  /** Mã ổn định; 6 linh vật đang dùng mang tên bot (aris, lam, mai, tin, dev, ha). */
  id: string
  /** Tên dáng, ví dụ "Sao bốn cánh". */
  shape: string
  /** Vai gợi ý khi tạo bot. */
  role: string
  /** Mã trong thư viện thiết kế (A1…B8), rỗng với dáng mới. */
  code: string
  /** Đang gắn với một bot trong đội mẫu. */
  inUse: boolean
  /** Màu chủ đạo của khối. */
  color: string
  /** Nội dung bên trong `<svg viewBox="0 0 100 100">`. */
  body: string
}

export { MASCOTS }

export function getMascot(id: string): Mascot | undefined {
  return MASCOTS.find((m) => m.id === id)
}

/** SVG hoàn chỉnh của một linh vật; `label` rỗng thì ẩn với trình đọc màn hình. */
export function mascotSvg(id: string, size = 32, label = ''): string {
  const m = getMascot(id)
  if (!m) throw new Error(`không có linh vật "${id}"`)
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" ${a11y}>${m.body}</svg>`
}
