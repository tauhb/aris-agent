/**
 * Tab Tổng quan của Văn phòng, chế độ 3D (bản vẽ `VanPhong3D`): cảnh three.js dựng từ đội thật (mỗi phòng ban một khu,
 * mỗi bot một bàn), thẻ tên HTML bám theo bot, ba con số ở góc trên trái, khung "Vừa làm gì" ở góc dưới trái. Bấm vào bot thì
 * `onPick` (nơi gọi mở cùng ngăn kéo với 2D). Cảnh nằm ở `scene3d.ts` và chỉ được nạp khi vào đây, nên người dùng 2D không
 * tải thư viện 3D. Không có WebGL thì gọi `onUnsupported` để quay về 2D.
 */
import { getMascot } from '@aris/ui-kit'
import type { TeamLive } from '@aris/ui-kit/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { STATUS_DOT } from './Desk.js'
import { FeedRow } from './FeedRow.js'
import { assigneeOf, layoutOffice, spotsFor, type Occupant } from './layout.js'
import type { Desk, DeskGroup, FeedItem } from './model.js'
import type { Actor, OfficeScene } from './scene3d.js'

type T = PageProps['t']

/** Màu thân khi linh vật không có trong thư viện. */
const FALLBACK_COLOR = '#1D6FE0'

export function Office3D({
  t,
  groups,
  aris,
  live,
  tokens,
  cost,
  costNote,
  need,
  lines,
  mascotOf,
  selected,
  onPick,
  onUnsupported,
}: {
  t: T
  groups: readonly DeskGroup[]
  aris: Desk
  live: TeamLive | null
  /** Số token hôm nay đã định dạng; "–" khi chưa có. */
  tokens: string
  cost: string
  costNote: string
  need: number
  lines: readonly FeedItem[] | null
  mascotOf: (bot: string) => string
  selected: string | null
  onPick: (id: string | null) => void
  onUnsupported: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tags = useRef(new Map<string, HTMLElement>())
  const [scene, setScene] = useState<OfficeScene | null>(null)
  // Hàm gọi từ cảnh luôn là bản mới nhất, không buộc dựng lại cảnh khi trang vẽ lại.
  const callbacks = useRef({ onPick, onUnsupported })
  callbacks.current = { onPick, onUnsupported }

  const desks = groups.flatMap((g) => g.desks)
  const shape = JSON.stringify(groups.map((g) => [g.id, g.label, g.desks.map((d) => d.id)]))
  const layout = useMemo(
    () =>
      layoutOffice({
        groups: groups.map((g) => ({ id: g.id, label: g.label, bots: g.desks.map((d) => d.id) })),
      }),
    // Chỉ dựng lại bố cục khi hình dạng đội đổi (trạng thái bot đổi thì không).
    [shape],
  )

  const everyone = [aris, ...desks]
  const occupants: Occupant[] = everyone.map((d) => ({ id: d.id, scene: d.scene }))
  const assignee = assigneeOf(live?.activity ?? [], aris.id, occupants)
  const actors: Actor[] = everyone.map((d, i) => ({
    id: d.id,
    color: getMascot(d.mascot)?.color ?? FALLBACK_COLOR,
    mascot: d.mascot,
    scene: d.scene,
    commander: i === 0,
  }))
  const spots = spotsFor(layout, occupants, aris.id, assignee)

  useEffect(() => {
    const cv = canvas.current
    const st = stage.current
    if (!cv || !st) return
    let off = false
    let made: OfficeScene | null = null
    import('./scene3d.js')
      .then((m) => {
        if (off) return
        made = m.createScene({
          canvas: cv,
          stage: st,
          onPick: (id) => callbacks.current.onPick(id),
          onProject: (key, x, y, visible) => {
            const el = tags.current.get(key)
            if (!el) return
            el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
            el.style.visibility = visible ? 'visible' : 'hidden'
          },
        })
        setScene(made)
      })
      .catch(() => {
        if (!off) callbacks.current.onUnsupported()
      })
    return () => {
      off = true
      made?.dispose()
      made = null
      setScene(null)
    }
  }, [])

  useEffect(() => {
    scene?.update({ layout, actors, spots })
  })
  useEffect(() => scene?.select(selected), [scene, selected])

  const shown = lines?.slice(0, 4)
  return (
    <div className="ap-of-3d" ref={stage}>
      <canvas ref={canvas} role="img" aria-label={t('of.3d.aria')} />
      <div className="ap-of-tags" aria-hidden="true">
        {layout.zones.map((z) => (
          <div
            key={`zone:${z.id}`}
            className="ap-of-tag zone"
            ref={(el) => {
              if (el) tags.current.set(`zone:${z.id}`, el)
              else tags.current.delete(`zone:${z.id}`)
            }}
          >
            {z.label}
          </div>
        ))}
        {everyone.map((d) => (
          <div
            key={d.id}
            className="ap-of-tag"
            ref={(el) => {
              if (el) tags.current.set(d.id, el)
              else tags.current.delete(d.id)
            }}
          >
            <i style={{ background: STATUS_DOT[d.status] }} />
            {d.name}
            {d.scene !== 'work' && <span>{d.scene === 'wait' ? '!' : 'z'}</span>}
          </div>
        ))}
      </div>
      <ul className="ap-of-sr">
        {everyone.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onPick(d.id)}>
              {t('of.desk', { name: d.name })}
            </button>
          </li>
        ))}
      </ul>
      {!scene && <div className="ap-of-3d-load">{t('of.3d.loading')}</div>}
      <div className="ap-of-3d-nums">
        <div className="ap-of-big">
          <b>{tokens}</b>
          <span>{t('of.num.tokens')}</span>
        </div>
        <div className="ap-of-big">
          <b>{cost}</b>
          <span>{costNote}</span>
        </div>
        <div className="ap-of-big">
          <b className={need > 0 ? 'warn' : undefined}>{need}</b>
          <span>{t('of.num.waiting')}</span>
        </div>
      </div>
      <div className="ap-of-3d-feed">
        <div className="head">
          <b>{t('of.feed.title')}</b>
          <span>{t('of.3d.hint')}</span>
        </div>
        {shown?.length === 0 && <div className="none">{t('of.feed.empty')}</div>}
        {shown?.map((f) => (
          <FeedRow key={`${f.at}-${f.bot}-${f.kind}-${f.what}`} item={f} t={t} mascot={mascotOf(f.bot)} />
        ))}
      </div>
    </div>
  )
}
