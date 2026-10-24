/**
 * Hồ sơ bot (bản vẽ 2.2), đợt 2: tab "Quyền & kênh" (quyền riêng của bot) và cột phải "Tóm tắt bot"
 * (trạng thái, số liệu 7 ngày, ký ức lõi, việc Aris hay giao, học gần đây).
 */
import {
  Card,
  CardRow,
  Select,
  StatusPill,
  Switch,
  Tag,
  teamAction,
  useTeam,
  type BotData,
} from '@aris/ui-kit/react'
import type { BotStatus } from '@aris/ui-kit'
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
  live: { status: string; task?: string }
  week: { assigned: number; done: number; failed: number; recent: string[] }
  costWeek: number | null
  memory: { core: { used: number; cap: number }; recent: { text: string; at: string }[] } | null
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

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="ap-stat">
      <div className="lb">{label}</div>
      <div className="v">{value}</div>
    </div>
  )
}

/** Cột phải "Tóm tắt bot": thay danh sách tên gọi / phòng / model cũ. */
export function BotAside({ t, bot }: { t: T; bot: BotData }) {
  const team = useTeam()
  const p = useProfile(bot.id)
  const member = bot.kind === 'commander' ? team.commander : team.members.find((m) => m.id === bot.id)
  const status = (p?.live.status ?? member?.status ?? 'idle') as BotStatus
  const task = status !== 'idle' ? p?.live.task : undefined
  const w = p?.week
  const resolved = w ? w.done + w.failed : 0
  const money = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: n > 0 && n < 0.01 ? 4 : 2,
    })
  const core = p?.memory?.core
  return (
    <aside className="ap-aside" aria-label={t('bot.summary')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <StatusPill status={status} label={t(`bot.st.${status}`)} />
        {task && (
          <span className="a-muted" style={{ fontSize: 13 }}>
            {task}
          </span>
        )}
      </div>
      <div className="ap-stats">
        <Tile label={t('bot.aside.assigned')} value={w ? t('bot.aside.tasks', { n: w.assigned }) : '…'} />
        <Tile
          label={t('bot.aside.done')}
          value={w ? (resolved ? `${Math.round((w.done / resolved) * 100)}%` : '—') : '…'}
        />
        <Tile
          label={t('bot.aside.cost')}
          value={p ? (p.costWeek === null ? '—' : `${money(p.costWeek)} USD`) : '…'}
        />
        <Tile
          label={t('bot.aside.core')}
          value={core ? `${Math.round((core.used / Math.max(core.cap, 1)) * 100)}%` : p ? '—' : '…'}
        />
      </div>
      <div>
        <div className="ap-lb">{t('bot.aside.often', { name: bot.name })}</div>
        {w?.recent.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {w.recent.map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
          </div>
        ) : (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('bot.aside.noTasks')}
          </span>
        )}
      </div>
      <div>
        <div className="ap-lb">{t('bot.aside.learned')}</div>
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {p?.memory?.recent.length ? (
            p.memory.recent.map((m) => (
              <span key={m.at + m.text} className="ap-clamp">
                {t('bot.aside.remember', { text: m.text })}
              </span>
            ))
          ) : (
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('bot.aside.noLearned')}
            </span>
          )}
          <Later t={t} stage={3} row>
            <span className="a-muted" style={{ fontSize: 12.5, padding: '6px 0', display: 'block' }}>
              {t('bot.aside.skillLearn')}
            </span>
          </Later>
        </div>
      </div>
    </aside>
  )
}
