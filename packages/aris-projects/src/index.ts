/**
 * Dự án của aris (quyết định 11, bước 3b; đặc tả: docs/specs/aris-projects.md):
 * - Dự án là một workspace của dsh kèm hồ sơ của aris: mục tiêu, thành viên, luật trò chuyện.
 * - Mỗi dự án một phiên chính, Aris làm trưởng nhóm: Team của dự án là Team của phiên này.
 * - Ngữ cảnh `aris:project` cho mọi phiên trong dự án.
 * - `/api/aris/projects` cho hộp Tạo dự án (1.5) và cột phải của dự án (1.4).
 * @module @aris/projects
 */
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { ArisBots } from '@aris/bots'
import { DEFAULT_WORKSPACE_DIRECTORY, defaultHomePath } from '@aris/home'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { handleApi, type WorkspaceLike } from './api.js'
import { renderProject } from './context.js'
import { projectsDomain, type ProjectRecord, type Table } from './domain.js'
import { ProjectError, ProjectStore } from './store.js'

export * from './domain.js'
export { DEFAULT_RULES, ProjectStore, cleanRules } from './store.js'
export { renderProject } from './context.js'

export const name = 'aris-projects'
export const inject = ['storageDomain', 'systemPrompt', 'sessionController', 'workspaceRegistry']

/** Sau tính cách (290), ký ức lõi (300); trước hướng dẫn giao việc của Commander (310). */
export const CONTEXT_ORDER = 305

/** Dịch vụ cho plugin khác: dự án của một phiên (Kanban, chat chung ở bước sau). */
export interface ArisProjects {
  store: ProjectStore
  ofSession(sessionId: string): { project: ProjectRecord; path: string } | undefined
}

/** Chỗ chat riêng của aris và workspace mặc định của dsh không phải dự án (giống `isProjectWorkspace` của giao diện). */
export function isProjectPath(path: string, home = defaultHomePath()): boolean {
  const p = path.replace(/[\\/]+$/, '')
  return p.split(/[\\/]/).pop() !== DEFAULT_WORKSPACE_DIRECTORY && p !== home.replace(/[\\/]+$/, '')
}

/** `~/...` thành đường tuyệt đối; đường tương đối bị từ chối. */
export function expandPath(path: string, home = homedir()): string {
  const p = path.trim()
  const out = p === '~' ? home : p.startsWith('~/') ? join(home, p.slice(2)) : p
  if (!isAbsolute(out))
    throw new ProjectError('Thư mục làm việc cần là đường dẫn đầy đủ, ví dụ ~/Projects/ten-du-an.')
  return out
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-projects')
  const domain = await ctx.storageDomain.open(projectsDomain)
  ctx.effect(() => () => void domain.close(), 'aris-projects: domain')
  const bots = () => ctx.get('arisBots') as ArisBots | undefined
  const store = new ProjectStore(
    domain.table('projects') as unknown as Table<ProjectRecord>,
    (id) => bots()?.store.get(id)?.kind === 'member',
  )

  const workspaces = (): WorkspaceLike[] =>
    ctx.workspaceRegistry
      .list()
      .filter((w) => isProjectPath(w.path))
      .map((w) => ({ id: w.id, path: w.path, title: w.title, sessionIds: w.sessionIds }))
  const workspaceOf = (sessionId: string) => workspaces().find((w) => w.sessionIds.includes(sessionId))

  const service: ArisProjects = {
    store,
    ofSession(sessionId) {
      const w = workspaceOf(sessionId)
      const project = w ? store.get(w.id) : undefined
      return w && project ? { project, path: w.path } : undefined
    },
  }
  ctx.provide('arisProjects', service)

  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:project',
        order: CONTEXT_ORDER,
        text: (c) => {
          const id = c?.agent?.session.id
          const found = id ? service.ofSession(id) : undefined
          const b = bots()
          if (!found || !b || !id) return ''
          return renderProject(found.project, b.store.botOf(id), b.store.list(), found.path)
        },
        interpolate: false,
      }),
    'aris-projects: context',
  )

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/projects',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) =>
          handleApi(
            {
              store,
              workspaces,
              async createWorkspace(path, title) {
                const dir = expandPath(path)
                await mkdir(dir, { recursive: true })
                const w = await ctx.workspaceRegistry.create(dir, title)
                return { id: w.id, path: w.path, title: w.title, sessionIds: w.sessionIds }
              },
              async renameWorkspace(id, title) {
                await ctx.workspaceRegistry.get(WorkspaceId(id))?.setTitle(title)
              },
              async newMainSession(workspaceId) {
                const { sessionId } = await ctx.sessionController.create({
                  workspaceId: WorkspaceId(workspaceId),
                })
                await ctx.workspaceRegistry
                  .pinSession(sessionId)
                  .catch((e: unknown) => logger.warn('ghim phiên chính của dự án: %s', String(e)))
                return sessionId
              },
            },
            request,
          ),
      })
      return () => void dispose()
    }, 'aris-projects: /api/aris/projects')
  })
}
