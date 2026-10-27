/**
 * Kho skill của đội ở giao diện (giai đoạn 8, plan 8.1): hàm thuần cho Thư viện skill, chi tiết skill, Hộp duyệt và
 * hồ sơ bot. Khớp `@aris/skills` (`TEAM_OWNER`, `assignedTo`, nguồn nhập).
 */

/** Chủ của skill dùng chung trong kho của đội (như `TEAM_OWNER` của `@aris/skills`). */
export const TEAM_SKILL_OWNER = '_doi'

export type Assigned = 'all' | string[]

/** Nơi một skill nhập từ ngoài (như `ImportSource` của `@aris/skills`). */
export interface SkillSource {
  kind: 'github' | 'claude-code' | 'codex' | 'folder' | 'library'
  /** Gói trong kho dựng sẵn và bản lúc cài. */
  pack?: string
  libVersion?: number
  repo?: string
  ref?: string
  sha?: string
  path: string
  importedAt: string
}

export const isTeamSkill = (s: { bot: string }) => s.bot === TEAM_SKILL_OWNER

/** Skill của đội được gán cho bot này không. */
export const assignedTo = (s: { assigned?: Assigned | undefined }, bot: string): boolean =>
  s.assigned === 'all' || (Array.isArray(s.assigned) && s.assigned.includes(bot))

/** Danh sách bot được gán, `'all'` thành mọi bot hiện có. */
export const assignedList = (assigned: Assigned | undefined, allBots: readonly string[]): string[] =>
  assigned === 'all' ? [...allBots] : [...(assigned ?? [])]

/** Bật hay tắt một bot trong danh sách gán: danh sách mới (không bao giờ là `'all'`, để `Cả đội` là lựa chọn riêng). */
export function toggleAssigned(
  assigned: Assigned | undefined,
  bot: string,
  on: boolean,
  allBots: readonly string[],
): string[] {
  const base = assignedList(assigned, allBots).filter((b) => b !== bot)
  return on ? [...base, bot] : base
}

/**
 * Nhãn nguồn ngắn: "GitHub · chủ/repo", "Claude Code", "Codex", tên kho dựng sẵn (`library`, chữ theo ngôn ngữ do
 * nơi gọi đưa vào), hay tên thư mục.
 */
export function sourceLabel(src: SkillSource | null | undefined, library = 'aris'): string {
  if (!src) return ''
  if (src.kind === 'github') return `GitHub · ${src.repo ?? ''}`.trim()
  if (src.kind === 'claude-code') return 'Claude Code'
  if (src.kind === 'codex') return 'Codex'
  if (src.kind === 'library') return library
  return src.path.split('/').filter(Boolean).at(-1) ?? src.path
}

/** Mã commit rút gọn 7 ký tự. */
export const shortSha = (sha: string | undefined) => (sha ? sha.slice(0, 7) : '')

/** Địa chỉ xem skill trên GitHub (theo mã commit nếu có), không có thì undefined. */
export function sourceUrl(src: SkillSource | null | undefined): string | undefined {
  if (!src || src.kind !== 'github' || !src.repo) return undefined
  const ref = src.sha ?? src.ref ?? 'HEAD'
  return `https://github.com/${src.repo}/tree/${ref}${src.path ? `/${src.path}` : ''}`
}

export interface Importable {
  by?: string | undefined
  source?: SkillSource | undefined
  at: string
}

export interface ImportGroup<T> {
  /** Cùng nguồn và cùng lần nhập. */
  key: string
  source: SkillSource
  items: T[]
}

/** Gom các bản chờ duyệt do nhập từ ngoài theo từng lần nhập; bản khác (vòng học, `/learn`) giữ nguyên. */
export function groupImports<T extends Importable>(
  items: readonly T[],
): { groups: ImportGroup<T>[]; rest: T[] } {
  const groups = new Map<string, ImportGroup<T>>()
  const rest: T[] = []
  for (const it of items) {
    const src = it.source
    if (it.by !== 'import' || !src) {
      rest.push(it)
      continue
    }
    const key = `${src.kind}|${src.repo ?? ''}|${src.importedAt}`
    const g = groups.get(key) ?? { key, source: src, items: [] }
    g.items.push(it)
    groups.set(key, g)
  }
  return { groups: [...groups.values()], rest }
}

/** Skill trong nhóm duyệt không có cảnh báo đỏ nào: duyệt riêng được. */
export const cleanItems = <T extends { risks?: string[] | undefined }>(items: readonly T[]): T[] =>
  items.filter((i) => !i.risks?.length)

/** Skill của đội mà bot chưa được dùng (để "＋ Thêm từ kho đội"). */
export const notAssigned = <T extends { bot: string; assigned?: Assigned | undefined }>(
  rows: readonly T[],
  bot: string,
): T[] => rows.filter((r) => isTeamSkill(r) && !assignedTo(r, bot))
