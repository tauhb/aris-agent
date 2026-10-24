/**
 * 2.2e · Tab Routine của hồ sơ bot: routine của riêng bot (`@aris/routine`, `?bot=`), cảnh báo lỗi
 * liên tiếp, lần chạy gần đây, tạo routine đặt sẵn bot. Chữ dùng chung với 4.1 và 4.2 (`rt.*`, `rn.*`).
 */
import { Button, Pill, Switch } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageNav, Translate } from '../page.js'

interface Run {
  id: string
  routine: string
  title?: string
  sessionId?: string
  at: string
  trigger: 'schedule' | 'catchup' | 'manual'
  status: 'running' | 'done' | 'failed' | 'stopped' | 'cap' | 'missed'
  usd: number
  error?: string
}

interface RoutineRow {
  id: string
  title: string
  task: string
  when: string
  deliver: 'telegram' | 'none'
  perms: 'read' | 'bot'
  mode?: 'agent' | 'script'
  command?: string
  enabled: boolean
  nextAt?: string
  failStreak: number
  running: boolean
  last: Run | null
}

export interface BotRoutines {
  routines: RoutineRow[]
  runs: Run[]
  usd7: number
  alerts: { routine: string; title: string; streak: number; error: string; session: string | null }[]
  /** Bot có Telegram riêng; không thì gửi qua Aris. */
  telegram: boolean
  paused: boolean
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
const two = (n: number) => String(n).padStart(2, '0')
const stamp = (iso: string) => {
  const d = new Date(iso)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

/** Routine của một bot; `reload` sau khi đổi. Dùng cả cho số trên nhãn tab. */
export function useBotRoutines(botId: string | undefined) {
  const [data, setData] = useState<BotRoutines | null>(null)
  const reload = useCallback(async () => {
    if (!botId) return
    const r = await fetch(
      new URL(`api/aris/routines?bot=${encodeURIComponent(botId)}`, document.baseURI),
    ).catch(() => null)
    if (r?.ok) setData((await r.json()) as BotRoutines)
  }, [botId])
  useEffect(() => {
    setData(null)
    void reload()
    const timer = setInterval(() => void reload(), 15_000)
    return () => clearInterval(timer)
  }, [reload])
  return { data, reload }
}

export function BotRoutineTab({
  t,
  nav,
  bot,
  data,
  reload,
}: {
  t: Translate
  nav: PageNav
  bot: { id: string; name: string }
  data: BotRoutines | null
  reload: () => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const act = async (body: Record<string, unknown>) => {
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string; session?: string } | null
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    await reload()
    return r?.ok ? j : null
  }
  const rows = data?.routines ?? []
  const on = rows.filter((r) => r.enabled)
  const next = on
    .map((r) => r.nextAt)
    .filter((x): x is string => !!x)
    .sort()[0]
  const toName = data?.telegram ? bot.name : 'Aris'
  const deliver = (r: RoutineRow) =>
    r.deliver === 'none'
      ? t('rn.to.none')
      : r.mode === 'script'
        ? t('rn.to.scriptTelegram', { bot: toName })
        : t('rn.to.telegram', { bot: toName })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{t('brt.title', { name: bot.name })}</b>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {rows.length
              ? t('brt.summary', { n: rows.length, on: on.length }) +
                (next ? ` · ${t('brt.next', { at: stamp(next) })}` : '')
              : t('brt.none')}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        <a className="ap-link" style={{ fontSize: 13 }} onClick={() => nav.go('routine')}>
          {t('brt.all')}
        </a>
        <Button variant="primary" onClick={() => nav.go('routine-new', { bot: bot.id })}>
          {t('brt.new', { name: bot.name })}
        </Button>
      </div>
      {error && (
        <div role="alert" style={{ color: 'var(--a-danger)', fontSize: 13 }}>
          {error}
        </div>
      )}
      {data && !rows.length && (
        <div
          className="a-card"
          style={{ padding: '24px 22px', display: 'grid', gap: 8, justifyItems: 'start' }}
        >
          <b>{t('brt.emptyTitle', { name: bot.name })}</b>
          <span className="a-muted" style={{ fontSize: 13 }}>
            {t('brt.emptyText', { name: bot.name })}
          </span>
          <Button variant="primary" onClick={() => nav.go('routine-new', { bot: bot.id })}>
            {t('brt.new', { name: bot.name })}
          </Button>
        </div>
      )}
      {data?.alerts.map((a) => (
        <div className="ap-alert" key={a.routine}>
          <span style={{ flex: 1, minWidth: 240 }}>
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
              {t('rt.letFix', { name: bot.name })}
            </Button>
          )}
        </div>
      ))}
      {!!rows.length && (
        <div className="a-card" style={{ overflowX: 'auto' }}>
          <div className="ap-rt ap-brt a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
            <span>{t('rt.name')}</span>
            <span>{t('rt.when')}</span>
            <span>{t('rt.to')}</span>
            <span>{t('rt.last')}</span>
            <span>{t('rt.on')}</span>
          </div>
          {rows.map((r) => {
            const off = !r.enabled || data?.paused
            const l = r.last
            const label = r.running
              ? t('rt.st.running')
              : l
                ? (l.status === 'failed' || l.status === 'cap') && r.failStreak >= 2
                  ? t('rt.st.failedN', { n: r.failStreak })
                  : t(`rt.st.${l.status}`)
                : undefined
            return (
              <div className="ap-rt ap-brt" key={r.id}>
                <span className={off ? 'a-muted' : undefined} style={{ minWidth: 0 }}>
                  {l?.sessionId ? (
                    <a className="ap-link" onClick={() => nav.openSession(l.sessionId!)}>
                      <b>{r.title}</b>
                    </a>
                  ) : (
                    <b>{r.title}</b>
                  )}
                  <div
                    className="a-muted"
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={r.mode === 'script' ? r.command : r.task}
                  >
                    {r.mode === 'script'
                      ? `${t('rn.mode.script')} · ${r.command ?? ''}`
                      : `${r.task}${r.perms === 'read' ? ` · ${t('brt.readOnly')}` : ''}`}
                  </div>
                </span>
                <span className={off ? 'a-muted' : undefined}>
                  {r.when}
                  <div className="a-muted" style={{ fontSize: 12 }}>
                    {r.enabled && r.nextAt ? t('brt.next', { at: stamp(r.nextAt) }) : t('brt.off')}
                  </div>
                </span>
                <span className={off ? 'a-muted' : undefined}>{deliver(r)}</span>
                <span>
                  {label ? (
                    <>
                      <Pill tone={r.running ? TONE.running : TONE[l!.status]}>{label}</Pill>{' '}
                      {l && !r.running && (
                        <span className="a-muted" style={{ fontSize: 12 }}>
                          {stamp(l.at).slice(0, 5)}
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
      )}
      {!!data?.runs.length && (
        <div className="a-card" style={{ overflowX: 'auto' }}>
          <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between' }}>
            <b>{t('brt.recent')}</b>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('brt.recentCost', { usd: data.usd7.toFixed(2).replace('.', ',') })}
            </span>
          </div>
          {data.runs.map((x) => (
            <div className="ap-rt ap-brr" key={x.id}>
              <span className="a-muted a-mono" style={{ fontSize: 12 }}>
                {stamp(x.at)}
              </span>
              <span style={{ minWidth: 0 }}>
                {x.title}
                {x.trigger === 'manual' && (
                  <span className="a-muted" style={{ fontSize: 12 }}>
                    {' '}
                    · {t('brt.manual')}
                  </span>
                )}
              </span>
              <span style={{ minWidth: 0 }}>
                <Pill tone={TONE[x.status]}>{t(`rt.st.${x.status}`)}</Pill>
                {x.error && (
                  <span className="a-muted" style={{ fontSize: 12 }} title={x.error}>
                    {' '}
                    {x.error.length > 28 ? `${x.error.slice(0, 27)}…` : x.error}
                  </span>
                )}
              </span>
              <span className="a-muted a-mono" style={{ fontSize: 12 }}>
                {x.usd ? `${x.usd.toFixed(3).replace('.', ',')} $` : '—'}
              </span>
              {x.sessionId ? (
                <a
                  className="ap-link"
                  style={{ fontSize: 12.5 }}
                  onClick={() => nav.openSession(x.sessionId!)}
                >
                  {t('brt.openRun')}
                </a>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {!!rows.length && (
        <div className="a-card a-muted" style={{ padding: '12px 14px', fontSize: 13 }}>
          {t('brt.note', { name: bot.name })}
        </div>
      )}
    </div>
  )
}
