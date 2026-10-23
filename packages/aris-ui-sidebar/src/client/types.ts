/** Phần hợp đồng slot `sidebar` của dsh mà thanh bên aris dùng tới. */
import type { ReactNode } from 'react'

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
  usePanels: Selector<readonly PanelEntry[]>
  useShortcuts: Selector<readonly ShortcutRow[]>
  usePanelInfo: Selector<PanelInfo>
  renderSlot: RenderSlot
}
