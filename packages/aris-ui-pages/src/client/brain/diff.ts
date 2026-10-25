/** So sánh theo câu cho bản nạp (5.2) và nhật ký bộ não (5.6): câu bỏ, câu thêm; bỏ nhãn đầu trang. */

export interface Change {
  kind: 'del' | 'add'
  text: string
}

const FRONT = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/
/** Dòng nhãn đầu trang trong bản vá (sửa ít dòng nên không thấy dấu ---). */
const FRONT_KEY = /^(loai|trang-thai|phong-ban|the|nguon|cap-nhat|tom-tat|tieu-de|url|tu|luc|ma):( |$)/

/** Tách Markdown thành câu: mỗi dòng, rồi tách tiếp theo dấu chấm câu. */
export function units(md: string): string[] {
  return md
    .replace(FRONT, '')
    .split(/\r?\n/)
    .flatMap((line) => line.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ỹ0-9"“([])/u))
    .map((s) => s.trim())
    .filter((s) => s && !/^[-*_]{3,}$/.test(s))
}

/** Các câu khác nhau giữa hai bản (theo dãy con chung dài nhất). */
export function diffUnits(before: string, after: string): Change[] {
  const a = units(before)
  const b = units(after)
  const n = a.length
  const m = b.length
  // Bảng độ dài dãy con chung; trang wiki ngắn nên đủ nhanh.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
  const out: Change[] = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++
      j++
    } else if (j < m && (i >= n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!))
      out.push({ kind: 'add', text: b[j++]! })
    else out.push({ kind: 'del', text: a[i++]! })
  }
  return out
}

/** Thay đổi theo tệp từ `git show --unified=0`: dòng bỏ, dòng thêm (bỏ nhãn đầu trang). */
export function patchChanges(patch: string): { path: string; changes: Change[] }[] {
  const files: { path: string; changes: Change[] }[] = []
  let cur: { path: string; changes: Change[] } | undefined
  let inFront = false
  for (const line of patch.split('\n')) {
    const head = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (head) {
      cur = { path: head[2]!, changes: [] }
      files.push(cur)
      continue
    }
    if (
      !cur ||
      line.startsWith('+++') ||
      line.startsWith('---') ||
      line.startsWith('@@') ||
      line.startsWith('index ')
    )
      continue
    const kind = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : undefined
    if (!kind) continue
    const text = line.slice(1).trim()
    if (text === '---') {
      inFront = !inFront
      continue
    }
    if (inFront || !text || FRONT_KEY.test(text)) continue
    cur.changes.push({ kind, text })
  }
  return files
}
