/**
 * Bot ngoài (bước 4; đặc tả: docs/specs/aris-commander.md, bản vẽ 2.1b, 2.1c):
 * - Mỗi bot ngoài một nhà cung cấp riêng `aris-<mã bot>` trên `ctx.subagents`: aris nạp module
 *   plugin chính thức của dsh (cài từ hộp Thêm bot ngoài, nằm trong thư mục profile) và gắn với
 *   mức quyền, model của bot đó. Không bật lớp profile của plugin nên không lộ công cụ chung.
 * - Giao việc: một lần chạy trọn gói qua `startActivation` (kết quả về phiên giao thành thông báo
 *   của dsh), worktree riêng nếu bật, tự dừng khi quá giờ. Trạng thái lưu ở bảng `externals`.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
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

/** Tạo worktree mới từ HEAD trên nhánh riêng. */
export async function addWorktree(repo: string, plan: { branch: string; dir: string }): Promise<void> {
  await mkdir(join(plan.dir, '..'), { recursive: true })
  await run('git', ['-C', repo, 'worktree', 'add', '-b', plan.branch, plan.dir, 'HEAD'], { timeout: 60_000 })
}

/** Lời giao việc cho bot ngoài: tự đủ, vì bot ngoài không thấy cuộc trò chuyện. */
export function externalBrief(o: {
  name: string
  task: string
  reason: string
  cwd?: string | undefined
  worktree?: { branch: string } | undefined
}): string {
  return [
    `Bạn là ${o.name}, thành viên đội bot của aris, nhận một việc từ Commander.`,
    '',
    o.task.trim(),
    '',
    ...(o.worktree
      ? [
          `Bạn đang ở một git worktree riêng (nhánh ${o.worktree.branch}). Thay đổi để nguyên trong worktree, người dùng tự xem rồi gộp.`,
        ]
      : o.cwd
        ? [`Thư mục làm việc: ${o.cwd}`]
        : []),
    `Vì sao là bạn: ${o.reason.trim()}`,
    'Bạn làm một mình, không hỏi lại được. Xong thì trả lời bằng kết quả: đã làm gì, tệp nào đổi, kiểm tra ra sao, còn gì dở.',
  ].join('\n')
}

export const label = (agent: ExternalAgent) => EXTERNAL_LABEL[agent]
