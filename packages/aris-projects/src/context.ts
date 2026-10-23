/**
 * Ngữ cảnh `aris:project`: phiên trong một dự án biết mục tiêu, thành viên, luật. Aris (chủ trì)
 * nhận thêm cách làm việc trong dự án; bot thành viên nhận mục tiêu và đồng đội.
 */
import type { ProjectRecord } from './domain.js'

export interface BotLike {
  id: string
  kind: 'commander' | 'member'
  handle: string
  name: string
  role: string
}

export function renderProject(
  p: ProjectRecord,
  me: BotLike,
  bots: readonly BotLike[],
  path?: string,
): string {
  const members = p.members.flatMap((id) => {
    const b = bots.find((x) => x.id === id)
    return b ? [b] : []
  })
  const lines = ['<aris-project>', `Phiên này thuộc dự án «${p.name}».`]
  if (path) lines.push(`Thư mục làm việc của dự án: ${path}`)
  if (p.goal) lines.push(`Mục tiêu: ${p.goal}`)
  lines.push(
    members.length
      ? `Thành viên: Aris chủ trì; ${members.map((b) => `@${b.handle} (${b.name}, ${b.role || 'thành viên'})`).join('; ')}.`
      : 'Thành viên: chỉ có Aris; chưa thêm bot nào vào dự án.',
  )
  if (me.kind === 'commander') {
    lines.push(
      'Cách làm trong dự án:',
      '- Giao việc của dự án cho thành viên dự án trước. Cần bot ngoài dự án thì hỏi người dùng trước khi giao, hoặc đề nghị thêm bot đó vào dự án.',
      '- Mọi việc giao trong phiên chính của dự án là thẻ trên bảng việc chung của dự án; ghi tiêu đề thẻ ngắn, rõ.',
      `- Luật trò chuyện: tối đa ${p.rules.maxRounds} vòng cho mỗi tin của người dùng, tối đa ${p.rules.maxMessages} tin của các bot mỗi lượt${p.rules.arisSummarizes ? '; Aris tổng hợp cuối mỗi vòng' : ''}.`,
    )
  } else {
    lines.push('Bạn là thành viên dự án: làm phần được giao, bám mục tiêu dự án, cần đồng đội thì nhắn họ.')
  }
  lines.push('</aris-project>')
  return lines.join('\n')
}
