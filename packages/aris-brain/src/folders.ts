/**
 * Thư mục của bộ não để chọn làm nguồn "chỉ trả lời theo tài liệu" (GĐ8.7 đợt D). Thuần: từ danh mục trang ra cây thư
 * mục, mỗi thư mục kèm số trang có chữ bên trong (kể cả thư mục con).
 */
import type { Entry } from './catalog.js'

export interface BrainFolder {
  /** Đường dẫn trong kho, dấu `/`, không có `/` ở cuối (ví dụ `cong-ty/wiki/san-pham`). */
  path: string
  /** Tên hiển thị: phần cuối của đường dẫn. */
  title: string
  /** Số trang có chữ trong thư mục. */
  pages: number
}

/** Tối đa bấy nhiêu thư mục (giao diện chỉ là danh sách chọn). */
const MAX_FOLDERS = 300

export function brainFolders(entries: readonly Entry[]): BrainFolder[] {
  const count = new Map<string, number>()
  for (const e of entries) {
    // Trang của người dùng có chữ; bỏ mục lục, mẫu trang (tên bắt đầu bằng `_`).
    if (!e.space || e.binary || e.name.startsWith('_')) continue
    const parts = e.path.split('/').slice(0, -1)
    // Bỏ cấp không gian (`ca-nhan`, `cong-ty`): nguồn phải hẹp hơn cả một không gian.
    for (let i = 2; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      count.set(p, (count.get(p) ?? 0) + 1)
    }
  }
  return [...count]
    .map(([path, pages]) => ({ path, title: path.split('/').at(-1)!, pages }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MAX_FOLDERS)
}
