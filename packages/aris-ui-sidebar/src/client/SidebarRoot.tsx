/**
 * Thanh bên aris theo bản vẽ `SidebarMoi`: logo, Việc mới, bốn trang (Văn phòng, Second Brain, Routine,
 * Tự học), Đội hình theo trạng thái (Aris, "Cần chú ý", dải "Rảnh"), Dự án, ô chờ duyệt và chủ nhân.
 * Ghép từ bộ thành phần `@aris/ui-kit/react`; giữ nguyên các chỗ cắm của dsh nên
 * plugin khác vẫn cắm vào được.
 */
import { ShortcutKeys, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  BotRow,
  BrandMark,
  Button,
  Dialog,
  GearIcon,
  GroupLabel,
  IconButton,
  Mascot,
  Menu,
  MenuItem,
  NavItem,
  PanelIcon,
  PlusIcon,
  ProjectIcon,
  SearchIcon,
  SectionHeader,
  WaitingIcon,
  arisNavigate,
  onArisRoute,
  latestCommanderSession,
  openBotSession,
  teamAction,
  useDismiss,
  useInboxCount,
  usePendingApprovals,
  useTeam,
  useTeamLive,
  type NavRequest,
  type TemplateData,
} from '@aris/ui-kit/react'
import { isProjectWorkspace, type TeamMember } from '@aris/ui-kit'
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { useTodayCost } from './cost.js'
import { latestProjectSession, recentSessions } from './projects.js'
import { countWorking, splitRoster, workLine, type AttentionRow } from './roster.js'
import type { Translate } from './locale.js'
import type { PanelEntry, SidebarProps, WorkspaceRow } from './types.js'

/** Trang do dsh đăng ký nhưng aris không đặt trên thanh bên: Plugin mở từ Cài đặt (6.7). */
const SETTINGS_PANELS = new Set(['plugins'])
/** Trang của dsh mà aris thay bằng trang riêng: lịch dsh mở từ nút "Lịch đang chạy" trong trang Routine. */
const HIDDEN_PANELS = new Set(['schedules'])
/** Trang của dsh mà aris đặt tên khác ("Automation tasks" thành Routine). */
const PANEL_LABELS = {
  'aris-office': 'panel.office',
  'aris-brain': 'panel.brain',
  'aris-routine': 'panel.schedules',
  'aris-learn': 'panel.learn',
} as const

/**
 * Trang con sáng mục cha trên thanh bên: Tạo routine thuộc Routine; Hộp duyệt, Ký ức, Thư viện skill thuộc
 * Tự học; Phòng ban thuộc Văn phòng.
 */
const PARENT_PANEL: Record<string, string> = {
  'aris-routine-new': 'aris-routine',
  'aris-approvals': 'aris-learn',
  'aris-memory': 'aris-learn',
  'aris-skills': 'aris-learn',
  'aris-skill': 'aris-learn',
  'aris-department': 'aris-office',
}

/** Trang aris xem một bot cụ thể, và tham số chứa mã bot (mặc định Aris). */
const BOT_PAGES: Record<string, string> = { 'aris-bot': 'id', 'aris-memory': 'bot', 'aris-owner': 'bot' }

/** Trong thanh thu gọn, nhãn chuyển thành tooltip. */
function Tip({ label, wide, children }: { label: string; wide: boolean; children: ReactElement }) {
  return (
    <Tooltip label={label} side="right" delayMs={400} disabled={wide}>
      {children}
    </Tooltip>
  )
}

function PanelNav({
  panel,
  wide,
  props,
  meta,
}: {
  panel: PanelEntry
  wide: boolean
  props: SidebarProps
  /** Nhãn nhỏ bên phải: "N đang làm" ở Văn phòng, số việc chờ duyệt ở Tự học. */
  meta?: ReactNode
}) {
  const active = props.usePanelInfo((info) => {
    const id = info.activePanelId
    return (id !== null && PARENT_PANEL[id] !== undefined ? PARENT_PANEL[id] : id) === panel.id
  })
  const label =
    panel.id in PANEL_LABELS ? props.t(PANEL_LABELS[panel.id as keyof typeof PANEL_LABELS]) : panel.label
  return (
    <Tip label={label} wide={wide}>
      <NavItem
        label={label}
        active={active}
        collapsed={!wide}
        icon={props.renderSlot('sidebar.panellist', { size: 18, active }, { only: panel.id })}
        meta={meta}
        onClick={() => props.selectPanel(panel.id)}
      />
    </Tip>
  )
}

function Bot({
  member,
  lead,
  current,
  wide,
  t,
  onOpen,
  line,
}: {
  member: TeamMember
  lead?: boolean
  /** Dòng việc đang làm thay cho ghi chú (Aris lúc đang chạy). */
  line?: string | undefined
  /** Bot đang được xem ở vùng chính. */
  current?: boolean
  wide: boolean
  t: Translate
  onOpen: () => void
}) {
  return (
    <Tip label={`${member.name} · ${member.note}`} wide={wide}>
      <BotRow
        mascot={member.mascot ?? member.id}
        name={member.name}
        note={line || member.note}
        status={member.status}
        statusLabel={t(`status.${member.status}`)}
        lead={lead}
        current={current}
        collapsed={!wide}
        onClick={onOpen}
      />
    </Tip>
  )
}

/**
 * Một bot đang làm hay đang đợi: linh vật, tên, "· phòng ban" và một dòng việc. Màu xanh khi đang làm, cam
 * khi đợi người dùng duyệt. Bấm tên phòng ban thì mở trang phòng ban, bấm phần còn lại thì mở chat; hai
 * nút là anh em (không lồng nhau), nút mở chat phủ cả dòng bên dưới.
 */
function AttentionBot({
  row,
  line,
  current,
  t,
  onOpen,
}: {
  row: AttentionRow
  line: string
  current: boolean
  t: Translate
  onOpen: () => void
}) {
  const { member, department, state } = row
  const note = state === 'waiting' ? [t('team.waiting'), line].filter(Boolean).join(' · ') : line
  return (
    <div className={`as-att ${state}`}>
      <button
        type="button"
        className="as-att-hit"
        aria-label={`${member.name}${department ? ` · ${department.label}` : ''}${note ? ` · ${note}` : ''}`}
        aria-current={current ? 'page' : undefined}
        onClick={onOpen}
      />
      <span className="as-mv">
        <Mascot id={member.mascot ?? member.id} size={28} motion={member.status} seed={member.name} />
      </span>
      <span className="txt">
        <span className="nm">
          {member.name}
          {department && (
            <button
              type="button"
              className="as-dept"
              title={t('team.openGroup', { name: department.label })}
              onClick={() => arisNavigate('department', { id: department.id })}
            >
              · {department.label}
            </button>
          )}
        </span>
        {note && <span className="note">{note}</span>}
      </span>
    </div>
  )
}

/** Dải linh vật của các bot đang rảnh (hay vừa xong, vừa vấp): rê chuột ra tên, bấm để mở chat. */
function RestStrip({
  members,
  t,
  onOpen,
  onAll,
}: {
  members: readonly TeamMember[]
  t: Translate
  onOpen: (id: string) => void
  onAll: () => void
}) {
  return (
    <div className="as-rest">
      <div className="as-rest-head">
        <span>{t('team.rest', { n: members.length })}</span>
        <button type="button" className="as-all" onClick={onAll}>
          {t('team.seeAll')}
        </button>
      </div>
      {members.length > 0 && (
        <div className="as-rest-row">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="as-m"
              title={`${m.name} · ${t(`status.${m.status}`)}`}
              aria-label={`${m.name} · ${t(`status.${m.status}`)}`}
              onClick={() => onOpen(m.id)}
            >
              <Mascot id={m.mascot ?? m.id} size={30} motion={m.status} seed={m.name} />
              <span className={`as-dot ${m.status}`} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Nút "+" cạnh Đội hình: bot mới hay phòng ban mới. */
function AddMenu({ t }: { t: Translate }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  useDismiss(root, open, () => setOpen(false))
  return (
    <span className="a-pop" ref={root}>
      <IconButton
        label={t('team.add')}
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <PlusIcon size={15} width={2} />
      </IconButton>
      {open && (
        <Menu label={t('team.add')} align="end" width={200}>
          <MenuItem
            onSelect={() => {
              setOpen(false)
              arisNavigate('create-bot')
            }}
          >
            {t('team.newBot')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              setOpen(false)
              // Dấu thời gian để mở lại hộp tạo được dù lần trước chưa tạo xong.
              arisNavigate('department', { new: String(Date.now()) })
            }}
          >
            {t('team.newDept')}
          </MenuItem>
        </Menu>
      )}
    </span>
  )
}

/** Đội mới chỉ có Commander: mời chọn một đội mẫu (đi kèm aris) hoặc tự tạo bot. */
function PickTemplate({ t, templates }: { t: Translate; templates: readonly TemplateData[] }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const use = async (id: string) => {
    setBusy(id)
    setError(null)
    try {
      await teamAction({ op: 'apply-template', template: id })
      setOpen(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="pick">
      <span>{t('team.empty')}</span>
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        {t('team.pickTemplate')}
      </Button>
      <Dialog
        open={open}
        title={t('team.templateTitle')}
        description={t('team.templateHint')}
        onClose={() => setOpen(false)}
        closeLabel={t('team.close')}
        width={520}
        footer={
          <Button variant="ghost" onClick={() => (setOpen(false), arisNavigate('create-bot'))}>
            {t('team.createOwn')}
          </Button>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map((tpl) => (
            <div key={tpl.id} className="tpl">
              <div style={{ minWidth: 0 }}>
                <b>{tpl.name}</b>
                <div className="a-muted">{tpl.description}</div>
              </div>
              <Button size="sm" disabled={busy !== null} onClick={() => void use(tpl.id)}>
                {busy === tpl.id ? t('team.applying') : t('team.templateUse', { n: tpl.bots })}
              </Button>
            </div>
          ))}
          {error && <div style={{ color: 'var(--a-danger)' }}>{error}</div>}
        </div>
      </Dialog>
    </div>
  )
}

/** Một dự án = một workspace của dsh: tên, số phiên; bấm để mở dự án. */
function Project({
  project,
  wide,
  t,
  onOpen,
}: {
  project: WorkspaceRow
  wide: boolean
  t: Translate
  onOpen: () => void
}) {
  const count = project.sessionIds.length
  return (
    <Tip label={`${project.title} · ${project.path}`} wide={wide}>
      <NavItem
        label={t('project.label', { name: project.title })}
        title={project.path}
        icon={<ProjectIcon />}
        collapsed={!wide}
        meta={count > 0 ? t('project.sessions', { count }) : undefined}
        onClick={onOpen}
      >
        {project.title}
      </NavItem>
    </Tip>
  )
}

export function SidebarRoot(props: SidebarProps) {
  const { collapsed, width, startSession, toggleSidebar, selectPanel, renderSlot, t } = props
  const wide = !collapsed
  const panels = props.usePanels((p) => p)
  const navPanels = panels.filter((p) => !SETTINGS_PANELS.has(p.id) && !HIDDEN_PANELS.has(p.id))
  // Workspace mặc định là chỗ chat riêng với Aris (quyết định 11), không phải dự án.
  const projects = props.useWorkspaces((w) => w.items).filter(isProjectWorkspace)
  const sessionsById = props.useSessions((list) => list.byId)
  // Bấm dự án: mở phiên gần nhất của dự án; dự án chưa có phiên thì dsh tạo phiên mới.
  const openProject = (project: WorkspaceRow) => {
    const latest = latestProjectSession(project.sessionIds, sessionsById)
    if (latest) props.openSession(latest)
    else props.openProject(project.workspaceId)
  }
  const newShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'session.new'))
  const toggleShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'sidebar.left.toggle'))
  const openChat = () => selectPanel(null)
  const homes = props.useWorkspaces((w) => w.items).filter((w) => !isProjectWorkspace(w))
  // Bấm Aris: mở lại phiên gần nhất của Aris (phiên chat riêng chưa gắn bot nào); chưa có thì phiên mới.
  const chatWithAris = () =>
    void latestCommanderSession(
      recentSessions(
        homes.flatMap((w) => w.sessionIds),
        sessionsById,
      ),
    ).then((id) => (id ? props.openSession(id) : props.startSession(homes[0]?.workspaceId)), openChat)
  const team = useTeam(t('team.noDepartment'))
  const live = useTeamLive()
  const roster = splitRoster(team.groups)
  const working = countWorking(team.groups) + (team.commander.status === 'working' ? 1 : 0)
  // Bấm bot: mở lại phiên chat gần nhất với bot đó (chưa có thì tạo).
  // Bot ngoài không có phiên chat riêng: mở hồ sơ.
  const chatWith = (id: string) => () =>
    team.bots.find((b) => b.id === id)?.external
      ? arisNavigate('bot', { id })
      : void openBotSession(id).then(
          (sessionId) => props.openSession(sessionId),
          () => {},
        )
  // Bot đang được xem (hồ sơ, ký ức, hồ sơ chủ nhân) sáng trên Đội hình, như canvas.
  const [route, setRoute] = useState<NavRequest | null>(null)
  useEffect(() => onArisRoute(setRoute), [])
  const activePanel = props.usePanelInfo((info) => info.activePanelId)
  const botKey = activePanel ? BOT_PAGES[activePanel] : undefined
  const viewedBot = botKey ? (route?.params?.[botKey] ?? 'aris') : undefined
  // Yêu cầu quyền của bot đang chờ (duyệt tập trung): bấm thì mở phiên có thanh duyệt của yêu cầu đầu.
  const [pending] = usePendingApprovals('all')
  const waiting = t('approvals.waiting', { count: pending.length })
  // Mục Tự học đếm mọi thứ chờ duyệt trong Hộp duyệt (yêu cầu quyền, ký ức, skill, soát bộ não), không chỉ yêu cầu quyền.
  const inbox = useInboxCount()
  const toggleLabel = t(wide ? 'toggle.collapse' : 'toggle.open')
  const money = (n: number) =>
    n.toLocaleString(t('number.locale'), {
      minimumFractionDigits: 2,
      maximumFractionDigits: n < 0.01 && n > 0 ? 4 : 2,
    })
  const spent = useTodayCost()

  return (
    <nav
      className={wide ? 'aris aris-sb' : 'aris aris-sb rail'}
      aria-label={t('nav.label')}
      style={wide ? { width } : undefined}
    >
      <div className="brand">
        <BrandMark size={28} />
        {wide && <span className="brandName">aris</span>}
        {wide && (
          <IconButton
            label={t('search')}
            style={{ marginLeft: 'auto' }}
            onClick={() => arisNavigate('search')}
          >
            <SearchIcon />
          </IconButton>
        )}
        <Tooltip label={toggleLabel} shortcutKeys={toggleShortcut?.keys} side="right" delayMs={400}>
          <IconButton label={toggleLabel} aria-keyshortcuts={toggleShortcut?.aria} onClick={toggleSidebar}>
            <PanelIcon />
          </IconButton>
        </Tooltip>
      </div>

      <Tip label={t('session.new')} wide={wide}>
        <Button
          variant="primary"
          size="lg"
          block={wide}
          className="newTask"
          icon={<PlusIcon size={16} />}
          aria-label={t('session.new')}
          aria-keyshortcuts={newShortcut?.aria}
          onClick={() => startSession()}
        >
          {wide && t('session.new')}
          {wide && newShortcut && newShortcut.keys.length > 0 && (
            <span className="a-kbd" aria-hidden="true">
              <ShortcutKeys keys={newShortcut.keys} />
            </span>
          )}
        </Button>
      </Tip>

      <div className="nav" role="list" aria-label={t('panels.label')}>
        {navPanels.map((panel) => (
          <PanelNav
            key={panel.id}
            panel={panel}
            wide={wide}
            props={props}
            meta={
              panel.id === 'aris-office' && working > 0 ? (
                <span className="as-working">{t('office.working', { n: working })}</span>
              ) : panel.id === 'aris-learn' && inbox > 0 ? (
                <span className="as-count">{inbox}</span>
              ) : undefined
            }
          />
        ))}
      </div>

      <div className="middle">
        <div className="team">
          {wide && <SectionHeader title={t('team.title')} action={<AddMenu t={t} />} />}
          <Bot
            member={team.commander}
            line={
              team.commander.status === 'working'
                ? workLine(live?.status[team.commander.id], live?.titles)
                : undefined
            }
            lead
            current={viewedBot === team.commander.id}
            wide={wide}
            t={t}
            onOpen={chatWithAris}
          />
          {wide && team.ready && team.members.length === 0 && (
            <PickTemplate t={t} templates={team.templates} />
          )}
          {wide && team.members.length > 0 && (
            <>
              {roster.attention.length > 0 && (
                <>
                  <GroupLabel>{t('team.attention', { n: roster.attention.length })}</GroupLabel>
                  {roster.attention.map((row) => (
                    <AttentionBot
                      key={row.member.id}
                      row={row}
                      line={workLine(live?.status[row.member.id], live?.titles)}
                      current={viewedBot === row.member.id}
                      t={t}
                      onOpen={chatWith(row.member.id)}
                    />
                  ))}
                </>
              )}
              <RestStrip
                members={roster.rest}
                t={t}
                onOpen={(id) => chatWith(id)()}
                onAll={() => arisNavigate('office')}
              />
            </>
          )}
          {/* Thanh thu gọn: chỉ còn linh vật, theo thứ tự phòng ban. */}
          {!wide &&
            team.members.map((m) => (
              <Bot
                key={m.id}
                member={m}
                current={viewedBot === m.id}
                wide={wide}
                t={t}
                onOpen={chatWith(m.id)}
              />
            ))}
        </div>

        <div className="projects">
          {wide && (
            <SectionHeader
              title={t('projects.title')}
              action={
                <IconButton
                  label={t('projects.add')}
                  size="sm"
                  onClick={() => arisNavigate('create-project')}
                >
                  <PlusIcon size={15} width={2} />
                </IconButton>
              }
            />
          )}
          {projects.map((project) => (
            <Project
              key={project.workspaceId}
              project={project}
              wide={wide}
              t={t}
              onOpen={() => openProject(project)}
            />
          ))}
        </div>
      </div>

      <div className="foot">
        {pending.length > 0 && (
          <Tip label={waiting} wide={wide}>
            <NavItem
              label={waiting}
              variant="warn"
              icon={<WaitingIcon />}
              collapsed={!wide}
              onClick={() =>
                pending[0]?.parentSession
                  ? props.openSession(pending[0].parentSession)
                  : arisNavigate('approvals')
              }
            />
          </Tip>
        )}
        {wide && (
          <div className="owner">
            <span className="avatar" aria-hidden="true">
              {(team.owner.name || t('owner.name')).charAt(0).toLocaleUpperCase()}
            </span>
            <span className="ownerText">
              <span className="ownerName">{team.owner.name || t('owner.name')}</span>
              {spent !== undefined && (
                <span className="ownerCost a-num">{t('owner.cost', { spent: money(spent) })}</span>
              )}
            </span>
            <IconButton label={t('settings')} size="sm" onClick={() => arisNavigate('settings')}>
              <GearIcon size={17} />
            </IconButton>
          </div>
        )}
        <div className="seat">{renderSlot('sidebar.footer.action', { wide })}</div>
      </div>
    </nav>
  )
}

/** Hai nút sát đèn giao thông của macOS khi thanh bên ẩn hẳn (chỗ cắm `shell.leading`). */
export function LeadingControls({
  toggleSidebar,
  startSession,
  t,
}: Pick<SidebarProps, 'toggleSidebar' | 'startSession' | 't'>) {
  return (
    <div className="aris aris-lead">
      <IconButton label={t('toggle.open')} onClick={toggleSidebar}>
        <PanelIcon />
      </IconButton>
      <IconButton label={t('session.new')} onClick={() => startSession()}>
        <PlusIcon size={16} />
      </IconButton>
    </div>
  )
}
