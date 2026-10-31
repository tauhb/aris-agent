/**
 * Đọc lần gọi công cụ giao việc của Commander (`assign_task`) thành các việc từng bot: bot nào, việc gì, phiên nào, lỗi gì.
 * Thuần, không phụ thuộc React. Khung chat vẽ thành nhánh "dòng việc" và Văn phòng vẽ thành khối "Đội đang làm" từ cùng
 * một nguồn này.
 */

/** Lần gọi ở ba pha mà dsh truyền cho toolview (`tool.call.toolview`). */
export type SubagentCall =
  | { phase: 'preparing'; block: { callId: string } }
  | { phase: 'start'; block: { callId: string; argsRaw: string } }
  | {
      phase: 'result'
      block: {
        callId: string
        call: { argsRaw: string } | null
        content: readonly { type: string; text?: string }[]
        isError: boolean
        error?: { code?: string; message?: string } | undefined
      }
    }

/** Lời dsh trả về khi người dùng từ chối lần gọi công cụ. */
export const USER_REJECTED = /user rejected tool/i

/** Một việc trong lần gọi `assign_task` của Commander. */
export interface DispatchItem {
  handle: string
  title?: string | undefined
  /** Mã phiên của bot (có khi đã giao xong). */
  sessionId?: string | undefined
  /** Giao không được (lời báo trong kết quả). */
  error?: string | undefined
  /** Bot ngoài: mã lần chạy (không có phiên riêng). */
  externalRun?: string | undefined
  /** Người dùng từ chối lần giao (duyệt mỗi lần). */
  rejected?: boolean | undefined
}

/** Đọc lần gọi `assign_task`: các việc trong tham số, ghép với phiên của từng bot trong kết quả. */
export function dispatchItems(call: SubagentCall): DispatchItem[] {
  const raw =
    call.phase === 'start'
      ? call.block.argsRaw
      : call.phase === 'result'
        ? call.block.call?.argsRaw
        : undefined
  let items: DispatchItem[] = []
  try {
    // Log cũ ghi tham số tiếng Việt (`viec`, `tieu_de`, `noi_dung`): đọc cả hai.
    type Task = { bot?: unknown; title?: unknown; task?: unknown; tieu_de?: unknown; noi_dung?: unknown }
    const v = JSON.parse(raw ?? '{}') as { tasks?: Task[]; viec?: Task[] }
    items = (v.tasks ?? v.viec ?? []).flatMap((x) => {
      if (typeof x.bot !== 'string') return []
      const title = x.title ?? x.tieu_de
      const task = x.task ?? x.noi_dung
      return [
        {
          handle: x.bot.replace(/^@/, '').toLowerCase(),
          title:
            typeof title === 'string' ? title : typeof task === 'string' ? task.split('\n')[0] : undefined,
        },
      ]
    })
  } catch {
    // Tham số đang truyền dở: chưa có việc nào để vẽ.
  }
  if (call.phase !== 'result') return items
  const text = call.block.content.map((c) => c.text ?? '').join('\n')
  for (const line of text.split('\n')) {
    const m = line.match(/^- @([a-z0-9-]+)(.*)$/)
    const item = m && items.find((i) => i.handle === m[1])
    if (!item) continue
    const sid = m[2]!.match(/phiên (\S+)$/)?.[1]
    if (sid) item.sessionId = sid
    const run = m[2]!.match(/việc ngoài (\S+)$/)?.[1]
    if (run) item.externalRun = run
    const err = m[2]!.match(/không giao được — (.*)$/)?.[1]
    if (err) item.error = err
  }
  // Không có dòng của bot: cả lần giao bị chặn (quá giới hạn, người dùng từ chối…), không bot nào nhận.
  const whole =
    text
      .split('\n')
      .find((l) => l.trim())
      ?.replace(/^Không giao được:\s*/, '')
      .trim() || 'không giao được'
  const rejected = USER_REJECTED.test(text)
  for (const item of items)
    if (!item.sessionId && !item.externalRun && !item.error) {
      item.error = whole
      if (rejected) item.rejected = true
    }
  return items
}
