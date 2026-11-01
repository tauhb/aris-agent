/**
 * Cấu hình của Commander (trang 2.5): giới hạn điều phối, trần tiền mỗi việc, trợ lý ẩn danh, bot
 * cần duyệt mỗi lần giao. Danh sách "Được giao việc cho" là cờ `assignable` của từng bot (`@aris/bots`).
 */
import { z } from 'zod'

export const commanderSettings = z.object({
  /** Bot (trừ Commander) chạy cùng lúc. */
  parallel: z.number().int().min(1).max(12),
  /** Việc lớn của phòng ban chạy cùng lúc (trưởng nhóm mở Team lồng); 0 là tắt giao cả phòng. */
  nested: z.number().int().min(0).max(6),
  /** Trần tiền mỗi việc giao (USD); không có là không giới hạn. */
  budgetUsd: z.number().positive().max(100).optional(),
  /** Commander được dùng trợ lý ẩn danh (công cụ `agent` của dsh) cho việc lặt vặt, quét song song. */
  helpers: z.boolean(),
  /** Bot (mã nội bộ) mà mỗi lần giao việc cần người dùng duyệt. */
  approve: z.array(z.string()),
  /** Duyệt bền (GĐ9.7a): aris giữ và lưu yêu cầu duyệt, nhắn chen thì từ chối, chống lặp. Không có là bật. */
  durable: z.boolean().optional(),
  /** Đồng đội hỏi nhau (GĐ9.5): bot hỏi ý đồng đội bằng `ask_teammate`. Không có là bật. */
  teammates: z.boolean().optional(),
})
export type CommanderSettings = z.infer<typeof commanderSettings>

export const DEFAULT_SETTINGS: CommanderSettings = { parallel: 6, nested: 3, helpers: true, approve: [] }

export class SettingsError extends Error {}

/**
 * Gộp phần người dùng sửa vào cấu hình hiện tại. `budgetUsd: null` là bỏ trần tiền. Số sai khoảng
 * báo lỗi rõ thay vì tự kẹp, để ô nhập không âm thầm đổi số người dùng gõ.
 */
export function cleanSettings(patch: unknown, current: CommanderSettings): CommanderSettings {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>
  const next: Record<string, unknown> = { ...current }
  for (const k of ['parallel', 'nested', 'helpers', 'approve', 'durable', 'teammates'] as const)
    if (k in p) next[k] = p[k]
  if ('budgetUsd' in p) {
    if (p.budgetUsd === null || p.budgetUsd === '' || p.budgetUsd === 0) delete next.budgetUsd
    else next.budgetUsd = p.budgetUsd
  }
  if (Array.isArray(next.approve)) next.approve = [...new Set(next.approve as unknown[])]
  const r = commanderSettings.safeParse(next)
  if (r.success) return r.data
  const field = String(r.error.issues[0]?.path[0] ?? '')
  throw new SettingsError(
    field === 'parallel'
      ? 'Số bot chạy cùng lúc phải từ 1 đến 12.'
      : field === 'nested'
        ? 'Số việc lớn chạy cùng lúc phải từ 0 đến 6.'
        : field === 'budgetUsd'
          ? 'Trần tiền mỗi việc phải lớn hơn 0 và không quá 100 USD.'
          : 'Cấu hình Commander không hợp lệ.',
  )
}

/** Trần tiền cho một việc của bot ngoài: trần nhỏ hơn giữa bot và Commander. */
export function externalBudget(bot: number | undefined, commander: number | undefined): number | undefined {
  if (bot === undefined) return commander
  if (commander === undefined) return bot
  return Math.min(bot, commander)
}

/** Theo dõi tiền của từng việc giao cho bot trong đội (theo phiên của bot), để dừng khi chạm trần. */
export class TaskSpend {
  private readonly tasks = new Map<string, { cap: number; spent: number; title: string }>()

  /** Bắt đầu đếm một việc mới (giao mới hay nhắn tiếp đều đếm lại từ 0). */
  start(session: string, cap: number | undefined, title: string): void {
    if (cap === undefined) this.tasks.delete(session)
    else this.tasks.set(session, { cap, spent: 0, title })
  }

  add(session: string, usd: number): void {
    const t = this.tasks.get(session)
    if (t) t.spent += usd
  }

  /** Việc đã chạm trần: tiền đã dùng, trần, tên việc. */
  over(session: string): { spent: number; cap: number; title: string } | undefined {
    const t = this.tasks.get(session)
    return t && t.spent >= t.cap ? { ...t } : undefined
  }

  end(session: string): void {
    this.tasks.delete(session)
  }
}
