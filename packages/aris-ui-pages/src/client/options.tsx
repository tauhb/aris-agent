/**
 * Lựa chọn dựng sẵn cho bộ chọn dùng chung (`Select` của ui-kit): bot có linh vật, tên, mô tả
 * ngắn; phòng ban; model theo nhà cung cấp. Dùng thay `<select>` mặc định của trình duyệt.
 */
import type { BotData, SelectOption, TeamView } from '@aris/ui-kit/react'

/** Mô tả ngắn của bot: vai trò, thêm ý đầu của phần mô tả. */
export function botNote(b: Pick<BotData, 'role' | 'description'>): string {
  const first = (b.description.split(/(?<=[.;!?])\s|\n/)[0] ?? '').trim().replace(/[.;,:!?]+$/, '')
  const desc = first.length > 80 ? `${first.slice(0, 78)}…` : first
  return [b.role, desc].filter(Boolean).join(' · ')
}

export function botOption(b: BotData, extra: Partial<SelectOption> = {}): SelectOption {
  return { id: b.id, name: b.name, mascot: b.mascot, note: botNote(b), ...extra }
}

/**
 * Bot trong đội theo phòng ban (Commander đứng đầu nếu `commander`). `filter` bỏ bớt bot;
 * `group` đổi nhãn nhóm (ví dụ "Trong dự án" / "Ngoài dự án").
 */
export function botOptions(
  team: Pick<TeamView, 'bots' | 'departments'>,
  o: {
    commander?: boolean
    filter?: (b: BotData) => boolean
    group?: (b: BotData) => string | undefined
    noDepartment?: string
  } = {},
): SelectOption[] {
  const keep = (b: BotData) => (o.commander || b.kind !== 'commander') && (!o.filter || o.filter(b))
  const depName = (b: BotData) =>
    b.kind === 'commander'
      ? undefined
      : (team.departments.find((d) => d.id === b.department)?.name ?? o.noDepartment)
  const order = (b: BotData) =>
    b.kind === 'commander' ? -1 : (team.departments.find((d) => d.id === b.department)?.order ?? 999)
  return team.bots
    .filter(keep)
    .map((b, i) => ({ b, i }))
    .sort((x, y) => (o.group ? 0 : order(x.b) - order(y.b) || x.i - y.i))
    .map(({ b }) => botOption(b, { group: o.group ? o.group(b) : depName(b) }))
}

/** Biểu tượng chữ cái đầu cho lựa chọn không có linh vật (phòng ban…). */
export function Initial({ text }: { text: string }) {
  return <span className="ap-initial">{text.trim().charAt(0).toLocaleUpperCase('vi') || '·'}</span>
}

/** Phòng ban, thêm lựa chọn "chưa vào phòng" (`''`) nếu có `none`. */
export function departmentOptions(
  team: Pick<TeamView, 'bots' | 'departments'>,
  none?: { name: string; note?: string },
  count?: (n: number) => string,
): SelectOption[] {
  const out: SelectOption[] = []
  if (none) out.push({ id: '', name: none.name, note: none.note, icon: <Initial text="–" /> })
  for (const d of team.departments) {
    const n = team.bots.filter((b) => b.department === d.id).length
    out.push({
      id: d.id,
      name: d.name,
      note: [count?.(n), d.about].filter(Boolean).join(' · '),
      icon: <Initial text={d.name} />,
    })
  }
  return out
}

/**
 * Model theo nhà cung cấp; giá trị là `nhà cung cấp\0model`. `def` là lựa chọn mặc định (`''`);
 * `current` chưa có trong danh mục thì vẫn hiện để không mất giá trị đang lưu.
 */
export function modelOptions(
  catalog: readonly { id: string; name: string; models: readonly { id: string; name: string }[] }[],
  def?: { name: string; note?: string },
  current?: { provider: string; model: string },
  keep: (provider: string, model: string) => boolean = () => true,
): SelectOption[] {
  const out: SelectOption[] = []
  if (def) out.push({ id: '', name: def.name, note: def.note })
  const key = (p: string, m: string) => `${p}\u0000${m}`
  if (
    current &&
    !catalog.some((g) => g.id === current.provider && g.models.some((m) => m.id === current.model))
  )
    out.push({ id: key(current.provider, current.model), name: current.model, note: current.provider })
  for (const g of catalog)
    for (const m of g.models.filter((x) => keep(g.id, x.id)))
      out.push({
        id: key(g.id, m.id),
        name: m.name || m.id,
        note: m.name && m.name !== m.id ? m.id : undefined,
        group: g.name,
      })
  return out
}

/** Danh sách giá trị đơn giản (số phút, mức tiền…). */
export function plainOptions<V extends string | number>(
  values: readonly V[],
  label: (v: V) => string,
  note?: (v: V) => string | undefined,
): SelectOption[] {
  return values.map((v) => ({ id: String(v), name: label(v), note: note?.(v) }))
}
