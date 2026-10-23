/** Tên hiển thị và lựa chọn bot từ đội mẫu (giai đoạn 2 lấy từ dịch vụ đội bot). */
import { COMMANDER, DEMO_TEAM } from '@aris/ui-kit'
import type { BotOption } from '@aris/ui-kit/react'

export const BOT_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)].map((m) => [m.id, m.name]),
)

export const botName = (id: string) => BOT_NAMES[id] ?? id

/**
 * Lựa chọn cho bộ chọn bot: linh vật, tên, vai trò, nhóm theo phòng ban (Commander
 * đứng đầu, không nhóm). Giữ thứ tự của đội, chỉ lấy các mã trong `ids`.
 */
export function botOptions(ids: readonly string[]): BotOption[] {
  const want = new Set(ids)
  const out: BotOption[] = []
  if (want.has(COMMANDER.id))
    out.push({ id: COMMANDER.id, name: COMMANDER.name, note: COMMANDER.role, mascot: COMMANDER.id })
  for (const g of DEMO_TEAM)
    for (const m of g.members)
      if (want.has(m.id)) out.push({ id: m.id, name: m.name, note: m.role, mascot: m.id, group: g.label })
  return out
}
