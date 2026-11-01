/**
 * Aris quản đội (GĐ9.2, bản vẽ V3, V4): Aris tạo bot và sửa lời dặn của bot bằng lời, lần nào cũng hỏi duyệt
 * người dùng bằng thẻ đủ chi tiết (tên, vai, mô tả cho đồng đội, toàn văn lời dặn, model, phòng; thẻ sửa lời
 * dặn có chỗ đổi). Các hàm thuần ở đây soạn tên gọi và nội dung thẻ; công cụ đăng ký ở `index.ts`.
 */
import type { BotRecord } from './domain.js'

/** Tên gọi `@handle` từ tên hiển thị: bỏ dấu, chữ thường, chỉ chữ số và "-", không trùng tên đã có. */
export function handleFrom(name: string, taken: (handle: string) => boolean): string {
  const base =
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^[^a-z]+|-+$/g, '')
      .slice(0, 20) || 'bot'
  if (!taken(base)) return base
  for (let i = 2; ; i++) if (!taken(`${base}-${i}`)) return `${base}-${i}`
}

/** Một dòng của chỗ đổi lời dặn: giữ nguyên, bỏ đi, thêm vào. */
export interface DiffLine {
  kind: 'same' | 'del' | 'add'
  text: string
}

/** So hai bản lời dặn theo dòng (dãy con chung dài nhất), đủ cho văn bản vài chục dòng. */
export function soulDiff(prev: string, next: string): DiffLine[] {
  const a = prev.split('\n')
  const b = next.split('\n')
  const n = a.length
  const m = b.length
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i++]! })
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ kind: 'del', text: a[i++]! })
    else out.push({ kind: 'add', text: b[j++]! })
  }
  while (i < n) out.push({ kind: 'del', text: a[i++]! })
  while (j < m) out.push({ kind: 'add', text: b[j++]! })
  return out
}

/** Chỗ đổi dạng chữ cho thẻ duyệt: chỉ dòng bỏ ("− ") và dòng thêm ("+ "), bỏ dòng trống. */
export function diffText(lines: readonly DiffLine[]): string {
  return lines
    .filter((l) => l.kind !== 'same' && l.text.trim())
    .map((l) => `${l.kind === 'del' ? '−' : '+'} ${l.text}`)
    .join('\n')
}

/** Đề xuất tạo bot như Aris gửi lên, sau khi làm sạch. */
export interface BotProposal {
  name: string
  handle: string
  role: string
  description: string
  soul: string
  mascot?: string | undefined
  department?: { id: string; name: string } | undefined
  model?: string | undefined
}

type Lang = 'vi' | 'en'

const words = {
  vi: {
    create: (p: BotProposal) => `Tạo bot ${p.name} (@${p.handle})${p.role ? ` · ${p.role}` : ''}`,
    dept: 'Phòng',
    noDept: 'chưa vào phòng nào',
    about: 'Mô tả cho đồng đội',
    soul: 'Lời dặn',
    model: 'Model',
    defaultModel: 'theo model mặc định',
    edit: (name: string, from: number, to: number) => `Sửa lời dặn của ${name} (bản ${from} → bản ${to})`,
    restore: (name: string, v: number, to: number) =>
      `Khôi phục lời dặn bản ${v} của ${name} (thành bản ${to})`,
    changes: 'Chỗ đổi',
    full: 'Lời dặn mới (toàn văn)',
    why: 'Lý do',
    chars: (a: number, b: number) => `${a} → ${b} ký tự`,
  },
  en: {
    create: (p: BotProposal) => `Create bot ${p.name} (@${p.handle})${p.role ? ` · ${p.role}` : ''}`,
    dept: 'Department',
    noDept: 'none yet',
    about: 'Description for teammates',
    soul: 'Instructions',
    model: 'Model',
    defaultModel: 'default model',
    edit: (name: string, from: number, to: number) => `Edit ${name}'s instructions (version ${from} → ${to})`,
    restore: (name: string, v: number, to: number) =>
      `Restore ${name}'s instructions to version ${v} (as version ${to})`,
    changes: 'Changes',
    full: 'New instructions (full text)',
    why: 'Reason',
    chars: (a: number, b: number) => `${a} → ${b} characters`,
  },
} as const

/** Nội dung thẻ duyệt tạo bot: đủ mọi thứ bot sẽ có. */
export function createCard(p: BotProposal, lang: Lang): string {
  const w = words[lang]
  return [
    w.create(p),
    `${w.dept}: ${p.department?.name ?? w.noDept} · ${w.model}: ${p.model ?? w.defaultModel}`,
    p.description && `${w.about}: ${p.description}`,
    `${w.soul}:\n${p.soul}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Nội dung thẻ duyệt sửa (hay khôi phục) lời dặn: bản, độ dài, chỗ đổi, toàn văn bản mới, lý do. */
export function editCard(
  bot: Pick<BotRecord, 'name' | 'soul'>,
  next: string,
  version: { from: number; to: number; restore?: number },
  reason: string,
  lang: Lang,
): string {
  const w = words[lang]
  const head =
    version.restore !== undefined
      ? w.restore(bot.name, version.restore, version.to)
      : w.edit(bot.name, version.from, version.to)
  const changes = diffText(soulDiff(bot.soul, next))
  return [
    `${head} · ${w.chars(bot.soul.length, next.length)}`,
    reason && `${w.why}: ${reason}`,
    changes && `${w.changes}:\n${changes}`,
    `${w.full}:\n${next}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
