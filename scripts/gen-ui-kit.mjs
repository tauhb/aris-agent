// Sinh packages/aris-ui-kit/src/mascots.generated.ts từ thư viện linh vật trong
// design/canvas/ThuVienLinhVat.dc.html. Chạy lại khi thiết kế linh vật thay đổi.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from './paths.mjs'

const html = readFileSync(join(repoRoot, 'design/canvas/ThuVienLinhVat.dc.html'), 'utf8')
const IN_USE = { Aris: 'aris', Lâm: 'lam', Mai: 'mai', Tín: 'tin', Dev: 'dev', Hạ: 'ha' }

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const tiles = [...html.matchAll(/<div class="tile[^"]*">([\s\S]*?)<\/div>/g)].map((m) => m[1])
const mascots = tiles.map((t) => {
  const svg = t.match(/<svg[^>]*aria-label="([^"]*)"[^>]*>([\s\S]*?)<\/svg>/)
  const span = (cls) => t.match(new RegExp(`<span class="${cls}">([^<]*)</span>`))?.[1] ?? ''
  const label = svg[1]
  const shape = span('nm')
  const [code, state] = span('cd').split(' · ')
  const bot = IN_USE[label]
  return {
    id: bot ?? slug(shape),
    shape,
    role: span('rl'),
    code: code ?? '',
    inUse: state === 'đang dùng',
    color: svg[2].match(/fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? '',
    body: svg[2].replace(/\s+/g, ' ').trim(),
  }
})

const ids = new Set(mascots.map((m) => m.id))
if (ids.size !== mascots.length) throw new Error('trùng id linh vật')

const out = `// Tệp sinh tự động bởi scripts/gen-ui-kit.mjs từ design/canvas/ThuVienLinhVat.dc.html. Đừng sửa tay.
import type { Mascot } from './mascots.js'

export const MASCOTS: readonly Mascot[] = ${JSON.stringify(mascots, null, 2)}
`
writeFileSync(join(repoRoot, 'packages/aris-ui-kit/src/mascots.generated.ts'), out)
console.log(`${mascots.length} linh vật → packages/aris-ui-kit/src/mascots.generated.ts`)
