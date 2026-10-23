import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Thư mục DSH_HOME aris dùng. */
export function arisHome() {
  return resolve(process.env.ARIS_DSH_HOME ?? join(repoRoot, '.dsh-home'))
}

/**
 * Socket của aris đang chạy (khớp với `@aris/daemon`): `~/.aris/run/<băm DSH_HOME>.sock`, vì đường
 * Unix socket của macOS tối đa 104 ký tự.
 */
export function socketPath(home = arisHome()) {
  return join(
    homedir(),
    '.aris',
    'run',
    `${createHash('sha256').update(resolve(home)).digest('hex').slice(0, 12)}.sock`,
  )
}

/** Đường dẫn tới CLI dsh đã ghim trong repo. */
export function dshBin() {
  const require = createRequire(join(repoRoot, 'package.json'))
  const pkg = require.resolve('@deepseek-ai/dsh/package.json')
  const bin = require(pkg).bin
  return join(dirname(pkg), typeof bin === 'string' ? bin : bin.dsh)
}

/** Ba mặt của aris: tên profile, mẫu profile dsh nó dựa vào, và các bundle aris gắn thêm. */
export const PROFILES = [
  { name: 'aris', template: 'web', bundles: ['aris-bundle', 'aris-web-bundle'] },
  { name: 'aris-acp', template: 'acp', bundles: ['aris-bundle'] },
  { name: 'aris-headless', template: 'headless', bundles: ['aris-bundle'] },
]
