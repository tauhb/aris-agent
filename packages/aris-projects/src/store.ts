/** Kho dự án: tạo, sửa (tên, mục tiêu, thành viên, luật), phiên chính. */
import type { CardRecord, ProjectRecord, Rules, Table } from './domain.js'

export const DEFAULT_RULES: Rules = { maxRounds: 3, maxMessages: 10, stopCommand: true, arisSummarizes: true }

export class ProjectError extends Error {}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '')
const keyOf = (workspace: string) => workspace.replace(/[^A-Za-z0-9-]/g, '-')
const int = (v: unknown, min: number, max: number, prev: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : prev

/** Luật từ dữ liệu gửi lên; giữ giá trị cũ cho trường không gửi hoặc sai. */
export function cleanRules(input: unknown, prev: Rules = DEFAULT_RULES): Rules {
  const r = (input ?? {}) as Record<string, unknown>
  return {
    maxRounds: int(r.maxRounds, 1, 10, prev.maxRounds),
    maxMessages: int(r.maxMessages, 1, 30, prev.maxMessages),
    stopCommand: typeof r.stopCommand === 'boolean' ? r.stopCommand : prev.stopCommand,
    arisSummarizes: typeof r.arisSummarizes === 'boolean' ? r.arisSummarizes : prev.arisSummarizes,
  }
}

export interface ProjectInput {
  name?: string
  goal?: string | null
  members?: readonly string[]
  rules?: unknown
  mainSession?: string
  split?: 'auto' | 'manual'
}

export class ProjectStore {
  constructor(
    private table: Table<ProjectRecord>,
    /** Bot thường có thật (không phải Commander): thành viên khác bị bỏ. */
    private isMember: (botId: string) => boolean,
    private now = () => new Date(),
  ) {}

  get(workspace: string): ProjectRecord | undefined {
    return this.table.get(keyOf(workspace))
  }

  list(): ProjectRecord[] {
    return [...this.table.entries()].map(([, p]) => p)
  }

  /** Tạo hoặc sửa dự án của một workspace; chỉ trường gửi lên mới đổi. */
  async upsert(workspace: string, input: ProjectInput, fallbackName = ''): Promise<ProjectRecord> {
    const prev = this.get(workspace)
    const name = clean(input.name, 60) || prev?.name || clean(fallbackName, 60)
    if (!name) throw new ProjectError('Dự án cần có tên.')
    const members =
      input.members === undefined
        ? (prev?.members ?? [])
        : [...new Set(input.members)].filter((id) => this.isMember(id)).slice(0, 12)
    const rec: ProjectRecord = {
      workspace,
      name,
      members,
      rules:
        input.rules === undefined ? (prev?.rules ?? DEFAULT_RULES) : cleanRules(input.rules, prev?.rules),
      createdAt: prev?.createdAt ?? this.now().toISOString(),
    }
    const goal = input.goal === undefined ? prev?.goal : clean(input.goal ?? '', 600)
    if (goal) rec.goal = goal
    const main = input.mainSession ?? prev?.mainSession
    if (main) rec.mainSession = main
    const split = input.split === 'auto' || input.split === 'manual' ? input.split : prev?.split
    if (split) rec.split = split
    await this.table.put(keyOf(workspace), rec)
    return rec
  }
}

/** Thẻ người dùng tạo trên Kanban, chờ chia việc (mã `c-1`, `c-2`…). */
export class CardStore {
  constructor(
    private table: Table<CardRecord>,
    private now = () => new Date(),
  ) {}

  get(id: string): CardRecord | undefined {
    return this.table.get(id)
  }

  list(workspace: string): CardRecord[] {
    return [...this.table.entries()].map(([, c]) => c).filter((c) => c.workspace === workspace)
  }

  async create(
    workspace: string,
    input: { title?: unknown; description?: unknown; bot?: string },
  ): Promise<CardRecord> {
    const title = clean(input.title, 200)
    if (!title) throw new ProjectError('Thẻ cần có tiêu đề.')
    let n = 0
    for (const [id] of this.table.entries()) n = Math.max(n, Number(id.slice(2)) || 0)
    const rec: CardRecord = { id: `c-${n + 1}`, workspace, title, createdAt: this.now().toISOString() }
    const description = clean(input.description, 4000)
    if (description) rec.description = description
    if (input.bot) rec.bot = input.bot
    await this.table.put(rec.id, rec)
    return rec
  }

  async update(
    id: string,
    patch: { title?: unknown; description?: unknown; bot?: string | null },
  ): Promise<CardRecord> {
    const prev = this.get(id)
    if (!prev) throw new ProjectError('Không có thẻ này.')
    if (prev.taskId) throw new ProjectError('Thẻ đã giao; sửa trên bảng việc của đội.')
    const rec: CardRecord = { ...prev }
    if (patch.title !== undefined) {
      const title = clean(patch.title, 200)
      if (!title) throw new ProjectError('Thẻ cần có tiêu đề.')
      rec.title = title
    }
    if (patch.description !== undefined) {
      const d = clean(patch.description, 4000)
      if (d) rec.description = d
      else delete rec.description
    }
    if (patch.bot === null) delete rec.bot
    else if (patch.bot) rec.bot = patch.bot
    await this.table.put(id, rec)
    return rec
  }

  async remove(id: string): Promise<void> {
    if (!this.get(id)) throw new ProjectError('Không có thẻ này.')
    await this.table.delete(id)
  }

  /** Aris đã giao thẻ: thẻ của Team thay chỗ. */
  async dispatched(id: string, taskId: string): Promise<void> {
    const prev = this.get(id)
    if (prev) await this.table.put(id, { ...prev, taskId })
  }
}
