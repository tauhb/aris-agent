/**
 * Dự án thật từ `/api/aris/projects` (gói `@aris/projects`): hồ sơ (mục tiêu, thành viên, luật,
 * phiên chính) theo workspace, dùng chung cho cột phải của dự án, Kanban… Mỗi gói client giữ bản
 * sao riêng; sửa ở đâu thì phát sự kiện `aris:projects-changed` để các gói khác tải lại ngay.
 */
import { useSyncExternalStore } from 'react'

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
