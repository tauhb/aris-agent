/**
 * Thanh bên aris theo canvas "Thanh bên dùng chung": logo, Việc mới, các trang
 * (Chat + trang do plugin đăng ký), Đội hình, vùng phiên của dsh, ô chờ duyệt và
 * chủ nhân. Giữ nguyên các chỗ cắm của dsh nên plugin khác vẫn cắm vào được.
 */
import { ShortcutKeys, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import { BrandMark, ChatIcon, Mascot, PanelIcon, PlusIcon, StatusGlyph, WaitingIcon } from './icons.js'
import { COMMANDER, DEMO_PENDING_APPROVALS, DEMO_TEAM, type TeamMember } from './team.js'
import type { PanelEntry, SidebarProps } from './types.js'

/** Trong thanh thu gọn, nhãn chuyển thành tooltip. */
function Tip({ label, wide, children }: { label: string; wide: boolean; children: React.ReactElement }) {
  return (
    <Tooltip label={label} side="right" delayMs={400} disabled={wide}>
      {children}
    </Tooltip>
  )
}

function NavRow({
  label,
  wide,
  active,
  glyph,
  onClick,
}: {
  label: string
  wide: boolean
  active: boolean
  glyph: ReactNode
  onClick: () => void
}) {
  return (
    <Tip label={label} wide={wide}>
      <button
        type="button"
        className="navRow"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        <span className="glyph" aria-hidden="true">
          {glyph}
        </span>
        {wide && <span className="label">{label}</span>}
      </button>
    </Tip>
  )
}

function PanelNav({ panel, wide, props }: { panel: PanelEntry; wide: boolean; props: SidebarProps }) {
  const active = props.usePanelInfo((info) => info.activePanelId === panel.id)
  return (
    <NavRow
      label={panel.label}
      wide={wide}
      active={active}
      glyph={props.renderSlot('sidebar.panellist', { size: 18, active }, { only: panel.id })}
      onClick={() => props.selectPanel(panel.id)}
    />
  )
}

function Bot({
  member,
  lead,
  wide,
  onOpen,
}: {
  member: TeamMember
  lead?: boolean
  wide: boolean
  onOpen: () => void
}) {
  return (
    <Tip label={`${member.name} · ${member.note}`} wide={wide}>
      <button type="button" className={lead ? 'bot lead' : 'bot'} onClick={onOpen}>
        <Mascot id={member.id} size={lead ? 34 : 28} />
        {wide && (
          <>
            <span className="botText">
              <span className="botName">{member.name}</span>
              <span className={member.status === 'waiting' ? 'botNote waiting' : 'botNote'}>
                {member.note}
              </span>
            </span>
            {!lead && <StatusGlyph status={member.status} />}
          </>
        )}
      </button>
    </Tip>
  )
}

export function SidebarRoot(props: SidebarProps) {
  const { collapsed, width, startSession, toggleSidebar, selectPanel, renderSlot } = props
  const wide = !collapsed
  const panels = props.usePanels((p) => p)
  const chatActive = props.usePanelInfo((info) => info.activePanelId === null)
  const newShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'session.new'))
  const toggleShortcut = props.useShortcuts((rows) => rows.find((r) => r.id === 'sidebar.left.toggle'))
  const openChat = () => selectPanel(null)

  return (
    <nav
      className={wide ? 'aris-sb' : 'aris-sb rail'}
      aria-label="Điều hướng aris"
      style={wide ? { width } : undefined}
    >
      <div className="brand">
        <BrandMark size={28} />
        {wide && <span className="brandName">aris</span>}
        <Tooltip
          label={wide ? 'Thu gọn thanh bên' : 'Mở thanh bên'}
          shortcutKeys={toggleShortcut?.keys}
          side="right"
          delayMs={400}
        >
          <button
            type="button"
            className="iconBtn"
            style={wide ? { marginLeft: 'auto' } : undefined}
            aria-label={wide ? 'Thu gọn thanh bên' : 'Mở thanh bên'}
            aria-keyshortcuts={toggleShortcut?.aria}
            onClick={toggleSidebar}
          >
            <PanelIcon />
          </button>
        </Tooltip>
      </div>

      <Tip label="Việc mới" wide={wide}>
        <button
          type="button"
          className="newTask"
          aria-label="Việc mới"
          aria-keyshortcuts={newShortcut?.aria}
          onClick={() => startSession()}
        >
          <PlusIcon size={16} />
          {wide && 'Việc mới'}
          {wide && newShortcut && newShortcut.keys.length > 0 && (
            <span className="kbd" aria-hidden="true">
              <ShortcutKeys keys={newShortcut.keys} />
            </span>
          )}
        </button>
      </Tip>

      <div className="nav" role="list">
        <NavRow
          label="Chat"
          wide={wide}
          active={chatActive}
          glyph={<ChatIcon active={chatActive} />}
          onClick={openChat}
        />
        {panels.map((panel) => (
          <PanelNav key={panel.id} panel={panel} wide={wide} props={props} />
        ))}
      </div>

      <div className="middle">
        <div className="team">
          {wide && (
            <div className="section">
              <span>Đội hình</span>
              <button
                type="button"
                className="iconBtn"
                style={{ width: 26, height: 26, borderRadius: 8 }}
                aria-label="Thêm bot vào đội"
              >
                <PlusIcon size={15} width={2} />
              </button>
            </div>
          )}
          <Bot member={COMMANDER} lead wide={wide} onOpen={openChat} />
          {DEMO_TEAM.map((group) => (
            <div key={group.label} style={{ display: 'contents' }}>
              {wide && <div className="group">{group.label}</div>}
              {group.members.map((m) => (
                <Bot key={m.id} member={m} wide={wide} onOpen={openChat} />
              ))}
            </div>
          ))}
        </div>

        <div className="sessions">
          {renderSlot('sidebar.workspaces', { wide, expandSidebar: () => collapsed && toggleSidebar() })}
        </div>
      </div>

      <div className="foot">
        {DEMO_PENDING_APPROVALS > 0 && (
          <Tip label={`${DEMO_PENDING_APPROVALS} việc đợi anh gật đầu`} wide={wide}>
            <button
              type="button"
              className="approvals"
              aria-label={`${DEMO_PENDING_APPROVALS} việc đợi anh gật đầu`}
            >
              <WaitingIcon />
              {wide && `${DEMO_PENDING_APPROVALS} việc đợi anh gật đầu`}
            </button>
          </Tip>
        )}
        {wide && (
          <div className="owner">
            <span className="avatar" aria-hidden="true">
              C
            </span>
            <span className="ownerText">
              <span className="ownerName">Chủ nhân</span>
              <span className="ownerCost">0,42 / 5 USD hôm nay</span>
            </span>
          </div>
        )}
        <div className="seat">{renderSlot('sidebar.footer.action', { wide })}</div>
        <div className="seat">{renderSlot('sidebar.settings', { wide })}</div>
      </div>
    </nav>
  )
}

/** Hai nút sát đèn giao thông của macOS khi thanh bên ẩn hẳn (chỗ cắm `shell.leading`). */
export function LeadingControls({
  toggleSidebar,
  startSession,
}: Pick<SidebarProps, 'toggleSidebar' | 'startSession'>) {
  return (
    <div
      className="aris-sb"
      style={{
        height: 'auto',
        border: 0,
        padding: 0,
        background: 'transparent',
        flexDirection: 'row',
        gap: 8,
      }}
    >
      <button type="button" className="iconBtn" aria-label="Mở thanh bên" onClick={toggleSidebar}>
        <PanelIcon />
      </button>
      <button type="button" className="iconBtn" aria-label="Việc mới" onClick={() => startSession()}>
        <PlusIcon size={16} />
      </button>
    </div>
  )
}
