/** Tên hiển thị của bot trong đội mẫu (giai đoạn 2 lấy từ dịch vụ đội bot). */
import { COMMANDER, DEMO_TEAM } from '@aris/ui-kit'

export const BOT_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)].map((m) => [m.id, m.name]),
)

export const botName = (id: string) => BOT_NAMES[id] ?? id
