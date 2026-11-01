/**
 * Bảng Hoạt động của giao diện mới (bản vẽ V8, V9): mở từ chuông ở thanh bên (sự kiện `ACTIVITY_OPEN`), bám
 * mép phải thanh bên. Ba phần: việc cần người dùng (yêu cầu duyệt, bot đang đợi), việc đang chạy kèm việc xong
 * hôm nay, và routine. Bấm một mục thì mở phiên của bot và đóng bảng.
 */
import {
  ACTIVITY_OPEN,
  CloseIcon,
  IconButton,
  Mascot,
  activityV2,
  openBotSession,
  usePendingApprovals,
  useTeamData,
  useTeamLive,
  type ActivityEntry,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { Translate } from '../page.js'

type Tab = 'need' | 'running' | 'routine'

interface RoutineRow {
  id: string
  bot: string
  title: string
  enabled: boolean
  nextAt?: string
  running: boolean
  last: { status: string; sessionId?: string } | null
}

const routinesUrl = () => new URL('api/aris/routines', document.baseURI)

const clock = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** Bảng Hoạt động; `openSession` mở một phiên có sẵn trên vùng chính. */
export function ActivityDrawer({ t, openSession }: { t: Translate; openSession: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('need')
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(ACTIVITY_OPEN, show)
    return () => window.removeEventListener(ACTIVITY_OPEN, show)
  }, [])
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open])
  if (!open) return null
  return (
    <ActivityBody
      t={t}
      tab={tab}
      setTab={setTab}
      close={() => setOpen(false)}
      openSession={(id) => {
        setOpen(false)
        openSession(id)
      }}
    />
  )
}

function ActivityBody({
  t,
  tab,
  setTab,
  close,
  openSession,
}: {
  t: Translate
  tab: Tab
  setTab: (tab: Tab) => void
  close: () => void
  openSession: (id: string) => void
}) {
  const team = useTeamData()
  const live = useTeamLive()
  const [approvals] = usePendingApprovals('all')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const botOf = (id: string) => team?.bots.find((b) => b.id === id)
  const nameOf = (id: string) => botOf(id)?.name ?? id
  const a = activityV2(approvals, live, nameOf, now, t('act.busy'))
  const go = (e: ActivityEntry) =>
    e.session ? openSession(e.session) : void openBotSession(e.bot).then(openSession, () => {})

  const row = (e: ActivityEntry, meta?: string) => {
    const bot = botOf(e.bot)
    return (
      <button key={e.key} type="button" className="g9-it" onClick={() => go(e)}>
        <Mascot id={bot?.mascot ?? e.bot} size={32} accessory={bot?.accessory} />
        <span className="b">
          <span className="ti">{e.title}</span>
          <span className="l">{e.sub}</span>
        </span>
        {meta && <span className={e.failed ? 't err' : 't'}>{meta}</span>}
      </button>
    )
  }

  // Bảng bám mép phải thanh bên (người dùng kéo đổi được độ rộng thanh bên).
  const edge = document.querySelector('.g9-sb')?.getBoundingClientRect().right
  return (
    <div
      className="aris g9-drawer"
      role="dialog"
      aria-label={t('act.title')}
      style={edge ? { left: edge + 8 } : undefined}
    >
      <div className="g9-dh">
        <span>{t('act.title')}</span>
        <IconButton label={t('act.close')} size="sm" onClick={close}>
          <CloseIcon size={16} />
        </IconButton>
      </div>
      <div className="g9-seg" role="tablist">
        {(['need', 'running', 'routine'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-pressed={tab === id}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {id === 'routine'
              ? t('act.tab.routine')
              : t(`act.tab.${id}`, { n: id === 'need' ? a.need.length : a.running.length })}
          </button>
        ))}
      </div>
      <div className="g9-list">
        {tab === 'need' &&
          (a.need.length ? a.need.map((e) => row(e)) : <p className="g9-empty">{t('act.empty.need')}</p>)}
        {tab === 'running' && (
          <>
            {a.running.length ? (
              a.running.map((e) => row(e, clock(e.at)))
            ) : (
              <p className="g9-empty">{t('act.empty.running')}</p>
            )}
            {a.done.length > 0 && <div className="g9-lab">{t('act.today')}</div>}
            {a.done.map((e) => row(e, e.failed ? t('act.failed') : clock(e.at)))}
          </>
        )}
        {tab === 'routine' && <Routines t={t} nameOf={nameOf} botOf={botOf} openSession={openSession} />}
      </div>
    </div>
  )
}

function Routines({
  t,
  nameOf,
  botOf,
  openSession,
}: {
  t: Translate
  nameOf: (id: string) => string
  botOf: (id: string) => { mascot: string; accessory?: string | undefined } | undefined
  openSession: (id: string) => void
}) {
  const [rows, setRows] = useState<RoutineRow[] | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(routinesUrl()).catch(() => null)
    if (r?.ok) setRows(((await r.json()) as { routines: RoutineRow[] }).routines)
  }, [])
  useEffect(() => void load(), [load])
  if (!rows) return null
  if (!rows.length) return <p className="g9-empty">{t('act.empty.routine')}</p>
  return (
    <>
      {rows.map((r) => {
        const bot = botOf(r.bot)
        const when = !r.enabled ? t('act.off') : r.nextAt ? clock(Date.parse(r.nextAt)) : ''
        const session = r.last?.sessionId
        return (
          <button
            key={r.id}
            type="button"
            className="g9-it"
            onClick={() =>
              session ? openSession(session) : void openBotSession(r.bot).then(openSession, () => {})
            }
          >
            <Mascot id={bot?.mascot ?? r.bot} size={32} accessory={bot?.accessory} />
            <span className="b">
              <span className="ti">{r.title}</span>
              <span className="l">{nameOf(r.bot)}</span>
            </span>
            {when && <span className="t">{when}</span>}
          </button>
        )
      })}
    </>
  )
}
