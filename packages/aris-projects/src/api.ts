/**
 * `/api/aris/projects`: dự án (workspace của dsh kèm hồ sơ của aris). dsh đã kiểm cookie và quyền
 * chủ nhân trước khi gọi tới đây.
 */
import type { CardView } from './board.js'
import { ProjectError, type CardStore, type ProjectInput, type ProjectStore } from './store.js'

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
  cards: CardStore
  /** Bảng việc của dự án (Kanban). */
  board: (workspaceId: string) => Promise<CardView[]>
  /** Tên gọi của bot (để nhắn Aris giao thẻ). */
  handleOf: (botId: string) => string | undefined
  /** Gửi một tin của người dùng vào phiên (đánh thức Aris ở phiên chính). */
  prompt: (sessionId: string, text: string) => Promise<void>
  /** Dự án mới: tạo trang Dự án trong bộ não và nối (bản vẽ 4.3b); lỗi không chặn việc tạo dự án. */
  linkPage?: (workspace: string) => Promise<unknown>
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

async function boardOf(d: ApiDeps, workspace: string) {
  const p = d.store.get(workspace)
  return {
    workspace,
    cards: await d.board(workspace),
    split: p?.split ?? 'auto',
    driver: p?.driver ?? false,
    page: p?.page ?? null,
  }
}

/** Lời nhắn Aris khi người dùng bấm "Giao ngay" trên một thẻ chờ. */
export function dispatchPrompt(
  card: { id: string; title: string; description?: string | undefined },
  handle?: string,
): string {
  return [
    `Giao thẻ ${card.id} «${card.title}» ${handle ? `cho @${handle}` : 'cho bot hợp nhất trong dự án'} (người dùng bấm "Giao ngay" trên Kanban).`,
    card.description ? `Nội dung thẻ: ${card.description}` : '',
    `Dùng giao_viec với the=${card.id}; xong thì báo ngắn đã giao cho ai.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function handleApi(d: ApiDeps, request: Request): Promise<Response> {
  if (request.method === 'GET') {
    const board = new URL(request.url).searchParams.get('board')
    if (board) {
      if (!d.workspaces().some((w) => w.id === board)) return json({ error: 'Không có dự án này.' }, 400)
      return json(await boardOf(d, board))
    }
    return json(snapshot(d))
  }
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
        await d.linkPage?.(w.id).catch(() => undefined)
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
      case 'card-create': {
        const id = String(body.workspace)
        if (!d.workspaces().some((x) => x.id === id)) throw new ProjectError('Không có dự án này.')
        const c = (body.card ?? {}) as { title?: unknown; description?: unknown; bot?: unknown }
        await d.cards.create(id, {
          title: c.title,
          description: c.description,
          ...(typeof c.bot === 'string' && c.bot ? { bot: c.bot } : {}),
        })
        return json(await boardOf(d, id))
      }
      case 'card-update': {
        const card = await d.cards.update(
          String(body.id),
          (body.patch ?? {}) as { title?: unknown; bot?: string | null },
        )
        return json(await boardOf(d, card.workspace))
      }
      case 'card-delete': {
        const card = d.cards.get(String(body.id))
        if (!card) throw new ProjectError('Không có thẻ này.')
        await d.cards.remove(card.id)
        return json(await boardOf(d, card.workspace))
      }
      case 'card-dispatch': {
        let card = d.cards.get(String(body.id))
        if (!card) throw new ProjectError('Không có thẻ này.')
        if (card.taskId) throw new ProjectError('Thẻ đã giao.')
        if (typeof body.bot === 'string' && body.bot) card = await d.cards.update(card.id, { bot: body.bot })
        const w = d.workspaces().find((x) => x.id === card!.workspace)
        if (!w) throw new ProjectError('Không có dự án này.')
        const main = await ensureMain(d, w)
        await d.prompt(main, dispatchPrompt(card, card.bot ? d.handleOf(card.bot) : undefined))
        return json({ ...(await boardOf(d, w.id)), sessionId: main })
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
