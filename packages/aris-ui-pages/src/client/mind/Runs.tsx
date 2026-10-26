/**
 * 3.5 · Việc đang chạy: mục tiêu và lời giám khảo (`@aris/autonomy`), việc được giao trong 24 giờ
 * và yêu cầu quyền đang chờ (`@aris/commander`), vòng lặp và nhịp tim, điểm khôi phục tệp
 * (`@aris/checkpoints`, giai đoạn 4 đợt 5).
 */
import { Button, Card, Mascot, PageShell, Pill, useTeamData, type BotData } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps, Translate } from '../page.js'
import { Box, Col } from '../ui.js'

/** Mục tiêu (bảng `goals` của `@aris/autonomy`). */
interface Goal {
  sessionId: string
  bot: string
  objective: string
  phase: 'active' | 'paused' | 'blocked' | 'complete'
  rounds: number
  max: number
  blocked?: { code: string; message: string }
  /** Hợp đồng hoàn thành (model rẻ soạn khi đặt mục tiêu). */
  contract?: { done: string; proof: string; keep?: string; scope?: string; stop?: string }
  /** Tiêu chí thêm bằng `/subgoal`. */
  subgoals?: string[]
  verdicts: {
    verdict: 'done' | 'continue' | 'blocked'
    reason: string
    missing?: string
    round: number
    at: string
  }[]
}

/** Vòng lặp / nhịp tim cùng lần chạy kế (lịch nhắc của dsh). */
interface Loop {
  id: string
  sessionId: string
  bot: string
  kind: 'loop' | 'heartbeat'
  mode: 'fixed' | 'auto'
  seconds: number
  task: string
  runs: number
  same: number
  nextAt: string | null
  missing: boolean
}

/** Một lần giao việc (nhật ký của `@aris/commander`). */
interface Dispatch {
  at: string
  sessionId: string
  bot: string
  member: string
  title: string
  outcome?: 'done' | 'failed' | 'stopped'
  /** Lượt của bot nhận việc chưa kết thúc. */
  live?: boolean
}

/** Yêu cầu quyền đang chờ (`?approvals=all` của `@aris/commander`). */
interface Approval {
  id: string
  bot: string
  parentSession?: string
}

const DAY_MS = 86_400_000
const PHASE_TONE = { active: 'accent', paused: 'muted', blocked: 'warn', complete: 'ok' } as const
const OUTCOME_COLOR = { done: 'var(--a-ok)', failed: 'var(--a-danger)', stopped: 'var(--a-muted)' } as const

const clock = (iso: string) => {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  return d.toDateString() === new Date().toDateString()
    ? hm
    : `${two(d.getDate())}/${two(d.getMonth() + 1)} ${hm}`
}
const span = (t: Translate, s: number) =>
  s % 3600 === 0
    ? t('run.hour', { n: s / 3600 })
    : s % 60 === 0
      ? t('run.min', { n: s / 60 })
      : t('run.sec', { n: s })

const api = (path: string) => new URL(path, document.baseURI)
const getJson = async <T,>(path: string): Promise<T | null> => {
  const r = await fetch(api(path)).catch(() => null)
  return r?.ok ? ((await r.json()) as T) : null
}

function useRuns() {
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [loops, setLoops] = useState<Loop[] | null>(null)
  const [delegated, setDelegated] = useState<Dispatch[] | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const [a, c, p] = await Promise.all([
      getJson<{ goals: Goal[]; loops: Loop[] }>('api/aris/autonomy'),
      getJson<{ recent: Dispatch[] }>('api/aris/commander'),
      getJson<{ approvals: Approval[] }>('api/aris/commander?approvals=all'),
    ])
    if (a) {
      setGoals(a.goals)
      setLoops(a.loops)
    }
    if (c) setDelegated(c.recent.filter((d) => Date.now() - Date.parse(d.at) < DAY_MS))
    if (p) setApprovals(p.approvals)
  }, [])
  useEffect(() => {
    void reload()
    const timer = setInterval(() => void reload(), 10_000)
    return () => clearInterval(timer)
  }, [reload])
  const act = async (body: Record<string, string>) => {
    setError(null)
    const r = await fetch(api('api/aris/autonomy'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string; goals?: Goal[]; loops?: Loop[] } | null
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    if (j?.goals) setGoals(j.goals)
    if (j?.loops) setLoops(j.loops)
  }
  return { goals, loops, delegated, approvals, error, act }
}

export function Runs({ t, nav }: PageProps) {
  const team = useTeamData()
  const { goals, loops, delegated, approvals, error, act } = useRuns()
  const botOf = (id: string): BotData | undefined => team?.bots.find((b) => b.id === id)
  const mascot = (id: string, size = 24) => (
    <span title={botOf(id)?.name} style={{ display: 'inline-flex' }}>
      <Mascot id={botOf(id)?.mascot ?? 'aris'} size={size} accessory={botOf(id)?.accessory} />
    </span>
  )
  const running = (goals ?? []).some((g) => g.phase === 'active') || (loops ?? []).length > 0
  const stopAll = () => {
    if (window.confirm(t('run.stopAllConfirm'))) void act({ op: 'stop-all' })
  }
  return (
    <PageShell
      title={t('run.title')}
      subtitle={t('run.subtitle')}
      actions={
        <Button
          size="sm"
          disabled={!running}
          onClick={stopAll}
          style={{ border: '1px solid var(--a-danger)', color: 'var(--a-danger)', fontWeight: 600 }}
        >
          {t('run.stopAll')}
        </Button>
      }
    >
      {error && (
        <div style={{ color: 'var(--a-danger)', fontSize: 13, marginBottom: 10 }} role="alert">
          {error}
        </div>
      )}
      <div className="ap-cols">
        <Col grow={1.2} basis={460}>
          <div className="ap-cap">{t('run.goal')}</div>
          {goals && !goals.length && (
            <Box>
              <span className="a-muted" style={{ fontSize: 13 }}>
                {t('run.noGoal')}
              </span>
            </Box>
          )}
          {goals?.map((g) => {
            const v = g.verdicts.at(-1)
            return (
              <Box key={g.sessionId} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {mascot(g.bot)}
                  <b style={{ flex: 1 }}>{g.objective}</b>
                  <Pill tone={PHASE_TONE[g.phase]}>{t(`run.phase.${g.phase}`)}</Pill>
                  <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                    {t('run.rounds', { n: g.rounds, max: g.max })}
                  </span>
                </div>
                <div className="ap-meter" style={{ margin: '10px 0' }}>
                  <span
                    style={{
                      width: `${g.phase === 'complete' ? 100 : Math.min(100, (g.rounds / Math.max(1, g.max)) * 100)}%`,
                      background: g.phase === 'complete' ? 'var(--a-ok)' : 'var(--a-accent)',
                    }}
                  />
                </div>
                {(g.contract || g.subgoals?.length) && (
                  <details style={{ fontSize: 12.5, marginBottom: 8 }}>
                    <summary className="a-muted" style={{ cursor: 'pointer' }}>
                      {g.contract
                        ? t('run.contractDone', { done: g.contract.done })
                        : t('run.subgoals', { n: g.subgoals!.length })}
                    </summary>
                    <div style={{ display: 'grid', gap: 2, marginTop: 4, paddingLeft: 14 }}>
                      {g.contract &&
                        (['proof', 'keep', 'scope', 'stop'] as const).map(
                          (k) =>
                            g.contract![k] && (
                              <div key={k}>
                                <span className="a-muted">{t(`run.contract.${k}`)}</span> {g.contract![k]}
                              </div>
                            ),
                        )}
                      {g.subgoals?.map((x, i) => (
                        <div key={i}>
                          <span className="a-muted">{t('run.subgoal', { n: i + 1 })}</span> {x}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                <div style={{ fontSize: 13 }}>
                  {v ? (
                    <>
                      <span className="a-muted">{t('run.judge', { at: clock(v.at) })}</span>{' '}
                      <b>{t(`run.verdict.${v.verdict}`)}</b> — {v.reason}
                      {v.missing && v.verdict !== 'done' && (
                        <div className="a-muted" style={{ marginTop: 2 }}>
                          {t('run.missing', { what: v.missing })}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="a-muted">{t('run.noJudge')}</span>
                  )}
                  {g.phase === 'blocked' && g.blocked && (
                    <div style={{ marginTop: 4, color: 'var(--a-warn)' }}>
                      {t('run.blocked', { why: g.blocked.message })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {g.phase === 'active' && (
                    <Button size="sm" onClick={() => void act({ op: 'goal-pause', session: g.sessionId })}>
                      {t('run.pause')}
                    </Button>
                  )}
                  {(g.phase === 'paused' || g.phase === 'blocked') && (
                    <Button size="sm" onClick={() => void act({ op: 'goal-resume', session: g.sessionId })}>
                      {t('run.resume')}
                    </Button>
                  )}
                  {g.phase !== 'complete' && (
                    <Button size="sm" onClick={() => void act({ op: 'goal-clear', session: g.sessionId })}>
                      {t('run.cancel')}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => nav.openSession(g.sessionId)}>
                    {t('run.open')}
                  </Button>
                </div>
              </Box>
            )
          })}
          <div className="ap-cap">{t('run.delegated')}</div>
          <Card>
            {delegated && !delegated.length && (
              <div className="ap-tr a-muted" style={{ fontSize: 13 }}>
                {t('run.noDelegated')}
              </div>
            )}
            {delegated?.map((d) => {
              const waiting = approvals.some(
                (a) => a.bot === d.bot && (!a.parentSession || a.parentSession === d.sessionId),
              )
              return (
                <div className="ap-tr" key={`${d.at}-${d.member}`}>
                  {mascot(d.bot)}
                  <a className="ap-link" style={{ flex: 1 }} onClick={() => nav.openSession(d.member)}>
                    {d.title}
                  </a>
                  {waiting && d.live ? (
                    <a
                      className="ap-link"
                      style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--a-warn)' }}
                      onClick={() => nav.go('approvals')}
                    >
                      {t('run.waiting')}
                    </a>
                  ) : d.outcome ? (
                    <span style={{ fontSize: 12, color: OUTCOME_COLOR[d.outcome] }}>
                      {t(`run.outcome.${d.outcome}`)}
                    </span>
                  ) : d.live ? (
                    <span className="ap-pulse" style={{ fontSize: 12, color: 'var(--a-accent)' }}>
                      {t('run.outcome.running')}
                    </span>
                  ) : (
                    <span className="a-muted" style={{ fontSize: 12 }}>
                      {t('run.outcome.unknown')}
                    </span>
                  )}
                  <span className="a-muted a-mono" style={{ fontSize: 12, width: 44, textAlign: 'right' }}>
                    {clock(d.at)}
                  </span>
                </div>
              )
            })}
          </Card>
        </Col>
        <Col basis={380}>
          <div className="ap-cap">{t('run.loops')}</div>
          <Card>
            {loops && !loops.length && (
              <div className="ap-tr a-muted" style={{ fontSize: 13 }}>
                {t('run.noLoops')}
              </div>
            )}
            {loops?.map((l) => (
              <div className="ap-tr" key={l.id}>
                {mascot(l.bot)}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <a className="ap-link" onClick={() => nav.openSession(l.sessionId)}>
                    {l.kind === 'heartbeat'
                      ? `${t('run.heartbeat')}${l.task ? `: “${l.task}”` : ''}`
                      : l.task}
                  </a>
                  <div className="a-muted" style={{ fontSize: 12 }}>
                    {l.mode === 'auto'
                      ? t('run.auto', { span: span(t, l.seconds) })
                      : t('run.every', { span: span(t, l.seconds) })}
                    {' · '}
                    {t('run.runs', { n: l.runs })}
                    {l.mode === 'auto' && l.same > 0 && ` · ${t('run.same', { n: l.same })}`}
                    {' · '}
                    {l.missing ? (
                      <span style={{ color: 'var(--a-warn)' }}>{t('run.lost')}</span>
                    ) : (
                      l.nextAt && <span className="a-mono">{t('run.nextAt', { at: clock(l.nextAt) })}</span>
                    )}
                  </div>
                </span>
                <Button size="sm" onClick={() => void act({ op: 'loop-stop', id: l.id })}>
                  {t('run.stop')}
                </Button>
              </div>
            ))}
          </Card>
          <div className="ap-cap">{t('run.checkpoints')}</div>
          <Checkpoints t={t} />
        </Col>
      </div>
    </PageShell>
  )
}

/** Điểm khôi phục (`@aris/checkpoints`). */
interface Point {
  id: string
  dir: string
  at: string
  bot: string
  tool: string
  detail: string
  restore?: boolean
  /** Số tệp lượt sau điểm đã đổi. */
  files: number
  paths: string[]
}

const tail = (dir: string) => `${dir.split('/').filter(Boolean).pop() ?? dir}/`

/** Điểm khôi phục: chụp trước khi bot sửa tệp; xem khác biệt, khôi phục (hỏi lại). */
function Checkpoints({ t }: { t: Translate }) {
  const team = useTeamData()
  const [points, setPoints] = useState<Point[] | null>(null)
  const [open, setOpen] = useState<{ id: string; stat: string; patch: string; truncated: boolean } | null>(
    null,
  )
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(async () => {
    const d = await getJson<{ points: Point[] }>('api/aris/checkpoints')
    if (d) setPoints(d.points)
  }, [])
  useEffect(() => {
    void load()
    // Mỗi lần đọc phải so thư mục bằng git: tải lại thưa.
    const timer = setInterval(() => void load(), 60_000)
    return () => clearInterval(timer)
  }, [load])
  const nameOf = (id: string) => team?.bots.find((b) => b.id === id)?.name ?? id
  const toggleDiff = async (p: Point) => {
    if (open?.id === p.id) return setOpen(null)
    const d = await getJson<{ stat: string; patch: string; truncated: boolean }>(
      `api/aris/checkpoints?diff=${p.id}`,
    )
    if (d) setOpen({ id: p.id, ...d })
  }
  const restore = async (p: Point) => {
    if (!window.confirm(t('run.cp.confirm', { at: clock(p.at), dir: tail(p.dir) }))) return
    setNote(null)
    const r = await fetch(api('api/aris/checkpoints'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'restore', id: p.id }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string; count?: number } | null
    setNote(r?.ok ? t('run.cp.restored', { n: j?.count ?? 0 }) : (j?.error ?? 'HTTP error'))
    setOpen(null)
    await load()
  }
  return (
    <Card>
      {note && (
        <div className="ap-tr" role="status" style={{ fontSize: 13 }}>
          {note}
        </div>
      )}
      {points && !points.length && (
        <div className="ap-tr a-muted" style={{ fontSize: 13 }}>
          {t('run.cp.none')}
        </div>
      )}
      {points?.map((p) => (
        <div key={p.id}>
          <div className="ap-tr">
            <span className="a-mono a-muted" style={{ fontSize: 12 }}>
              {clock(p.at)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {p.restore
                ? t('run.cp.beforeRestore')
                : p.files
                  ? t('run.cp.before', { bot: nameOf(p.bot), n: p.files })
                  : t('run.cp.beforeNone', { bot: nameOf(p.bot) })}{' '}
              <span className="a-mono" style={{ fontSize: 12 }} title={p.dir}>
                {tail(p.dir)}
              </span>
              <div
                className="a-muted"
                style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={p.detail}
              >
                {p.paths.length ? p.paths.join(', ') : p.detail}
              </div>
            </span>
            {p.files > 0 && (
              <Button size="sm" onClick={() => void toggleDiff(p)}>
                {open?.id === p.id ? t('run.cp.hide') : t('run.diff')}
              </Button>
            )}
            {p.files > 0 && (
              <Button size="sm" onClick={() => void restore(p)}>
                {t('run.restore')}
              </Button>
            )}
          </div>
          {open?.id === p.id && (
            <pre
              className="a-mono"
              style={{
                margin: '0 14px 12px',
                maxHeight: 320,
                overflow: 'auto',
                fontSize: 11.5,
                background: 'var(--a-panel2)',
                borderRadius: 8,
                padding: 10,
                whiteSpace: 'pre-wrap',
              }}
            >
              {open.stat}
              {'\n'}
              {open.patch}
              {open.truncated ? `\n${t('run.cp.truncated')}` : ''}
            </pre>
          )}
        </div>
      ))}
    </Card>
  )
}
