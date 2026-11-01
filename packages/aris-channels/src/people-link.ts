/**
 * Người và luồng ở kênh (GĐ9.6a, docs/plans/gd9-6-nguoi-va-luong.md): khi một cuộc chat của kênh được gắn với một
 * phiên, nối người nhắn vào kho người của `@aris/bots` và ghi luồng; luồng chung của chủ thì dùng chung trang với web.
 */
import type { Trust } from './access.js'

/** Phần kho người và luồng của `@aris/bots` mà kênh dùng (GĐ9.6a). */
export interface PeoplePort {
  store: {
    personFor(input: {
      channel: 'telegram' | 'zalo' | 'lark'
      ref: string
      account?: string | undefined
      name: string
      role: 'owner' | 'member' | 'guest'
    }): Promise<{ id: string; role: 'owner' | 'member' | 'guest' }>
    current(bot: string, person: string, kind: 'direct', channel: 'shared'): string | undefined
    touch(input: {
      bot: string
      person: string
      kind: 'direct' | 'customer' | 'group'
      channel: 'telegram' | 'zalo' | 'lark' | 'shared'
      session: string
      via?: 'telegram' | 'zalo' | 'lark'
    }): Promise<unknown>
  }
}

/** Người nhắn trong cuộc chat của kênh: để ghi người và luồng (GĐ9.6a). */
export interface ChatWho {
  channel: 'telegram' | 'zalo' | 'lark'
  ref: string
  account?: string | undefined
  name: string
  trust: Trust
  group: boolean
}

/** Ghi người và luồng cho một cuộc chat đã có phiên; luồng chung của chủ thì trả phiên chung (nếu khác phiên hiện có). */
export async function linkThread(
  port: PeoplePort | undefined,
  shared: boolean,
  bot: string,
  who: ChatWho | undefined,
  pick: (sharedSession: string | undefined) => Promise<string>,
): Promise<string> {
  if (!port || !who) return pick(undefined)
  const role = who.trust === 'owner' ? 'owner' : who.trust === 'member' ? 'member' : 'guest'
  const person = await port.store.personFor({
    channel: who.channel,
    ref: who.ref,
    account: who.account,
    name: who.name,
    role,
  })
  const kind = who.group ? 'group' : role === 'guest' ? 'customer' : 'direct'
  const together = shared && person.role === 'owner' && kind === 'direct'
  const session = await pick(together ? port.store.current(bot, person.id, 'direct', 'shared') : undefined)
  await port.store.touch({
    bot,
    person: person.id,
    kind,
    channel: together ? 'shared' : who.channel,
    session,
    via: who.channel,
  })
  return session
}
