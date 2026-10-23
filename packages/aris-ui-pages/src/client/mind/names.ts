/**
 * Tên hiển thị và lựa chọn bot từ đội thật (`@aris/bots`). Đọc bản đội đang tải; trang gốc theo
 * dõi đội (`useTeamData`) nên vẽ lại khi đội tải xong hoặc đổi.
 */
import { currentTeam, type BotOption } from '@aris/ui-kit/react'

const everyone = () => {
  const v = currentTeam()
  return [v.commander, ...v.members]
}

/** Mã bot → tên hiển thị của mọi bot trong đội. */
export const botNames = (): Readonly<Record<string, string>> =>
  Object.fromEntries(everyone().map((m) => [m.id, m.name]))

export const botName = (id: string) => everyone().find((m) => m.id === id)?.name ?? id

/**
 * Lựa chọn cho bộ chọn bot: linh vật, tên, vai trò, nhóm theo phòng ban (Commander
 * đứng đầu, không nhóm). Giữ thứ tự của đội, chỉ lấy các mã trong `ids` (bỏ trống là cả đội).
 */
export function botOptions(ids?: readonly string[]): BotOption[] {
  const v = currentTeam()
  const want = ids ? new Set(ids) : undefined
  const out: BotOption[] = []
  const c = v.commander
  if (!want || want.has(c.id)) out.push({ id: c.id, name: c.name, note: c.role, mascot: c.mascot ?? c.id })
  for (const g of v.groups)
    for (const m of g.members)
      if (!want || want.has(m.id))
        out.push({ id: m.id, name: m.name, note: m.role, mascot: m.mascot ?? m.id, group: g.label })
  return out
}
