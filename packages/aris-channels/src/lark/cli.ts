/**
 * Dò `lark-cli` (tuỳ chọn) trên máy. Có thì trang Lark ghi thêm "bot dùng được qua lệnh shell"; không có thì không hiện
 * gì. Dò theo cách `@aris/commander` dò CLI của agent ngoài (PATH rồi các chỗ cài phổ biến, vì launchd chạy aris với PATH
 * tối thiểu). Chép gọn vào đây vì gói kênh không phụ thuộc commander. Chỉ chạy `lark-cli --version`, không chạy lệnh nào khác.
 */
import { execFile } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export function binDirs(env = process.env, home = homedir()): string[] {
  return [
    ...(env.PATH ?? '').split(delimiter),
    join(home, '.local', 'bin'),
    join(home, 'Library', 'pnpm'),
    join(home, '.npm-global', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter(Boolean)
}

/** Đường dẫn đầy đủ của một lệnh, hoặc undefined khi không có. */
export function findBinary(name: string, dirs = binDirs()): string | undefined {
  for (const d of dirs) {
    const p = join(d, name)
    try {
      accessSync(p, constants.X_OK)
      return p
    } catch {
      // Không có ở đây.
    }
  }
  return undefined
}

export interface LarkCliInfo {
  path: string
  /** Phiên bản (dòng đầu của `--version`), hoặc null khi không đọc được. */
  version: string | null
}

export interface LarkCliDeps {
  find?: (name: string) => string | undefined
  version?: (bin: string) => Promise<string | null>
  now?: () => number
}

async function readVersion(bin: string): Promise<string | null> {
  try {
    const { stdout } = await run(bin, ['--version'], { timeout: 15_000 })
    return (
      stdout
        .trim()
        .split('\n')[0]
        ?.match(/\d+\.\d+\.\d+\S*/)?.[0] ?? null
    )
  } catch {
    return null
  }
}

/** Dò `lark-cli`, nhớ kết quả 60 giây (trang cài đặt tải lại mỗi 5 giây). */
export function larkCliProbe(deps: LarkCliDeps = {}) {
  const find = deps.find ?? ((n: string) => findBinary(n))
  const version = deps.version ?? readVersion
  const now = deps.now ?? Date.now
  let cached: { at: number; value: Promise<LarkCliInfo | null> } | undefined
  return (): Promise<LarkCliInfo | null> => {
    if (cached && now() - cached.at < 60_000) return cached.value
    const path = find('lark-cli')
    const value = path ? version(path).then((v) => ({ path, version: v })) : Promise.resolve(null)
    cached = { at: now(), value }
    return value
  }
}
