/**
 * Kho git ẩn của điểm khôi phục (đặc tả: docs/specs/aris-checkpoints.md): một kho trần dùng chung,
 * mỗi thư mục một chỉ mục riêng; mỗi điểm là một commit có nhánh `refs/aris/<mã thư mục>/<commit>`.
 * Không đụng tới `.git` thật của dự án.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { DIFF_MAX_BYTES, EXCLUDES, MAX_FILE_BYTES, MAX_FILES, parseNameStatus } from './rules.js'

export class CheckpointError extends Error {}

export interface Change {
  /** `A` tạo sau điểm, `D` xoá sau điểm, `M` sửa. */
  status: string
  path: string
}

export class ShadowStore {
  readonly store: string

  constructor(readonly root: string = join(homedir(), '.aris', 'checkpoints')) {
    this.store = join(root, 'store')
  }

  key(dir: string): string {
    return createHash('sha1').update(resolve(dir)).digest('hex').slice(0, 16)
  }

  private env(dir: string): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: homedir(),
      LANG: 'C',
      GIT_DIR: this.store,
      GIT_WORK_TREE: resolve(dir),
      GIT_INDEX_FILE: join(this.store, 'indexes', this.key(dir)),
      GIT_AUTHOR_NAME: 'aris',
      GIT_AUTHOR_EMAIL: 'aris@localhost',
      GIT_COMMITTER_NAME: 'aris',
      GIT_COMMITTER_EMAIL: 'aris@localhost',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_TERMINAL_PROMPT: '0',
    }
  }

  /** Chạy git trong thư mục; trả đầu ra chuẩn. */
  git(dir: string, args: readonly string[], input?: string): Promise<string> {
    return new Promise((ok, fail) => {
      const child = execFile(
        'git',
        ['-c', 'core.quotepath=false', '-c', 'core.autocrlf=false', ...args],
        { cwd: resolve(dir), env: this.env(dir), maxBuffer: 64 * 1024 * 1024 },
        (err, stdout, stderr) =>
          err ? fail(new CheckpointError(`${err.message}\n${stderr}`.trim())) : ok(stdout),
      )
      if (input !== undefined) child.stdin?.end(input)
    })
  }

  /** Có git trên máy không. */
  available(): Promise<boolean> {
    return new Promise((ok) => execFile('git', ['--version'], (err) => ok(!err)))
  }

  private async init(dir: string): Promise<void> {
    if (!existsSync(join(this.store, 'HEAD'))) {
      await mkdir(this.root, { recursive: true })
      await new Promise<void>((ok, fail) =>
        execFile('git', ['init', '--bare', '-q', this.store], (err) => (err ? fail(err) : ok())),
      )
      await mkdir(join(this.store, 'info'), { recursive: true })
      await writeFile(join(this.store, 'info', 'exclude'), `${EXCLUDES.join('\n')}\n`)
    }
    await mkdir(join(this.store, 'indexes'), { recursive: true })
    void dir
  }

  /** Đưa trạng thái hiện tại của thư mục vào chỉ mục (bỏ tệp quá lớn). */
  private async stage(dir: string): Promise<void> {
    await this.init(dir)
    const listed = await this.git(dir, ['ls-files', '-co', '--exclude-standard', '-z'])
    if (listed.split('\0').length > MAX_FILES) throw new CheckpointError('thư mục quá nhiều tệp')
    await this.git(dir, ['add', '-A', '--', '.'])
    const sized = await this.git(dir, ['ls-files', '-z', '--format=%(objectsize)\t%(path)'])
    const big = sized
      .split('\0')
      .filter(Boolean)
      .map((l) => l.split('\t'))
      .filter(([size]) => Number(size) > MAX_FILE_BYTES)
      .map(([, path]) => path!)
    if (big.length)
      await this.git(
        dir,
        ['rm', '--cached', '-q', '--pathspec-from-file=-', '--pathspec-file-nul'],
        `${big.join('\0')}\0`,
      )
  }

  /**
   * Chụp thư mục: trả commit mới, hoặc undefined khi không có gì đổi so với `last` (commit của điểm
   * trước của thư mục).
   */
  async snapshot(dir: string, message: string, last?: string): Promise<string | undefined> {
    await this.stage(dir)
    const tree = (await this.git(dir, ['write-tree'])).trim()
    if (last) {
      const prev = (
        await this.git(dir, ['rev-parse', '-q', '--verify', `${last}^{tree}`]).catch(() => '')
      ).trim()
      if (prev === tree) return undefined
    }
    const commit = (await this.git(dir, ['commit-tree', tree, '-m', message])).trim()
    await this.git(dir, ['update-ref', `refs/aris/${this.key(dir)}/${commit}`, commit])
    return commit
  }

  /** Tệp đổi từ điểm tới hiện tại. */
  async changes(dir: string, commit: string): Promise<Change[]> {
    await this.stage(dir)
    return parseNameStatus(await this.git(dir, ['diff', '--cached', '--no-renames', '--name-status', commit]))
  }

  /** Tệp đổi giữa hai điểm. */
  async between(dir: string, from: string, to: string): Promise<Change[]> {
    return parseNameStatus(await this.git(dir, ['diff', '--no-renames', '--name-status', from, to]))
  }

  /** Khác biệt từ điểm tới hiện tại: thống kê và phần khác biệt (cắt ngắn). */
  async diff(dir: string, commit: string): Promise<{ stat: string; patch: string; truncated: boolean }> {
    await this.stage(dir)
    const stat = await this.git(dir, ['diff', '--cached', '--no-renames', '--stat', commit])
    const patch = await this.git(dir, ['diff', '--cached', '--no-renames', commit])
    const truncated = Buffer.byteLength(patch) > DIFF_MAX_BYTES
    return { stat, patch: truncated ? patch.slice(0, DIFF_MAX_BYTES) : patch, truncated }
  }

  /**
   * Đưa thư mục (hay một tệp) về như lúc chụp: tệp sửa, tệp xoá lấy lại từ điểm; tệp tạo sau thì xoá.
   * Trả số tệp đã đổi.
   */
  async restore(dir: string, commit: string, file?: string): Promise<number> {
    const all = await this.changes(dir, commit)
    const list = file ? all.filter((c) => c.path === file) : all
    if (file && !list.length) throw new CheckpointError(`Tệp ${file} không đổi từ lúc chụp.`)
    const added = list.filter((c) => c.status === 'A')
    const back = list.filter((c) => c.status !== 'A')
    for (const c of added) await rm(join(resolve(dir), c.path), { force: true })
    if (back.length)
      await this.git(
        dir,
        ['checkout', commit, '--pathspec-from-file=-', '--pathspec-file-nul'],
        `${back.map((c) => c.path).join('\0')}\0`,
      )
    return list.length
  }

  /** Bỏ nhánh của một điểm (dọn kho); nội dung mất sau lần gc. */
  async drop(dir: string, commit: string): Promise<void> {
    await this.git(dir, ['update-ref', '-d', `refs/aris/${this.key(dir)}/${commit}`]).catch(() => undefined)
  }

  async gc(): Promise<void> {
    if (!existsSync(join(this.store, 'HEAD'))) return
    await this.git(this.root, ['gc', '--prune=now', '--quiet'])
  }
}
