/**
 * Ngữ cảnh `aris:bot`: bot của phiên là ai, tính cách, và đội hình để biết gọi ai. dsh nạp lại
 * mỗi lần dựng prompt nên sửa hồ sơ bot có hiệu lực từ bước kế tiếp.
 */
import type { BotRecord, DepartmentRecord, OwnerRecord } from './domain.js'
import { DEFAULT_POLICY } from './policy.js'

type Owner = Omit<OwnerRecord, 'updatedAt'>

/**
 * Cách xưng hô với người dùng. Không viết cứng "anh", "chị", "chủ nhân": đã biết thì theo hồ sơ;
 * chưa biết thì hỏi một lần rồi lưu bằng tool `xung_ho`.
 */
export function renderAddress(o: Owner): string[] {
  const known = [
    o.name ? `tên ${o.name}` : '',
    o.call ? `gọi người dùng là «${o.call}»` : '',
    o.self ? `tự xưng «${o.self}»` : '',
  ].filter(Boolean)
  const lines = known.length ? [`Người dùng: ${known.join(', ')}.`] : []
  if (!o.call || !o.self)
    lines.push(
      'Chưa biết đủ cách xưng hô với người dùng. Ở câu trả lời đầu tiên của cuộc trò chuyện này, vẫn làm việc được nhờ, rồi hỏi ngắn một lần: người dùng tên gì, muốn được gọi thế nào, và muốn bạn xưng thế nào. Nhận được câu trả lời thì lưu ngay bằng tool xung_ho. Người dùng không muốn trả lời thì thôi, đừng hỏi lại. Trong lúc chưa biết, dùng cách gọi trung tính hợp với ngôn ngữ người dùng đang viết.',
    )
  return lines
}

export function renderPersona(
  me: BotRecord,
  team: readonly BotRecord[],
  departments: readonly DepartmentRecord[],
  owner: Owner = {},
): string {
  const dept = (id?: string) => departments.find((d) => d.id === id)
  const lines = [
    '<aris-bot>',
    me.kind === 'commander'
      ? `Bạn là ${me.name} (@${me.handle}), chỉ huy đội bot của người dùng.`
      : `Bạn là ${me.name} (@${me.handle}), ${me.role ? `phụ trách ${me.role.toLowerCase()}` : 'thành viên'} trong đội bot của người dùng${dept(me.department) ? `, phòng ${dept(me.department)!.name}` : ''}.`,
  ]
  if (me.description) lines.push(`Việc của bạn: ${me.description}`)
  if (me.soul) lines.push(`Tính cách và cách làm việc: ${me.soul}`)
  lines.push(...renderAddress(owner))
  if (me.kind === 'member') {
    // Quyền theo chính sách phòng: nói trước để bot không thử công cụ bị chặn.
    const p = dept(me.department)?.policy ?? DEFAULT_POLICY
    const off = [
      !p.web && 'tìm và đọc web',
      !p.write && 'ghi, sửa tệp',
      !p.shell && 'chạy lệnh terminal',
    ].filter(Boolean)
    if (off.length)
      lines.push(
        `Quyền của bạn (${dept(me.department) ? `chính sách phòng ${dept(me.department)!.name}` : 'bot chưa xếp phòng'}): không được ${off.join(', ')}. Việc cần các quyền đó thì báo người giao việc hoặc nhờ đồng đội có quyền.`,
      )
  }
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
  // Phòng ban và việc phòng lo, để người chỉ huy xếp việc lớn đúng phòng.
  const used = departments.filter((d) => team.some((b) => b.department === d.id))
  if (used.length) {
    lines.push('', 'Phòng ban:')
    for (const d of used) {
      const lead = team.find((b) => b.id === d.lead)
      lines.push(
        `- ${d.name}${d.about ? `: ${d.about}` : ''}${lead ? ` (trưởng nhóm @${lead.handle})` : ' (chưa có trưởng nhóm)'}`,
      )
    }
  }
  lines.push('</aris-bot>')
  return lines.join('\n')
}
