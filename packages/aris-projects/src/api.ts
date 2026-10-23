/**
 * `/api/aris/projects`: dự án (workspace của dsh kèm hồ sơ của aris). dsh đã kiểm cookie và quyền
 * chủ nhân trước khi gọi tới đây.
 */
import { ProjectError, type ProjectInput, type ProjectStore } from './store.js'

export interface WorkspaceLike {
  id: string
  path: string
  title: string
  sessionIds: readonly string[]
}

export interface ApiDeps {
  store: ProjectStore
  /** Workspace là dự án (không gồm chỗ chat riêng). */
  workspaces: () => WorkspaceLike[]
  /** Tạo thư mục nếu chưa có, rồi tạo (hoặc lấy lại) workspace của dsh cho thư mục đó. */
  createWorkspace: (path: string, name: string) => Promise<WorkspaceLike>
  renameWorkspace: (id: string, name: string) => Promise<void>
  /** Phiên chính mới của dự án (Aris trưởng nhóm), ghim lên đầu dự án; trả mã phiên. */
  newMainSession: (workspaceId: string) => Promise<string>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

function snapshot(d: ApiDeps) {
  return {
    projects: d.workspaces().map((w) => ({
      workspace: w.id,
      path: w.path,
      title: w.title,
      sessions: w.sessionIds.length,
      project: d.store.get(w.id) ?? null,
    })),
  }
}

/** Phiên chính còn trong workspace thì dùng lại, không thì tạo phiên mới. */
async function ensureMain(d: ApiDeps, w: WorkspaceLike): Promise<string> {
  const rec = d.store.get(w.id)
  if (rec?.mainSession && w.sessionIds.includes(rec.mainSession)) return rec.mainSession
  const sessionId = await d.newMainSession(w.id)
  await d.store.upsert(w.id, { mainSession: sessionId }, w.title)
  return sessionId
}

export async function handleApi(d: ApiDeps, request: Request): Promise<Response> {
  if (request.method === 'GET') return json(snapshot(d))
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  try {
    switch (body.op) {
      case 'create': {
        const p = (body.project ?? {}) as ProjectInput & { path?: string }
        const name = typeof p.name === 'string' ? p.name.trim() : ''
        const path = typeof p.path === 'string' ? p.path.trim() : ''
        if (!name) throw new ProjectError('Dự án cần có tên.')
        if (!path) throw new ProjectError('Dự án cần một thư mục làm việc.')
        const w = await d.createWorkspace(path, name)
        const taken = d.store.get(w.id)
        if (taken) throw new ProjectError(`Thư mục này đã là dự án «${taken.name}».`)
        await d.store.upsert(w.id, { ...p, name }, name)
        const sessionId = await ensureMain(d, w)
        return json({ ...snapshot(d), workspace: w.id, sessionId })
      }
      case 'update': {
        const id = String(body.workspace)
        const w = d.workspaces().find((x) => x.id === id)
        if (!w) throw new ProjectError('Không có dự án này.')
        const patch = (body.patch ?? {}) as ProjectInput
        const rec = await d.store.upsert(id, patch, w.title)
        if (patch.name && rec.name !== w.title) await d.renameWorkspace(id, rec.name)
        break
      }
      case 'main': {
        const id = String(body.workspace)
        const w = d.workspaces().find((x) => x.id === id)
        if (!w) throw new ProjectError('Không có dự án này.')
        return json({ sessionId: await ensureMain(d, w) })
      }
      default:
        return json({ error: 'op không hợp lệ' }, 400)
    }
    return json(snapshot(d))
  } catch (err) {
    if (err instanceof ProjectError) return json({ error: err.message }, 400)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
}
