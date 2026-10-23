/**
 * Chỗ chat riêng của aris. Quyết định 11: mọi workspace khác là một dự án; workspace mặc định
 * (thư mục `default-workspace`, theo quy ước của dsh) là nơi chat riêng với Aris. dsh chỉ tự
 * tạo workspace này khi chưa có phiên nào, nên ai mở app từ một thư mục khác sẽ không có
 * nó và mọi "Việc mới" rơi vào dự án. Đường `POST /api/aris/home` tìm hoặc tạo workspace
 * ấy rồi trả mã cho nút "Việc mới".
 * @module @aris/home
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Workspace } from '@deepseek-ai/dsh-workspace'

export const name = 'aris-home'
export const inject = ['workspaceRegistry']

/** Tên thư mục của workspace mặc định, theo `dsh-api-workspace-controller`. */
export const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

export interface Config {
  /** Thư mục chat riêng; bỏ trống thì như dsh: `<Documents>/deepseek-harness/default-workspace`. */
  path?: string | undefined
}

export interface Registry {
  list(): Pick<Workspace, 'id' | 'path'>[]
  create(path: string, title?: string): Promise<Pick<Workspace, 'id' | 'path'>>
}

const isHome = (path: string) =>
  path
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .pop() === DEFAULT_WORKSPACE_DIRECTORY

export function defaultHomePath(): string {
  return join(homedir(), 'Documents', 'deepseek-harness', DEFAULT_WORKSPACE_DIRECTORY)
}

/** Workspace chat riêng: dùng cái đã đăng ký, chưa có thì tạo thư mục và đăng ký. */
export async function ensureHome(
  registry: Registry,
  path = defaultHomePath(),
): Promise<{ workspaceId: string; path: string }> {
  const found = registry.list().find((w) => isHome(w.path))
  if (found) return { workspaceId: found.id, path: found.path }
  await mkdir(path, { recursive: true })
  const created = await registry.create(path, DEFAULT_WORKSPACE_DIRECTORY)
  return { workspaceId: created.id, path: created.path }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

export function apply(ctx: Context, config: Config = {}): void {
  const registry = ctx.workspaceRegistry as unknown as Registry
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/home',
        methods: ['POST'],
        requestBody: 'buffered',
        // dsh đã kiểm Host/Origin, cookie và quyền chủ nhân.
        fetch: async () => {
          try {
            return json(await ensureHome(registry, config.path ?? defaultHomePath()))
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : String(err) }, 500)
          }
        },
      })
      return () => void dispose()
    }, 'aris-home: /api/aris/home')
  })
}
