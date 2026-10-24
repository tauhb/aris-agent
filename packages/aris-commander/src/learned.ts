/**
 * Commander tự học (giai đoạn 3, đợt 4): từ nhật ký giao việc (bot, loại việc, kết quả) tính bot nào
 * làm tốt loại việc nào, cho trang 2.5 và cho ngữ cảnh của Commander khi chọn bot. Thuần.
 */
import type { DispatchRecord } from './domain.js'

export interface Learned {
  bot: string
  /** Loại việc Commander ghi khi giao (đã chuẩn hoá chữ thường). */
  kind: string
  times: number
  done: number
  failed: number
  last: string
}

/** Loại việc chuẩn hoá: chữ thường, bỏ khoảng trắng thừa, tối đa 60 ký tự. */
export const kindOf = (s: string | undefined) =>
  (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60)

/** Gộp theo bot × loại việc, nhiều lần trước; bỏ lần giao không ghi loại việc. */
export function learnedFrom(records: readonly DispatchRecord[]): Learned[] {
  const by = new Map<string, Learned>()
  for (const r of records) {
    const kind = kindOf(r.kind)
    if (!kind) continue
    const key = `${r.bot}\u0000${kind}`
    const l = by.get(key) ?? { bot: r.bot, kind, times: 0, done: 0, failed: 0, last: r.at }
    l.times++
    if (r.outcome === 'done') l.done++
    else if (r.outcome === 'failed') l.failed++
    if (r.at > l.last) l.last = r.at
    by.set(key, l)
  }
  return [...by.values()].sort((a, b) => b.times - a.times || b.last.localeCompare(a.last))
}

/** Tỉ lệ xong trên các lần đã có kết quả (undefined khi chưa lần nào xong hay vấp). */
export const rateOf = (l: Learned) => (l.done + l.failed ? l.done / (l.done + l.failed) : undefined)

/** Khối ngữ cảnh cho Commander: tối đa `max` dòng, nhiều lần trước. Rỗng khi chưa có gì. */
export function learnedContext(list: readonly Learned[], nameOf: (bot: string) => string, max = 12): string {
  if (!list.length) return ''
  const rows = list.slice(0, max).map((l) => {
    const r = rateOf(l)
    return `- ${nameOf(l.bot)} · ${l.kind}: ${l.times} lần${r === undefined ? '' : `, xong ${Math.round(r * 100)}%`}`
  })
  return [
    '<aris-routing-history>',
    'Kết quả giao việc trước đây (bot · loại việc: số lần, tỉ lệ xong). Ưu tiên bot đã làm tốt loại việc tương tự, trừ khi người dùng chỉ định khác:',
    ...rows,
    '</aris-routing-history>',
  ].join('\n')
}
