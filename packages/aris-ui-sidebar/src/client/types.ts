/** Phần hợp đồng slot `sidebar` của dsh mà thanh bên aris dùng tới. */
import type { ReactNode } from 'react'
import type { Translate } from './locale.js'

export type Selector<T> = <R>(select: (value: T) => R) => R

export interface PanelEntry {
  id: string
  order: number
  label: string
}

export interface ShortcutRow {
  readonly id: string
  readonly keys: readonly string[]
  readonly aria: string | undefined
}

export interface PanelInfo {
  readonly activePanelId: string | null
}

/** Một workspace của dsh; aris gọi là "Phòng". */
export interface WorkspaceRow {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

/** Phần tóm tắt phiên của dsh mà thanh bên cần để chọn phiên gần nhất của phòng. */
export interface SessionListSnapshot {
  readonly byId: Readonly<Record<string, { readonly blank: boolean; readonly updatedAt: number }>>
}

export interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceRow[]
}

export type RenderSlot = (
  name: string,
  props: Record<string, unknown>,
  options?: { only?: string; fallback?: ReactNode },
) => ReactNode

export interface SidebarProps {
  collapsed: boolean
  width: number
  startSession: (workspaceId?: string) => void
  toggleSidebar: () => void
  selectPanel: (id: string | null) => void
  openRoom: (workspaceId: string) => void
  openSession: (sessionId: string) => void
  usePanels: Selector<readonly PanelEntry[]>
  useShortcuts: Selector<readonly ShortcutRow[]>
  usePanelInfo: Selector<PanelInfo>
  useWorkspaces: Selector<WorkspaceSnapshot>
  useSessions: Selector<SessionListSnapshot>
  renderSlot: RenderSlot
  /** Bộ dịch của namespace `aris.sidebar`, dsh truyền vào nhờ `locale: NS` khi đăng ký slot. */
  t: Translate
}
