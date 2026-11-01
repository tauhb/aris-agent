/**
 * Đầu khung chat của giao diện mới GĐ9 (bản vẽ V5): viên tên bot ở giữa (linh vật và tên, bấm mở hồ sơ ở
 * khung phải), bên phải là viên model và nút màn hình máy của bot (mở hồ sơ ở thẻ Máy). Không còn danh sách
 * phiên và nút phiên mới: mỗi bot một luồng, "Chủ đề mới" nằm trong menu "…".
 */
import { Mascot, ScreenIcon, useSessionBot, useTeamData } from '@aris/ui-kit/react'
import type { Translate } from './locale.js'

/** Mở hồ sơ bot ở khung phải, ở thẻ chi tiết hay thẻ máy. */
export type OpenProfile = (view: 'details' | 'computer') => void

/** Tên model gọn để hiện trên viên: bỏ phần nhà cung cấp trước dấu "/". */
export const shortModel = (model: string | undefined): string | undefined => {
  const id = model?.trim()
  if (!id) return undefined
  return id.slice(id.lastIndexOf('/') + 1)
}

/** Viên tên bot, phần trình bày thuần (để test). */
export function NamePill({
  name,
  mascot,
  accessory,
  t,
  onOpen,
}: {
  name: string
  mascot: string
  accessory?: string | undefined
  t: Translate
  onOpen: () => void
}) {
  return (
    <span className="aris g9-whoAt">
      <button type="button" className="g9-who" aria-label={t('v2.openProfile', { name })} onClick={onOpen}>
        <Mascot id={mascot} size={22} accessory={accessory} seed={name} />
        <span>{name}</span>
      </button>
    </span>
  )
}

/** Slot `conversation.header.leading`: viên tên bot của phiên (phiên chưa gắn bot là của Aris). */
export function LeadingV2({
  t,
  useMounted,
  openProfile,
}: {
  t: Translate
  useMounted: <R>(select: (value: string | undefined) => R) => R
  openProfile: OpenProfile
}) {
  const sessionId = useMounted((id) => id)
  const bot = useSessionBot(sessionId)
  return (
    <NamePill
      name={bot?.name ?? 'Aris'}
      mascot={bot?.mascot ?? 'aris'}
      accessory={bot?.accessory}
      t={t}
      onOpen={() => openProfile('details')}
    />
  )
}

/** Phần trình bày thuần của nút bên phải (để test). */
export function ActionsV2View({
  model,
  t,
  openProfile,
}: {
  model: string | undefined
  t: Translate
  openProfile: OpenProfile
}) {
  return (
    <span className="aris g9-hr">
      {model && (
        <button type="button" className="g9-mp" title={model} onClick={() => openProfile('details')}>
          <span>{model}</span>
        </button>
      )}
      <button
        type="button"
        className="g9-ib"
        aria-label={t('v2.computer')}
        title={t('v2.computer')}
        onClick={() => openProfile('computer')}
      >
        <ScreenIcon size={18} />
      </button>
    </span>
  )
}

/** Slot `conversation.session.header.actions`: viên model và nút màn hình. */
export function ActionsV2({
  t,
  sessionId,
  openProfile,
}: {
  t: Translate
  sessionId: string
  openProfile: OpenProfile
}) {
  const bot = useSessionBot(sessionId)
  const data = useTeamData()
  const id = (bot ?? data?.bots.find((b) => b.kind === 'commander'))?.model?.model
  const name = data?.catalog?.flatMap((g) => g.models).find((m) => m.id === id)?.name
  return <ActionsV2View model={name ?? shortModel(id)} t={t} openProfile={openProfile} />
}
