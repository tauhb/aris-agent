/**
 * 4.1 · Routine: bảng các lịch của `@aris/routine` (bot, lịch chạy, nơi gửi, lần chạy gần nhất,
 * bật/tắt), tạm dừng tất cả, cảnh báo routine lỗi liên tiếp. Tạo routine bằng lời (4.2) là đợt 2.
 */
import { Button, Mascot, PageShell, Pill, Switch, useTeamData, type BotData } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps, Translate } from '../page.js'

/** Lần chạy (bảng `runs` của `@aris/routine`). */
interface Run {
  id: string
  sessionId?: string
  at: string
  finishedAt?: string
  status: 'running' | 'done' | 'failed' | 'stopped' | 'cap' | 'missed'
  error?: string
}

/** Routine kèm lịch đọc được và lần chạy gần nhất. */
interface RoutineRow {
  id: string
  bot: string
  title: string
  task: string
  when: string
  deliver: 'telegram' | 'none'
  enabled: boolean
  nextAt?: string
  failStreak: number
  running: boolean
  last: Run | null
}

interface Alert {
  routine: string
  title: string
  bot: string
  streak: number
  error: string
  session: string | null
}

interface Data {
  routines: RoutineRow[]
  paused: boolean
  next: { routine: string; bot: string; at: string } | null
  alerts: Alert[]
}

const TONE = {
  done: 'ok',
  failed: 'danger',
  cap: 'danger',
  running: 'accent',
  missed: 'warn',
  stopped: 'muted',
} as const

const endpoint = () => new URL('api/aris/routines', document.baseURI)

/** "hôm nay 07:30", "hôm qua", "ngày mai 07:30", "24/10" (tương lai kèm giờ). */
function dayOf(t: Translate, iso: string) {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`
  const shift = (n: number) => new Date(Date.now() + n * 86_400_000).toDateString()
  if (d.toDateString() === shift(0)) return t('rt.today', { time })
  if (d.toDateString() === shift(-1)) return t('rt.yesterday')
  if (d.toDateString() === shift(1)) return t('rt.tomorrow', { time })
  const day = `${two(d.getDate())}/${two(d.getMonth() + 1)}`
  return d.getTime() > Date.now() ? `${day} ${time}` : day
}

export function Routine({ t, nav }: PageProps) {
  const team = useTeamData()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const botOf = (id: string): BotData | undefined => team?.bots.find((b) => b.id === id)

  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setData((await r.json()) as Data)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [load])

  const act = async (body: Record<string, unknown>) => {
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string; session?: string } | null
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    await load()
    return r?.ok ? j : null
  }

  const rows = data?.routines ?? []
  const next = data?.next
  const status = (r: RoutineRow) => {
    if (r.running) return { tone: TONE.running, label: t('rt.st.running') }
    const l = r.last
    if (!l) return undefined
    const label =
      (l.status === 'failed' || l.status === 'cap') && r.failStreak >= 2
        ? t('rt.st.failedN', { n: r.failStreak })
        : t(`rt.st.${l.status}`)
    return { tone: TONE[l.status], label, day: dayOf(t, l.finishedAt ?? l.at) }
  }

  return (
    <PageShell
      title={t('rt.title')}
      subtitle={
        next
          ? t('rt.subtitle', {
              n: rows.length,
              bot: botOf(next.bot)?.name ?? next.bot,
              at: dayOf(t, next.at),
            })
          : t('rt.subtitleNone', { n: rows.length })
      }
      actions={
        <>
          <Button onClick={() => nav.openPanel('schedules')}>{t('rt.dshSchedules')}</Button>
          <Button
            disabled={!data || !rows.length}
            onClick={() => void act({ op: 'pause-all', on: !data?.paused })}
          >
            {data?.paused ? t('rt.resumeAll') : t('rt.pauseAll')}
          </Button>
          <Button variant="primary" onClick={() => nav.go('routine-new')}>
            {t('rt.new')}
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ color: 'var(--a-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {data?.paused && (
        <div className="a-muted" style={{ fontSize: 13 }}>
          {t('rt.pausedNote')}
        </div>
      )}
      <div className="a-card" style={{ overflowX: 'auto' }}>
        <div className="ap-rt a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
          <span />
          <span>{t('rt.name')}</span>
          <span>{t('rt.when')}</span>
          <span>{t('rt.to')}</span>
          <span>{t('rt.last')}</span>
          <span>{t('rt.on')}</span>
        </div>
        {data && !rows.length && (
          <div className="ap-rt a-muted" style={{ display: 'block' }}>
            {t('rt.empty')}
          </div>
        )}
        {rows.map((r) => {
          const off = !r.enabled || data?.paused
          const st = status(r)
          const bot = botOf(r.bot)
          return (
            <div className="ap-rt" key={r.id}>
              <span title={bot?.name} style={{ display: 'inline-flex' }}>
                <Mascot id={bot?.mascot ?? 'aris'} size={26} accessory={bot?.accessory} />
              </span>
              <span className={off ? 'a-muted' : undefined} style={{ minWidth: 0 }}>
                {r.last?.sessionId ? (
                  <a className="ap-link" onClick={() => nav.openSession(r.last!.sessionId!)}>
                    <b>{r.title}</b>
                  </a>
                ) : (
                  <b>{r.title}</b>
                )}
                <div
                  className={off ? undefined : 'a-muted'}
                  style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={r.task}
                >
                  {r.task}
                </div>
              </span>
              <span className={off ? 'a-muted' : undefined}>{r.when}</span>
              <span className={off ? 'a-muted' : undefined}>
                {r.deliver === 'telegram' ? t('rt.to.telegram') : t('rt.to.none')}
              </span>
              <span>
                {st ? (
                  <>
                    <Pill tone={st.tone}>{st.label}</Pill>{' '}
                    {st.day && (
                      <span className="a-muted" style={{ fontSize: 12 }}>
                        {st.day}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="a-muted">—</span>
                )}
              </span>
              <Switch
                checked={r.enabled}
                label={t('rt.toggle', { name: r.title })}
                onChange={(v) => void act({ op: 'toggle', id: r.id, on: v })}
              />
            </div>
          )
        })}
      </div>
      {data?.alerts.map((a) => (
        <div className="ap-alert" key={a.routine}>
          <span style={{ flex: 1, minWidth: 260 }}>
            <b>{t('rt.alertTitle', { name: a.title, n: a.streak })}</b>
            {a.error && ` — ${a.error}`}
          </span>
          {a.session && (
            <Button size="sm" onClick={() => nav.openSession(a.session!)}>
              {t('rt.viewRun')}
            </Button>
          )}
          {a.session && (
            <Button
              size="sm"
              onClick={() =>
                void act({ op: 'fix', id: a.routine }).then((j) => j?.session && nav.openSession(j.session))
              }
            >
              {t('rt.letFix', { name: botOf(a.bot)?.name ?? a.bot })}
            </Button>
          )}
        </div>
      ))}
    </PageShell>
  )
}
