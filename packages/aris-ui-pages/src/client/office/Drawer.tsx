/**
 * Ngăn kéo bên phải của một bot (bản vẽ `VanPhong2D`): việc đang làm, vài bước gần nhất, Từng bước / Mở chat / Dừng và
 * ô nhắn chèn vào việc đang chạy. Không có phiên đang chạy thì ô nhắn mở chat.
 */
import { Button, CloseIcon, IconButton, Mascot, openBotSession, stopExternalRun } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'
import { termLine } from './Desk.js'
import { steerSession, stopSession, useLastSteps } from './data.js'
import { hhmm, type Desk } from './model.js'

type T = PageProps['t']

export function Drawer({
  desk,
  sessions,
  t,
  nav,
  onClose,
}: {
  desk: Desk
  /** Phiên đang chạy hay đang đợi của bot (bot ngoài: mã lần chạy). */
  sessions: readonly string[]
  t: T
  nav: PageProps['nav']
  onClose: () => void
}) {
  const sid = sessions[0]
  const steps = useLastSteps(desk.external ? undefined : sid)
  const [text, setText] = useState('')
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const openChat = async () => {
    if (desk.external) return nav.go('bot', { id: desk.id })
    try {
      nav.openSession(sid ?? (await openBotSession(desk.id)))
    } catch (e) {
      setNote({ bad: true, text: t('of.dr.error', { error: e instanceof Error ? e.message : String(e) }) })
    }
  }
  const run = async (job: () => Promise<void>, ok: string) => {
    setBusy(true)
    setNote(null)
    try {
      await job()
      setNote({ bad: false, text: ok })
      return true
    } catch (e) {
      setNote({ bad: true, text: t('of.dr.error', { error: e instanceof Error ? e.message : String(e) }) })
      return false
    } finally {
      setBusy(false)
    }
  }
  const stop = () =>
    sid && void run(() => (desk.external ? stopExternalRun(sid) : stopSession(sid)), t('of.dr.stopped'))
  const send = async () => {
    const msg = text.trim()
    if (!msg) return
    if (!sid || desk.external) return void openChat()
    if (await run(() => steerSession(sid, msg), t('of.dr.sent'))) setText('')
  }

  return (
    <aside className="ap-of-drawer" aria-label={t('of.dr.aria', { name: desk.name })}>
      <header>
        <Mascot id={desk.mascot} size={48} accessory={desk.accessory} />
        <span className="t">
          <b>{desk.name}</b>
          <small>{desk.role}</small>
        </span>
        <IconButton label={t('of.dr.close')} size="sm" onClick={onClose}>
          <CloseIcon size={16} />
        </IconButton>
      </header>
      <div className="ap-of-term">&gt; {termLine(desk, t)}</div>
      <div className="ap-of-steps">
        {steps?.map((s) => (
          <span key={s.n}>
            <span className="at">{hhmm(s.at)}</span> {s.title}
          </span>
        ))}
      </div>
      <div className="ap-of-acts">
        <Button
          size="sm"
          disabled={!sid || desk.external}
          onClick={() => sid && nav.go('settings', { section: 'stats', replay: sid })}
        >
          {t('of.dr.steps')}
        </Button>
        <Button size="sm" onClick={() => void openChat()}>
          {t('of.dr.chat')}
        </Button>
        <Button size="sm" style={{ color: 'var(--a-danger)' }} disabled={!sid || busy} onClick={stop}>
          {t('of.dr.stop')}
        </Button>
      </div>
      {note && <div className={note.bad ? 'ap-of-note bad' : 'ap-of-note'}>{note.text}</div>}
      <div className="ap-of-send">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send()
          }}
          placeholder={t('of.dr.msg', { name: desk.name })}
          aria-label={t('of.dr.msg', { name: desk.name })}
          maxLength={4000}
        />
        <Button variant="primary" size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>
          {t('of.dr.send')}
        </Button>
      </div>
    </aside>
  )
}
