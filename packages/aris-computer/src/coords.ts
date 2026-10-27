/**
 * Đổi toạ độ giữa màn hình (điểm) và ảnh chụp cửa sổ (điểm ảnh). Ảnh chụp có thể là Retina (2 điểm ảnh mỗi điểm) rồi
 * bị thu nhỏ theo cạnh dài; cửa sổ ở màn hình phụ có toạ độ âm hay lớn hơn màn hình chính. Thuần.
 */
import type { El, Point, Rect } from './types.js'

/** Tỉ lệ điểm ảnh của ảnh chụp trên mỗi điểm màn hình (theo chiều ngang và dọc). */
export function shotScale(
  bounds: Rect,
  image: { width: number; height: number },
): { sx: number; sy: number } {
  return {
    sx: bounds.width > 0 ? image.width / bounds.width : 1,
    sy: bounds.height > 0 ? image.height / bounds.height : 1,
  }
}

/** Khung theo toạ độ màn hình → khung trên ảnh chụp cửa sổ. */
export function screenToShot(r: Rect, bounds: Rect, image: { width: number; height: number }): Rect {
  const { sx, sy } = shotScale(bounds, image)
  return {
    x: Math.round((r.x - bounds.x) * sx),
    y: Math.round((r.y - bounds.y) * sy),
    width: Math.round(r.width * sx),
    height: Math.round(r.height * sy),
  }
}

/** Điểm trên ảnh chụp cửa sổ → điểm màn hình. */
export function shotToScreen(p: Point, bounds: Rect, image: { width: number; height: number }): Point {
  const { sx, sy } = shotScale(bounds, image)
  return { x: bounds.x + p.x / sx, y: bounds.y + p.y / sy }
}

/** Điểm có nằm trong ảnh chụp không. */
export const insideImage = (p: Point, image: { width: number; height: number }) =>
  p.x >= 0 && p.y >= 0 && p.x < image.width && p.y < image.height

const contains = (r: Rect, p: Point) =>
  p.x >= r.x && p.y >= r.y && p.x < r.x + r.width && p.y < r.y + r.height

/** Phần tử nhỏ nhất chứa điểm (trên ảnh chụp): để biết bot sắp bấm vào cái gì. */
export function elementAt(elements: readonly El[], p: Point): El | undefined {
  let best: El | undefined
  for (const e of elements) {
    if (!e.box || !contains(e.box, p)) continue
    if (!best || e.box.width * e.box.height < best.box!.width * best.box!.height) best = e
  }
  return best
}

/** Tâm khung. */
export const center = (r: Rect): Point => ({
  x: Math.round(r.x + r.width / 2),
  y: Math.round(r.y + r.height / 2),
})
