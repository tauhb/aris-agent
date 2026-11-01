/**
 * Đồng đội hỏi nhau (GĐ9.5, docs/plans/gd9-5-dong-doi-hoi-nhau.md): bot hỏi ý một đồng đội bằng `ask_teammate`,
 * đồng đội trả lời ở phiên riêng. Phần thuần ở đây (bản ghi việc, giới hạn, câu gửi đồng đội, gom kết quả quay
 * về); nối vào dsh ở `index.ts`.
 */
import { z } from 'zod'

export const taskRecord = z.object({
  id: z.string(),
  /** Gốc: một lượt do chủ bắt đầu (`<phiên>@<lúc bắt đầu lượt>`); giới hạn tính theo gốc. */
  root: z.string(),
  /** Việc cha (câu hỏi mà phiên hỏi đang trả lời), nếu có. */
  parent: z.string().optional(),
  /** 1: bot hỏi từ lượt của chủ; 2: đồng đội đang được hỏi hỏi thêm. */
  depth: z.number().int().min(1),
  from: z.string(),
  fromName: z.string(),
  fromSession: z.string(),
  to: z.string(),
  toName: z.string(),
  toSession: z.string().optional(),
  question: z.string(),
  status: z.enum(['running', 'done', 'failed', 'interrupted']),
  answer: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  /** Lúc kết quả được nhắn về phiên của bot hỏi (khi lượt của bot hỏi đã dừng). */
  returnedAt: z.string().optional(),
})
export type TaskRecord = z.infer<typeof taskRecord>

export const LIMITS = {
  /** Độ sâu tối đa của chuỗi hỏi. */
  depth: 2,
  /** Số câu hỏi tối đa mỗi gốc. */
  perRoot: 6,
  /** Chờ đồng đội trả lời tối đa. */
  waitMs: 5 * 60_000,
  /** Gom các kết quả về cùng một phiên trong ngần này rồi nhắn một lần. */
  batchMs: 3000,
} as const

/** Lý do không được hỏi (chuỗi để trả cho model), hay `undefined` khi được hỏi. */
export function cannotAsk(input: {
  depth: number
  rootCount: number
  trust: 'owner' | 'member' | 'guest' | undefined
  self: string
  target: { id: string; external?: unknown } | undefined
  targetRef: string
}): string | undefined {
  if (input.trust && input.trust !== 'owner')
    return 'Lượt này không phải của chủ (khách hay người khác nhắn qua kênh): không được hỏi đồng đội. Tự trả lời trong phạm vi của bạn, hoặc báo chủ.'
  if (!input.target) return `Không có đồng đội «${input.targetRef}». Xem danh sách đồng đội ở <aris-bot>.`
  if (input.target.id === input.self) return 'Không tự hỏi chính mình.'
  if (input.target.external) return `${input.targetRef} là bot ngoài, không nhận câu hỏi của đồng đội.`
  if (input.depth > LIMITS.depth)
    return `Chuỗi hỏi đã sâu ${LIMITS.depth} tầng: không hỏi thêm. Trả lời bằng những gì bạn biết, nói rõ chỗ chưa chắc.`
  if (input.rootCount >= LIMITS.perRoot)
    return `Lượt này đã hỏi đồng đội ${LIMITS.perRoot} lần: không hỏi thêm. Tổng hợp từ các câu trả lời đã có.`
  return undefined
}

/** Câu gửi vào phiên của đồng đội. */
export function consultMessage(from: string, question: string, context?: string): string {
  return [
    `[Đồng đội ${from} hỏi ý bạn]`,
    question.trim(),
    context?.trim() ? `\nNgữ cảnh ${from} gửi kèm:\n${context.trim()}` : '',
    '\nĐây là câu hỏi ý: chỉ trả lời bằng những gì bạn biết hay tra được (đọc tệp, bộ não, tìm kiếm). Không gửi tin cho ai, không sửa gì ra ngoài; thao tác cần duyệt sẽ bị từ chối. Trả lời ngắn, đúng trọng tâm; chỗ chưa chắc thì nói rõ.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Kết quả trả cho bot hỏi (kết quả của công cụ). */
export function answerText(to: string, answer: string): string {
  return `${to} trả lời:\n${answer.trim()}`
}

/** Tin nhắn vào phiên của bot hỏi khi lượt của nó đã dừng: gom mọi kết quả về một tin. */
export function returnMessage(
  tasks: readonly Pick<TaskRecord, 'toName' | 'question' | 'status' | 'answer'>[],
): string {
  const parts = tasks.map((t) => {
    const q = t.question.split('\n')[0]!.slice(0, 120)
    if (t.status === 'done') return `- ${t.toName} trả lời câu «${q}»:\n${(t.answer ?? '').trim()}`
    if (t.status === 'interrupted')
      return `- Câu hỏi «${q}» gửi ${t.toName} bị ngắt (aris khởi động lại); hỏi lại nếu còn cần.`
    return `- ${t.toName} chưa trả lời được câu «${q}».`
  })
  return `[aris] Kết quả bạn đã hỏi đồng đội (lượt trước của bạn đã dừng trước khi có kết quả):\n${parts.join('\n')}\nDùng các kết quả này nếu việc vẫn cần.`
}
