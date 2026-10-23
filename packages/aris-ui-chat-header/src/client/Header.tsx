/**
 * Đầu khung chat theo canvas 1.1: "Aris · Commander / Tên phiên ▾".
 * - `conversation.header.leading`: bot đang chat (mặc định Aris, Commander).
 * - `conversation.session.header.actions`: nút ▾ ngay sau tên phiên, mở danh sách phiên.
 * - `conversation.session.header.utilities`: icon phiên mới.
 * Giai đoạn 2 lấy bot thật từ agent preset của phiên.
 */
import { ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives'
import { getMascot } from '@aris/ui-kit'
import { useEffect, useRef, useState } from 'react'
import type { Translate } from './locale.js'
import { chatSessions, whenLabel, type SessionListLike } from './sessions.js'

type Selector<T> = <R>(select: (value: T) => R, equal?: (a: R, b: R) => boolean) => R

/** So danh sách theo id, tiêu đề và trạng thái để hook không vẽ lại khi không đổi. */
const sameIds = <T extends { id: string; displayTitle: string; running: boolean; updatedAt: number }>(
  a: readonly T[],
  b: readonly T[],
) =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.id === b[i]!.id &&
      x.displayTitle === b[i]!.displayTitle &&
      x.running === b[i]!.running &&
      x.updatedAt === b[i]!.updatedAt,
  )

export interface HeaderActions {
  openSession: (sessionId: string) => void
  startSession: () => void
}

interface ShortcutRow {
  readonly id: string
  readonly keys: readonly string[]
}

/** Bot đang chat. Chưa có dịch vụ đội bot nên luôn là Aris. */
const CURRENT_BOT = { id: 'aris', name: 'Aris', role: 'Commander' }

function Mascot({ id, size }: { id: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      style={{ flex: 'none' }}
      dangerouslySetInnerHTML={{ __html: getMascot(id)?.body ?? '' }}
    />
  )
}

const line = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function NewIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4.5H7a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-5"
        {...line}
        strokeWidth={1.75}
      />
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z" {...line} strokeWidth={1.75} />
    </svg>
  )
}

export function BotIdentity({ t }: { t: Translate }) {
  return (
    <span className="aris-ch" aria-label={t('bot.chattingWith', CURRENT_BOT)}>
      <Mascot id={CURRENT_BOT.id} size={26} />
      <span className="botName">{CURRENT_BOT.name}</span>
      <span className="role">{CURRENT_BOT.role}</span>
      <span className="sep" aria-hidden="true">
        /
      </span>
    </span>
  )
}

export function SessionSwitcher(
  props: HeaderActions & {
    t: Translate
    sessionId: string
    useSessions: Selector<SessionListLike>
    useShortcuts: Selector<readonly ShortcutRow[]>
  },
) {
  const { t } = props
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const sessions = props.useSessions((list) => chatSessions(list, props.sessionId), sameIds)
  const newShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'session.new'))

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <span className="aris-ch pop" ref={root}>
      <button
        type="button"
        className="chev"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('switcher.open', CURRENT_BOT)}
        onClick={() => setOpen(!open)}
      >
        <svg width={12} height={12} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" {...line} strokeWidth={2.4} />
        </svg>
      </button>
      {open && (
        <span className="menu" role="listbox" aria-label={t('switcher.list', CURRENT_BOT)}>
          <button type="button" className="item new" onClick={go(props.startSession)}>
            <svg width={15} height={15} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" {...line} strokeWidth={2.2} />
            </svg>
            <span className="t">{t('session.newWith', CURRENT_BOT)}</span>
            {newShortcut && newShortcut.keys.length > 0 && (
              <span className="meta">
                <ShortcutKeys keys={newShortcut.keys} />
              </span>
            )}
          </button>
          <span className="label">{t('switcher.list', CURRENT_BOT)}</span>
          {sessions.length === 0 && <span className="empty">{t('switcher.empty')}</span>}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={s.id === props.sessionId}
              className="item"
              onClick={go(() => props.openSession(s.id))}
            >
              <span className="t">{s.displayTitle}</span>
              <span className="meta">
                {s.id === props.sessionId
                  ? t('meta.open')
                  : s.running
                    ? t('meta.running')
                    : whenLabel(s.updatedAt, t)}
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

export function NewSessionButton({
  startSession,
  t,
}: Pick<HeaderActions, 'startSession'> & { t: Translate }) {
  return (
    <span className="aris-ch">
      <button
        type="button"
        className="icon"
        aria-label={t('session.newWith', CURRENT_BOT)}
        title={t('session.new')}
        onClick={startSession}
      >
        <NewIcon />
      </button>
    </span>
  )
}
