/**
 * Nhóm "Đội bot" trong menu `@` của ô nhập (bản vẽ 1.2): bot trong đội đứng đầu, trước tệp và
 * phiên của dsh; mỗi dòng có linh vật, tên, chức danh; chọn thì chèn `@tên_gọi `.
 */
import { getMascot } from '@aris/ui-kit'
import { currentTeam, Mascot, refreshTeam, type BotData } from '@aris/ui-kit/react'
import type { ComponentType, CSSProperties } from 'react'

interface IconProps {
  size?: number | undefined
  className?: string | undefined
}

interface Candidate {
  name: string
  label?: string
  description?: string
  icon?: ComponentType<IconProps>
  section?: string
}

/** Nguồn gợi ý `@` theo hợp đồng `inputTriggers.registerSource` của dsh (chỉ phần aris dùng). */
export interface BotTriggerSource {
  trigger: '@'
  name: string
  order: number
  candidates(session: unknown, req: { query: string }): Promise<readonly Candidate[]>
  onPick(pick: { candidate: Candidate }): { text: string }
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** Bot khớp chữ gõ sau `@` (tên gọi hoặc tên, không phân biệt dấu); khớp đầu từ xếp trước. */
export function matchBots(bots: readonly BotData[], query: string): BotData[] {
  const q = fold(query.trim())
  if (!q) return [...bots]
  const score = (b: BotData) => {
    const keys = [fold(b.handle), fold(b.name)]
    if (keys.some((k) => k.startsWith(q))) return 0
    if (keys.some((k) => k.split(/\s+/).some((w) => w.startsWith(q)))) return 1
    if (keys.some((k) => k.includes(q))) return 2
    return -1
  }
  return bots
    .map((b) => [b, score(b)] as const)
    .filter(([, s]) => s >= 0)
    .sort((x, y) => x[1] - y[1])
    .map(([b]) => b)
}

const icons = new Map<string, ComponentType<IconProps>>()
/**
 * Biểu tượng của dòng là cả tên thành viên (linh vật + tên trên nền màu linh vật, như trong chat);
 * chữ tên thường của dsh ở dòng bot được ẩn bằng CSS. Giữ một component cho mỗi bot.
 */
function iconOf(b: BotData): ComponentType<IconProps> {
  const key = `${b.mascot}|${b.accessory ?? ''}|${b.name}`
  let icon = icons.get(key)
  if (!icon) {
    const color = getMascot(b.mascot)?.color ?? '#64748B'
    icon = ({ className }: IconProps) => (
      <span
        className={`aris-who aris-who-menu ${className ?? ''}`}
        style={{ '--who': color } as CSSProperties}
      >
        <Mascot id={b.mascot} size={18} accessory={b.accessory} />
        {b.name}
      </span>
    )
    icons.set(key, icon)
  }
  return icon
}

export function botTriggerSource(text: {
  /** Đọc lúc mở menu (ngôn ngữ của trang có thể đổi sau khi plugin chạy). */
  section: () => string
  external: (agent: string) => string
}): BotTriggerSource {
  return {
    trigger: '@',
    name: 'aris-bots',
    order: -100,
    candidates: async (_session, req) => {
      // Lần mở menu đầu có thể trước khi đội tải xong.
      if (!currentTeam().bots.length) await refreshTeam().catch(() => undefined)
      const section = text.section()
      return matchBots(currentTeam().bots, req.query).map((b) => ({
        name: b.handle,
        label: b.name,
        description: b.external ? text.external(b.external.agent) : b.role,
        icon: iconOf(b),
        section,
      }))
    },
    // Chèn chữ thường `@tên_gọi `: Aris hiểu tên gọi, tin đã gửi hiện thành tên thành viên (quy tắc chữ `aris-bot`).
    onPick: ({ candidate }) => ({ text: `@${candidate.name} ` }),
  }
}
