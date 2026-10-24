/**
 * Kho skill theo bot và theo bản (đặc tả: docs/specs/aris-skills.md). Thuần: lưu qua hai bảng
 * khoá–giá trị (bảng của storage domain dsh, hoặc Map khi kiểm thử).
 */
import { lintSkill, NAME_RE } from './lint.js'

export interface SkillRecord {
  /** `<bot>--<tên>`. */
  id: string
  bot: string
  name: string
  description: string
  whenToUse?: string | undefined
  /** draft: chưa bản nào được duyệt; active: có bản đang dùng; rejected: bản đầu bị từ chối. */
  status: 'draft' | 'active' | 'rejected'
  /** Bản đang dùng (0 khi chưa có). */
  version: number
  uses: number
  lastUsedAt?: string | undefined
  createdAt: string
  updatedAt: string
}

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
  by: 'reflect' | 'user' | 'restore'
  why?: string | undefined
  quote?: string | undefined
  sessionId?: string | undefined
  /** Từ bản nào (khôi phục). */
  from?: number | undefined
  warnings: string[]
  at: string
  review?: Review | undefined
}

export interface Table<V> {
  get(key: string): V | undefined
  entries(): IterableIterator<[string, V]>
  put(key: string, value: V): Promise<void>
}

export class SkillError extends Error {}

/** Đề xuất chưa trả lời quá ngần này ngày thì tự bỏ. */
export const PROPOSAL_DAYS = 7

export const skillId = (bot: string, name: string) => `${bot}--${name}`
export const versionId = (bot: string, name: string, v: number) => `${bot}--${name}--v${v}`

export interface ProposeInput {
  bot: string
  name: string
  description: string
  whenToUse?: string | undefined
  body: string
  by: 'reflect' | 'user'
  why?: string | undefined
  quote?: string | undefined
  sessionId?: string | undefined
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

  /** Skill đang dùng của một bot (nguồn skill của agent, lời nhắc vòng học). */
  activeFor(bot: string): { skill: SkillRecord; version: VersionRecord }[] {
    return this.list(bot).flatMap((skill) => {
      const version = skill.status === 'active' ? this.active(skill.id) : undefined
      return version ? [{ skill, version }] : []
    })
  }

  /**
   * Đề xuất một bản mới (skill mới hoặc bản vá). Lỗi của bộ kiểm thì ném `SkillError`; thân giống
   * hệt bản đang dùng thì bỏ (undefined). Bản đề xuất cũ còn chờ của cùng skill bị thay.
   */
  async propose(input: ProposeInput): Promise<VersionRecord | undefined> {
    const body = input.body.trim()
    const lint = lintSkill({ name: input.name, description: input.description, body })
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
      at,
    }
    await this.versions.put(v.id, v)
    this.emit({ type: 'opened', version: v, patch: !!current })
    return v
  }

  /** Duyệt và bật một bản đề xuất (có thể kèm thân đã sửa: "Sửa rồi bật"). */
  async approve(id: string, by: 'user' | 'telegram', body?: string): Promise<VersionRecord> {
    const v = this.versions.get(id)
    if (!v || v.status !== 'proposed') throw new SkillError('Bản này đã được trả lời hoặc không còn.')
    let next = v
    if (body !== undefined && body.trim() !== v.body) {
      const lint = lintSkill({ name: v.name, description: v.description, body: body.trim() })
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
    const s = this.get(skillId(bot, name))
    if (!s || s.status !== 'active') return
    const at = this.now().toISOString()
    await this.skills.put(s.id, { ...s, uses: s.uses + 1, lastUsedAt: at })
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
    await this.skills.put(s.id, {
      ...s,
      status: 'active',
      version: v.version,
      description: v.description,
      ...(v.whenToUse ? { whenToUse: v.whenToUse } : {}),
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
