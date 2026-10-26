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
  openBotSession,
  useDismiss,
  useProjectByPath,
  useSessionBot,
  useTeam,
} from '@aris/ui-kit/react'
import { projectOfSession, type WorkspaceLike } from '@aris/ui-kit'
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
  const path = useWorkspaces((w) => projectOfSession(w.items, sessionId)?.path)
  return title === undefined ? (
    <BotIdentity t={t} sessionId={sessionId} />
  ) : (
    <ProjectIdentity t={t} title={title} path={path} />
  )
}

/** Dự án: Aris chủ trì và các bot thành viên (`@aris/projects`). */
function ProjectIdentity({ t, title, path }: { t: Translate; title: string; path: string | undefined }) {
  const team = useTeam()
  const project = useProjectByPath(path)?.project
  const members = [
    { id: team.commander.id, mascot: team.commander.mascot ?? 'aris', accessory: team.commander.accessory },
    ...(project?.members ?? []).flatMap((id) => {
      const m = team.members.find((b) => b.id === id)
      return m ? [{ id: m.id, mascot: m.mascot ?? m.id, accessory: m.accessory }] : []
    }),
  ]
  return (
    <span className="aris aris-ch" aria-label={t('project.label', { name: title, n: members.length })}>
      <span className="stack" aria-hidden="true">
        {members.map((m) => (
          <Mascot key={m.id} id={m.mascot} size={24} accessory={m.accessory} />
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

/** Bot của phiên (`@aris/bots`): phiên chưa gắn là của Commander. */
export function BotIdentity({ t, sessionId }: { t: Translate; sessionId?: string | undefined }) {
  const bot = useSessionBot(sessionId)
  const current = {
    name: bot?.name ?? 'Aris',
    role: !bot || bot.kind === 'commander' ? 'Commander' : bot.role,
  }
  return (
    <span className="aris aris-ch" aria-label={t('bot.chattingWith', current)}>
      <Mascot id={bot?.mascot ?? 'aris'} size={26} accessory={bot?.accessory} />
      <span className="botName">{current.name}</span>
      {current.role && <Pill>{current.role}</Pill>}
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
  const bot = useSessionBot(props.sessionId)
  const CURRENT_BOT = { name: bot?.name ?? 'Aris' }
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
            onSelect={go(newSessionWith(bot, props))}
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

/**
 * Việc mới với đúng bot của phiên: phiên của bot thường mở phiên mới với bot đó (gắn bot trước
 * khi mở); phiên của Commander dùng "việc mới" của dsh như cũ.
 */
function newSessionWith(
  bot: ReturnType<typeof useSessionBot>,
  actions: Pick<HeaderActions, 'startSession' | 'openSession'>,
): () => void {
  if (!bot || bot.kind === 'commander') return actions.startSession
  return () =>
    void openBotSession(bot.id, true).then(
      (id) => actions.openSession(id),
      () => actions.startSession(),
    )
}

export function NewSessionButton({
  startSession,
  openSession,
  sessionId,
  t,
}: Pick<HeaderActions, 'startSession' | 'openSession'> & { t: Translate; sessionId?: string | undefined }) {
  const bot = useSessionBot(sessionId)
  return (
    <span className="aris aris-ch">
      <IconButton
        label={t('session.newWith', { name: bot?.name ?? 'Aris' })}
        title={t('session.new')}
        onClick={newSessionWith(bot, { startSession, openSession })}
      >
        <ComposeIcon />
      </IconButton>
    </span>
  )
}
