/**
 * Ảnh cửa sổ bot chụp, kèm vùng đánh dấu (khung hay điểm) vẽ đè theo tỉ lệ ảnh; bấm ảnh thì phóng to trong hộp thoại.
 * Dùng cho khung "Màn hình của bot" (viền xanh: chỗ vừa bấm) và thẻ duyệt (viền cam: chỗ sẽ bấm).
 */
import { Dialog } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { usePreview, type Mark, type Shot as ShotData } from './api.js'

const pct = (v: number, of: number) => `${Math.max(0, Math.min(100, (v / of) * 100))}%`

function MarkBox({ mark, shot, tone }: { mark: Mark; shot: ShotData; tone: 'done' | 'ask' }) {
  const box = 'width' in mark
  return (
    <span
      aria-hidden="true"
      className={`ap-cu-mark ${tone}${box ? '' : ' dot'}`}
      style={{
        left: pct(mark.x, shot.width),
        top: pct(mark.y, shot.height),
        ...(box ? { width: pct(mark.width, shot.width), height: pct(mark.height, shot.height) } : {}),
      }}
    />
  )
}

export function Shot({
  shot,
  mark,
  tone,
  label,
  zoomTitle,
  closeLabel,
}: {
  shot: ShotData
  mark?: Mark | undefined
  tone: 'done' | 'ask'
  /** Mô tả ảnh cho trình đọc màn hình (cũng là nhãn của nút phóng to). */
  label: string
  zoomTitle: string
  closeLabel: string
}) {
  const [zoom, setZoom] = useState(false)
  const src = `data:image/png;base64,${shot.png}`
  const img = (
    <span className="ap-cu-shot">
      <img src={src} alt="" width={shot.width} height={shot.height} />
      {mark && <MarkBox mark={mark} shot={shot} tone={tone} />}
    </span>
  )
  return (
    <>
      <button type="button" className="ap-cu-zoombtn" aria-label={label} onClick={() => setZoom(true)}>
        {img}
      </button>
      <Dialog
        open={zoom}
        title={zoomTitle}
        width={1100}
        closeLabel={closeLabel}
        onClose={() => setZoom(false)}
      >
        <div role="img" aria-label={label}>
          {img}
        </div>
      </Dialog>
    </>
  )
}

/** Ảnh chờ duyệt của một lời gọi điều khiển máy (Hộp duyệt): ảnh cửa sổ, viền cam ở chỗ sẽ bấm. */
export function PreviewShot({ t, id, what }: { t: PageProps['t']; id: string; what: string }) {
  const p = usePreview(id)
  if (!p?.image) return null
  return (
    <div className="ap-cu-preview">
      <Shot
        shot={p.image}
        mark={p.mark}
        tone="ask"
        label={t('cu.askShot', { what: what || p.describe })}
        zoomTitle={what || p.describe}
        closeLabel={t('cu.close')}
      />
      <span className="a-muted ap-cu-small">{t('cu.askCaption')}</span>
    </div>
  )
}
