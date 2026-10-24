/** So sánh hai bản skill theo dòng (màn 3.3): dòng giữ, thêm, bớt. Thuần, LCS đơn giản. */

export interface DiffLine {
  kind: ' ' | '+' | '-'
  text: string
}

export function lineDiff(before: string, after: string): DiffLine[] {
  // Skill mới: mọi dòng là thêm (không so dòng trống của bản rỗng với dòng trống của bản mới).
  if (!before) return after.split('\n').map((text) => ({ kind: '+' as const, text }))
  const a = before.split('\n')
  const b = after.split('\n')
  // Bảng độ dài chuỗi con chung dài nhất từ cuối lên; skill tối đa 6.000 ký tự nên đủ nhẹ.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: ' ', text: a[i++]! })
      j++
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ kind: '-', text: a[i++]! })
    else out.push({ kind: '+', text: b[j++]! })
  }
  while (i < a.length) out.push({ kind: '-', text: a[i++]! })
  while (j < b.length) out.push({ kind: '+', text: b[j++]! })
  return out
}

export const diffStat = (d: readonly DiffLine[]) => ({
  add: d.filter((l) => l.kind === '+').length,
  del: d.filter((l) => l.kind === '-').length,
})
