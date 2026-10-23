/**
 * Ngữ cảnh `aris:bot`: bot của phiên là ai, tính cách, và đội hình để biết gọi ai. dsh nạp lại
 * mỗi lần dựng prompt nên sửa hồ sơ bot có hiệu lực từ bước kế tiếp.
 */
import type { BotRecord, DepartmentRecord } from './domain.js'

export function renderPersona(
  me: BotRecord,
  team: readonly BotRecord[],
  departments: readonly DepartmentRecord[],
): string {
  const dept = (id?: string) => departments.find((d) => d.id === id)
  const lines = [
    '<aris-bot>',
    me.kind === 'commander'
      ? `Bạn là ${me.name} (@${me.handle}), chỉ huy đội bot của chủ nhân.`
      : `Bạn là ${me.name} (@${me.handle}), ${me.role ? `phụ trách ${me.role.toLowerCase()}` : 'thành viên'} trong đội bot của chủ nhân${dept(me.department) ? `, phòng ${dept(me.department)!.name}` : ''}.`,
  ]
  if (me.description) lines.push(`Việc của bạn: ${me.description}`)
  if (me.soul) lines.push(`Tính cách và cách làm việc: ${me.soul}`)
  const others = team.filter((b) => b.id !== me.id)
  if (others.length) {
    lines.push(
      '',
      'Đội hình (nhắc tới đồng đội bằng đúng @tên gọi không dấu dưới đây, ví dụ @' + others[0]!.handle + '):',
    )
    for (const b of others) {
      const d = dept(b.department)
      const lead = d?.lead === b.id ? ', trưởng nhóm' : ''
      lines.push(`- @${b.handle} · ${b.name} · ${b.role || 'thành viên'}${d ? ` (${d.name}${lead})` : ''}`)
    }
  }
  lines.push('</aris-bot>')
  return lines.join('\n')
}
