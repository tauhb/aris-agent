/**
 * Điều khiển máy trong bảng chat của Văn phòng (bản vẽ `MayChat`): khung "Màn hình của <bot>" (ảnh mới nhất, viền xanh
 * ở chỗ vừa bấm, phóng to, số ảnh và thao tác đã dùng trong lượt), nút Cầm lái / Trả lại, và thẻ duyệt có ảnh với
 * viền cam ở chỗ sẽ bấm (bản vẽ `MayDuyet`, dùng chung cho chuông "Cần {you}").
 */
import { answerApproval, Button, type PendingApproval } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { computerPost, usePreview, useScreen } from './api.js'
import { Shot } from './Shot.js'

type T = PageProps['t']

const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Thẻ duyệt một thao tác điều khiển máy: việc sắp làm, ảnh cửa sổ có viền cam, Cho phép / Từ chối. */
export function ComputerApproval({
  t,
  item,
  onDone,
  compact,
}: {
  t: T
  item: PendingApproval
  onDone: () => void
  /** Trong chuông: ảnh nhỏ hơn, không có dòng chế độ. */
  compact?: boolean
}) {
  const p = usePreview(item.preview)
  const [busy, setBusy] = useState(false)
  const answer = async (allow: boolean) => {
    setBusy(true)
    await answerApproval(item.id, allow).catch(() => false)
    setBusy(false)
    onDone()
  }
  const what = item.target ?? p?.describe ?? item.tool ?? ''
  return (
    <section
      className={`ap-cu-ask${compact ? ' compact' : ''}`}
      aria-label={t('cu.askLabel', { name: item.name })}
    >
      <span className="ap-cu-tag">{t('cu.askTag')}</span>
      <b className="ap-cu-what">{what}</b>
      {p?.image && (
        <Shot
          shot={p.image}
          mark={p.mark}
          tone="ask"
          label={t('cu.askShot', { what })}
          zoomTitle={what}
          closeLabel={t('cu.close')}
        />
      )}
      {!compact && <span className="a-muted ap-cu-small">{t('cu.askTimeout')}</span>}
      <span className="ap-cu-row">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void answer(true)}>
          {t('cu.allow')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void answer(false)}>
          {t('cu.reject')}
        </Button>
      </span>
    </section>
  )
}

/** Khung màn hình của bot và các thẻ duyệt điều khiển máy của phiên, đặt cuối luồng tin trong bảng chat. */
export function ChatScreen({
  t,
  sessionId,
  name,
  approvals,
  reloadApprovals,
}: {
  t: T
  sessionId: string | undefined
  name: string
  approvals: readonly PendingApproval[]
  reloadApprovals: () => void
}) {
  const [view, reload] = useScreen(sessionId)
  const mine = approvals.filter((a) => a.source === 'computer' && a.parentSession === sessionId)
  const screen = view?.active ? view.screen : undefined
  const paused = view?.paused === true
  const toggle = async () => {
    if (!sessionId) return
    await computerPost({ op: paused ? 'give' : 'take', session: sessionId })
    reload()
  }
  if (!screen && !mine.length && !paused) return null
  return (
    <>
      {screen?.image && (
        <section className="ap-cu-frame" aria-label={t('cu.screenOf', { name })}>
          <div className="ap-cu-fh">
            <b>{t('cu.screenOf', { name })}</b>
            <span className="a-muted a-mono">
              {screen.app} · {hhmm(screen.at)}
            </span>
          </div>
          <div className="ap-cu-fb">
            <Shot
              shot={screen.image}
              mark={screen.mark}
              tone="done"
              label={t('cu.screenShot', { name, app: screen.app })}
              zoomTitle={`${screen.app}${screen.title ? ` · ${screen.title}` : ''} · ${hhmm(screen.at)}`}
              closeLabel={t('cu.close')}
            />
          </div>
          <div className="ap-cu-ff">
            <span className="a-muted ap-cu-small">
              {t('cu.screenNote', {
                name,
                s: view?.shots ?? 0,
                sm: view?.limits?.shots ?? 40,
                a: view?.actions ?? 0,
                am: view?.limits?.actions ?? 150,
              })}
            </span>
            {!paused && (
              <Button size="sm" variant="primary" onClick={() => void toggle()}>
                {t('cu.take')}
              </Button>
            )}
          </div>
        </section>
      )}
      {paused && (
        <div className="ap-cu-held" role="status">
          <b>{t('cu.heldTitle')}</b>
          <span>{t('cu.heldText', { name })}</span>
          <span>
            <Button size="sm" variant="primary" onClick={() => void toggle()}>
              {t('cu.give', { name })}
            </Button>
          </span>
        </div>
      )}
      {mine.map((a) => (
        <ComputerApproval key={a.id} t={t} item={a} onDone={reloadApprovals} />
      ))}
    </>
  )
}
