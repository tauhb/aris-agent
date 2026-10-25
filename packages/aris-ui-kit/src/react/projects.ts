/**
 * Dự án thật từ `/api/aris/projects` (gói `@aris/projects`): hồ sơ (mục tiêu, thành viên, luật,
 * phiên chính) theo workspace, dùng chung cho cột phải của dự án, Kanban… Mỗi gói client giữ bản
 * sao riêng; sửa ở đâu thì phát sự kiện `aris:projects-changed` để các gói khác tải lại ngay.
 */
import { useCallback, useSyncExternalStore } from 'react'

export interface ProjectRules {
  maxRounds: number
  maxMessages: number
  stopCommand: boolean
  arisSummarizes: boolean
}

export interface ProjectData {
  workspace: string
  name: string
  goal?: string
  members: string[]
  rules: ProjectRules
  mainSession?: string
  /** Chia việc trên Kanban: tự động (mặc định) hay thủ công. */
  split?: 'auto' | 'manual'
  /** Driver: tự giao thẻ đủ phụ thuộc cho bot dự kiến. */
  driver?: boolean
  /** Trang Dự án trong bộ não (đường dẫn trong kho, bản vẽ 4.3b). */
  page?: string
  createdAt: string
}

export interface ProjectEntry {
  workspace: string
  path: string
  title: string
  sessions: number
  /** Hồ sơ của aris; dự án cũ chưa có hồ sơ thì `null`. */
  project: ProjectData | null
}

export const PROJECTS_CHANGED = 'aris:projects-changed'

const endpoint = () => new URL('api/aris/projects', document.baseURI)
let snap: ProjectEntry[] | null = null
const listeners = new Set<() => void>()
let loading: Promise<void> | undefined
let listening = false

function set(next: ProjectEntry[]) {
  snap = next
  for (const l of listeners) l()
}

export function refreshProjects(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  loading ??= fetch(endpoint(), { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<{ projects: ProjectEntry[] }>) : undefined))
    .then((d) => d && set(d.projects))
    .catch(() => {})
    .finally(() => (loading = undefined))
  return loading
}

/** Gọi một thao tác của `/api/aris/projects`; lỗi ném ra với lời báo của máy chủ. */
export async function projectAction<R = { projects: ProjectEntry[] }>(
  body: Record<string, unknown>,
): Promise<R> {
  const res = await fetch(endpoint(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as R & { error?: string; projects?: ProjectEntry[] }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  if (out.projects) set(out.projects)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(PROJECTS_CHANGED))
  return out
}

function subscribe(fn: () => void) {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    // Gói khác vừa sửa dự án (hoặc vừa tạo dự án): tải lại.
    window.addEventListener(PROJECTS_CHANGED, () => void refreshProjects())
  }
  listeners.add(fn)
  if (!snap) void refreshProjects()
  return () => void listeners.delete(fn)
}

/** Mọi dự án (`null` khi chưa tải xong). */
export function useProjects(): ProjectEntry[] | null {
  return useSyncExternalStore(subscribe, () => snap)
}

/** Dự án theo đường thư mục của workspace. */
export function useProjectByPath(path: string | undefined): ProjectEntry | undefined {
  const all = useProjects()
  return path ? all?.find((p) => p.path === path) : undefined
}

/** Một thẻ trên bảng việc của dự án (`@aris/projects`, Kanban 4.3). */
export interface BoardCard {
  id: string
  /** `task`: thẻ của đội; `draft`: thẻ người dùng tạo, chờ chia; `job`: việc lớn của một phòng ban. */
  kind: 'task' | 'draft' | 'job'
  title: string
  description?: string
  column: 'unassigned' | 'ready' | 'doing' | 'waiting' | 'done'
  /** Bot nhận thẻ, hoặc bot người dùng gợi ý. */
  bot?: string
  /** Phiên của bot nhận thẻ. */
  session?: string
  waitingFor: { id: string; title: string }[]
  /** Việc lớn: tên phòng, tiến độ thẻ của phòng, có vấp không. */
  department?: string
  progress?: { done: number; total: number }
  failed?: boolean
  /** `bot` là bot dự kiến (Driver giao khi thẻ sẵn sàng). */
  planned?: boolean
  /** Driver: thẻ đã giao lâu mà chưa có kết quả. */
  stuck?: boolean
}

export interface BoardData {
  workspace: string
  cards: BoardCard[]
  split: 'auto' | 'manual'
  driver?: boolean
  /** Trang Dự án trong bộ não, nếu đã nối. */
  page?: string | null
}

const boards = new Map<string, BoardData>()
const boardListeners = new Map<string, Set<() => void>>()
const boardTimers = new Map<string, ReturnType<typeof setInterval>>()

function setBoard(b: BoardData) {
  boards.set(b.workspace, b)
  for (const l of boardListeners.get(b.workspace) ?? []) l()
}

export function refreshBoard(workspace: string): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  const url = endpoint()
  url.searchParams.set('board', workspace)
  return fetch(url, { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<BoardData>) : undefined))
    .then((d) => d && setBoard(d))
    .catch(() => {})
}

/** Thao tác thẻ (`card-create`, `card-update`, `card-delete`, `card-dispatch`); trả bảng mới. */
export async function boardAction(
  body: Record<string, unknown>,
): Promise<BoardData & { sessionId?: string }> {
  const out = await projectAction<BoardData & { sessionId?: string }>(body)
  if (out.cards) setBoard(out)
  return out
}

/** Bảng việc của một dự án, tải lại mỗi 5 giây khi đang mở (`null` khi chưa tải xong). */
export function useBoard(workspace: string | undefined): BoardData | null {
  return useSyncExternalStore(
    useCallback(
      (fn: () => void) => {
        if (!workspace) return () => {}
        let set = boardListeners.get(workspace)
        if (!set) boardListeners.set(workspace, (set = new Set()))
        set.add(fn)
        void refreshBoard(workspace)
        if (!boardTimers.has(workspace))
          boardTimers.set(
            workspace,
            setInterval(() => void refreshBoard(workspace), 5000),
          )
        const onChange = () => void refreshBoard(workspace)
        window.addEventListener(PROJECTS_CHANGED, onChange)
        return () => {
          set!.delete(fn)
          window.removeEventListener(PROJECTS_CHANGED, onChange)
          if (set!.size === 0) {
            clearInterval(boardTimers.get(workspace))
            boardTimers.delete(workspace)
          }
        }
      },
      [workspace],
    ),
    () => (workspace ? (boards.get(workspace) ?? null) : null),
  )
}
