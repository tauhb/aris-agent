// Kiểm tra bản dịch tiếng Việt so với bản tiếng Anh đã ghim của dsh: độ phủ theo
// namespace, khoá thiếu, khoá lỗi thời (dsh đã bỏ) và biến `{tên}` bị lệch.
// Thoát mã 1 khi có khoá lỗi thời hoặc biến lệch; khoá thiếu chỉ báo (sẽ hiện tiếng Anh).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repoRoot } from '../paths.mjs'

const dir = join(repoRoot, 'packages/aris-ui-locale-vi/locales')

/**
 * Tập biến `{tên}` trong một chuỗi, đã sắp xếp. Bỏ `{you}`/`{You}`: đó là cách gọi người dùng,
 * gói tiếng Việt điền lúc đăng ký theo hồ sơ xưng hô, không phải biến của dsh.
 */
export const placeholders = (text) =>
  [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .filter((v) => v !== 'you' && v !== 'You')
    .sort()
    .join(',')

export function compare(en, vi) {
  const report = { total: 0, done: 0, missing: [], stale: [], mismatched: [], perNs: [] }
  for (const [ns, { en: dict }] of Object.entries(en)) {
    const tr = vi[ns] ?? {}
    let done = 0
    for (const [key, text] of Object.entries(dict)) {
      report.total++
      if (!(key in tr)) {
        report.missing.push(`${ns}:${key}`)
        continue
      }
      done++
      if (placeholders(text) !== placeholders(tr[key])) report.mismatched.push(`${ns}:${key}`)
    }
    for (const key of Object.keys(tr)) if (!(key in dict)) report.stale.push(`${ns}:${key}`)
    report.done += done
    report.perNs.push([ns, done, Object.keys(dict).length])
  }
  for (const ns of Object.keys(vi)) if (!(ns in en)) report.stale.push(`${ns}:*`)
  return report
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const en = JSON.parse(readFileSync(join(dir, 'en.snapshot.json'), 'utf8'))
  const vi = JSON.parse(readFileSync(join(dir, 'vi.json'), 'utf8'))
  const r = compare(en, vi)
  const pct = ((r.done / r.total) * 100).toFixed(1)
  console.log(`Tiếng Việt: ${r.done}/${r.total} chuỗi (${pct}%)`)
  if (process.argv.includes('--ns'))
    for (const [ns, d, t] of r.perNs) console.log(`  ${d === t ? '✓' : ' '} ${ns} ${d}/${t}`)
  if (r.stale.length) console.log(`Khoá lỗi thời (dsh đã bỏ):\n  ${r.stale.join('\n  ')}`)
  if (r.mismatched.length) console.log(`Biến {tên} lệch với bản gốc:\n  ${r.mismatched.join('\n  ')}`)
  process.exit(r.stale.length || r.mismatched.length ? 1 : 0)
}
