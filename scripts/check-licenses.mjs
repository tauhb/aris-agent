// Quét giấy phép của mọi phụ thuộc (kể cả dev) qua `pnpm licenses list`.
// Chỉ cho phép giấy phép dễ dãi; ngoại lệ phải ghi rõ lý do bên dưới.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { repoRoot } from './paths.mjs'

export const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'CC-BY-4.0',
  'Unlicense',
  'Python-2.0',
  'MPL-2.0',
])

/** Gói được phép dù giấy phép ngoài danh sách, kèm lý do. */
export const EXCEPTIONS = {
  // Phông Inter của giao diện GĐ9, nhúng nguyên tệp vào app, không sửa; người dùng đồng ý 1/11/2026.
  '@fontsource-variable/inter': 'OFL-1.1, phông chữ nhúng không sửa đổi',
  // Thư viện libvips dựng sẵn của sharp (do dsh kéo vào), liên kết động, không sửa đổi.
  '@img/sharp-libvips-darwin-arm64': 'LGPL-3.0-or-later, liên kết động qua sharp',
  '@img/sharp-libvips-linux-x64': 'LGPL-3.0-or-later, liên kết động qua sharp',
  '@img/sharp-libvips-linuxmusl-x64': 'LGPL-3.0-or-later, liên kết động qua sharp',
  // Do zca-js (kênh Zalo) kéo vào. Zlib là giấy phép dễ dãi, cùng loại với MIT.
  pako: '(MIT AND Zlib), nén dữ liệu cho zca-js',
}

/** Một biểu thức SPDX hợp lệ khi có ít nhất một nhánh OR mà mọi phần AND đều được phép. */
export function isAllowed(expr) {
  const clean = expr.replace(/[()]/g, '').trim()
  return clean.split(/\s+OR\s+/i).some((alt) => alt.split(/\s+AND\s+/i).every((id) => ALLOWED.has(id.trim())))
}

export function findViolations(report) {
  const out = []
  for (const [license, pkgs] of Object.entries(report)) {
    if (isAllowed(license)) continue
    for (const p of pkgs)
      if (!(p.name in EXCEPTIONS)) out.push(`${p.name}@${p.versions?.join(',') ?? ''}: ${license}`)
  }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--json'], { cwd: repoRoot, encoding: 'utf8' }),
  )
  const violations = findViolations(report)
  if (violations.length) {
    console.error('Giấy phép chưa được phép:\n' + violations.join('\n'))
    process.exit(1)
  }
  const total = Object.values(report).reduce((n, p) => n + p.length, 0)
  console.log(`check-licenses: ${total} gói, không có giấy phép ngoài danh sách`)
}
