/**
 * Kho skill theo bot và theo bản (đặc tả: docs/specs/aris-skills.md). Thuần: lưu qua hai bảng
 * khoá–giá trị (bảng của storage domain dsh, hoặc Map khi kiểm thử).
 */
import { lintSkill, NAME_RE } from './lint.js'

/** Chủ của skill dùng chung trong kho của đội: không phải bot nào; `SkillRecord.assigned` nói bot nào được dùng. */
export const TEAM_OWNER = '_doi'

/** Nguồn một skill nhập từ ngoài (giai đoạn 8, plan 8.1). */
export interface ImportSource {
  kind: 'github' | 'claude-code' | 'codex' | 'folder'
  /** `chủ/repo` (GitHub). */
  repo?: string | undefined
  ref?: string | undefined
  /** Mã commit đã tải (GitHub), để kiểm tra bản mới. */
  sha?: string | undefined
  /** Đường dẫn của thư mục skill trong repo hay trên máy. */
  path: string
  importedAt: string
}

/** Bot nào được dùng skill của đội: danh sách mã bot hay cả đội. */
export type Assigned = 'all' | string[]

export interface SkillRecord {
  /** `<bot>--<tên>`. */
  id: string
  bot: string
  name: string
  description: string
  whenToUse?: string | undefined
  /**
   * draft: chưa bản nào được duyệt; active: có bản đang dùng; archived: cất vào kho (không nạp cho
   * bot; người dọn kho hay người dùng cất); rejected: bản đầu bị từ chối.
   */
  status: 'draft' | 'active' | 'archived' | 'rejected'
  /** Bản đang dùng (0 khi chưa có). */
  version: number
  uses: number
  lastUsedAt?: string | undefined
  /** Lúc bật bản đầu tiên (tính "ít dùng" khi chưa dùng lần nào). */
  activatedAt?: string | undefined
  /** Ghim: người dọn kho không động tới. */
  pinned?: boolean | undefined
  archivedAt?: string | undefined
  archivedBy?: 'user' | 'curator' | undefined
  /** Ca thử: yêu cầu thật của người dùng dẫn tới skill (5 ca gần nhất). */
  cases?: Case[] | undefined
  /** Skill của đội (`bot` là `TEAM_OWNER`): bot nào được dùng. Chưa gán bot nào là chưa ai dùng được. */
  assigned?: Assigned | undefined
  /** Số lượt dùng theo từng bot (skill của đội). */
  usesBy?: Record<string, number> | undefined
  createdAt: string
  updatedAt: string
}

export interface Case {
  request: string
  sessionId?: string | undefined
  at: string
}

/** Ít dùng sau ngần này ngày không dùng; cất vào kho sau ngần này ngày. */
export const STALE_DAYS = 30
export const ARCHIVE_DAYS = 90
const KEEP_CASES = 5

export interface Review {
  at: string
  by: 'user' | 'telegram' | 'timeout' | 'replaced'
  decision: 'approved' | 'rejected'
}

export interface VersionRecord {
  /** `<bot>--<tên>--v<n>`. */
  id: string
  skill: string
  bot: string
  name: string
  version: number
  body: string
  description: string
  whenToUse?: string | undefined
  status: 'proposed' | 'active' | 'superseded' | 'rejected'
  by: 'reflect' | 'user' | 'restore' | 'import'
  why?: string | undefined
  quote?: string | undefined
  sessionId?: string | undefined
  /** Từ bản nào (khôi phục). */
  from?: number | undefined
  warnings: string[]
  /** Dấu hiệu nguy hiểm của skill nhập từ ngoài (bộ quét `scanImported`), hiện đỏ ở thẻ duyệt. */
  risks?: string[] | undefined
  /** Nhập từ đâu (chỉ có ở bản nhập từ ngoài). */
  source?: ImportSource | undefined
  /** Tệp kèm đã chép cùng bản này (đường dẫn tương đối). */
  files?: string[] | undefined
  /** Bot được gán khi bản này được duyệt (skill của đội). */
  assignOnApprove?: Assigned | undefined
  at: string
  review?: Review | undefined
}

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
  delete(key: string): Promise<unknown>
}

export class SkillError extends Error {}

/** Đề xuất chưa trả lời quá ngần này ngày thì tự bỏ. */
export const PROPOSAL_DAYS = 7

export const skillId = (bot: string, name: string) => `${bot}--${name}`
export const versionId = (bot: string, name: string, v: number) => `${bot}--${name}--v${v}`

/** Skill của đội được gán cho bot này không. */
export const assignedTo = (s: Pick<SkillRecord, 'assigned'>, bot: string): boolean =>
  s.assigned === 'all' || (Array.isArray(s.assigned) && s.assigned.includes(bot))

/** Gộp hai danh sách bot được gán (không trùng; một bên là cả đội thì cả đội). */
export function mergeAssigned(a: Assigned | undefined, b: Assigned): Assigned {
  if (a === 'all' || b === 'all') return 'all'
  return [...new Set([...(a ?? []), ...b])]
}

/** Một skill trong kế hoạch / báo cáo của người dọn kho. */
export interface CuratorItem {
  id: string
  name: string
  bot: string
  /** Số ngày không dùng. */
  idle: number
}

export interface CuratorPlan {
  archive: CuratorItem[]
  stale: CuratorItem[]
}

export interface ProposeInput {
  bot: string
  name: string
  description: string
  whenToUse?: string | undefined
  body: string
  by: 'reflect' | 'user' | 'import'
  why?: string | undefined
  quote?: string | undefined
  sessionId?: string | undefined
  /** Yêu cầu của người dùng trong đoạn vòng học đọc: thành ca thử. */
  cases?: readonly string[] | undefined
  /** Skill nhập từ ngoài: nguồn, dấu hiệu nguy hiểm, tệp kèm, bot gán sẵn (chỉ có hiệu lực khi được duyệt). */
  source?: ImportSource | undefined
  risks?: readonly string[] | undefined
  files?: readonly string[] | undefined
  assignOnApprove?: Assigned | undefined
}

export type SkillEvent =
  | { type: 'opened'; version: VersionRecord; patch: boolean }
  | { type: 'closed'; version: VersionRecord; decision: Review['decision']; by: Review['by'] }

export class SkillStore {
  private readonly listeners = new Set<(e: SkillEvent) => void>()

  constructor(
    private readonly skills: Table<SkillRecord>,
    private readonly versions: Table<VersionRecord>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Skill (mọi bot hoặc một bot), mới cập nhật trước; bỏ skill có bản đầu bị từ chối. */
  list(bot?: string): SkillRecord[] {
    return [...this.skills.entries()]
      .map(([, s]) => s)
      .filter((s) => (!bot || s.bot === bot) && s.status !== 'rejected')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(id: string): SkillRecord | undefined {
    return this.skills.get(id)
  }

  /** Các bản của một skill, mới trước. */
  versionsOf(id: string): VersionRecord[] {
    return [...this.versions.entries()]
      .map(([, v]) => v)
      .filter((v) => v.skill === id)
      .sort((a, b) => b.version - a.version)
  }

  version(id: string): VersionRecord | undefined {
    return this.versions.get(id)
  }

  /** Bản đề xuất đang chờ của mọi skill, cũ trước. */
  pending(): VersionRecord[] {
    return [...this.versions.entries()]
      .map(([, v]) => v)
      .filter((v) => v.status === 'proposed')
      .sort((a, b) => a.at.localeCompare(b.at))
  }

  /** Bản đang dùng của một skill. */
  active(id: string): VersionRecord | undefined {
    const s = this.get(id)
    return s && s.version ? this.versions.get(versionId(s.bot, s.name, s.version)) : undefined
  }

  /**
   * Skill đang dùng của một bot (nguồn skill của agent, lời nhắc vòng học): skill riêng của bot, cộng skill của đội
   * đã gán cho bot. Trùng tên thì skill riêng thắng.
   */
  activeFor(bot: string): { skill: SkillRecord; version: VersionRecord }[] {
    const live = (skill: SkillRecord) => {
      const version = skill.status === 'active' ? this.active(skill.id) : undefined
      return version ? [{ skill, version }] : []
    }
    const own = bot === TEAM_OWNER ? [] : this.list(bot).flatMap(live)
    const names = new Set(own.map((x) => x.skill.name))
    const team = this.list(TEAM_OWNER)
      .filter((s) => assignedTo(s, bot) && !names.has(s.name))
      .flatMap(live)
    return [...own, ...team]
  }

  /** Skill mà bot dùng khi gọi tên này: skill riêng nếu có, không thì skill của đội đã gán cho bot. */
  resolveFor(bot: string, name: string): SkillRecord | undefined {
    const own = this.get(skillId(bot, name))
    if (own && own.status === 'active') return own
    const team = this.get(skillId(TEAM_OWNER, name))
    return team && team.status === 'active' && assignedTo(team, bot) ? team : undefined
  }

  /**
   * Đề xuất một bản mới (skill mới hoặc bản vá). Lỗi của bộ kiểm thì ném `SkillError`; thân giống
   * hệt bản đang dùng thì bỏ (undefined). Bản đề xuất cũ còn chờ của cùng skill bị thay.
   */
  async propose(input: ProposeInput): Promise<VersionRecord | undefined> {
    const body = input.body.trim()
    const lint = lintSkill(
      { name: input.name, description: input.description, body },
      { imported: input.by === 'import' },
    )
    if (lint.errors.length) throw new SkillError(lint.errors.join(' '))
    const id = skillId(input.bot, input.name)
    const at = this.now().toISOString()
    const current = this.active(id)
    if (current && current.body.trim() === body) return undefined
    for (const old of this.versionsOf(id).filter((v) => v.status === 'proposed'))
      await this.close(old, 'rejected', 'replaced')
    const prev = this.get(id)
    const n = (this.versionsOf(id)[0]?.version ?? 0) + 1
    if (!prev || prev.status === 'rejected')
      await this.skills.put(id, {
        id,
        bot: input.bot,
        name: input.name,
        description: input.description.trim(),
        ...(input.whenToUse?.trim() ? { whenToUse: input.whenToUse.trim() } : {}),
        status: 'draft',
        version: 0,
        uses: prev?.uses ?? 0,
        createdAt: prev?.createdAt ?? at,
        updatedAt: at,
      })
    else await this.skills.put(id, { ...prev, updatedAt: at })
    const v: VersionRecord = {
      id: versionId(input.bot, input.name, n),
      skill: id,
      bot: input.bot,
      name: input.name,
      version: n,
      body,
      description: input.description.trim(),
      ...(input.whenToUse?.trim() ? { whenToUse: input.whenToUse.trim() } : {}),
      status: 'proposed',
      by: input.by,
      ...(input.why ? { why: input.why } : {}),
      ...(input.quote ? { quote: input.quote } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      warnings: lint.warnings,
      ...(input.risks?.length ? { risks: [...input.risks] } : {}),
      ...(input.source ? { source: input.source } : {}),
      ...(input.files?.length ? { files: [...input.files] } : {}),
      ...(input.assignOnApprove ? { assignOnApprove: input.assignOnApprove } : {}),
      at,
    }
    await this.versions.put(v.id, v)
    for (const request of input.cases ?? []) await this.addCase(id, { request, sessionId: input.sessionId })
    this.emit({ type: 'opened', version: v, patch: !!current })
    return v
  }

  /** Thêm một ca thử (bỏ trùng, giữ 5 ca gần nhất). */
  async addCase(id: string, c: { request: string; sessionId?: string | undefined }): Promise<void> {
    const s = this.get(id)
    const request = c.request.trim().slice(0, 2000)
    if (!s || request.length < 8) return
    const at = this.now().toISOString()
    const rest = (s.cases ?? []).filter((x) => x.request !== request)
    const cases = [...rest, { request, at, ...(c.sessionId ? { sessionId: c.sessionId } : {}) }].slice(
      -KEEP_CASES,
    )
    await this.skills.put(id, { ...s, cases })
  }

  async pin(id: string, on: boolean): Promise<SkillRecord> {
    return this.patch(id, () => ({ pinned: on || undefined }))
  }

  /** Tắt: cất vào kho, không nạp cho bot nữa. */
  async archive(id: string, by: 'user' | 'curator'): Promise<SkillRecord> {
    return this.patch(id, (s) => {
      if (s.status !== 'active') throw new SkillError('Chỉ cất được skill đang dùng.')
      return { status: 'archived', archivedAt: this.now().toISOString(), archivedBy: by }
    })
  }

  /** Dùng lại skill đã cất: đếm lại từ hôm nay để không bị cất ngay. */
  async unarchive(id: string): Promise<SkillRecord> {
    return this.patch(id, (s) => {
      if (s.status !== 'archived' || !s.version) throw new SkillError('Skill này không nằm trong kho.')
      return {
        status: 'active',
        archivedAt: undefined,
        archivedBy: undefined,
        activatedAt: this.now().toISOString(),
        lastUsedAt: undefined,
      }
    })
  }

  // --- Kho skill của đội (giai đoạn 8, plan 8.1) ------------------------------------------------------

  /** Skill của đội: kho chung, bot nào dùng được do `assigned`. */
  teamList(): SkillRecord[] {
    return this.list(TEAM_OWNER)
  }

  private teamSkill(id: string): SkillRecord {
    const s = this.get(id)
    if (!s || s.bot !== TEAM_OWNER) throw new SkillError('Đây không phải skill của đội.')
    return s
  }

  /** Đặt đúng danh sách bot được dùng skill của đội (`'all'` là cả đội, kể cả bot tạo sau). */
  async setAssigned(id: string, assigned: Assigned): Promise<SkillRecord> {
    this.teamSkill(id)
    const clean: Assigned =
      assigned === 'all' ? 'all' : [...new Set(assigned.map((b) => b.trim()).filter(Boolean))]
    return this.patch(id, () => ({ assigned: clean }))
  }

  /** Gán thêm bot cho skill của đội (giữ các bot đã gán). */
  async assign(id: string, bots: Assigned): Promise<SkillRecord> {
    const s = this.teamSkill(id)
    return this.setAssigned(id, mergeAssigned(s.assigned, bots))
  }

  /**
   * Bỏ gán cho một bot. Skill đang gán cho cả đội thì cần `allBots` (mọi bot hiện có) để đổi thành danh sách trừ bot này.
   */
  async unassign(id: string, bot: string, allBots: readonly string[] = []): Promise<SkillRecord> {
    const s = this.teamSkill(id)
    if (s.assigned === 'all' && allBots.length === 0)
      throw new SkillError('Skill đang gán cho cả đội; cần danh sách bot để bỏ riêng một bot.')
    const base = s.assigned === 'all' ? allBots : (s.assigned ?? [])
    return this.setAssigned(
      id,
      base.filter((b) => b !== bot),
    )
  }

  /**
   * Chia sẻ skill riêng của một bot cho đội: chuyển vào kho của đội, giữ các bản cũ, gán sẵn cho bot gốc. Mã skill
   * đổi (`<bot>--<tên>` thành `_doi--<tên>`), nên các bản được ghi lại dưới mã mới rồi xoá bản cũ.
   */
  async share(id: string): Promise<SkillRecord> {
    const s = this.get(id)
    if (!s || s.bot === TEAM_OWNER) throw new SkillError('Skill này đã ở kho của đội hoặc không còn.')
    if (this.get(skillId(TEAM_OWNER, s.name))) throw new SkillError('Kho của đội đã có skill tên này.')
    return this.rekey(s, TEAM_OWNER, { assigned: [s.bot] })
  }

  /** Trả skill của đội về làm skill riêng; chỉ được khi skill gán đúng cho một bot. */
  async unshare(id: string): Promise<SkillRecord> {
    const s = this.teamSkill(id)
    if (!Array.isArray(s.assigned) || s.assigned.length !== 1)
      throw new SkillError('Chỉ trả về làm skill riêng được khi skill gán đúng cho một bot.')
    const bot = s.assigned[0]!
    if (this.get(skillId(bot, s.name))) throw new SkillError('Bot này đã có skill riêng cùng tên.')
    return this.rekey(s, bot, { assigned: undefined, usesBy: undefined })
  }

  /** Chuyển skill và các bản sang chủ khác (mã đổi theo). */
  private async rekey(s: SkillRecord, bot: string, extra: Partial<SkillRecord>): Promise<SkillRecord> {
    const nextId = skillId(bot, s.name)
    const old = this.versionsOf(s.id)
    for (const v of old)
      await this.versions.put(versionId(bot, s.name, v.version), {
        ...v,
        id: versionId(bot, s.name, v.version),
        skill: nextId,
        bot,
      })
    const next: SkillRecord = { ...s, ...extra, id: nextId, bot, updatedAt: this.now().toISOString() }
    for (const k of Object.keys(next) as (keyof SkillRecord)[]) if (next[k] === undefined) delete next[k]
    await this.skills.put(nextId, next)
    for (const v of old) await this.versions.delete(v.id)
    await this.skills.delete(s.id)
    return next
  }

  /** Số ngày từ lần dùng cuối (chưa dùng thì từ lúc bật). */
  idleDays(s: SkillRecord): number {
    const since = Date.parse(s.lastUsedAt ?? s.activatedAt ?? s.updatedAt)
    return Math.floor((this.now().getTime() - since) / 86_400_000)
  }

  /** Ít dùng: đang dùng, không ghim, quá `STALE_DAYS` ngày không dùng. */
  isStale(s: SkillRecord): boolean {
    return s.status === 'active' && !s.pinned && this.idleDays(s) >= STALE_DAYS
  }

  /**
   * Kế hoạch của người dọn kho (chạy thử, không đổi gì): skill sẽ cất (đang dùng, không ghim, quá
   * `ARCHIVE_DAYS` ngày không dùng) và skill đang ít dùng còn giữ.
   */
  curatePlan(): CuratorPlan {
    const item = (s: SkillRecord): CuratorItem => ({
      id: s.id,
      name: s.name,
      bot: s.bot,
      idle: this.idleDays(s),
    })
    const live = this.list().filter((s) => s.status === 'active' && !s.pinned)
    return {
      archive: live.filter((s) => this.idleDays(s) >= ARCHIVE_DAYS).map(item),
      stale: live.filter((s) => this.isStale(s) && this.idleDays(s) < ARCHIVE_DAYS).map(item),
    }
  }

  /** Người dọn kho: cất các skill trong kế hoạch. Trả kế hoạch đã làm. */
  async curate(): Promise<CuratorPlan> {
    const plan = this.curatePlan()
    for (const s of plan.archive) await this.archive(s.id, 'curator')
    return plan
  }

  /** Mọi skill và các bản (sao lưu ra tệp). */
  backup(): { at: string; skills: SkillRecord[]; versions: VersionRecord[] } {
    return {
      at: this.now().toISOString(),
      skills: [...this.skills.entries()].map(([, s]) => s),
      versions: [...this.versions.entries()].map(([, v]) => v),
    }
  }

  private async patch(id: string, fn: (s: SkillRecord) => Partial<SkillRecord>): Promise<SkillRecord> {
    const s = this.get(id)
    if (!s) throw new SkillError('Không có skill này.')
    const next: SkillRecord = { ...s, ...fn(s), updatedAt: this.now().toISOString() }
    for (const k of Object.keys(next) as (keyof SkillRecord)[]) if (next[k] === undefined) delete next[k]
    await this.skills.put(id, next)
    return next
  }

  /** Duyệt và bật một bản đề xuất (có thể kèm thân đã sửa: "Sửa rồi bật"). */
  async approve(id: string, by: 'user' | 'telegram', body?: string): Promise<VersionRecord> {
    const v = this.versions.get(id)
    if (!v || v.status !== 'proposed') throw new SkillError('Bản này đã được trả lời hoặc không còn.')
    let next = v
    if (body !== undefined && body.trim() !== v.body) {
      const lint = lintSkill(
        { name: v.name, description: v.description, body: body.trim() },
        { imported: v.by === 'import' },
      )
      if (lint.errors.length) throw new SkillError(lint.errors.join(' '))
      next = { ...v, body: body.trim(), warnings: lint.warnings }
    }
    await this.activate(next)
    return this.close(next, 'approved', by)
  }

  async reject(id: string, by: 'user' | 'telegram' | 'timeout'): Promise<VersionRecord> {
    const v = this.versions.get(id)
    if (!v || v.status !== 'proposed') throw new SkillError('Bản này đã được trả lời hoặc không còn.')
    const closed = await this.close(v, 'rejected', by)
    const s = this.get(v.skill)
    if (s && s.status === 'draft' && !this.versionsOf(s.id).some((x) => x.status === 'proposed'))
      await this.skills.put(s.id, { ...s, status: 'rejected', updatedAt: this.now().toISOString() })
    return closed
  }

  /** Khôi phục một bản cũ: thành bản mới, dùng ngay. */
  async restore(skill: string, version: number): Promise<VersionRecord> {
    const s = this.get(skill)
    const old = s ? this.versions.get(versionId(s.bot, s.name, version)) : undefined
    if (!s || !old) throw new SkillError('Không có bản này.')
    const n = (this.versionsOf(skill)[0]?.version ?? 0) + 1
    const v: VersionRecord = {
      ...old,
      id: versionId(s.bot, s.name, n),
      version: n,
      status: 'proposed',
      by: 'restore',
      from: version,
      at: this.now().toISOString(),
    }
    delete v.review
    delete v.why
    delete v.quote
    await this.activate(v)
    return v
  }

  /**
   * Số skill được bật lần đầu và số lần khôi phục bản cũ (rollback) kể từ một thời điểm: lấy từ `activatedAt`
   * của skill và `at` của bản khôi phục (`by: 'restore'`), nên tính được cả những lần đã xảy ra trước đó.
   */
  eventsSince(sinceMs: number): { enabled: number; rolledBack: number } {
    const since = (iso: string | undefined) => (iso ? Date.parse(iso) >= sinceMs : false)
    let enabled = 0
    for (const [, s] of this.skills.entries()) if (since(s.activatedAt)) enabled++
    let rolledBack = 0
    for (const [, v] of this.versions.entries()) if (v.by === 'restore' && since(v.at)) rolledBack++
    return { enabled, rolledBack }
  }

  /** Bỏ đề xuất quá hạn; trả số bản đã bỏ. */
  async expire(days = PROPOSAL_DAYS): Promise<number> {
    const cutoff = this.now().getTime() - days * 86_400_000
    let n = 0
    for (const v of this.pending())
      if (Date.parse(v.at) < cutoff) {
        await this.reject(v.id, 'timeout')
        n++
      }
    return n
  }

  /** Công cụ `skill` của dsh vừa nạp skill này của bot. */
  async recordUse(bot: string, name: string): Promise<void> {
    if (!NAME_RE.test(name)) return
    const s = this.resolveFor(bot, name)
    if (!s) return
    const at = this.now().toISOString()
    await this.skills.put(s.id, {
      ...s,
      uses: s.uses + 1,
      lastUsedAt: at,
      ...(s.bot === TEAM_OWNER ? { usesBy: { ...s.usesBy, [bot]: (s.usesBy?.[bot] ?? 0) + 1 } } : {}),
    })
  }

  /** Số bản người dùng đã trả lời hôm nay (Hộp duyệt). */
  reviewedToday(): number {
    const day = this.now().toDateString()
    let n = 0
    for (const [, v] of this.versions.entries())
      if (
        v.review &&
        (v.review.by === 'user' || v.review.by === 'telegram') &&
        new Date(v.review.at).toDateString() === day
      )
        n++
    return n
  }

  on(fn: (e: SkillEvent) => void): () => void {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  /** Bật một bản: bản đang dùng thành `superseded`, skill trỏ tới bản mới. */
  private async activate(v: VersionRecord) {
    const s = this.get(v.skill)
    if (!s) throw new SkillError('Không có skill này.')
    const current = this.active(s.id)
    if (current && current.id !== v.id)
      await this.versions.put(current.id, { ...current, status: 'superseded' })
    await this.versions.put(v.id, { ...v, status: 'active' })
    // Skill của đội: bot chọn lúc nhập được gán ngay khi bản đầu được duyệt (gộp vào bot đã gán trước).
    const assigned =
      s.bot === TEAM_OWNER && v.assignOnApprove ? mergeAssigned(s.assigned, v.assignOnApprove) : s.assigned
    await this.skills.put(s.id, {
      ...s,
      status: 'active',
      activatedAt: s.activatedAt ?? this.now().toISOString(),
      version: v.version,
      description: v.description,
      ...(v.whenToUse ? { whenToUse: v.whenToUse } : {}),
      ...(assigned ? { assigned } : {}),
      updatedAt: this.now().toISOString(),
    })
  }

  private async close(
    v: VersionRecord,
    decision: Review['decision'],
    by: Review['by'],
  ): Promise<VersionRecord> {
    const latest = this.versions.get(v.id) ?? v
    const review: Review = { at: this.now().toISOString(), by, decision }
    const next: VersionRecord = {
      ...latest,
      ...(v.body !== latest.body ? { body: v.body, warnings: v.warnings } : {}),
      status: decision === 'approved' ? 'active' : 'rejected',
      review,
    }
    await this.versions.put(v.id, next)
    this.emit({ type: 'closed', version: next, decision, by })
    return next
  }

  private emit(e: SkillEvent) {
    for (const fn of this.listeners) {
      try {
        fn(e)
      } catch {
        // Người nghe lỗi không làm hỏng việc duyệt.
      }
    }
  }
}
