// Sinh packages/aris-ui-kit/src/accessories.generated.ts từ số đo và bảng đặt phụ kiện trong
// docs/plans/phu-kien-linh-vat/ (geo.json: số đo từng dáng; acc.py: bảng HAT, DEFAULT, TINT).
// Chạy lại khi số đo hoặc các bảng đó đổi; hàm vẽ nằm ở packages/aris-ui-kit/src/accessories.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { repoRoot } from './paths.mjs'

const dir = join(repoRoot, 'docs/plans/phu-kien-linh-vat')
const geo = JSON.parse(readFileSync(join(dir, 'geo.json'), 'utf8'))
const py = readFileSync(join(dir, 'acc.py'), 'utf8')

/** Phần thân của một bảng Python (`NAME = {…}`), tới dấu `}` đầu tiên (các bảng này không lồng nhau). */
function table(name) {
  const start = py.indexOf(`\n${name} = {`)
  if (start < 0) throw new Error(`acc.py không có bảng ${name}`)
  const from = py.indexOf('{', start) + 1
  return py.slice(from, py.indexOf('}', from))
}

// HAT: chỗ đặt mũ cho dáng có đỉnh lõm hay nhọn; khoá lặp thì lấy lần cuối, như từ điển Python.
const hat = new Map()
for (const m of table('HAT').matchAll(/'([a-z0-9-]+)':\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g))
  hat.set(m[1], [Number(m[2]), Number(m[3])])

const defaults = {}
for (const m of table('DEFAULT').matchAll(/'([a-z0-9-]+)':\s*'([a-z0-9-]+)'/g)) defaults[m[1]] = m[2]

const tint = {}
for (const m of table('TINT').matchAll(/\('([a-z0-9-]+)',\s*'([a-z0-9-]+)'\):\s*'(#[0-9A-Fa-f]{6})'/g))
  tint[`${m[1]}:${m[2]}`] = m[3]

const accIds = new Set([...table('ACC').matchAll(/'([a-z0-9-]+)':\s*\('/g)].map((m) => m[1]))
if (accIds.size !== 22) throw new Error(`acc.py có ${accIds.size} phụ kiện, cần 22`)

const ids = Object.keys(geo)
if (ids.length !== 50) throw new Error(`geo.json có ${ids.length} dáng, cần 50`)
for (const id of ids) {
  if (!accIds.has(defaults[id])) throw new Error(`dáng ${id} thiếu phụ kiện mặc định hợp lệ`)
}
for (const key of Object.keys(tint)) {
  const [id, acc] = key.split(':')
  if (!geo[id] || !accIds.has(acc)) throw new Error(`TINT trỏ tới ${key} không có`)
}

// Chỗ đặt mũ: bảng HAT nếu dáng có trong đó, không thì đo tự động (hx, top + 2).
const shapes = Object.fromEntries(
  ids.map((id) => {
    const g = geo[id]
    const [hx, hy] = hat.get(id) ?? [g.hx, g.top + 2]
    const { eb, ex, ey, eh, ew, L, R, Lb, Rb, bot } = g
    return [id, { eb, ex, ey, eh, ew, L, R, Lb, Rb, bot, hx, hy }]
  }),
)

const out = `// Tệp sinh tự động bởi scripts/gen-accessories.mjs từ docs/plans/phu-kien-linh-vat/geo.json và acc.py. Đừng sửa tay.
import type { AccGeo } from './accessories.js'

/** Số đo của từng dáng, đã áp bảng HAT (chỗ đặt mũ \`hx\`, \`hy\`). */
export const ACC_GEO: Readonly<Record<string, AccGeo>> = ${JSON.stringify(shapes, null, 2)}

/** Phụ kiện mặc định của từng dáng, theo vai gợi ý của dáng. */
export const ACC_DEFAULT: Readonly<Record<string, string>> = ${JSON.stringify(defaults, null, 2)}

/** Màu phụ kiện tránh trùng màu thân, khoá \`<dáng>:<phụ kiện>\`. */
export const ACC_TINT: Readonly<Record<string, string>> = ${JSON.stringify(tint, null, 2)}
`
const file = join(repoRoot, 'packages/aris-ui-kit/src/accessories.generated.ts')
writeFileSync(file, await format(out, { ...(await resolveConfig(file)), parser: 'typescript' }))
console.log(`${ids.length} dáng, ${Object.keys(tint).length} màu riêng → ${file}`)
