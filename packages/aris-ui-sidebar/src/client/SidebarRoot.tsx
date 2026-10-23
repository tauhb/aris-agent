/**
 * Thanh bên aris theo canvas "Thanh bên dùng chung": logo, Việc mới, các trang
 * (Chat + trang do plugin đăng ký), Đội hình, Dự án, ô chờ duyệt và chủ nhân.
 * Ghép từ bộ thành phần `@aris/ui-kit/react`; giữ nguyên các chỗ cắm của dsh nên
 * plugin khác vẫn cắm vào được.
 */
import { ShortcutKeys, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  BotRow,
  BrandMark,
  Button,
  GearIcon,
  GroupLabel,
  IconButton,
  NavItem,
  PanelIcon,
  PlusIcon,
  ProjectIcon,
  SearchIcon,
  SectionHeader,
  WaitingIcon,
  arisNavigate,
  onArisRoute,
  type NavRequest,
} from '@aris/ui-kit/react'
import {
  COMMANDER,
  DEMO_PENDING_APPROVALS,
  DEMO_TEAM,
  isProjectWorkspace,
  type TeamMember,
} from '@aris/ui-kit'
import { useEffect, useState, type ReactElement } from 'react'
import { useTodayCost } from './cost.js'
import { latestProjectSession } from './projects.js'
import type { Translate } from './locale.js'
import type { PanelEntry, SidebarProps, WorkspaceRow } from './types.js'

/** Trang do dsh đăng ký nhưng aris không đặt trên thanh bên: Plugin mở từ Cài đặt (6.7). */
const SETTINGS_PANELS = new Set(['plugins'])
/** Trang của dsh mà aris thay bằng trang riêng: lịch dsh mở từ nút "Lịch đang chạy" trong trang Routine. */
const HIDDEN_PANELS = new Set(['schedules'])
/** Trang của dsh mà aris đặt tên khác ("Automation tasks" thành Routine). */
const PANEL_LABELS = {
  'aris-map': 'panel.map',
  'aris-brain': 'panel.brain',
  'aris-routine': 'panel.schedules',
  'aris-kanban': 'panel.kanban',
} as const

/** Trang con sáng mục cha trên thanh bên (Tạo routine thuộc Routine). */
const PARENT_PANEL: Record<string, string> = { 'aris-routine-new': 'aris-routine' }

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

function PanelNav({ panel, wide, props }: { panel: PanelEntry; wide: boolean; props: SidebarProps }) {
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
        onClick={() => props.selectPanel(panel.id)}
      />
    </Tip>
  )
}

function Bot({
  member,
  lead,
  groupLead,
  current,
  wide,
  t,
  onOpen,
}: {
  member: TeamMember
  lead?: boolean
  /** Trưởng nhóm của phòng ban. */
  groupLead?: boolean
  /** Bot đang được xem ở vùng chính. */
  current?: boolean
  wide: boolean
  t: Translate
  onOpen: () => void
}) {
  const tip = groupLead
    ? `${member.name} · ${t('team.groupLead')} · ${member.note}`
    : `${member.name} · ${member.note}`
  return (
    <Tip label={tip} wide={wide}>
      <BotRow
        mascot={member.id}
        name={member.name}
        note={member.note}
        status={member.status}
        statusLabel={t(`status.${member.status}`)}
        lead={lead}
        badge={groupLead ? t('team.groupLead') : undefined}
        current={current}
        collapsed={!wide}
        onClick={onOpen}
      />
    </Tip>
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
  // Bot đang được xem (hồ sơ, ký ức, hồ sơ chủ nhân) sáng trên Đội hình, như canvas.
  const [route, setRoute] = useState<NavRequest | null>(null)
  useEffect(() => onArisRoute(setRoute), [])
  const activePanel = props.usePanelInfo((info) => info.activePanelId)
  const botKey = activePanel ? BOT_PAGES[activePanel] : undefined
  const viewedBot = botKey ? (route?.params?.[botKey] ?? 'aris') : undefined
  const waiting = t('approvals.waiting', { count: DEMO_PENDING_APPROVALS })
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
          <PanelNav key={panel.id} panel={panel} wide={wide} props={props} />
        ))}
      </div>

      <div className="middle">
        <div className="team">
          {wide && (
            <SectionHeader
              title={t('team.title')}
              action={
                <IconButton label={t('team.add')} size="sm" onClick={() => arisNavigate('create-bot')}>
                  <PlusIcon size={15} width={2} />
                </IconButton>
              }
            />
          )}
          <Bot
            member={COMMANDER}
            lead
            current={viewedBot === COMMANDER.id}
            wide={wide}
            t={t}
            onOpen={openChat}
          />
          {DEMO_TEAM.map((group) => (
            <div key={group.id} style={{ display: 'contents' }}>
              {wide && (
                <GroupLabel>
                  <button
                    type="button"
                    className="grp"
                    title={t('team.openGroup', { name: group.label })}
                    onClick={() => arisNavigate('department', { id: group.id })}
                  >
                    {group.label}
                  </button>
                </GroupLabel>
              )}
              {group.members.map((m) => (
                <Bot
                  key={m.id}
                  member={m}
                  groupLead={m.id === group.lead}
                  current={viewedBot === m.id}
                  wide={wide}
                  t={t}
                  onOpen={openChat}
                />
              ))}
            </div>
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
        {DEMO_PENDING_APPROVALS > 0 && (
          <Tip label={waiting} wide={wide}>
            <NavItem
              label={waiting}
              variant="warn"
              icon={<WaitingIcon />}
              collapsed={!wide}
              onClick={() => arisNavigate('approvals')}
            />
          </Tip>
        )}
        {wide && (
          <div className="owner">
            <span className="avatar" aria-hidden="true">
              C
            </span>
            <span className="ownerText">
              <span className="ownerName">{t('owner.name')}</span>
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
        {/* Vỏ cài đặt của dsh: không còn nút mở (xem settings.launcher ở index.tsx), chỉ còn
            báo mất kết nối, hộp thoại cài đặt (phím tắt) và các bước làm quen. */}
        <div className="seat">{renderSlot('sidebar.settings', { wide })}</div>
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
