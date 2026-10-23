// Kiểm kê giao diện web của dsh cho bản đồ giao diện (giai đoạn G1): mọi row có
// phần client trong profile `aris`, các chỗ cắm (slot) mà gói client khai báo,
// nhóm token theme `--dsw-*` và số chuỗi chữ tiếng Anh cần Việt hoá.
// Mặc định in JSON; với `--md <tệp>` ghi bảng Markdown vào tệp đó.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { arisHome, dshBin, repoRoot } from '../paths.mjs'

const require = createRequire(join(repoRoot, 'package.json'))
const store = join(repoRoot, 'node_modules/.pnpm/node_modules')

const dump = execFileSync(process.execPath, [dshBin(), '--profile', 'aris', '--dump-config'], {
  env: { ...process.env, DSH_HOME: arisHome() },
  encoding: 'utf8',
})
// Đọc từng dòng (dump có thẻ !!js nên không parse YAML); chỉ cần id, name, disabled.
const rows = []
let layer = ''
for (const line of dump.split('\n')) {
  if (line.startsWith('# == ')) layer = line.slice(5)
  const m = line.match(/^- id: (.+)$/)
  if (m) rows.push({ id: m[1].trim(), layer, name: '', disabled: '' })
  const n = line.match(/^ {2}name: '?([^']+)'?$/)
  if (n && rows.length) rows.at(-1).name = n[1]
  const d = line.match(/^ {2}disabled: (.+)$/)
  if (d && rows.length) rows.at(-1).disabled = d[1]
}

function pkgOf(name) {
  if (name.startsWith('file://')) return null
  const base = name
    .split('/')
    .slice(0, name.startsWith('@') ? 2 : 1)
    .join('/')
  for (const dir of [join(store, base), join(repoRoot, 'node_modules', base)]) {
    if (existsSync(join(dir, 'package.json')))
      return { dir, json: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) }
  }
  return null
}

const slotsDeclared = new Set()
const client = []
for (const r of rows) {
  const p = pkgOf(r.name)
  if (!p?.json.dsh?.client) continue
  const file = join(p.dir, 'lib/client.js')
  const src = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const registers = [
    ...new Set(
      [...src.matchAll(/name: "([a-z][\w.]*)"/g)]
        .map((m) => m[1])
        .filter((s) => s.includes('.') || ['main', 'sidebar'].includes(s)),
    ),
  ]
  for (const m of src.matchAll(/"([a-z][\w]*(?:\.[\w]+)+)": \{\s*kind: "(single|list|keyed)"/g))
    slotsDeclared.add(`${m[1]} (${m[2]})`)
  let strings = 0
  for (const m of src.matchAll(/const en\$?\d* = \{([\s\S]*?)\n\t\t\};/g))
    strings += (m[1].match(/^\s*"?[\w.-]+"?: /gm) ?? []).length
  client.push({
    id: r.id,
    package: p.json.name,
    disabled: r.disabled,
    description: p.json.description ?? '',
    registers,
    strings,
  })
}

const themeFile = join(store, '@deepseek-ai/dsh-client-ui-theme/lib/client.js')
const tokens = [...new Set(readFileSync(themeFile, 'utf8').match(/--dsw-[a-z0-9-]+/g))].sort()
const groups = {}
for (const t of tokens) {
  const g = t.split('-').slice(3, 5).join('-')
  groups[g] = (groups[g] ?? 0) + 1
}

const result = {
  dsh: require('@deepseek-ai/dsh/package.json').version,
  client,
  slots: [...slotsDeclared].sort(),
  tokens: { count: tokens.length, groups },
}
const mdAt = process.argv.indexOf('--md')
if (mdAt < 0) {
  console.log(JSON.stringify(result, null, 1))
} else {
  const visible = client.filter((c) => c.registers.length > 0 || c.strings > 0)
  const md = [
    '# Kiểm kê giao diện web của dsh',
    '',
    `> Tự sinh bởi \`node scripts/ui/inventory.mjs --md docs/giao-dien/kiem-ke-dsh.md\` từ profile \`aris\`, dsh \`${result.dsh}\`. Đừng sửa tay; chạy lại sau mỗi lần nâng dsh rồi so khác biệt.`,
    '',
    `- ${client.length} row có phần client, ${visible.length} row có vẽ giao diện hoặc có chữ.`,
    `- ${result.slots.length} chỗ cắm (slot) được khai báo.`,
    `- ${tokens.length} token theme \`--dsw-*\`; ${client.reduce((n, c) => n + c.strings, 0)} chuỗi chữ tiếng Anh.`,
    '',
    '## Row có giao diện',
    '',
    '| Row | Gói | Chuỗi chữ | Cắm vào | Mô tả |',
    '|---|---|---|---|---|',
    ...visible.map(
      (c) =>
        `| \`${c.id}\`${c.disabled ? ' (tắt có điều kiện)' : ''} | \`${c.package.replace('@deepseek-ai/', '')}\` | ${c.strings || ''} | ${c.registers
          .slice(0, 6)
          .map((r) => `\`${r}\``)
          .join(
            ' ',
          )}${c.registers.length > 6 ? ' …' : ''} | ${c.description.replace(/\|/g, '/').slice(0, 110)} |`,
    ),
    '',
    '## Chỗ cắm',
    '',
    result.slots.map((s) => `\`${s}\``).join(' · '),
    '',
    '## Nhóm token theme',
    '',
    '| Nhóm | Số token |',
    '|---|---|',
    ...Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .map(([g, n]) => `| \`--dsw-${g}-*\` | ${n} |`),
    '',
  ].join('\n')
  writeFileSync(process.argv[mdAt + 1], md)
  console.log(`đã ghi ${process.argv[mdAt + 1]}`)
}
