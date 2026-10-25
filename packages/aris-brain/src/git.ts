/**
 * Lịch sử git của kho bộ não: thay đổi do aris làm commit ngay; thay đổi bằng Obsidian gom lại theo nhịp.
 * Đây là `.git` thật của kho (người dùng thấy trong Obsidian, đẩy lên đâu tuỳ ý), khác kho ẩn của điểm
 * khôi phục.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

export class VaultGit {
  constructor(readonly root: string) {}

  private run(args: readonly string[], input?: string): Promise<string> {
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
      ).stdin?.end(input ?? ''),
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
    if (paths?.length) {
      // Đường dẫn đã mất mà git chưa từng theo dõi (tệp chuyển đi từ Hộp thư vào) thì bỏ qua, không thì
      // `git add` báo lỗi cả lệnh.
      const keep: string[] = []
      for (const p of paths)
        if (existsSync(join(this.root, p)) || (await this.run(['ls-files', '--', p])).trim()) keep.push(p)
      if (keep.length) await this.run(['add', '-A', '--', ...keep])
    } else await this.run(['add', '-A'])
    const staged = await this.run(['diff', '--cached', '--name-only'])
    if (!staged.trim()) return undefined
    await this.run(['commit', '-q', '--no-verify', '-m', message])
    return (await this.run(['rev-parse', 'HEAD'])).trim()
  }

  /** Hoàn tác một commit, kèm thay đổi thêm (dòng nhật ký) trong cùng commit. Trùng chỗ thì bỏ và báo lỗi. */
  async revert(sha: string, message: string, extra?: () => Promise<readonly string[]>): Promise<string> {
    try {
      await this.run(['revert', '--no-commit', sha])
    } catch (e) {
      await this.run(['revert', '--abort']).catch(() => undefined)
      throw new Error(
        `trùng chỗ với thay đổi sau đó: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
        { cause: e },
      )
    }
    const paths = (await extra?.()) ?? []
    if (paths.length) await this.run(['add', '-A', '--', ...paths])
    await this.run(['commit', '-q', '--no-verify', '-m', message])
    return (await this.run(['rev-parse', 'HEAD'])).trim()
  }

  /** Lịch sử commit chạm vào một thư mục: mã, giờ, tiêu đề, tệp đổi. */
  async log(path: string, sinceDays: number): Promise<LogEntry[]> {
    const out = await this.run([
      'log',
      `--since=${sinceDays}.days.ago`,
      '--no-renames',
      '--name-status',
      '--format=%x1e%H%x09%ct%x09%s',
      '--',
      path,
    ])
    return parseLog(out)
  }

  /** Khác biệt của một commit trong một thư mục (bỏ tệp hệ thống). */
  show(sha: string, path: string): Promise<string> {
    return this.run(['show', '--no-renames', '--format=', '--unified=0', sha, '--', path])
  }

  /** Commit có tồn tại trong kho. */
  async has(sha: string): Promise<boolean> {
    return this.run(['cat-file', '-e', `${sha}^{commit}`]).then(
      () => true,
      () => false,
    )
  }
}

export interface LogEntry {
  sha: string
  at: number
  subject: string
  files: { status: string; path: string }[]
}

/** Đọc kết quả `git log --name-status` với dấu tách `\x1e`. */
export function parseLog(out: string): LogEntry[] {
  return out
    .split('\x1e')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [head = '', ...rest] = c.split('\n')
      const [sha = '', at = '0', ...subject] = head.split('\t')
      return {
        sha,
        at: Number(at) * 1000,
        subject: subject.join('\t'),
        files: rest
          .map((l) => l.split('\t'))
          .filter((p) => p.length >= 2)
          .map(([status = '', path = '']) => ({ status: status[0] ?? '', path })),
      }
    })
}

/**
 * Gộp ba chiều một trang (`git merge-file`): thay đổi của bản nạp (base → next) lên bản hiện tại. Trả nội
 * dung đã gộp và có trùng chỗ không.
 */
export async function merge3(
  current: string,
  base: string,
  next: string,
): Promise<{ text: string; clean: boolean }> {
  const dir = await mkdtemp(join(tmpdir(), 'aris-merge-'))
  try {
    const f = (n: string) => join(dir, n)
    await writeFile(f('cur'), current)
    await writeFile(f('base'), base)
    await writeFile(f('next'), next)
    const code = await new Promise<number>((ok) =>
      execFile('git', ['merge-file', '-q', f('cur'), f('base'), f('next')], (err) =>
        ok(err ? ((err as { code?: number }).code ?? 1) : 0),
      ),
    )
    return { text: await readFile(f('cur'), 'utf8'), clean: code === 0 }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Lời commit gom thay đổi bằng Obsidian: "<tên> sửa: a.md, b.md (+3)". */
export function sweepMessage(who: string, files: readonly string[]): string {
  const names = files.map((f) => f.split('/').pop() ?? f)
  const shown = names.slice(0, 3).join(', ')
  return `${who} sửa: ${shown}${names.length > 3 ? ` (+${names.length - 3})` : ''}`
}
