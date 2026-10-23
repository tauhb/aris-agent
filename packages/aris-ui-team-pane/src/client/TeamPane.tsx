/**
 * "Đội bot lúc này" theo màn R3: sơ đồ đội 3D (Commander giữa, các bot xoay
 * quanh), việc gần đây của đội, rồi các lối mở trang khác của cột phải (Tệp,
 * Terminal…) mà dsh vẫn đăng ký như cũ. Đội và việc gần đây là dữ liệu mẫu đến
 * giai đoạn 2.
 */
import {
  COMMANDER,
  DEMO_ACTIVITY,
  DEMO_PROJECT_ROOM,
  DEMO_TEAM,
  projectOfSession,
  type BotStatus,
  type WorkspaceLike,
} from '@aris/ui-kit'
import { Button, Mascot, NavItem, StatusGlyph, TeamOrbit, arisNavigate } from '@aris/ui-kit/react'
import type { ComponentType, ReactNode } from 'react'
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

const MEMBERS = DEMO_TEAM.flatMap((g) => g.members)
const nameOf = (id: string) => [COMMANDER, ...MEMBERS].find((m) => m.id === id)?.name ?? id

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

/**
 * Cột phải của phiên thuộc dự án (màn 1.4): thành viên và việc đang làm, luật của
 * dự án, việc sinh ra từ dự án. Thêm so với canvas (anh chọn 23/10): sơ đồ 3D các
 * thành viên của dự án, Aris chủ trì ở giữa. Thành viên, luật, việc là mẫu tới giai
 * đoạn 2 (Team của dsh); thư mục làm việc là thật.
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
  const R = DEMO_PROJECT_ROOM
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
  // Bot của dự án, mang trạng thái trong dự án (đang nghĩ, chờ…), không phải trạng thái chung.
  const crew = R.members.flatMap((x) => {
    const m = MEMBERS.find((b) => b.id === x.id)
    return m && m.id !== COMMANDER.id ? [{ ...m, status: x.status }] : []
  })
  return (
    <div className="aris aris-team aris-project">
      <div className="head">
        <h2>{t('project.members')}</h2>
        <Button variant="ghost" size="sm" className="mapLink" onClick={openMap}>
          {t('openMap')} ›
        </Button>
      </div>
      <div className="map">
        <TeamOrbit
          commander={COMMANDER}
          commanderLabel={t('commander', { name: COMMANDER.name })}
          members={crew}
          statusLabel={orbitStatus}
          label={t('orbit', {
            name: COMMANDER.name,
            members: crew.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
          })}
          height={220}
          onSelect={openMap}
        />
      </div>
      <div className="list">
        {R.members.map((m) => (
          <div key={m.id} className="act">
            <Mascot id={m.id} size={22} />
            <span className="txt">
              <b>{nameOf(m.id)}</b>
            </span>
            <span className="a-muted state">{m.state}</span>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => arisNavigate('create-bot')}>
          {t('project.addBot')}
        </Button>
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
          <span>{R.rules.maxRounds}</span>
        </div>
        <div className="kv">
          <span>{t('project.maxMessages')}</span>
          <span>{R.rules.maxMessages}</span>
        </div>
        <label className="kv">
          <span>{t('project.stopCmd')}</span>
          <input type="checkbox" defaultChecked={R.rules.stopCommand} />
        </label>
      </div>
      <div className="sect">
        <div className="a-grp">{t('project.tasks')}</div>
        {R.tasks.map((task) => (
          <div key={task.text} className="act">
            <StatusGlyph status={task.status} label={t(`status.${task.status}`)} />
            <span className="txt">{task.text}</span>
            <span className="a-muted state">{task.state}</span>
          </div>
        ))}
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
  if (projectPath !== undefined) return <ProjectPane t={t} path={projectPath} more={more} openMap={openMap} />
  const orbitStatus = (s: BotStatus) => t(`orbit.${s}`)
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
          commander={COMMANDER}
          commanderLabel={t('commander', { name: COMMANDER.name })}
          members={MEMBERS}
          statusLabel={orbitStatus}
          label={t('orbit', {
            name: COMMANDER.name,
            members: MEMBERS.map((m) => `${m.name} ${orbitStatus(m.status)}`).join(', '),
          })}
          height={300}
          onSelect={openMap}
        />
      </div>
      <div className="hint">{t('orbitHint')}</div>

      <div className="list" aria-label={t('recent')}>
        {DEMO_ACTIVITY.map((a) => (
          <div key={a.id} className="act">
            <StatusGlyph status={a.status} label={t(`status.${a.status}`)} />
            <span className="txt">
              <b>{nameOf(a.id)}</b> {a.text} · <span className="a-muted">{a.when}</span>
            </span>
          </div>
        ))}
      </div>

      {more}
    </div>
  )
}
