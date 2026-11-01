/**
 * Việc lớn của phòng ban (bước 3d; đặc tả: docs/specs/aris-commander.md): lời giao cho trưởng
 * nhóm, ngữ cảnh của phiên trưởng nhóm, báo cáo nộp về Commander.
 */
import type { JobRecord } from './domain.js'

export interface MemberLike {
  id: string
  handle: string
  name: string
  role: string
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/^phong\s+/, '')
    .trim()

/** Phòng ban theo mã hoặc tên (không phân biệt dấu, bỏ chữ "Phòng" ở đầu). */
export function findDepartment<D extends { id: string; name: string }>(
  list: readonly D[],
  ref: string,
): D | undefined {
  const r = fold(ref)
  return list.find((d) => d.id === ref.trim() || fold(d.name) === r)
}

/** Lời giao việc lớn gửi vào phiên của trưởng nhóm. */
export function jobBrief(
  job: Pick<JobRecord, 'id' | 'title' | 'task'>,
  lead: MemberLike,
  department: string,
  members: readonly MemberLike[],
): string {
  return [
    `Aris giao việc lớn cho cả phòng ${department} (${job.id}). Bạn (@${lead.handle}) là trưởng nhóm, nhận việc này: «${job.title}»`,
    '',
    job.task.trim(),
    '',
    members.length
      ? `Thành viên phòng có thể giao: ${members.map((m) => `@${m.handle} (${m.name}, ${m.role || 'thành viên'})`).join('; ')}.`
      : 'Phòng chưa có thành viên nào khác: tự làm.',
    'Cách làm: việc nhiều phần thì chia thẻ bằng tao_the, giao từng phần cho thành viên phòng bằng giao_viec (chỉ thành viên phòng), đợi bằng wait_agent, phần hợp với bạn thì tự làm. Xong hết thì viết câu trả lời cuối là báo cáo nộp Aris: đủ kết quả, ai làm phần nào, điều còn chưa chắc.',
  ].join('\n')
}

/** Ngữ cảnh của phiên trưởng nhóm: luôn nhớ đang nhận việc gì cho ai. */
export function jobContext(job: JobRecord, department: string, members: readonly MemberLike[]): string {
  return [
    '<aris-department-job>',
    `Bạn đang là trưởng nhóm phòng ${department}, nhận việc lớn ${job.id} «${job.title}» do Aris giao.`,
    `Chỉ giao việc cho thành viên phòng: ${members.length ? members.map((m) => `@${m.handle}`).join(', ') : '(chưa có)'}. Không giao cho bot phòng khác.`,
    'Câu trả lời cuối của bạn (khi mọi phần đã xong) tự động về Aris làm báo cáo của phòng.',
    '</aris-department-job>',
  ].join('\n')
}

/** Tin gửi về phiên của Commander khi phòng làm xong (hoặc vấp). */
export function jobReport(job: JobRecord, department: string): string {
  return job.status === 'failed'
    ? `Việc lớn ${job.id} «${job.title}» của phòng ${department} bị vấp (lượt của trưởng nhóm lỗi). Xem phiên của trưởng nhóm, rồi báo người dùng hoặc giao lại.`
    : [
        `Phòng ${department} nộp kết quả việc lớn ${job.id} «${job.title}»:`,
        '',
        job.result?.trim() || '(trưởng nhóm không viết báo cáo)',
        '',
        'Tổng hợp cho người dùng: điều quan trọng nhất, ai làm phần nào.',
      ].join('\n')
}

/** Chữ của một tin nhắn assistant (bỏ phần suy nghĩ, công cụ). */
export function textOf(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((p: { type?: string; text?: string }) =>
      p?.type === 'text' && typeof p.text === 'string' ? [p.text] : [],
    )
    .join('\n')
}
