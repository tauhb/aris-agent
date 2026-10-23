/**
 * Dự án (quyết định 11) là một workspace của dsh. Workspace mặc định mà dsh tạo lần
 * đầu (thư mục `default-workspace`) là chỗ chat riêng, không phải dự án.
 */

/** Tên thư mục của workspace mặc định, theo `dsh-api-workspace-controller`. */
export const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

export interface WorkspaceLike {
  readonly workspaceId: string
  readonly title: string
  readonly path: string
  readonly sessionIds: readonly string[]
}

/** Workspace là dự án khi không phải workspace mặc định. */
/** Chỗ chat riêng mặc định của aris (`~/aris/workspace`, xem `@aris/home`). */
const ARIS_HOME = /[\\/]aris[\\/]workspace$/

export function isProjectWorkspace(w: Pick<WorkspaceLike, 'path'>): boolean {
  const path = w.path.replace(/[\\/]+$/, '')
  return path.split(/[\\/]/).pop() !== DEFAULT_WORKSPACE_DIRECTORY && !ARIS_HOME.test(path)
}

/** Dự án chứa phiên; phiên chat riêng hoặc chưa thuộc workspace nào thì undefined. */
export function projectOfSession<W extends WorkspaceLike>(
  items: readonly W[],
  sessionId: string | undefined,
): W | undefined {
  if (!sessionId) return undefined
  const w = items.find((x) => x.sessionIds.includes(sessionId))
  return w && isProjectWorkspace(w) ? w : undefined
}
