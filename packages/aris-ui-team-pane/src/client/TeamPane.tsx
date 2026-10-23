/**
 * "Đội bot lúc này" theo màn R3: sơ đồ đội 3D (Commander giữa, các bot xoay
 * quanh), việc gần đây của đội, rồi các lối mở trang khác của cột phải (Tệp,
 * Terminal…) mà dsh vẫn đăng ký như cũ. Đội, trạng thái trực tiếp và việc gần đây là thật
 * (`@aris/bots`); cột phải của dự án đọc `@aris/projects`.
 */
import { projectOfSession, type BotStatus, type TeamMember, type WorkspaceLike } from '@aris/ui-kit'
import {
  Button,
  CloseIcon,
  IconButton,
  Mascot,
  Menu,
  MenuItem,
  NavItem,
  StatusGlyph,
  TeamOrbit,
  arisNavigate,
  projectAction,
  useDismiss,
  useProjectByPath,
  useTeam,
  useTeamLive,
  type ActivityItem,
} from '@aris/ui-kit/react'
import { useCallback, useRef, useState, type ComponentType, type ReactNode } from 'react'
import type { Translate } from './locale.js'

type Selector<T> = <R>(select: (value: T) => R) => R

/** Một lối mở trên trang bắt đầu của cột phải, như registry của dsh liệt kê. */
export interface GuideEntry {
  readonly providerId: string
  readonly kind: string
  readonly id: string
  readonly title: () => string
  readonly icon?: ComponentType<{ size?: number }>
}

export interface TeamPaneProps {
  t: Translate
  useGuideEntries: Selector<readonly GuideEntry[]>
  useTabInfo: () => { tab: { actions: { openTab(kind: string, options: { replaceTab: boolean }): void } } }
  openMap: () => void
  useWorkspaces: Selector<{ readonly items: readonly WorkspaceLike[] }>
  useMounted: Selector<string | undefined>
}

// Cột phải của dự án còn dùng đội mẫu tới bước 3 (dự án = Team của dsh).
/** Luật mặc định khi dự án chưa có hồ sơ (giống `@aris/projects`). */
const DEFAULT_RULES = { maxRounds: 3, maxMessages: 10, stopCommand: true, arisSummarizes: true }

const KIND_STATUS: Record<ActivityItem['kind'], BotStatus> = {
  assigned: 'working',
  started: 'working',
  done: 'done',
  failed: 'failed',
  waiting: 'waiting',
}

const nameIn = (team: ReturnType<typeof useTeam>, id: string) =>
  [team.commander, ...team.members].find((m) => m.id === id)?.name ?? id

/** Một dòng việc gần đây: "Minh nhận việc: Tóm tắt 3 đối thủ · 14:02". */
function Activity({ t, a, name }: { t: Translate; a: ActivityItem; name: string }) {
  const at = new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const status = KIND_STATUS[a.kind]
  return (
    <div className="act">
      <StatusGlyph status={status} label={t(`status.${status}`)} />
      <span className="txt">
        <b>{name}</b> {t(`act.${a.kind}`)}
        {a.task ? `: ${a.task}` : ''} · <span className="a-muted">{at}</span>
      </span>
    </div>
  )
}

/** Lối mở các trang khác của cột phải (Tệp, Terminal…) như dsh đăng ký. */
function More({
  t,
  entries,
  open,
}: {
  t: Translate
  entries: readonly GuideEntry[]
  open: (kind: string) => void
}) {
  if (entries.length === 0) return null
  return (
    <div className="more">
      <div className="a-grp">{t('more')}</div>
      {entries.map((e) => {
        const Icon = e.icon
        return (
          <NavItem
            key={`${e.providerId}:${e.id}`}
            label={e.title()}
            icon={Icon ? <Icon size={16} /> : undefined}
            onClick={() => open(e.kind)}
          />
        )
      })}
    </div>
  )
}

/** Hai cấp thư mục cuối, đủ nhận ra dự án; đường dẫn đủ nằm trong chú thích. */
const shortPath = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : path
}

/** Thêm bot vào dự án: các bot của đội chưa ở trong dự án. */
function AddBot({
  t,
  onAdd,
  candidates,
}: {
  t: Translate
  onAdd: (id: string) => void
  candidates: TeamMember[]
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  return (
    <span className="a-pop" ref={root}>
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {t('project.addBot')}
      </Button>
      {open && (
        <Menu label={t('project.addBotMenu')} width={240}>
          {candidates.length === 0 && (
            <MenuItem onSelect={() => (setOpen(false), arisNavigate('create-bot'))}>
              {t('project.newBot')}
            </MenuItem>
          )}
          {candidates.map((m) => (
            <MenuItem
              key={m.id}
              icon={<Mascot id={m.mascot ?? m.id} size={18} />}
              meta={m.role}
              onSelect={() => {
                setOpen(false)
                onAdd(m.id)
              }}
            >
              {m.name}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  )
}

/**
 * Cột phải của phiên thuộc dự án (màn 1.4): mục tiêu, thành viên và trạng thái của họ (sơ đồ 3D,
 * Aris chủ trì ở giữa), thêm/bớt bot, luật của dự án, việc sinh ra từ dự án. Dữ liệu thật từ
 * `@aris/projects`; dự án cũ chưa có hồ sơ thì thêm bot là tạo hồ sơ.
 */
function ProjectPane({
  t,
  path,
  more,
  openMap,
}: {
  t: Translate
  path: string
  more: ReactNode
  openMap: () => void
}) {
  const team = useTeam()
  const entry = useProjectByPath(path)
  const [error, setError] = useState<string | null>(null)
  const p = entry?.project ?? null
  const rules = p?.rules ?? DEFAULT_RULES
  const crew = (p?.members ?? []).flatMap((id) => {
    const m = team.members.find((b) => b.id === id)
    return m ? [m] : []
  })
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
  const setMembers = (members: string[]) => {
    if (!entry) return
    setError(null)
    projectAction({ op: 'update', workspace: entry.workspace, patch: { members } }).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    )
  }
  const candidates = team.members.filter((m) => !crew.some((c) => c.id === m.id))
  return (
    <div className="aris aris-team aris-project">
      {p?.goal && (
        <div className="goal">
          <div className="a-grp">{t('project.goal')}</div>
          <div className="txt">{p.goal}</div>
        </div>
      )}
      <div className="head">
        <h2>{t('project.members')}</h2>
        <Button variant="ghost" size="sm" className="mapLink" onClick={openMap}>
          {t('openMap')} ›
        </Button>
      </div>
      <div className="map">
        <TeamOrbit
          commander={team.commander}
          commanderLabel={t('commander', { name: team.commander.name })}
          members={crew}
          statusLabel={orbitStatus}
          label={t('orbit', {
            name: team.commander.name,
            members: crew.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
          })}
          height={220}
          onSelect={openMap}
        />
      </div>
      <div className="list">
        <div className="act">
          <Mascot id={team.commander.mascot ?? 'aris'} size={22} />
          <span className="txt">
            <b>{team.commander.name}</b>
          </span>
          <span className="a-muted state">{t('project.leads')}</span>
        </div>
        {crew.map((m) => (
          <div key={m.id} className="act">
            <Mascot id={m.mascot ?? m.id} size={22} />
            <span className="txt">
              <b>{m.name}</b>
            </span>
            <span className="a-muted state">{t(`status.${m.status}`)}</span>
            <IconButton
              size="sm"
              label={t('project.removeBot', { name: m.name })}
              onClick={() => setMembers(crew.filter((c) => c.id !== m.id).map((c) => c.id))}
            >
              <CloseIcon size={13} />
            </IconButton>
          </div>
        ))}
        {crew.length === 0 && <div className="act a-muted">{t('project.noMembers')}</div>}
        {entry && (
          <AddBot t={t} candidates={candidates} onAdd={(id) => setMembers([...crew.map((c) => c.id), id])} />
        )}
        {error && (
          <div className="act" style={{ color: 'var(--a-danger)' }}>
            {error}
          </div>
        )}
      </div>
      <div className="sect">
        <div className="a-grp">{t('project.rules')}</div>
        <div className="kv">
          <span>{t('project.dir')}</span>
          <span className="a-mono path" title={path}>
            {shortPath(path)}
          </span>
        </div>
        <div className="kv">
          <span>{t('project.maxRounds')}</span>
          <span>{rules.maxRounds}</span>
        </div>
        <div className="kv">
          <span>{t('project.maxMessages')}</span>
          <span>{rules.maxMessages}</span>
        </div>
        <div className="kv">
          <span>{t('project.stopCmd')}</span>
          <span>{t(rules.stopCommand ? 'project.yes' : 'project.no')}</span>
        </div>
        <div className="kv">
          <span>{t('project.summarize')}</span>
          <span>{t(rules.arisSummarizes ? 'project.yes' : 'project.no')}</span>
        </div>
      </div>
      <div className="sect">
        <div className="a-grp">{t('project.tasks')}</div>
        <div className="act a-muted">{t('project.noTasks')}</div>
        <Button variant="ghost" size="sm" onClick={() => arisNavigate('kanban')}>
          {t('project.board')}
        </Button>
      </div>
      {more}
    </div>
  )
}

export function TeamPane({
  t,
  useGuideEntries,
  useTabInfo,
  openMap,
  useWorkspaces,
  useMounted,
}: TeamPaneProps) {
  const entries = useGuideEntries((e) => e)
  const { tab } = useTabInfo()
  const sessionId = useMounted((id) => id)
  const projectPath = useWorkspaces((w) => projectOfSession(w.items, sessionId)?.path)
  const more = (
    <More t={t} entries={entries} open={(kind) => tab.actions.openTab(kind, { replaceTab: true })} />
  )
  const team = useTeam()
  const activity = useTeamLive()?.activity ?? []
  if (projectPath !== undefined) return <ProjectPane t={t} path={projectPath} more={more} openMap={openMap} />
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
  const { commander, members } = team
  return (
    <div className="aris aris-team">
      <div className="head">
        <h2>{t('title')}</h2>
        <Button variant="ghost" size="sm" className="mapLink" onClick={openMap}>
          {t('openMap')} ›
        </Button>
      </div>

      <div className="map">
        <TeamOrbit
          commander={commander}
          commanderLabel={t('commander', { name: commander.name })}
          members={members}
          statusLabel={orbitStatus}
          label={t('orbit', {
            name: commander.name,
            members: members.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
          })}
          height={300}
          onSelect={openMap}
        />
      </div>
      <div className="hint">{t('orbitHint')}</div>

      <div className="list" aria-label={t('recent')}>
        {activity.length === 0 && <div className="act a-muted">{t('recentSoon')}</div>}
        {activity.slice(0, 8).map((a) => (
          <Activity key={`${a.at}-${a.bot}-${a.kind}`} t={t} a={a} name={nameIn(team, a.bot)} />
        ))}
      </div>

      {more}
    </div>
  )
}

/**
 * Tên tab bắt đầu của cột phải (thay chữ "Bắt đầu" của dsh): gọi đúng thứ đang hiện,
 * "Đội bot" ở chat riêng, "Dự án" ở phiên dự án.
 */
export function TeamTitle({
  t,
  useWorkspaces,
  useMounted,
}: Pick<TeamPaneProps, 't' | 'useWorkspaces' | 'useMounted'>) {
  const sessionId = useMounted((id) => id)
  const inProject = useWorkspaces((w) => projectOfSession(w.items, sessionId) !== undefined)
  return <>{inProject ? t('tab.project') : t('tab.team')}</>
}
