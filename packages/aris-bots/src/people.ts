/**
 * Người và luồng (GĐ9.6a, docs/plans/gd9-6-nguoi-va-luong.md). Người (chủ, thành viên, khách) có nhiều danh tính
 * (web, Telegram, Zalo, Lark). Luồng là cuộc chat liên tục giữa một bot và một người: trang hiện tại là phiên đang
 * dùng, trang cũ giữ lại để xem. Kho này chỉ thêm mới; bảng phiên cũ của bot vẫn ghi song song.
 */
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import type { Table } from './domain.js'

export const CHANNELS = ['web', 'telegram', 'zalo', 'lark'] as const
export type Channel = (typeof CHANNELS)[number]

export const personRecord = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['owner', 'member', 'guest']),
  ids: z.array(z.object({ channel: z.enum(CHANNELS), ref: z.string(), account: z.string().optional() })),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PersonRecord = z.infer<typeof personRecord>

export const threadRecord = z.object({
  id: z.string(),
  bot: z.string(),
  person: z.string(),
  kind: z.enum(['direct', 'customer', 'group']),
  /** Kênh của luồng; luồng chung của chủ (mọi kênh một luồng) ghi `shared`. */
  channel: z.enum([...CHANNELS, 'shared']),
  /** Trang hiện tại: phiên đang dùng. */
  session: z.string(),
  /** Trang cũ, mới trước (tối đa {@link PAGES_MAX}). */
  pages: z.array(z.string()),
  /** Kênh vừa nhắn gần nhất (với luồng chung). */
  lastChannel: z.enum(CHANNELS).optional(),
  updatedAt: z.string(),
})
export type ThreadRecord = z.infer<typeof threadRecord>

export const OWNER_ID = 'p-owner'
export const PAGES_MAX = 50

const key = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '-')
/** Mã luồng: bot, người, loại, kênh (luồng chung bỏ kênh). */
export const threadId = (
  bot: string,
  person: string,
  kind: ThreadRecord['kind'],
  channel: ThreadRecord['channel'],
) => key(`${bot}--${person}--${kind}--${channel}`)

export class PeopleStore {
  constructor(
    private readonly people: Table<PersonRecord>,
    private readonly threads: Table<ThreadRecord>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  person(id: string): PersonRecord | undefined {
    return this.people.get(id)
  }

  list(): PersonRecord[] {
    return [...this.people.entries()].map(([, p]) => p)
  }

  /** Người "chủ" (người dùng chính của aris); chưa có thì tạo với danh tính web. */
  async ensureOwner(name = 'Chủ'): Promise<PersonRecord> {
    const cur = this.people.get(OWNER_ID)
    if (cur) {
      if (name && cur.name !== name && name !== 'Chủ')
        await this.people.put(OWNER_ID, { ...cur, name, updatedAt: this.stamp() })
      return this.people.get(OWNER_ID)!
    }
    const rec: PersonRecord = {
      id: OWNER_ID,
      name,
      role: 'owner',
      ids: [{ channel: 'web', ref: 'owner' }],
      createdAt: this.stamp(),
      updatedAt: this.stamp(),
    }
    await this.people.put(OWNER_ID, rec)
    return rec
  }

  /** Người theo danh tính kênh. */
  byIdentity(channel: Channel, ref: string, account?: string): PersonRecord | undefined {
    return this.list().find((p) =>
      p.ids.some((i) => i.channel === channel && i.ref === ref && (i.account ?? '') === (account ?? '')),
    )
  }

  /**
   * Người của một danh tính kênh: đã nối thì trả; chủ thì nối vào người "chủ"; còn lại tạo người mới. Vai đổi theo kênh
   * (khách được ghép đôi thành thành viên) thì cập nhật, nhưng không hạ vai chủ.
   */
  async personFor(input: {
    channel: Channel
    ref: string
    account?: string | undefined
    name: string
    role: PersonRecord['role']
  }): Promise<PersonRecord> {
    const id = {
      channel: input.channel,
      ref: input.ref,
      ...(input.account ? { account: input.account } : {}),
    }
    const found = this.byIdentity(input.channel, input.ref, input.account)
    if (found) {
      if (found.role !== 'owner' && found.role !== input.role && input.role !== 'guest') {
        const next = { ...found, role: input.role, updatedAt: this.stamp() }
        await this.people.put(found.id, next)
        return next
      }
      return found
    }
    if (input.role === 'owner') {
      const owner = await this.ensureOwner()
      const next = { ...owner, ids: [...owner.ids, id], updatedAt: this.stamp() }
      await this.people.put(owner.id, next)
      return next
    }
    let pid: string
    do pid = `p-${randomBytes(4).toString('hex')}`
    while (this.people.get(pid))
    const rec: PersonRecord = {
      id: pid,
      name: input.name.trim().slice(0, 60) || input.ref,
      role: input.role,
      ids: [id],
      createdAt: this.stamp(),
      updatedAt: this.stamp(),
    }
    await this.people.put(pid, rec)
    return rec
  }

  thread(id: string): ThreadRecord | undefined {
    return this.threads.get(id)
  }

  allThreads(): ThreadRecord[] {
    return [...this.threads.entries()].map(([, t]) => t)
  }

  /** Luồng có phiên này là trang hiện tại (hay trang cũ). */
  threadOfSession(session: string): ThreadRecord | undefined {
    const all = this.allThreads()
    return all.find((t) => t.session === session) ?? all.find((t) => t.pages.includes(session))
  }

  /** Trang hiện tại của một luồng. */
  current(
    bot: string,
    person: string,
    kind: ThreadRecord['kind'],
    channel: ThreadRecord['channel'],
  ): string | undefined {
    return this.threads.get(threadId(bot, person, kind, channel))?.session
  }

  /** Ghi luồng: chưa có thì tạo; phiên khác trang hiện tại thì trang hiện tại thành trang cũ. */
  async touch(input: {
    bot: string
    person: string
    kind: ThreadRecord['kind']
    channel: ThreadRecord['channel']
    session: string
    via?: Channel
  }): Promise<ThreadRecord> {
    const id = threadId(input.bot, input.person, input.kind, input.channel)
    const cur = this.threads.get(id)
    const pages =
      cur && cur.session !== input.session
        ? [cur.session, ...cur.pages.filter((p) => p !== cur.session && p !== input.session)].slice(
            0,
            PAGES_MAX,
          )
        : (cur?.pages.filter((p) => p !== input.session) ?? [])
    const rec: ThreadRecord = {
      id,
      bot: input.bot,
      person: input.person,
      kind: input.kind,
      channel: input.channel,
      session: input.session,
      pages,
      ...(input.via ? { lastChannel: input.via } : cur?.lastChannel ? { lastChannel: cur.lastChannel } : {}),
      updatedAt: this.stamp(),
    }
    await this.threads.put(id, rec)
    return rec
  }

  private stamp() {
    return this.now().toISOString()
  }
}
