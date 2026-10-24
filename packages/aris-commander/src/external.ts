/**
 * Bot ngoài (bước 4; đặc tả: docs/specs/aris-commander.md, bản vẽ 2.1b, 2.1c). Máy có CLI thì aris
 * tự chạy (`claude-driver.ts`, `codex-driver.ts`); tệp này là đường dự phòng qua plugin của dsh và
 * phần dùng chung (worktree, lời giao):
 * - Mỗi bot ngoài một nhà cung cấp riêng `aris-<mã bot>` trên `ctx.subagents`: aris nạp module
 *   plugin chính thức của dsh (cài từ hộp Thêm bot ngoài, nằm trong thư mục profile) và gắn với
 *   mức quyền, model của bot đó. Không bật lớp profile của plugin nên không lộ công cụ chung.
 * - Giao việc: một lần chạy trọn gói qua `startActivation` (kết quả về phiên giao thành thông báo
 *   của dsh), worktree riêng nếu bật, tự dừng khi quá giờ. Trạng thái lưu ở bảng `externals`.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  EXTERNAL_LABEL,
  EXTERNAL_PACKAGES,
  providerConfig,
  providerOf,
  type ExternalAgent,
  type ExternalConfig,
} from '@aris/bots'

const run = promisify(execFile)

/** Thư mục có thể chứa plugin đã cài: profile đang chạy trước, rồi các profile khác. */
export function profileDirs(env = process.env, argv = process.argv): string[] {
  const home = env.DSH_HOME ?? join(homedir(), '.dsh')
  const i = argv.indexOf('--profile')
  const current = i >= 0 ? argv[i + 1] : undefined
  const dirs = current ? [join(home, 'profiles', current)] : []
  for (const p of ['aris', 'aris-headless', 'aris-acp', 'default'])
    if (p !== current) dirs.push(join(home, 'profiles', p))
  return dirs.filter((d) => existsSync(join(d, 'package.json')))
}

/** Đường dẫn module của gói plugin, tìm trong thư mục profile rồi trong phụ thuộc của aris. */
export function resolvePackage(pkg: string, dirs = profileDirs()): string | undefined {
  for (const base of [...dirs.map((d) => join(d, 'package.json')), import.meta.url]) {
    try {
      return createRequire(base).resolve(pkg)
    } catch {
      // Chưa cài ở chỗ này.
    }
  }
  return undefined
}

/** Đã đăng nhập agent trên máy chưa (đoán theo tệp cấu hình; `unknown` khi không đoán được). */
export function loginState(agent: ExternalAgent, home = homedir()): 'yes' | 'no' | 'unknown' {
  if (agent === 'claude-code')
    return existsSync(join(home, '.claude.json')) || existsSync(join(home, '.claude')) ? 'yes' : 'no'
  if (agent === 'codex') return existsSync(join(home, '.codex', 'auth.json')) ? 'yes' : 'no'
  return 'unknown'
}

export interface PluginModule {
  name?: string
  inject?: unknown
  apply(ctx: unknown, config: unknown): unknown
}

/** Một bot ngoài đã gắn: cấu hình đang dùng và cách gỡ. */
interface Mounted {
  key: string
  dispose(): void
}

export interface MountPort {
  /** Gắn module với cấu hình (cordis `ctx.plugin`), trả hàm gỡ. */
  mount(mod: PluginModule, config: Record<string, unknown>): () => void
  load(pkg: string): Promise<PluginModule | undefined>
  warn(msg: string): void
}

export type ExternalReady = 'ready' | 'missing' | 'error'

/** Gắn và gỡ nhà cung cấp theo danh sách bot ngoài; gọi lại mỗi khi đội đổi. */
export class ExternalHost {
  private mounted = new Map<string, Mounted>()
  private states = new Map<string, ExternalReady>()
  private syncing: Promise<void> = Promise.resolve()

  constructor(private port: MountPort) {}

  state(botId: string): ExternalReady {
    return this.states.get(botId) ?? 'missing'
  }

  sync(bots: readonly { id: string; external?: ExternalConfig | undefined }[]): Promise<void> {
    this.syncing = this.syncing.then(() => this.apply(bots)).catch((e: unknown) => this.port.warn(String(e)))
    return this.syncing
  }

  private async apply(bots: readonly { id: string; external?: ExternalConfig | undefined }[]) {
    const want = new Map(bots.flatMap((b) => (b.external ? [[b.id, b.external] as const] : [])))
    for (const [id, m] of this.mounted)
      if (!want.has(id)) {
        m.dispose()
        this.mounted.delete(id)
        this.states.delete(id)
      }
    for (const [id, cfg] of want) {
      const config = providerConfig(providerOf(id), cfg)
      const key = JSON.stringify([cfg.agent, config])
      const prev = this.mounted.get(id)
      if (prev?.key === key) continue
      prev?.dispose()
      this.mounted.delete(id)
      const mod = await this.port.load(EXTERNAL_PACKAGES[cfg.agent])
      if (!mod) {
        this.states.set(id, 'missing')
        continue
      }
      try {
        this.mounted.set(id, { key, dispose: this.port.mount(mod, config) })
        this.states.set(id, 'ready')
      } catch (e) {
        this.states.set(id, 'error')
        this.port.warn(`gắn bot ngoài ${id}: ${String(e)}`)
      }
    }
  }

  dispose() {
    for (const m of this.mounted.values()) m.dispose()
    this.mounted.clear()
  }
}

/** Nạp module plugin đã cài (một lần mỗi đường dẫn). */
export function moduleLoader(): (pkg: string) => Promise<PluginModule | undefined> {
  const cache = new Map<string, Promise<PluginModule | undefined>>()
  return (pkg) => {
    const path = resolvePackage(pkg)
    if (!path) return Promise.resolve(undefined)
    let p = cache.get(path)
    if (!p) {
      p = import(pathToFileURL(path).href).then((m: PluginModule & { default?: PluginModule }) =>
        typeof m.apply === 'function' ? m : m.default,
      )
      cache.set(path, p)
    }
    return p
  }
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'viec'

/** Nhánh và thư mục worktree cho một việc của bot ngoài (ngoài repo, dưới ~/.aris/worktrees). */
export function worktreePlan(repo: string, handle: string, title: string, id: string, home = homedir()) {
  const tag = `${handle}-${slug(title)}-${id.slice(-4)}`
  return { branch: `aris/${tag}`, dir: join(home, '.aris', 'worktrees', basename(repo), tag) }
}

/** Gốc repo git của thư mục, hoặc undefined khi không phải repo. */
export async function gitRoot(dir: string): Promise<string | undefined> {
  try {
    const { stdout } = await run('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { timeout: 10_000 })
    return stdout.trim() || undefined
  } catch {
    return undefined
  }
}

/** Đường dẫn tuyệt đối (hoặc `~/…`) nhắc trong nội dung việc, theo thứ tự xuất hiện, bỏ trùng. */
export function pathsIn(text: string, home = homedir()): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?:^|[\s"'`(«“])((?:~\/|\/)[^\s"'`)»”,;]+)/g)) {
    let p = m[1]!.replace(/[.:]+$/, '')
    if (p.startsWith('~/')) p = join(home, p.slice(2))
    if (p.length > 1 && !out.includes(p)) out.push(p)
  }
  return out
}

/** Thư mục có thật gần nhất của một đường dẫn: chính nó, hoặc thư mục chứa khi là tệp. */
async function dirOf(path: string): Promise<string | undefined> {
  try {
    return (await stat(path)).isDirectory() ? path : dirname(path)
  } catch {
    return undefined
  }
}

/**
 * Thư mục làm việc cho một việc của bot ngoài, theo thứ tự:
 * 1. `explicit`: thư mục Commander nêu khi giao (tham số `thu_muc`), phải có thật;
 * 2. phiên giao việc không ở trong repo nào: repo đầu tiên nhắc trong nội dung việc (gốc repo);
 * 3. thư mục của phiên giao việc.
 * `root` là gốc repo của thư mục chọn được (để tạo worktree), không có khi không phải repo.
 */
export async function targetDir(
  o: { explicit?: string | undefined; task: string; session?: string | undefined },
  home = homedir(),
): Promise<{ dir?: string | undefined; root?: string | undefined } | { error: string }> {
  if (o.explicit?.trim()) {
    const raw = o.explicit.trim()
    const path = raw.startsWith('~/') ? join(home, raw.slice(2)) : raw
    if (!isAbsolute(path)) return { error: `Thư mục «${raw}» phải là đường dẫn tuyệt đối.` }
    const dir = await dirOf(path)
    if (!dir) return { error: `Không có thư mục ${path} trên máy.` }
    return { dir, root: await gitRoot(dir) }
  }
  const sessionRoot = o.session ? await gitRoot(o.session) : undefined
  if (!sessionRoot)
    for (const p of pathsIn(o.task, home)) {
      const dir = await dirOf(p)
      const root = dir ? await gitRoot(dir) : undefined
      if (root) return { dir: root, root }
    }
  return { dir: o.session, root: sessionRoot }
}

/** Tạo worktree mới từ HEAD trên nhánh riêng. */
export async function addWorktree(repo: string, plan: { branch: string; dir: string }): Promise<void> {
  await mkdir(join(plan.dir, '..'), { recursive: true })
  await run('git', ['-C', repo, 'worktree', 'add', '-b', plan.branch, plan.dir, 'HEAD'], { timeout: 60_000 })
}

/**
 * Việc chạy trong worktree: đường dẫn repo gốc trong nội dung việc đổi thành đường dẫn worktree (Aris
 * hay ghi đường dẫn tuyệt đối của dự án; bot làm theo sẽ ghi ra ngoài worktree và bị sandbox chặn).
 */
export function inWorktree(task: string, wt?: { dir: string; repo?: string | undefined }): string {
  return wt?.repo ? task.split(wt.repo).join(wt.dir) : task
}

/** Lời giao việc cho bot ngoài: tự đủ, vì bot ngoài không thấy cuộc trò chuyện. */
export function externalBrief(o: {
  name: string
  task: string
  reason: string
  cwd?: string | undefined
  worktree?: { branch: string; dir: string } | undefined
}): string {
  return [
    `Bạn là ${o.name}, thành viên đội bot của aris, nhận một việc từ Commander.`,
    '',
    o.task.trim(),
    '',
    ...(o.worktree
      ? [
          `Thư mục làm việc của bạn: ${o.worktree.dir} (git worktree riêng, nhánh ${o.worktree.branch}). Đọc, ghi, chạy lệnh đều trong thư mục này; không ghi ra ngoài. Thay đổi để nguyên ở đây, người dùng tự xem rồi gộp.`,
        ]
      : o.cwd
        ? [`Thư mục làm việc: ${o.cwd}`]
        : []),
    `Vì sao là bạn: ${o.reason.trim()}`,
    'Bạn làm một mình, không hỏi lại được. Xong thì trả lời bằng kết quả: đã làm gì, tệp nào đổi, kiểm tra ra sao, còn gì dở.',
  ].join('\n')
}

export const label = (agent: ExternalAgent) => EXTERNAL_LABEL[agent]
