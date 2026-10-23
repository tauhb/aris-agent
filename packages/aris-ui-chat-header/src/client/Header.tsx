/**
 * Đầu khung chat theo canvas 1.1: "Aris · Commander / Tên phiên ▾".
 * - `conversation.header.leading`: bot đang chat (mặc định Aris, Commander).
 * - `conversation.session.header.actions`: nút ▾ ngay sau tên phiên, mở danh sách phiên.
 * - `conversation.session.header.utilities`: icon phiên mới.
 * Giai đoạn 2 lấy bot thật từ agent preset của phiên.
 */
import { ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  ChevronDownIcon,
  ComposeIcon,
  IconButton,
  Mascot,
  Menu,
  MenuEmpty,
  MenuItem,
  MenuLabel,
  Pill,
  PlusIcon,
  useDismiss,
} from '@aris/ui-kit/react'
import { DEMO_PROJECT_ROOM, projectOfSession, type WorkspaceLike } from '@aris/ui-kit'
import { useCallback, useRef, useState } from 'react'
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

/**
 * Đầu khung bên trái: phiên thuộc dự án (màn 1.4) thì hiện linh vật các thành viên,
 * tên dự án, "n bot và anh"; phiên chat riêng thì hiện bot đang chat.
 */
export function Leading({
  t,
  useWorkspaces,
  useMounted,
}: {
  t: Translate
  useWorkspaces: Selector<{ readonly items: readonly WorkspaceLike[] }>
  useMounted: Selector<string | undefined>
}) {
  const sessionId = useMounted((id) => id)
  const title = useWorkspaces((w) => projectOfSession(w.items, sessionId)?.title)
  return title === undefined ? <BotIdentity t={t} /> : <ProjectIdentity t={t} title={title} />
}

/** Thành viên dự án là mẫu tới giai đoạn 2 (danh sách thành viên của Team dsh). */
function ProjectIdentity({ t, title }: { t: Translate; title: string }) {
  const members = DEMO_PROJECT_ROOM.members
  return (
    <span className="aris aris-ch" aria-label={t('project.label', { name: title, n: members.length })}>
      <span className="stack" aria-hidden="true">
        {members.map((m) => (
          <Mascot key={m.id} id={m.id} size={24} />
        ))}
      </span>
      <span className="botName">{title}</span>
      <span className="members">{t('project.members', { n: members.length })}</span>
      <span className="slash" aria-hidden="true">
        /
      </span>
    </span>
  )
}

export function BotIdentity({ t }: { t: Translate }) {
  return (
    <span className="aris aris-ch" aria-label={t('bot.chattingWith', CURRENT_BOT)}>
      <Mascot id={CURRENT_BOT.id} size={26} />
      <span className="botName">{CURRENT_BOT.name}</span>
      <Pill>{CURRENT_BOT.role}</Pill>
      <span className="slash" aria-hidden="true">
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
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  const sessions = props.useSessions((list) => chatSessions(list, props.sessionId), sameIds)
  const newShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'session.new'))

  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <span className="aris aris-ch a-pop" ref={root}>
      <IconButton
        label={t('switcher.open', CURRENT_BOT)}
        size="sm"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDownIcon />
      </IconButton>
      {open && (
        <Menu label={t('switcher.list', CURRENT_BOT)} role="listbox" width={330}>
          <MenuItem
            icon={<PlusIcon size={15} />}
            meta={
              newShortcut && newShortcut.keys.length > 0 ? (
                <ShortcutKeys keys={newShortcut.keys} />
              ) : undefined
            }
            onSelect={go(props.startSession)}
          >
            {t('session.newWith', CURRENT_BOT)}
          </MenuItem>
          <MenuLabel separated>{t('switcher.list', CURRENT_BOT)}</MenuLabel>
          {sessions.length === 0 && <MenuEmpty>{t('switcher.empty')}</MenuEmpty>}
          {sessions.map((s) => (
            <MenuItem
              key={s.id}
              role="option"
              selected={s.id === props.sessionId}
              meta={
                s.id === props.sessionId
                  ? t('meta.open')
                  : s.running
                    ? t('meta.running')
                    : whenLabel(s.updatedAt, t)
              }
              onSelect={go(() => props.openSession(s.id))}
            >
              {s.displayTitle}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  )
}

export function NewSessionButton({
  startSession,
  t,
}: Pick<HeaderActions, 'startSession'> & { t: Translate }) {
  return (
    <span className="aris aris-ch">
      <IconButton label={t('session.newWith', CURRENT_BOT)} title={t('session.new')} onClick={startSession}>
        <ComposeIcon />
      </IconButton>
    </span>
  )
}
