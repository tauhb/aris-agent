/**
 * Tìm CLI của agent ngoài trên máy (`claude`, `codex`): theo PATH rồi các chỗ cài phổ biến (launchd
 * chạy aris với PATH tối thiểu). Có thì aris tự chạy (bộ chuyển tự viết); không thì dùng plugin dsh.
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
    join(home, '.claude', 'local'),
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

/** Phiên bản CLI (dòng đầu của `--version`), hoặc undefined khi không chạy được. */
export async function cliVersion(bin: string): Promise<string | undefined> {
  try {
    const { stdout } = await run(bin, ['--version'], { timeout: 15_000 })
    return stdout
      .trim()
      .split('\n')[0]
      ?.match(/\d+\.\d+\.\d+/)?.[0]
  } catch {
    return undefined
  }
}
