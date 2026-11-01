/**
 * Kho bot: bọc các bảng của domain `aris_bots` bằng các thao tác có nghĩa (tạo, sửa, áp đội
 * mẫu, gắn bot vào phiên). Đọc đồng bộ từ bộ nhớ, ghi bền qua backend của dsh.
 */
import { randomBytes } from 'node:crypto'
import { NO_ACCESSORY, isAccessoryId } from '@aris/ui-kit'
import type { BotRecord, DepartmentRecord, OwnerRecord, SessionRecord, Tables } from './domain.js'
import { cleanExternal, ExternalConfigError, type ExternalConfig } from './external.js'
import { cleanPolicy, DEFAULT_POLICY, type Policy } from './policy.js'

export const COMMANDER_ID = 'aris'
/** Bot Thủ thư mặc định của bộ não (giai đoạn 5): người duy nhất ghi wiki. */
export const LIBRARIAN_ID = 'b-thu-thu'
/** Tên gọi: chữ thường không dấu, số, `-`, bắt đầu bằng chữ. */
export const HANDLE_RE = /^[a-z][a-z0-9-]{0,23}$/
const DEPT_RE = /^[a-z][a-z0-9-]{0,39}$/

export class BotError extends Error {}

/** Phần anh nhập khi tạo hoặc sửa bot. */
export interface BotInput {
  handle: string
  name: string
  role?: string
  description?: string
  soul?: string
  mascot?: string
  /** Mã phụ kiện linh vật hoặc `'none'` (không đeo); không có là theo mặc định của dáng. Mã lạ thì bỏ qua. */
  accessory?: string
  model?: { provider: string; model: string } | null
  department?: string | null
  /** Bot ngoài: cấu hình gửi từ hộp Thêm bot ngoài (xem `cleanExternal`); `null` là bỏ. */
  external?: unknown
  /** Bộ công cụ riêng: chỉ trường gửi lên mới đổi. */
  tools?: Partial<Record<ToolKey, boolean>>
  /** Quyền riêng: chỉ trường gửi lên mới đổi. */
  perms?: { write?: unknown; danger?: unknown }
  assignable?: boolean
  /** Model theo việc; `null` là bỏ (về mặc định). */
  models?: { goal?: ModelRef | null; fallback?: ModelRef | null }
  /** Tạo ảnh, tạo video; `null` ở một loại là về theo thứ tự chung. */
  media?: { image?: unknown; video?: unknown }
}

type ModelRef = { provider: string; model: string }

/** Nhóm công cụ bật/tắt được trên hồ sơ bot. */
export const TOOL_KEYS = ['web', 'files', 'shell'] as const
export type ToolKey = (typeof TOOL_KEYS)[number]

const isRef = (v: unknown): v is ModelRef =>
  !!v && typeof (v as ModelRef).provider === 'string' && typeof (v as ModelRef).model === 'string'

function cleanModels(v: BotInput['models'], prev: BotRecord['models'] = {}): BotRecord['models'] {
  const out = { ...prev }
  for (const k of ['goal', 'fallback'] as const) {
    const x = v?.[k]
    if (x === null) delete out[k]
    else if (isRef(x)) out[k] = { provider: x.provider, model: x.model }
  }
  return out
}

type MediaPolicy = NonNullable<NonNullable<BotRecord['media']>['image']>

function cleanMediaPolicy(v: unknown): MediaPolicy | undefined {
  const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  if (p.mode !== 'off' && p.mode !== 'shared' && p.mode !== 'own') return undefined
  const list = Array.isArray(p.list)
    ? p.list.filter(isRef).map((x) => ({ provider: x.provider, model: x.model }))
    : []
  return {
    mode: p.mode,
    ...(p.mode === 'own' ? { list: list.slice(0, 8) } : {}),
    ...(p.mode === 'own' && p.fallback === true ? { fallback: true } : {}),
    ...(typeof p.capUsd === 'number' && p.capUsd >= 0 && p.capUsd <= 100 ? { capUsd: p.capUsd } : {}),
  }
}

function cleanMedia(v: BotInput['media'], prev: BotRecord['media'] = {}): BotRecord['media'] {
  const out = { ...prev }
  for (const k of ['image', 'video'] as const) {
    const x = v?.[k]
    if (x === null) delete out[k]
    else if (x !== undefined) {
      const p = cleanMediaPolicy(x)
      if (p) out[k] = p
    }
  }
  return out
}

function cleanPerms(v: unknown, prev: BotRecord['perms'] = {}): BotRecord['perms'] {
  const p = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out = { ...prev }
  if (p.write === 'none' || p.write === 'workspace' || p.write === 'anywhere') out.write = p.write
  if (p.danger === 'ask' || p.danger === 'deny') out.danger = p.danger
  return out
}

function cleanTools(v: unknown, prev: BotRecord['tools'] = {}): BotRecord['tools'] {
  const t = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out = { ...prev }
  for (const k of TOOL_KEYS) if (typeof t[k] === 'boolean') out[k] = t[k]
  return out
}

export interface Template {
  id: string
  name: string
  description: string
  departments: { id: string; name: string; lead?: string; about?: string; policy?: Partial<Policy> }[]
  bots: (BotInput & { handle: string })[]
}

const COMMANDER_DEFAULT: Omit<BotRecord, 'createdAt'> = {
  id: COMMANDER_ID,
  kind: 'commander',
  handle: 'aris',
  name: 'Aris',
  role: 'Chỉ huy',
  description:
    'Nhận việc từ người dùng, tự làm việc nhỏ, chia việc lớn cho các bot phù hợp rồi tổng hợp kết quả.',
  soul: 'Điềm tĩnh, rõ ràng, chủ động. Trả lời thẳng vào việc, báo ngắn gọn điều đã làm và điều cần người dùng quyết.',
  mascot: 'aris',
}

const LIBRARIAN_DEFAULT: Omit<BotRecord, 'createdAt'> = {
  id: LIBRARIAN_ID,
  kind: 'member',
  handle: 'thu-thu',
  name: 'Thủ thư',
  role: 'Giữ bộ não',
  description:
    'Đọc nguồn người dùng đưa vào bộ não rồi viết thành wiki có liên kết: tóm tắt, người, dự án, chủ đề; giữ mục lục, soát mâu thuẫn mỗi tuần.',
  soul: 'Cẩn thận, ngăn nắp, trung thực với nguồn. Mỗi ý đều có chú thích nguồn; không chắc thì ghi là chưa chắc, không đoán.',
  mascot: 'trang-giay',
  tools: { web: false, files: false, shell: false },
  perms: { write: 'none', danger: 'deny' },
  assignable: false,
}

/** Bỏ dấu tiếng Việt và ký tự lạ để gợi ý tên gọi từ tên hiển thị. */
export function suggestHandle(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

const clean = (s: string | undefined, max: number) => (s ?? '').trim().slice(0, max)

/** Mã phụ kiện hợp lệ (một trong 22 phụ kiện hay `'none'`); giá trị lạ trả `undefined` để nơi gọi giữ giá trị cũ. */
const cleanAccessory = (v: unknown): string | undefined => {
  const a = typeof v === 'string' ? v.trim() : ''
  return a === NO_ACCESSORY || isAccessoryId(a) ? a : undefined
}

export class BotStore {
  constructor(
    private t: Tables,
    private now: () => Date = () => new Date(),
  ) {}

  /** Commander luôn có (tạo lần đầu chạy). */
  async ensureCommander(): Promise<BotRecord> {
    await this.dropHardcodedAddress()
    const c = this.t.bots.get(COMMANDER_ID)
    if (c) return c
    const rec: BotRecord = { ...COMMANDER_DEFAULT, createdAt: this.now().toISOString() }
    await this.t.bots.put(COMMANDER_ID, rec)
    return rec
  }

  /**
   * Tạo bot Thủ thư nếu chưa có (bộ não gọi một lần; người dùng xoá rồi thì bộ não không tạo lại). Tên
   * gọi `thu-thu` đã có bot khác dùng thì thêm số.
   */
  async ensureLibrarian(): Promise<BotRecord> {
    const c = this.t.bots.get(LIBRARIAN_ID)
    if (c) return c
    let handle = LIBRARIAN_DEFAULT.handle
    for (let i = 2; this.byHandle(handle); i++) handle = `${LIBRARIAN_DEFAULT.handle}-${i}`
    const rec: BotRecord = { ...LIBRARIAN_DEFAULT, handle, createdAt: this.now().toISOString() }
    await this.t.bots.put(LIBRARIAN_ID, rec)
    return rec
  }

  /**
   * Bot tạo từ đội mẫu cũ có chữ "chủ nhân" viết cứng trong mô tả và tính cách; đổi thành
   * "người dùng" (cách gọi thật lấy từ hồ sơ xưng hô). Chạy mỗi lần khởi động, không còn gì thì thôi.
   */
  private async dropHardcodedAddress() {
    const fix = (s: string) => s.replace(/chủ nhân/g, 'người dùng').replace(/Chủ nhân/g, 'Người dùng')
    for (const [id, b] of this.t.bots.entries())
      if (/chủ nhân/i.test(b.description + b.soul))
        await this.t.bots.put(id, { ...b, description: fix(b.description), soul: fix(b.soul) })
  }

  /** Cách xưng hô với người dùng (trống khi chưa hỏi). */
  owner(): Omit<OwnerRecord, 'updatedAt'> {
    const o = this.t.owner?.get('main')
    if (!o) return {}
    const rest: Partial<OwnerRecord> = { ...o }
    delete rest.updatedAt
    return rest
  }

  async setOwner(patch: { name?: string | null; call?: string | null; self?: string | null }) {
    if (!this.t.owner) throw new BotError('Chưa có kho hồ sơ người dùng.')
    const next: OwnerRecord = { ...this.owner(), updatedAt: this.now().toISOString() }
    for (const k of ['name', 'call', 'self'] as const) {
      const v = patch[k]
      if (v === undefined) continue
      const t = (v ?? '').trim().slice(0, 40)
      if (t) next[k] = t
      else delete next[k]
    }
    await this.t.owner.put('main', next)
    return this.owner()
  }

  list(): BotRecord[] {
    return [...this.t.bots.entries()]
      .map(([, b]) => b)
      .sort((a, b) =>
        a.kind !== b.kind ? (a.kind === 'commander' ? -1 : 1) : a.createdAt.localeCompare(b.createdAt),
      )
  }

  get(id: string): BotRecord | undefined {
    return this.t.bots.get(id)
  }

  byHandle(handle: string): BotRecord | undefined {
    const h = handle.trim().replace(/^@/, '').toLowerCase()
    return this.list().find((b) => b.handle === h)
  }

  departments(): DepartmentRecord[] {
    return [...this.t.departments.entries()].map(([, d]) => d).sort((a, b) => a.order - b.order)
  }

  private external(input: unknown, prev?: ExternalConfig): ExternalConfig {
    try {
      return cleanExternal(input, prev)
    } catch (e) {
      if (e instanceof ExternalConfigError) throw new BotError(e.message)
      throw e
    }
  }

  private validate(input: BotInput, self?: string) {
    const handle = input.handle.trim().replace(/^@/, '').toLowerCase()
    if (!HANDLE_RE.test(handle))
      throw new BotError(
        'Tên gọi chỉ gồm chữ thường không dấu, số, dấu "-", bắt đầu bằng chữ, tối đa 24 ký tự.',
      )
    const taken = this.byHandle(handle)
    if (taken && taken.id !== self) throw new BotError(`Tên gọi @${handle} đã có bot ${taken.name} dùng.`)
    const name = clean(input.name, 40)
    if (!name) throw new BotError('Bot cần có tên.')
    if (input.department && !this.t.departments.get(input.department))
      throw new BotError(`Không có phòng ban ${input.department}.`)
    return { handle, name }
  }

  async create(input: BotInput): Promise<BotRecord> {
    const { handle, name } = this.validate(input)
    let id: string
    do id = `b-${randomBytes(3).toString('hex')}`
    while (this.t.bots.get(id))
    const accessory = cleanAccessory(input.accessory)
    const rec: BotRecord = {
      id,
      kind: 'member',
      handle,
      name,
      role: clean(input.role, 60),
      description: clean(input.description, 1000),
      soul: clean(input.soul, 2000),
      mascot: clean(input.mascot, 40) || 'tron',
      ...(accessory ? { accessory } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.department ? { department: input.department } : {}),
      ...(input.external ? { external: this.external(input.external) } : {}),
      ...(input.tools ? { tools: cleanTools(input.tools) } : {}),
      ...(input.perms ? { perms: cleanPerms(input.perms) } : {}),
      ...(input.models ? { models: cleanModels(input.models) } : {}),
      ...(input.media ? { media: cleanMedia(input.media) } : {}),
      ...(input.assignable === false ? { assignable: false } : {}),
      createdAt: this.now().toISOString(),
    }
    await this.t.bots.put(id, rec)
    return rec
  }

  async update(id: string, patch: Partial<BotInput>): Promise<BotRecord> {
    const prev = this.t.bots.get(id)
    if (!prev) throw new BotError('Không có bot này.')
    const merged = { ...prev, ...patch } as BotInput
    const { handle, name } = this.validate({ ...merged, handle: patch.handle ?? prev.handle }, id)
    const rec: BotRecord = {
      ...prev,
      handle,
      name,
      role: patch.role !== undefined ? clean(patch.role, 60) : prev.role,
      description: patch.description !== undefined ? clean(patch.description, 1000) : prev.description,
      soul: patch.soul !== undefined ? clean(patch.soul, 2000) : prev.soul,
      mascot: patch.mascot !== undefined ? clean(patch.mascot, 40) || prev.mascot : prev.mascot,
    }
    const accessory = cleanAccessory(patch.accessory)
    if (accessory) rec.accessory = accessory
    if (patch.model === null) delete rec.model
    else if (patch.model) rec.model = patch.model
    if (patch.department === null) delete rec.department
    else if (patch.department) rec.department = patch.department
    if (patch.tools) rec.tools = cleanTools(patch.tools, prev.tools)
    if (patch.perms) rec.perms = cleanPerms(patch.perms, prev.perms)
    if (patch.models) rec.models = cleanModels(patch.models, prev.models)
    if (patch.media) rec.media = cleanMedia(patch.media, prev.media)
    if (typeof patch.assignable === 'boolean') rec.assignable = patch.assignable
    if (patch.external === null) delete rec.external
    else if (patch.external !== undefined) rec.external = this.external(patch.external, prev.external)
    await this.t.bots.put(id, rec)
    return rec
  }

  /** Xoá bot (không xoá Commander). Ký ức và phiên cũ giữ nguyên; bỏ chức trưởng nhóm nếu có. */
  async remove(id: string): Promise<void> {
    const b = this.t.bots.get(id)
    if (!b) throw new BotError('Không có bot này.')
    if (b.kind === 'commander') throw new BotError('Không xoá được Commander.')
    await this.t.bots.delete(id)
    for (const d of this.departments()) {
      if (d.lead === id) {
        const next = { ...d }
        delete next.lead
        await this.t.departments.put(d.id, next)
      }
    }
  }

  async upsertDepartment(input: {
    id?: string
    name: string
    lead?: string | null
    about?: string | null
    /** Chỉ các trường gửi lên mới đổi (xem `cleanPolicy`). */
    policy?: unknown
  }): Promise<DepartmentRecord> {
    const name = clean(input.name, 40)
    if (!name) throw new BotError('Phòng ban cần có tên.')
    const id = input.id ?? (suggestHandle(name) || 'phong')
    if (!DEPT_RE.test(id)) throw new BotError('Mã phòng ban không hợp lệ.')
    if (input.lead && !this.t.bots.get(input.lead))
      throw new BotError('Trưởng nhóm không phải bot trong đội.')
    const prev = this.t.departments.get(id)
    const rec: DepartmentRecord = { id, name, order: prev?.order ?? this.departments().length }
    const lead = input.lead === undefined ? prev?.lead : (input.lead ?? undefined)
    if (lead) rec.lead = lead
    const about = input.about === undefined ? prev?.about : clean(input.about ?? '', 120)
    if (about) rec.about = about
    const policy =
      input.policy === undefined ? prev?.policy : cleanPolicy(input.policy, prev?.policy ?? DEFAULT_POLICY)
    if (policy) rec.policy = policy
    await this.t.departments.put(id, rec)
    return rec
  }

  /**
   * Phòng ban mới (hộp "Phòng ban mới"): mã tự sinh từ tên, không trùng; bot chọn rời phòng cũ
   * (bot chỉ thuộc một phòng); chính sách ban đầu là mặc định hoặc chép từ phòng khác.
   */
  async createDepartment(input: {
    name: string
    about?: string
    bots?: readonly string[]
    lead?: string
    copyPolicyFrom?: string
  }): Promise<DepartmentRecord> {
    const name = clean(input.name, 40)
    if (!name) throw new BotError('Phòng ban cần có tên.')
    if (this.departments().some((d) => d.name.toLowerCase() === name.toLowerCase()))
      throw new BotError(`Đã có phòng ${name}.`)
    const base = (suggestHandle(name) || 'phong').replace(/^[^a-z]+/, '') || 'phong'
    let id = base
    for (let i = 2; this.t.departments.get(id); i++) id = `${base}-${i}`
    const bots = (input.bots ?? []).filter((b) => this.t.bots.get(b)?.kind === 'member')
    if (input.lead && !bots.includes(input.lead)) throw new BotError('Trưởng nhóm phải là bot trong phòng.')
    const from = input.copyPolicyFrom ? this.t.departments.get(input.copyPolicyFrom)?.policy : undefined
    const rec = await this.upsertDepartment({
      id,
      name,
      ...(input.about ? { about: input.about } : {}),
      policy: from ?? DEFAULT_POLICY,
    })
    for (const b of bots) await this.moveBot(b, id)
    return input.lead ? this.upsertDepartment({ id, name, lead: input.lead }) : rec
  }

  /** Chuyển bot sang phòng khác (`null`: chưa xếp phòng); rời phòng cũ thì thôi làm trưởng nhóm ở đó. */
  async moveBot(botId: string, department: string | null): Promise<void> {
    const bot = this.t.bots.get(botId)
    if (!bot || bot.kind !== 'member') throw new BotError('Không có bot này.')
    if (department && !this.t.departments.get(department))
      throw new BotError(`Không có phòng ban ${department}.`)
    const old = bot.department ? this.t.departments.get(bot.department) : undefined
    if (old && old.id !== department && old.lead === botId) {
      const next = { ...old }
      delete next.lead
      await this.t.departments.put(old.id, next)
    }
    const rec = { ...bot }
    if (department) rec.department = department
    else delete rec.department
    await this.t.bots.put(botId, rec)
  }

  /** Xoá phòng: bot về "chưa xếp phòng", giữ nguyên hồ sơ, ký ức, model riêng. */
  async deleteDepartment(id: string): Promise<void> {
    if (!this.t.departments.get(id)) throw new BotError('Không có phòng ban này.')
    for (const b of this.list()) if (b.department === id) await this.moveBot(b.id, null)
    await this.t.departments.delete(id)
  }

  /** Chính sách áp cho bot: của phòng bot thuộc, không thì mặc định. Commander không theo chính sách phòng. */
  policyOf(botId: string): { department?: DepartmentRecord; policy: Policy } | undefined {
    const bot = this.t.bots.get(botId)
    if (!bot || bot.kind === 'commander') return undefined
    const department = bot.department ? this.t.departments.get(bot.department) : undefined
    return department
      ? { department, policy: department.policy ?? DEFAULT_POLICY }
      : { policy: DEFAULT_POLICY }
  }

  /** Model bot chạy: model riêng, không có thì model mặc định của phòng. */
  effectiveModel(botId: string): { provider: string; model: string } | undefined {
    return this.t.bots.get(botId)?.model ?? this.policyOf(botId)?.policy.model
  }

  /** Phòng ban cũ chưa có chính sách: lấy theo đội mẫu cùng mã, không thì mặc định. */
  async ensurePolicies(templates: readonly Template[]): Promise<void> {
    for (const d of this.departments()) {
      if (d.policy) continue
      const tmpl = templates.flatMap((t) => t.departments).find((x) => x.id === d.id)
      await this.t.departments.put(d.id, {
        ...d,
        ...(tmpl?.about && !d.about ? { about: tmpl.about } : {}),
        policy: cleanPolicy(tmpl?.policy ?? {}, DEFAULT_POLICY),
      })
    }
  }

  /** Áp đội mẫu: chỉ thêm, không xoá; tên gọi đã có thì bỏ qua bot đó. */
  async applyTemplate(t: Template): Promise<{ added: string[]; skipped: string[] }> {
    for (const d of t.departments)
      if (!this.t.departments.get(d.id))
        await this.upsertDepartment({
          id: d.id,
          name: d.name,
          ...(d.about ? { about: d.about } : {}),
          policy: cleanPolicy(d.policy ?? {}, DEFAULT_POLICY),
        })
    const added: string[] = []
    const skipped: string[] = []
    const ids = new Map<string, string>()
    for (const b of t.bots) {
      const existing = this.byHandle(b.handle)
      if (existing) {
        skipped.push(b.handle)
        ids.set(b.handle, existing.id)
        continue
      }
      const rec = await this.create(b)
      ids.set(b.handle, rec.id)
      added.push(b.handle)
    }
    for (const d of t.departments) {
      const lead = d.lead ? ids.get(d.lead) : undefined
      const cur = this.t.departments.get(d.id)
      if (lead && cur && !cur.lead) await this.upsertDepartment({ id: d.id, name: cur.name, lead })
    }
    return { added, skipped }
  }

  /** Bot của phiên; phiên chưa gắn là của Commander. */
  botOf(sessionId: string | undefined): BotRecord {
    const tag = sessionId ? this.t.sessions.get(sessionKey(sessionId)) : undefined
    return (tag && this.t.bots.get(tag.bot)) || this.t.bots.get(COMMANDER_ID)!
  }

  /** Phiên chat thẳng gần nhất với bot (mở lại khi bấm bot trên thanh bên). */
  latestOpen(bot: string): string | undefined {
    let best: { id: string; at: string } | undefined
    for (const [key, r] of this.t.sessions.entries())
      if (r.bot === bot && r.via === 'open' && (!best || r.at > best.at))
        best = { id: r.session ?? key, at: r.at }
    return best?.id
  }

  /** Mã các phiên đã gắn với bot (chat riêng, phiên nhận việc), mới gắn trước. */
  sessionsOf(bot: string): string[] {
    return [...this.t.sessions.entries()]
      .filter(([, r]) => r.bot === bot)
      .sort(([, a], [, b]) => b.at.localeCompare(a.at))
      .map(([key, r]) => r.session ?? key)
  }

  tagOf(sessionId: string): SessionRecord | undefined {
    return this.t.sessions.get(sessionKey(sessionId))
  }

  async tag(sessionId: string, bot: string, via: SessionRecord['via']): Promise<void> {
    if (!this.t.bots.get(bot)) throw new BotError('Không có bot này.')
    await this.t.sessions.put(sessionKey(sessionId), {
      bot,
      via,
      at: this.now().toISOString(),
      session: sessionId,
    })
  }
}

/** Khoá bản ghi phiên: storage dsh chỉ nhận chữ, số và `-`. */
export const sessionKey = (id: string) => id.replace(/[^A-Za-z0-9-]/g, '-')
