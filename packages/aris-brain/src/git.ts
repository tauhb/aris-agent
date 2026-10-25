/**
 * Lịch sử git của kho bộ não: thay đổi do aris làm commit ngay; thay đổi bằng Obsidian gom lại theo nhịp.
 * Đây là `.git` thật của kho (người dùng thấy trong Obsidian, đẩy lên đâu tuỳ ý), khác kho ẩn của điểm
 * khôi phục.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export class VaultGit {
  constructor(readonly root: string) {}

  private run(args: readonly string[]): Promise<string> {
    return new Promise((ok, fail) =>
      execFile(
        'git',
        ['-c', 'core.quotepath=false', ...args],
        {
          cwd: this.root,
          maxBuffer: 16 * 1024 * 1024,
          env: {
            PATH: process.env.PATH ?? '/usr/bin:/bin',
            HOME: homedir(),
            LANG: 'C',
            GIT_TERMINAL_PROMPT: '0',
            GIT_AUTHOR_NAME: 'aris',
            GIT_AUTHOR_EMAIL: 'aris@localhost',
            GIT_COMMITTER_NAME: 'aris',
            GIT_COMMITTER_EMAIL: 'aris@localhost',
          },
        },
        (err, stdout, stderr) => (err ? fail(new Error(`${err.message}\n${stderr}`.trim())) : ok(stdout)),
      ),
    )
  }

  available(): Promise<boolean> {
    return new Promise((ok) => execFile('git', ['--version'], (err) => ok(!err)))
  }

  async init(): Promise<boolean> {
    if (existsSync(join(this.root, '.git'))) return false
    await this.run(['init', '-q'])
    return true
  }

  /** Tệp đã đổi chưa commit (đường dẫn tương đối). */
  async pending(): Promise<string[]> {
    const out = await this.run(['status', '--porcelain', '-z', '--untracked-files=all'])
    const files: string[] = []
    const parts = out.split('\0').filter(Boolean)
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]!
      files.push(p.slice(3))
      // Đổi tên: phần kế tiếp là tên cũ.
      if (p[0] === 'R' || p[0] === 'C') i++
    }
    return files
  }

  /** Commit các tệp đã cho (hay mọi thay đổi); không có gì đổi thì thôi. Trả mã commit. */
  async commit(message: string, paths?: readonly string[]): Promise<string | undefined> {
    if (paths?.length) await this.run(['add', '-A', '--', ...paths])
    else await this.run(['add', '-A'])
    const staged = await this.run(['diff', '--cached', '--name-only'])
    if (!staged.trim()) return undefined
    await this.run(['commit', '-q', '--no-verify', '-m', message])
    return (await this.run(['rev-parse', 'HEAD'])).trim()
  }
}

/** Lời commit gom thay đổi bằng Obsidian: "<tên> sửa: a.md, b.md (+3)". */
export function sweepMessage(who: string, files: readonly string[]): string {
  const names = files.map((f) => f.split('/').pop() ?? f)
  const shown = names.slice(0, 3).join(', ')
  return `${who} sửa: ${shown}${names.length > 3 ? ` (+${names.length - 3})` : ''}`
}
