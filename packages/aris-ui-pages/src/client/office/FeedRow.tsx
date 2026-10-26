/** Một dòng của "Vừa làm gì": giờ, chấm màu theo mức, linh vật của bot và câu. Dùng chung cho 2D và 3D. */
import { Mascot } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { hhmm, type FeedItem } from './model.js'

type T = PageProps['t']

const FEED_DOT = { ok: 'var(--a-ok)', warn: 'var(--a-warn)', bad: 'var(--a-danger)' } as const

export function FeedRow({ item, t, mascot }: { item: FeedItem; t: T; mascot: string }) {
  const head = t(`of.feed.k.${item.kind}`)
  const line = item.what ? `${head}: ${item.what}` : head
  return (
    <div className="ap-of-lg" title={line}>
      <span className="at">{hhmm(item.at)}</span>
      <i style={{ background: FEED_DOT[item.tone] }} />
      <Mascot id={mascot} size={18} />
      <span>{line}</span>
    </div>
  )
}
