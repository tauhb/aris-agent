// Tạo (hoặc tạo lại) ba profile aris trong DSH_HOME của repo: mỗi profile lấy
// từ mẫu dsh tương ứng rồi gắn @aris/bundle bằng link tới packages/aris-bundle.
// Chạy lại an toàn: profile đã có bundle thì bỏ qua.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PROFILES, arisHome, dshBin, repoRoot } from './paths.mjs'

const home = arisHome()
mkdirSync(home, { recursive: true })
const env = { ...process.env, DSH_HOME: home }
const dsh = (args) =>
  execFileSync(process.execPath, [dshBin(), ...args], { env, stdio: ['ignore', 'pipe', 'inherit'] })
const bundleDir = join(repoRoot, 'packages', 'aris-bundle')
const reset = process.argv.includes('--reset')

for (const { name, template } of PROFILES) {
  const manifest = join(home, 'profiles', name, 'package.json')
  if (reset || !existsSync(manifest)) {
    dsh(['--profile', name, '--from-default-profile', template, '--dump-config'])
  }
  const bundles = JSON.parse(readFileSync(manifest, 'utf8')).dsh?.profile?.bundles ?? []
  if (!bundles.includes('@aris/bundle')) {
    dsh(['plugin', '--profile', name, 'add', bundleDir])
  }
  const layers = String(dsh(['--profile', name, '--dump-config']))
    .split('\n')
    .filter((l) => l.startsWith('# == '))
    .map((l) => l.slice(5))
    .filter((l, i, all) => !l.includes(', patched by ') && all.indexOf(l) === i)
  console.log(`${name.padEnd(14)} ${layers.join(' → ')}`)
}
// Lớp dò cho kiểm tra khởi động (scripts/acp-handshake.mjs, CI): đường dẫn phải tuyệt đối.
const probe = join(home, 'probe.patch.yml')
writeFileSync(
  probe,
  `- insert:\n    - id: aris-probe\n      name: '${join(repoRoot, 'scripts', 'probe-plugin.mjs')}'\n`,
)
console.log(`DSH_HOME=${home}`)
