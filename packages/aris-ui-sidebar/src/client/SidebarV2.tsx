/**
 * Thanh bên của giao diện mới GĐ9 (bản vẽ V1): danh bạ bot, Aris ghim đầu rồi các phòng ban (gập mở được),
 * mỗi dòng có linh vật màu, tên, dòng việc gần nhất và chấm trạng thái. Hàng trên có tìm, chuông Hoạt động và
 * dấu cộng; đáy có ảnh đại diện (menu các trang: Bộ não, Tự học, Văn phòng, Routine, Thống kê, Dự án, Cài đặt)
 * và nút "Kết nối ứng dụng". Bấm một bot là mở chat với bot đó. Các trang cũ vẫn mở được từ menu.
 */
import {
  BellIcon,
  ChevronDownIcon,
  Mascot,
  PlusIcon,
  SearchIcon,
  arisNavigate,
  latestCommanderSession,
  openActivity,
  openBotSession,
  rosterV2,
  useDismiss,
  useInboxCount,
  usePendingApprovals,
  useSessionBot,
  useTeam,
  useTeamLive,
  type RosterGroup,
  type RosterRow,
  type RosterV2,
} from '@aris/ui-kit/react'
import { isProjectWorkspace } from '@aris/ui-kit'
import { useRef, useState, type ReactNode } from 'react'
import { useTodayCost } from './cost.js'
import type { Translate } from './locale.js'
import { latestProjectSession, recentSessions } from './projects.js'
import type { SidebarProps, WorkspaceRow } from './types.js'

/** Khoá lưu các phòng đang gập trên trình duyệt. */
const COLLAPSED_KEY = 'aris.ui.v2.collapsed'

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveCollapsed(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]))
  } catch {
    // Kho của trình duyệt bị chặn: gập mở chỉ giữ trong phiên.
  }
}

/** Một dòng bot: linh vật, tên, dòng việc (màu theo chấm) và chấm trạng thái. */
export function BotRowV2({
  row,
  t,
  current,
  onOpen,
}: {
  row: RosterRow
  t: Translate
  current: boolean
  onOpen: () => void
}) {
  const line = row.dot === 'need' ? t('v2.needs', { n: row.needs }) : row.line
  return (
    <button
      type="button"
      className="g9-row"
      aria-current={current ? 'true' : undefined}
      aria-label={line ? `${row.name} · ${line}` : row.name}
      onClick={onOpen}
    >
      <Mascot id={row.mascot} size={40} accessory={row.accessory} seed={row.name} />
      <span className="tb">
        <span className="nm">{row.name}</span>
        {line && <span className={row.dot ? `l ${row.dot}` : 'l'}>{line}</span>}
      </span>
      {row.dot && <span className={`g9-dot ${row.dot}`} aria-hidden="true" />}
    </button>
  )
}

/** Danh bạ: Aris ghim đầu, rồi từng phòng (gập mở được). Phần thuần, không đọc dữ liệu. */
export function RosterListV2({
  roster,
  t,
  current,
  collapsed,
  onToggle,
  onOpen,
}: {
  roster: RosterV2
  t: Translate
  current: string | undefined
  collapsed: ReadonlySet<string>
  onToggle: (group: RosterGroup) => void
  onOpen: (id: string) => void
}) {
  return (
    <div className="g9-scroll" role="list" aria-label={t('team.title')}>
      <BotRowV2
        row={roster.pinned}
        t={t}
        current={current === roster.pinned.id}
        onOpen={() => onOpen(roster.pinned.id)}
      />
      {roster.groups.map((g) => {
        const open = !collapsed.has(g.id)
        return (
          <div key={g.id || '_'} role="group" aria-label={g.label}>
            <button type="button" className="g9-grp" aria-expanded={open} onClick={() => onToggle(g)}>
              <span>{g.label}</span>
              <ChevronDownIcon size={10} />
            </button>
            {open &&
              g.rows.map((r) => (
                <BotRowV2 key={r.id} row={r} t={t} current={current === r.id} onOpen={() => onOpen(r.id)} />
              ))}
          </div>
        )
      })}
    </div>
  )
}

/** Nút mở menu nổi kèm menu; bấm ra ngoài hay chọn mục thì đóng. */
function Popover({
  label,
  className,
  dir,
  button,
  children,
}: {
  label: string
  className: string
  dir: 'up' | 'down'
  button: ReactNode
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  useDismiss(root, open, () => setOpen(false))
  return (
    <span className="g9-pop" ref={root}>
      <button
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {button}
      </button>
      {open && (
        <div className={`g9-menu ${dir}`} role="menu" aria-label={label}>
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  )
}

function MenuRow({
  children,
  meta,
  onSelect,
}: {
  children: ReactNode
  meta?: ReactNode
  onSelect: () => void
}) {
  return (
    <button type="button" role="menuitem" className="g9-mi" onClick={onSelect}>
      <span>{children}</span>
      {meta !== undefined && <span className="v">{meta}</span>}
    </button>
  )
}

/** Chữ cái của kết nối ứng dụng hiện ở nút "Kết nối ứng dụng". */
const appLetters = (names: readonly string[]) =>
  [...new Set(names.map((n) => n.trim().charAt(0).toLocaleUpperCase()).filter(Boolean))].slice(0, 3)

export function SidebarV2(props: SidebarProps) {
  const { t } = props
  const team = useTeam(t('team.noDepartment'))
  const live = useTeamLive()
  const [pending] = usePendingApprovals('all')
  const roster = rosterV2(team, live, pending)
  const inbox = useInboxCount()
  const spent = useTodayCost()
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const toggle = (g: RosterGroup) => {
    const next = new Set(collapsed)
    if (next.has(g.id)) next.delete(g.id)
    else next.add(g.id)
    setCollapsed(next)
    saveCollapsed(next)
  }

  // Bot của phiên đang mở ở vùng chính (trang khác đang mở thì không bot nào sáng).
  const mounted = props.useMounted((id) => id)
  const panel = props.usePanelInfo((info) => info.activePanelId)
  const sessionBot = useSessionBot(mounted)
  const current = panel === null && mounted ? (sessionBot?.id ?? team.commander.id) : undefined

  const sessionsById = props.useSessions((list) => list.byId)
  const workspaces = props.useWorkspaces((w) => w.items)
  const homes = workspaces.filter((w) => !isProjectWorkspace(w))
  const projects = workspaces.filter(isProjectWorkspace)
  const chatWithAris = () =>
    void latestCommanderSession(
      recentSessions(
        homes.flatMap((w) => w.sessionIds),
        sessionsById,
      ),
    ).then(
      (id) => (id ? props.openSession(id) : props.startSession(homes[0]?.workspaceId)),
      () => props.selectPanel(null),
    )
  const open = (id: string) => {
    if (id === team.commander.id) return chatWithAris()
    if (team.bots.find((b) => b.id === id)?.external) return arisNavigate('bot', { id })
    void openBotSession(id).then(
      (sessionId) => props.openSession(sessionId),
      () => {},
    )
  }
  const openProject = (project: WorkspaceRow) => {
    const latest = latestProjectSession(project.sessionIds, sessionsById)
    if (latest) props.openSession(latest)
    else props.openProject(project.workspaceId)
  }

  const owner = team.owner.name || t('owner.name')
  const money = (n: number) =>
    n.toLocaleString(t('number.locale'), {
      minimumFractionDigits: 2,
      maximumFractionDigits: n < 0.01 && n > 0 ? 4 : 2,
    })
  const letters = appLetters(team.mcp.filter((m) => m.enabled).map((m) => m.name))

  return (
    <nav className="aris g9-sb" aria-label={t('nav.label')}>
      <div className="g9-top">
        <span className="sp" />
        <button
          type="button"
          className="g9-ib"
          aria-label={t('search')}
          title={t('search')}
          onClick={() => arisNavigate('search')}
        >
          <SearchIcon size={18} />
        </button>
        <button
          type="button"
          className="g9-ib"
          aria-label={t('v2.activity', { n: pending.length })}
          title={t('v2.activityTitle')}
          onClick={openActivity}
        >
          <BellIcon size={18} />
          {pending.length > 0 && <span className="g9-n">{pending.length}</span>}
        </button>
        <Popover label={t('team.add')} className="g9-ib" dir="down" button={<PlusIcon size={17} width={2} />}>
          {(close) => (
            <>
              <MenuRow onSelect={() => (close(), chatWithAris())}>{t('v2.newChat')}</MenuRow>
              <MenuRow onSelect={() => (close(), arisNavigate('create-bot'))}>{t('team.newBot')}</MenuRow>
              <MenuRow onSelect={() => (close(), arisNavigate('department', { new: String(Date.now()) }))}>
                {t('team.newDept')}
              </MenuRow>
            </>
          )}
        </Popover>
      </div>

      <RosterListV2
        roster={roster}
        t={t}
        current={current}
        collapsed={collapsed}
        onToggle={toggle}
        onOpen={open}
      />

      <div className="g9-foot">
        <Popover
          label={t('v2.account', { name: owner })}
          className="g9-av"
          dir="up"
          button={owner.charAt(0).toLocaleUpperCase()}
        >
          {(close) => {
            const go = (fn: () => void) => () => (close(), fn())
            return (
              <>
                <div className="g9-mh">
                  <b>{owner}</b>
                  {spent !== undefined && <span>{t('owner.cost', { spent: money(spent) })}</span>}
                </div>
                <div className="g9-sep" />
                <MenuRow onSelect={go(() => arisNavigate('brain', { view: 'graph' }))}>
                  {t('panel.brain')}
                </MenuRow>
                <MenuRow meta={inbox > 0 ? inbox : undefined} onSelect={go(() => arisNavigate('learn'))}>
                  {t('panel.learn')}
                </MenuRow>
                <MenuRow onSelect={go(() => arisNavigate('office'))}>{t('panel.office')}</MenuRow>
                <MenuRow onSelect={go(() => arisNavigate('routine'))}>{t('panel.schedules')}</MenuRow>
                <MenuRow onSelect={go(() => arisNavigate('settings', { section: 'stats' }))}>
                  {t('v2.stats')}
                </MenuRow>
                <div className="g9-sep" />
                {projects.slice(0, 6).map((p) => (
                  <MenuRow key={p.workspaceId} onSelect={go(() => openProject(p))}>
                    {t('project.label', { name: p.title })}
                  </MenuRow>
                ))}
                <MenuRow onSelect={go(() => arisNavigate('create-project'))}>{t('projects.add')}</MenuRow>
                <div className="g9-sep" />
                <MenuRow onSelect={go(() => arisNavigate('settings'))}>{t('settings')}</MenuRow>
              </>
            )
          }}
        </Popover>
        <button
          type="button"
          className="g9-apps"
          onClick={() => arisNavigate('settings', { section: 'connections' })}
        >
          <span>{t('v2.apps')}</span>
          {letters.length > 0 && (
            <span className="g9-lgs" aria-hidden="true">
              {letters.map((l) => (
                <span key={l} className="g9-lg">
                  {l}
                </span>
              ))}
            </span>
          )}
        </button>
      </div>
      <div className="seat">{props.renderSlot('sidebar.footer.action', { wide: true })}</div>
    </nav>
  )
}
