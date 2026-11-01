/**
 * Dự án của aris (quyết định 11, bước 3b; đặc tả: docs/specs/aris-projects.md):
 * - Dự án là một workspace của dsh kèm hồ sơ của aris: mục tiêu, thành viên, luật trò chuyện.
 * - Mỗi dự án một phiên chính, Aris làm trưởng nhóm: Team của dự án là Team của phiên này.
 * - Ngữ cảnh `aris:project` cho mọi phiên trong dự án.
 * - `/api/aris/projects` cho hộp Tạo dự án (1.5) và cột phải của dự án (1.4).
 * @module @aris/projects
 */
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { ArisBots } from '@aris/bots'
import { DEFAULT_WORKSPACE_DIRECTORY, defaultHomePath } from '@aris/home'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-client-connection'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { WorkspaceId } from '@deepseek-ai/dsh-workspace'
import { handleApi, type WorkspaceLike } from './api.js'
import { buildBoard, foldTeam, type CardView, type JobLike, type TeamState } from './board.js'
import { renderProject } from './context.js'
import { projectsDomain, type CardRecord, type PlanRecord, type ProjectRecord, type Table } from './domain.js'
import { CardStore, PlanStore, ProjectError, ProjectStore } from './store.js'

export * from './domain.js'
export { CardStore, DEFAULT_RULES, PlanStore, ProjectStore, cleanRules } from './store.js'
export {
  buildBoard,
  foldTeam,
  COLUMNS,
  type CardView,
  type Column,
  type JobLike,
  type TaskLike,
  type TeamState,
} from './board.js'
export { renderProject } from './context.js'

export const name = 'aris-projects'
export const inject = [
  'storageDomain',
  'systemPrompt',
  'sessionController',
  'workspaceRegistry',
  'sessionQuery',
]

/** Sau tính cách (290), ký ức lõi (300); trước hướng dẫn giao việc của Commander (310). */
export const CONTEXT_ORDER = 305

/** Phần của @aris/brain dự án dùng (bản vẽ 4.3b). */
interface BrainPort {
  /** Trang bộ não bot của phiên được đọc: tên, tiêu đề, tóm tắt. */
  pageFor?(
    sessionId: string,
    path: string,
  ): { name: string; title: string; summary?: string | undefined } | undefined
  /** Tạo trang Dự án mới (hay nối trang có sẵn) và ghi vào dự án. */
  linkProject?(o: { workspace: string; path?: string }): Promise<unknown>
}

/** Dịch vụ cho plugin khác: dự án của một phiên (Kanban, chat chung ở bước sau). */
export interface ArisProjects {
  store: ProjectStore
  /** Thẻ người dùng tạo trên Kanban, chờ chia việc. */
  cards: CardStore
  ofSession(sessionId: string): { project: ProjectRecord; path: string } | undefined
  /** Bảng việc của dự án (Kanban, cột phải). */
  board(workspaceId: string): Promise<CardView[]>
  /** Bot dự kiến cho thẻ của Team (`tao_the`, Driver). */
  plans: PlanStore
  /** Bảng việc của Team trong phiên chính, đọc log (không đánh thức phiên): Driver. */
  team(workspaceId: string): Promise<TeamState>
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

  const cards = new CardStore(domain.table('cards') as unknown as Table<CardRecord>)
  const plans = new PlanStore(domain.table('plans') as unknown as Table<PlanRecord>)

  /** Bảng việc của Team trong phiên chính (đọc log, không đánh thức phiên). */
  async function teamOf(project: ProjectRecord | undefined): Promise<TeamState> {
    const empty: TeamState = { tasks: new Map(), members: new Map() }
    if (!project?.mainSession) return empty
    try {
      const obs = await ctx.sessionQuery.observeSession(SessionId(project.mainSession), {
        projectionMode: 'none',
      })
      try {
        return foldTeam(obs.events as unknown as { type: string; data?: unknown }[])
      } finally {
        obs[Symbol.dispose]()
      }
    } catch (e) {
      logger.warn('đọc bảng việc của %s: %s', project.name, String(e))
      return empty
    }
  }
  async function board(workspaceId: string): Promise<CardView[]> {
    const b = bots()
    const jobsService = ctx.get('arisJobs') as
      | {
          forWorkspace(ws: string): (Omit<JobLike, 'progress' | 'departmentName'> & { department: string })[]
          progressOf(job: unknown): Promise<{ done: number; total: number }>
        }
      | undefined
    const jobs = await Promise.all(
      (jobsService?.forWorkspace(workspaceId) ?? []).map(async (j) => ({
        ...j,
        departmentName: b?.store.departments().find((d) => d.id === j.department)?.name ?? j.department,
        progress: await jobsService!.progressOf(j),
      })),
    )
    const driverFlags = ctx.get('arisDriver') as
      { flags(ws: string): { gaveUp: string[]; stuck: string[] } } | undefined
    return buildBoard({
      jobs,
      team: await teamOf(store.get(workspaceId)),
      drafts: cards.list(workspaceId),
      planned: plans.forWorkspace(workspaceId),
      ...(driverFlags ? { driver: driverFlags.flags(workspaceId) } : {}),
      botOfHandle: (h) => b?.store.byHandle(h)?.id,
      sessionState: (sid) => b?.live.sessionState(sid) ?? 'idle',
    })
  }

  const workspaces = (): WorkspaceLike[] =>
    ctx.workspaceRegistry
      .list()
      .filter((w) => isProjectPath(w.path))
      .map((w) => ({ id: w.id, path: w.path, title: w.title, sessionIds: w.sessionIds }))
  const workspaceOf = (sessionId: string) => workspaces().find((w) => w.sessionIds.includes(sessionId))

  const service: ArisProjects = {
    store,
    cards,
    board,
    plans,
    team: (workspaceId) => teamOf(store.get(workspaceId)),
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
          const brain = ctx.get('arisBrain') as BrainPort | undefined
          return renderProject(
            found.project,
            b.store.botOf(id),
            b.store.list(),
            found.path,
            cards.list(found.project.workspace),
            found.project.mainSession === id,
            found.project.page ? brain?.pageFor?.(id, found.project.page) : undefined,
          )
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
              cards,
              board,
              handleOf: (id) => bots()?.store.get(id)?.handle,
              linkPage: async (workspace) =>
                (ctx.get('arisBrain') as BrainPort | undefined)?.linkProject?.({ workspace }),
              async prompt(sessionId, text) {
                await ctx.sessionController.prompt(
                  {
                    requestId: randomUUID() as never,
                    sessionId: SessionId(sessionId),
                    mode: 'queue',
                    content: [{ type: 'text', text }],
                  },
                  AbortSignal.timeout(30_000),
                )
              },
            },
            request,
          ),
      })
      return () => void dispose()
    }, 'aris-projects: /api/aris/projects')
  })
}
