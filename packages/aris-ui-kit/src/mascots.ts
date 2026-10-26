/**
 * Linh vật phong cách Grokbot: một khối màu phẳng, đúng hai mắt trắng, không
 * miệng. Phụ kiện (mũ, kính…) vẽ riêng ở `accessories.ts`, đeo thêm lên thân. Chỉ dùng
 * cho bot (không dùng cho nút đồ thị).
 */
import { ACCESSORY_VIEWBOX, PLAIN_VIEWBOX, accessoryOf } from './accessories.js'
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
  /** Tính cách chuyển động riêng của dáng (mặc định 1): nhân tốc độ và biên độ. */
  motion?: { speed?: number; amp?: number } | undefined
}

export { MASCOTS }

export function getMascot(id: string): Mascot | undefined {
  return MASCOTS.find((m) => m.id === id)
}

/**
 * SVG hoàn chỉnh của một linh vật; `label` rỗng thì ẩn với trình đọc màn hình. `accessory` theo
 * `resolveAccessory`: bỏ trống là phụ kiện mặc định của dáng, `'none'` là không đeo.
 */
export function mascotSvg(id: string, size = 32, label = '', accessory?: string): string {
  const m = getMascot(id)
  if (!m) throw new Error(`không có linh vật "${id}"`)
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'
  const acc = accessoryOf(id, accessory)
  const viewBox = acc ? ACCESSORY_VIEWBOX : PLAIN_VIEWBOX
  return `<svg width="${size}" height="${size}" viewBox="${viewBox}" ${a11y}>${m.body}${acc ?? ''}</svg>`
}

/** Phần tô hoặc nét trắng: mắt của linh vật. */
export const WHITE = /(fill|stroke)="#(?:fff|ffffff)"/i

/**
 * Gắn `class="eye"` cho mọi phần tử trắng (hoặc nhóm tô trắng) để mắt chớp được. Chạy trên thân SVG
 * nên bộ linh vật nào theo luật "mắt màu trắng" cũng dùng được; phần đã có class thì để nguyên.
 */
export function markEyes(body: string): string {
  return body.replace(
    /<(g|circle|ellipse|rect|path)\b([^>]*?)(\/?)>/g,
    (all, tag: string, attrs: string, end: string) =>
      WHITE.test(attrs) && !/\bclass=/.test(attrs) ? `<${tag} class="eye"${attrs}${end}>` : all,
  )
}

/**
 * Độ lệch nhịp (`--d`, giây, số âm để chuyển động chạy ngay từ giữa nhịp) và hướng lắc (`--dir`)
 * theo một hạt giống, để cả đội không nhún cùng lúc.
 */
export function motionVars(seed: string): { '--d': string; '--dir': 1 | -1 } {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  h >>>= 0
  return { '--d': `-${((h % 240) / 100).toFixed(2)}s`, '--dir': (h >>> 8) % 2 ? 1 : -1 }
}
