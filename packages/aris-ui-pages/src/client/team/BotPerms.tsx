/**
 * Hồ sơ bot (bản vẽ 2.2), đợt 2: tab "Quyền & kênh" (quyền riêng của bot) và cột phải "Tóm tắt bot"
 * (trạng thái, số liệu 7 ngày, ký ức lõi, việc Aris hay giao, học gần đây).
 */
import { Card, CardRow, Select, Mascot, Switch, teamAction, useTeam, type BotData } from '@aris/ui-kit/react'
import { getMascot, type BotStatus } from '@aris/ui-kit'
import { useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'
import { Later } from './BotTools.js'

type T = PageProps['t']
type WriteMode = 'none' | 'workspace' | 'anywhere'

/** Chính sách khi bot chưa vào phòng nào (như `DEFAULT_POLICY` của `@aris/bots`). */
const NO_DEPARTMENT = { write: true }

export function PermsCard({ t, bot }: { t: T; bot: BotData }) {
  const team = useTeam()
  const [error, setError] = useState<string | null>(null)
  const commander = bot.kind === 'commander'
  const dept = team.departments.find((d) => d.id === bot.department)
  const policy = commander ? undefined : (dept?.policy ?? NO_DEPARTMENT)
  const write: WriteMode = bot.perms?.write ?? 'anywhere'
  const save = (patch: Record<string, unknown>) => {
    setError(null)
    void teamAction({ op: 'update', id: bot.id, patch }).catch((e: unknown) => setError((e as Error).message))
  }
  const row = (label: ReactNode, hint: ReactNode, control: ReactNode) => (
    <div className="a-row" style={{ flexWrap: 'wrap' }}>
      <span className="grow" style={{ minWidth: 200, display: 'flex', flexDirection: 'column' }}>
        {label}
        {hint && (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {hint}
          </span>
        )}
      </span>
      {control}
    </div>
  )
  return (
    <Card title={t('bot.permTitle')}>
      {!commander &&
        row(
          t('perm.write'),
          policy && !policy.write
            ? dept
              ? t('tools.blockedBy', { dept: dept.name })
              : t('perm.writeBlockedDefault')
            : t('perm.writeHint'),
          <Select
            label={t('perm.write')}
            style={{ width: 300 }}
            disabled={!!policy && !policy.write}
            value={policy && !policy.write ? 'none' : write}
            onChange={(v) => save({ perms: { write: v } })}
            options={[
              { id: 'none', name: t('perm.write.none') },
              { id: 'workspace', name: t('perm.write.workspace'), note: t('perm.write.workspaceNote') },
              { id: 'anywhere', name: t('perm.write.anywhere'), note: t('perm.write.anywhereNote') },
            ]}
          />,
        )}
      {row(
        t('perm.danger'),
        t('perm.dangerHint'),
        <Select
          label={t('perm.danger')}
          style={{ width: 300 }}
          value={bot.perms?.danger ?? 'ask'}
          onChange={(v) => save({ perms: { danger: v } })}
          options={[
            { id: 'ask', name: t('perm.danger.ask'), note: t('perm.danger.askNote') },
            { id: 'deny', name: t('perm.danger.deny'), note: t('perm.danger.denyNote') },
          ]}
        />,
      )}
      {!commander &&
        row(
          t('perm.assignable'),
          t('perm.assignableHint', { name: bot.name }),
          <Switch
            label={t('perm.assignable')}
            checked={bot.assignable !== false}
            onChange={(on) => save({ assignable: on })}
          />,
        )}
      {error && (
        <CardRow>
          <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</span>
        </CardRow>
      )}
    </Card>
  )
}

interface Profile {
  live: { status: string; task?: string; since: number }
  week: {
    assigned: number
    today: number
    done: number
    failed: number
    recent: { task: string; at: number; result: 'done' | 'failed' | 'open' }[]
  }
  costWeek: number | null
  memory: {
    core: { used: number; cap: number }
    recent: {
      id: string
      text: string
      at: string
      kind: string
      tier: 'core' | 'archive'
      trust: string
      sessionId?: string
      sessionTitle?: string
      project?: string
      channel?: 'telegram'
    }[]
  } | null
}

function useProfile(bot: string): Profile | null {
  const [data, setData] = useState<Profile | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => {
      const url = new URL('api/aris/bots', document.baseURI)
      url.searchParams.set('profile', bot)
      void fetch(url, { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<Profile>) : null))
        .then((d) => alive && d && setData(d))
        .catch(() => {})
    }
    setData(null)
    load()
    const timer = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [bot])
  return data
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode | undefined
  tone?: string | undefined
}) {
  return (
    <div className="ap-astat">
      <span className="lb">{label}</span>
      <span className="v" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
      {sub && <span className="s">{sub}</span>}
    </div>
  )
}

const two = (n: number) => String(n).padStart(2, '0')
const hhmm = (ms: number) => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}
/** Màu pill theo loại ký ức. */
const KIND_COLOR: Record<string, string> = {
  project: '#7C5CE6',
  preference: '#E0569A',
  lesson: '#E8833A',
  convention: '#2F7BE5',
  person: '#2E9E5B',
  event: '#C9A227',
  environment: '#4A8C9C',
  fact: '#7A8290',
}

const STATUS_TONE: Record<BotStatus, string> = {
  working: 'var(--a-ok)',
  waiting: 'var(--a-warn)',
  done: 'var(--a-ok)',
  failed: 'var(--a-danger)',
  idle: 'var(--a-muted)',
}

/** Cột phải "Tóm tắt bot" (bản vẽ 2.2d, phương án A): thẻ đầu theo màu linh vật, ô chỉ số 7 ngày, việc gần đây, học gần đây. */
export function BotAside({ t, bot, nav }: { t: T; bot: BotData; nav: PageProps['nav'] }) {
  const team = useTeam()
  const p = useProfile(bot.id)
  const member = bot.kind === 'commander' ? team.commander : team.members.find((m) => m.id === bot.id)
  const status = (p?.live.status ?? member?.status ?? 'idle') as BotStatus
  const since = p?.live.since ?? 0
  const task = status !== 'idle' ? p?.live.task : undefined
  const color = getMascot(bot.mascot)?.color ?? 'var(--a-accent)'
  const dept = team.departments.find((d) => d.id === bot.department)?.name
  const w = p?.week
  const resolved = w ? w.done + w.failed : 0
  const money = (n: number) =>
    n.toLocaleString(t('aside.numLocale'), {
      minimumFractionDigits: 2,
      maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2,
    })
  const core = p?.memory?.core
  const corePct = core ? Math.round((core.used / Math.max(core.cap, 1)) * 100) : null
  const day = (ms: number) => {
    const d = new Date(ms)
    const today = new Date().setHours(0, 0, 0, 0)
    const diff = Math.round((today - new Date(ms).setHours(0, 0, 0, 0)) / 86_400_000)
    return diff <= 0
      ? t('aside.today')
      : diff === 1
        ? t('aside.yesterday')
        : `${two(d.getDate())}/${two(d.getMonth() + 1)}`
  }
  const statusLine =
    status === 'idle'
      ? since
        ? t('aside.idleSince', { time: `${hhmm(since)} ${day(since)}` })
        : t('bot.st.idle')
      : `${t(`bot.st.${status}`)}${since ? ` · ${t('aside.since', { time: hhmm(since) })}` : ''}`
  return (
    <aside className="ap-aside ap-aside-a" aria-label={t('bot.summary')}>
      <div className="ap-hero" style={{ ['--bot' as string]: color }}>
        <div className="who">
          <Mascot id={bot.mascot} size={40} motion={status} seed={bot.id} />
          <span className="txt">
            <b>{bot.name}</b>
            <span className="a-muted">
              {[...new Set([bot.role, dept].filter(Boolean))].join(' · ') || `@${bot.handle}`}
            </span>
          </span>
        </div>
        <span className="ap-chip2">
          <span className="ap-dot2" style={{ background: STATUS_TONE[status] }} />
          {statusLine}
        </span>
        {task && <span className="task">{task}</span>}
      </div>

      <div>
        <div className="ap-asec">{t('aside.week')}</div>
        <div className="ap-astats">
          <Stat
            label={t('aside.assigned')}
            value={w ? t('bot.aside.tasks', { n: w.assigned }) : '…'}
            sub={w ? t('aside.todayCount', { n: w.today }) : undefined}
          />
          <Stat
            label={t('bot.aside.done')}
            value={w ? (resolved ? `${Math.round((w.done / resolved) * 100)}%` : '—') : '…'}
            tone={w && resolved ? (w.failed > w.done ? 'var(--a-danger)' : 'var(--a-ok)') : undefined}
            sub={
              w
                ? resolved
                  ? t('aside.doneSub', { done: w.done, failed: w.failed })
                  : t('aside.noneDone')
                : undefined
            }
          />
          <Stat
            label={t('aside.cost')}
            value={p ? (p.costWeek === null ? '—' : `${money(p.costWeek)} USD`) : '…'}
            sub={p && p.costWeek !== null ? t('aside.perDay', { usd: money(p.costWeek / 7) }) : undefined}
          />
          <Stat
            label={t('bot.aside.core')}
            value={corePct === null ? (p ? '—' : '…') : `${corePct}%`}
            sub={
              core ? (
                <span className="ap-gauge">
                  <i style={{ width: `${Math.min(100, corePct ?? 0)}%`, background: color }} />
                </span>
              ) : undefined
            }
          />
        </div>
      </div>

      <div>
        <div className="ap-asec">{t('bot.aside.often', { name: bot.name })}</div>
        {w?.recent.length ? (
          w.recent.map((r) => (
            <div className="ap-atask" key={r.task + r.at}>
              <span className={`ic ${r.result}`} aria-label={t(`aside.result.${r.result}`)}>
                {r.result === 'done' ? '✓' : r.result === 'failed' ? '!' : '•'}
              </span>
              <span className="tt">{r.task}</span>
              <span className="a-muted when">{day(r.at)}</span>
            </div>
          ))
        ) : (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('bot.aside.noTasks')}
          </span>
        )}
      </div>

      <div>
        <div className="ap-asec">{t('bot.aside.learned')}</div>
        {p?.memory?.recent.length ? (
          <div className="ap-tl">
            {p.memory.recent.map((m) => (
              <div key={m.id} className="ap-learn" style={{ ['--k' as string]: KIND_COLOR[m.kind] ?? color }}>
                <span className="top">
                  <span className="ap-kind">{t(`mem.kind.${m.kind}`)}</span>
                  {m.tier === 'core' && <span className="ap-core">{t('aside.core')}</span>}
                  <span className="a-muted when">{day(Date.parse(m.at))}</span>
                </span>
                <button
                  type="button"
                  className="txt ap-clamp"
                  title={t('aside.openMemory')}
                  onClick={() => nav.go('memory', { bot: bot.id, focus: m.id, tier: m.tier })}
                >
                  {m.text}
                </button>
                <span className="src">
                  {m.channel === 'telegram' ? (
                    <span className="ap-lsrc">Telegram</span>
                  ) : m.sessionId ? (
                    <button
                      type="button"
                      className="ap-lsrc link"
                      title={t('aside.openSession')}
                      onClick={() => nav.openSession(m.sessionId!)}
                    >
                      «{m.sessionTitle ?? t('aside.untitled')}»
                    </button>
                  ) : null}
                  {m.project && <span className="ap-proj">{m.project}</span>}
                  <span className="a-muted">{t(`mem.trust.${m.trust}`, { name: bot.name })}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('bot.aside.noLearned')}
          </span>
        )}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <Later t={t} stage={3} row>
          <span className="a-muted" style={{ fontSize: 12.5, padding: '8px 0', display: 'block' }}>
            {t('bot.aside.skillLearn')}
          </span>
        </Later>
      </div>
    </aside>
  )
}
