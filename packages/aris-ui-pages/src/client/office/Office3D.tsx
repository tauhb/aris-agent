/**
 * Tab Tổng quan của Văn phòng, chế độ 3D (bản vẽ `VanPhong3D`): cảnh three.js dựng từ đội thật (mỗi phòng ban một khu,
 * mỗi bot một bàn), thẻ tên HTML bám theo bot (bot rảnh gộp thành một thẻ "Rảnh · N" trên sofa, rê chuột hoặc chọn thì hiện
 * thẻ riêng; thẻ chồng nhau thì giãn ra), ba con số ở góc trên trái. "Vừa làm gì" và bảng chat nằm ở cột phải dùng chung
 * với 2D (`Overview`). Bấm vào bot thì `onPick` (nơi gọi mở bảng chat với bot đó). Cảnh nằm ở `scene3d.ts` và chỉ được nạp khi vào đây, nên người dùng 2D không
 * tải thư viện 3D. Không có WebGL thì gọi `onUnsupported` để quay về 2D.
 */
import { getMascot } from '@aris/ui-kit'
import type { TeamLive } from '@aris/ui-kit/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { STATUS_DOT } from './Desk.js'
import { assigneeOf, labelPlan, layoutOffice, spotsFor, spreadLabels, type Occupant } from './layout.js'
import type { Desk, DeskGroup } from './model.js'
import type { Actor, OfficeScene } from './scene3d.js'

type T = PageProps['t']

/** Màu thân khi linh vật không có trong thư viện. */
const FALLBACK_COLOR = '#1D6FE0'
/** Khoảng cách dọc tối thiểu (px) giữa hai thẻ cùng chỗ trên màn hình. */
const LABEL_GAP = 24
const ZONE_PREFIX = 'zone:'

/** Đặt thẻ HTML tại điểm (x, y) trên màn hình, mép dưới giữa thẻ chạm điểm đó. */
function place(el: HTMLElement | undefined, x: number, y: number, visible: boolean) {
  if (!el) return
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
  el.style.visibility = visible ? 'visible' : 'hidden'
}

export function Office3D({
  t,
  groups,
  aris,
  live,
  tokens,
  cost,
  costNote,
  need,
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
  selected: string | null
  onPick: (id: string | null) => void
  onUnsupported: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const tags = useRef(new Map<string, HTMLElement>())
  // Vị trí chiếu mới nhất của từng thẻ; giãn thẻ chồng nhau làm sau khi cảnh chiếu xong cả khung hình.
  const projected = useRef(new Map<string, { x: number; y: number; visible: boolean }>())
  const [scene, setScene] = useState<OfficeScene | null>(null)
  const [hover, setHover] = useState<string | null>(null)
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
    accessory: d.accessory,
    scene: d.scene,
    commander: i === 0,
  }))
  const spots = spotsFor(layout, occupants, aris.id, assignee)
  const plan = labelPlan(layout, occupants, spots, [hover, selected])

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
          onHover: setHover,
          onProject: (key, x, y, visible) => {
            if (key.startsWith(ZONE_PREFIX)) place(tags.current.get(key), x, y, visible)
            else projected.current.set(key, { x, y, visible })
          },
          onProjected: () => {
            // Đo hết rồi mới ghi, để không buộc trình duyệt tính lại bố cục nhiều lần mỗi khung hình.
            const boxes = []
            for (const [key, p] of projected.current) {
              const el = tags.current.get(key)
              if (el && p.visible) boxes.push({ key, x: p.x, y: p.y, w: el.offsetWidth })
            }
            const ys = spreadLabels(boxes, LABEL_GAP)
            for (const [key, p] of projected.current)
              place(tags.current.get(key), p.x, ys.get(key) ?? p.y, p.visible)
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
        {plan.sofas.map(
          (n, i) =>
            n > 0 && (
              <div
                key={`sofa:${i}`}
                className="ap-of-tag sofa"
                ref={(el) => {
                  if (el) tags.current.set(`sofa:${i}`, el)
                  else tags.current.delete(`sofa:${i}`)
                }}
              >
                <i />
                {t('of.3d.rest', { n })}
              </div>
            ),
        )}
        {everyone
          .filter((d) => plan.named.has(d.id))
          .map((d) => (
            <div
              key={d.id}
              className="ap-of-tag"
              ref={(el) => {
                if (el) tags.current.set(d.id, el)
                else {
                  tags.current.delete(d.id)
                  projected.current.delete(d.id)
                }
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
    </div>
  )
}
