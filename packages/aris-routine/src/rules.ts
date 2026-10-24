/** Luật chạy routine (đặc tả: docs/specs/aris-routine.md). Thuần. */

/** Trễ quá mức này (giờ) thì không chạy bù, ghi "lỡ". */
export const CATCHUP_HOURS = 3
/** Trần tiền mặc định mỗi lần chạy (USD). */
export const ROUTINE_USD = 0.1
/** Một lần chạy quá chừng này thì huỷ. */
export const RUN_TIMEOUT_MS = 15 * 60_000
/** Lỗi liên tiếp chừng này lần thì cảnh báo. */
export const FAIL_ALERT = 2
/** Số lần chạy giữ lại mỗi routine. */
export const RUNS_KEPT = 50
/** Vòng kiểm của bộ hẹn giờ. */
export const TICK_MS = 30_000

export type RunStatus = 'running' | 'done' | 'failed' | 'stopped' | 'cap' | 'missed'
export type Trigger = 'schedule' | 'catchup' | 'manual'

/**
 * Đến giờ chưa và làm gì: `schedule` (đúng giờ, trong hai vòng kiểm), `catchup` (trễ nhưng còn trong
 * mức chạy bù), `missed` (trễ quá). Tắt, chưa có lần kế hay đang chạy thì undefined.
 */
export function decide(
  r: { enabled: boolean; nextAt?: string | undefined; catchupHours: number },
  now: Date,
  running: boolean,
): Exclude<Trigger, 'manual'> | 'missed' | undefined {
  if (!r.enabled || !r.nextAt || running) return undefined
  const late = now.getTime() - Date.parse(r.nextAt)
  if (late < 0) return undefined
  if (late <= 2 * TICK_MS) return 'schedule'
  return late <= r.catchupHours * 3_600_000 ? 'catchup' : 'missed'
}

/** Số lần lỗi liên tiếp sau một lần chạy: xong thì về 0; lỗi, chạm trần thì cộng; dừng tay, lỡ thì giữ. */
export function streakAfter(streak: number, status: RunStatus): number {
  if (status === 'done') return 0
  if (status === 'failed' || status === 'cap') return streak + 1
  return streak
}

/** Lời gửi cho bot ở mỗi lần chạy. */
export function routinePrompt(title: string, task: string, readOnly: boolean): string {
  return [
    `[Routine «${title}»] ${task}`,
    ``,
    `Đây là lần chạy tự động theo lịch, không có người trông. Làm xong rồi trả lời kết quả gọn, đọc được ngay trên điện thoại (sẽ gửi về Telegram). Không hỏi lại người dùng; thiếu thông tin thì làm phần làm được và nói rõ phần thiếu.${readOnly ? ' Quyền của lần chạy này: chỉ đọc. Ưu tiên công cụ đọc (read, grep, glob, tìm và đọc web); cần bash thì dùng lệnh đọc đơn giản nối bằng | hay ; (ls, cat, wc, grep, find, git log…), không dùng $(…), if, vòng lặp hay ghi tệp: lệnh khác phải chờ người dùng duyệt trên Telegram và có thể bị từ chối.' : ''}`,
  ].join('\n')
}

/** Lời nhờ bot tìm nguyên nhân khi routine lỗi liên tiếp ("Để <bot> sửa" ở màn 4.1). */
export function fixPrompt(title: string, errors: readonly string[]): string {
  return `Routine «${title}» lỗi ${errors.length} lần liên tiếp:\n${errors.map((e) => `- ${e}`).join('\n')}\n\nTìm nguyên nhân (xem lại các bước trong phiên này) và đề xuất cách sửa cụ thể: đổi nguồn, đổi lời việc, hay cần quyền gì. Chưa sửa gì cho tới khi người dùng đồng ý.`
}
