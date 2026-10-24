/**
 * Ngữ cảnh `aris:project`: phiên trong một dự án biết mục tiêu, thành viên, luật. Aris (chủ trì)
 * nhận thêm cách làm việc trong dự án; bot thành viên nhận mục tiêu và đồng đội.
 */
import type { CardRecord, ProjectRecord } from './domain.js'

export interface BotLike {
  id: string
  kind: 'commander' | 'member'
  handle: string
  name: string
  role: string
}

/** Phòng nhóm trong phiên chính: khi nào mở cuộc bàn, điều phối thế nào, luật của dự án. */
function roomGuide(p: ProjectRecord): string[] {
  const r = p.rules
  return [
    'Phòng nhóm (phiên này là phòng chung của dự án, bạn điều phối):',
    '- Người dùng nhắn @all, gọi @tên một hay vài bot, hoặc bảo cả nhóm bàn: mở cuộc bàn bằng moi_noi. Mỗi lần gọi là một vòng; các bot nói lần lượt và nghe được nhau. @all là mọi thành viên; @tên là đúng bot đó. Tin chỉ hỏi bạn (không @ ai, không bảo bàn) thì tự trả lời hoặc giao việc như thường.',
    '- Vòng 1 mời những người được gọi, loi_moi nêu rõ cần bàn gì. Vòng sau chỉ mời ai bị hỏi lại bằng @tên hoặc còn ý trái nhau, loi_moi nêu điểm cần bàn tiếp. Không mời lại khi đã đủ ý.',
    `- Luật: tối đa ${r.maxRounds} vòng và ${r.maxMessages} tin của các bot cho mỗi tin của người dùng; hết thì dừng mời.`,
    '- Người dùng thấy tin của từng bot ngay trong phòng (mỗi bot một tin riêng): đừng chép lại lời bot.',
    r.arisSummarizes
      ? '- Bàn xong: kết luận ngắn (ý chung, chỗ còn khác nhau) và bước tiếp theo.'
      : '- Bàn xong: chỉ nêu bước tiếp theo, không tổng hợp.',
    '- Cần người dùng chọn hướng trước khi chốt: hỏi bằng ask_user_question kèm các lựa chọn, không tự quyết thay.',
    '- Việc cần làm sinh ra từ cuộc bàn: chia thẻ bằng tao_the để lên Kanban của dự án; người dùng chưa chốt thì chưa giao.',
    ...(r.stopCommand
      ? [
          '- Người dùng nhắn "dừng @tên": không mời bot đó nữa tới khi họ gọi lại; "dừng phòng": dừng bàn, tóm tắt ngắn.',
        ]
      : []),
  ]
}

export function renderProject(
  p: ProjectRecord,
  me: BotLike,
  bots: readonly BotLike[],
  path?: string,
  drafts: readonly CardRecord[] = [],
  /** Phiên chính của dự án: phòng nhóm, Aris điều phối cuộc bàn chung. */
  main = false,
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
      '- Việc lớn nhiều phần: chia thành thẻ bằng tao_the (ghi thẻ nào chờ thẻ nào) rồi giao từng thẻ bằng giao_viec với tham số the; thẻ chờ thẻ khác thì giao sau khi thẻ kia xong.',
    )
    if (main) lines.push(...roomGuide(p))
    const pending = drafts.filter((c) => !c.taskId)
    if (pending.length) {
      const bot = (id?: string) => bots.find((b) => b.id === id)
      lines.push(
        `Thẻ người dùng tạo trên Kanban, chờ chia việc (${p.split === 'manual' ? 'chế độ thủ công: chỉ giao khi người dùng bảo' : 'chế độ tự động: giao ở lượt này hoặc lượt tới, bằng giao_viec với the là mã thẻ'}):`,
        ...pending.map(
          (c) =>
            `- ${c.id} «${c.title}»${bot(c.bot) ? ` (người dùng gợi ý @${bot(c.bot)!.handle})` : ''}${c.description ? `: ${c.description}` : ''}`,
        ),
      )
    }
  } else {
    lines.push('Bạn là thành viên dự án: làm phần được giao, bám mục tiêu dự án, cần đồng đội thì nhắn họ.')
  }
  lines.push('</aris-project>')
  return lines.join('\n')
}
