/**
 * Bộ kiểm "bài học, không phải nhật ký" cho skill (đặc tả: docs/specs/aris-skills.md). Thuần.
 * Lỗi thì bỏ đề xuất; cảnh báo thì giữ và hiện cho người dùng.
 */

/** Thân skill tối đa ngần này ký tự. */
export const MAX_BODY = 6000
export const MAX_DESCRIPTION = 300

/** Tên skill: chữ thường không dấu, số, nối bằng `-` (như danh mục skill của dsh). */
export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Bỏ dấu tiếng Việt, viết thường. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase()
}

/** Tên skill hợp lệ từ một câu bất kỳ ("Báo cáo doanh thu tuần" → "bao-cao-doanh-thu-tuan"). */
export function skillName(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
}

export interface SkillDraft {
  name: string
  description: string
  body: string
}

export interface LintResult {
  errors: string[]
  warnings: string[]
}

export function lintSkill(d: SkillDraft): LintResult {
  const errors: string[] = []
  const warnings: string[] = []
  const body = d.body.trim()
  if (!NAME_RE.test(d.name) || d.name.length > 60)
    errors.push('Tên skill chỉ gồm chữ thường không dấu, số và dấu gạch ngang, tối đa 60 ký tự.')
  if (!d.description.trim()) errors.push('Thiếu mô tả: skill dùng khi nào.')
  else if (d.description.length > MAX_DESCRIPTION) errors.push(`Mô tả dài quá ${MAX_DESCRIPTION} ký tự.`)
  if (!body) errors.push('Thân skill rỗng.')
  else if (body.length > MAX_BODY) errors.push(`Thân skill dài quá ${MAX_BODY} ký tự; tách bớt hoặc rút gọn.`)
  const f = fold(body)
  if (
    /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(body) ||
    /\b(hom nay|hom qua|vua roi|lan nay|sang nay|chieu nay)\b/.test(f)
  )
    warnings.push(
      'Có ngày cụ thể hoặc "hôm nay, hôm qua, lần này": skill là cách làm chung, không phải nhật ký một lần.',
    )
  const narrative = (f.match(/\b(bot|em|toi|minh) da \w+|\bda (gui|lam|sua|viet|chay|tao|xong)\b/g) ?? [])
    .length
  const steps = (body.match(/^\s*(\d+[.)]|[-*])\s+/gm) ?? []).length
  if (narrative >= 2 && narrative >= steps / 2)
    warnings.push('Kể lại việc đã làm nhiều hơn chỉ dẫn: viết thành các bước "làm gì, khi nào".')
  if (body && steps === 0) warnings.push('Chưa có các bước (danh sách đánh số hoặc gạch đầu dòng).')
  if (/\b(chu nhan)\b/.test(f) || /(^|[\s,.(])(anh|chị) (muốn|thích|sửa|bảo|dặn)\b/i.test(body))
    warnings.push('Nhắc người dùng bằng "anh, chị, chủ nhân": viết là "người dùng".')
  return { errors, warnings }
}
