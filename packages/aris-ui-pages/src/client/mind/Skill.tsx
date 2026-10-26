/**
 * 3.3 · Chi tiết skill (giai đoạn 3, đợt 3): bản đề xuất so với bản đang dùng (từng dòng thêm/bớt),
 * lý do và lối mở đoạn chat, cảnh báo của bộ kiểm; Từ chối / Sửa rồi bật / Duyệt và bật; lịch sử các
 * bản với khôi phục. Chỉ số kiểm thử và ca thử chạy lại phiên cũ là đợt 4 (để mờ).
 */
import {
  Button,
  Card,
  Checkbox,
  IconButton,
  Mascot,
  PageShell,
  Pill,
  Switch,
  useTeamData,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Box, Col } from '../ui.js'
import { dayOf } from './Skills.js'
import {
  isTeamSkill,
  shortSha,
  sourceLabel,
  sourceUrl,
  toggleAssigned,
  type Assigned,
  type SkillSource,
} from './skill-team.js'

interface Version {
  id: string
  skill: string
  version: number
  body: string
  status: 'proposed' | 'active' | 'superseded' | 'rejected'
  by: 'reflect' | 'user' | 'restore' | 'import'
  /** Nơi nhập từ đâu, dấu hiệu nguy hiểm, tệp kèm (skill nhập từ ngoài). */
  source?: SkillSource
  risks?: string[]
  files?: string[]
  why?: string
  quote?: string
  sessionId?: string
  from?: number
  warnings: string[]
  at: string
}

interface Run {
  steps: number
  tokens: number
  answer: string
  denied: number
  pass?: boolean
  note?: string
  error?: string
}

/** Lần kiểm thử gần nhất (`@aris/skills`, đợt 4). */
interface Eval {
  version: number
  base: number
  status: 'running' | 'done' | 'failed' | 'stopped'
  cases: { request: string; base?: Run; cand?: Run }[]
  usd: number
  cap: number
  note?: string
  summary: {
    cases: number
    pass: { cand: number; base: number }
    steps: { base: number; cand: number; pct: number }
    tokens: { base: number; cand: number; pct: number }
  }
}

interface Detail {
  skill: {
    id: string
    bot: string
    name: string
    description: string
    status: 'draft' | 'active' | 'archived' | 'rejected'
    version: number
    uses: number
    pinned?: boolean
    stale?: boolean
    idleDays?: number
    cases?: { request: string }[]
    assigned?: Assigned
    usesBy?: Record<string, number>
  }
  eval: Eval | null
  versions: Version[]
  proposed:
    | (Version & {
        base: number
        stat: { add: number; del: number }
        diff: { kind: ' ' | '+' | '-'; text: string }[]
      })
    | null
}

const post = async (body: unknown) => {
  const res = await fetch(new URL('api/aris/skills', document.baseURI), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as {
    error?: string
    skill?: { id: string }
    state?: string
  }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out
}

export function Skill({ t, nav, params }: PageProps) {
  const team = useTeamData()
  const id = params.id ?? ''
  const [d, setD] = useState<Detail | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(new URL(`api/aris/skills?id=${encodeURIComponent(id)}`, document.baseURI), {
      credentials: 'same-origin',
    }).catch(() => null)
    setD(res?.ok ? ((await res.json()) as Detail) : null)
  }, [id])
  useEffect(() => void load(), [load])
  // Đang kiểm thử: đọc lại mỗi 4 giây cho tới khi xong.
  useEffect(() => {
    if (d?.eval?.status !== 'running') return
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [d?.eval?.status, load])
  const isTeam = !!d && isTeamSkill(d.skill)
  const bot = team?.bots.find((b) => b.id === d?.skill.bot)
  const botName = isTeam ? t('ski.teamLib') : (bot?.name ?? d?.skill.bot ?? '')
  const members = (team?.bots ?? []).filter((b) => !b.external)
  const p = d?.proposed
  const current = d?.versions.find((v) => v.status === 'active')
  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const out = await post(body)
      setEditing(false)
      // Chia sẻ hay trả về làm đổi mã skill: mở lại ở mã mới.
      if ((body.op === 'share' || body.op === 'unshare') && out.skill?.id)
        nav.go('skill', { id: out.skill.id })
      else if (body.op === 'import-check')
        setInfo(
          t(
            out.state === 'proposed'
              ? 'ski.newProposed'
              : out.state === 'unchanged'
                ? 'ski.sameContent'
                : 'ski.noNew',
          ),
        )
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const back = (
    <IconButton label={t('skd.back')} onClick={() => nav.go('skills')}>
      ‹
    </IconButton>
  )
  if (d === null)
    return (
      <PageShell
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            {back}
            {id}
          </span>
        }
      >
        <div className="a-muted">{t('skd.missing')}</div>
      </PageShell>
    )
  if (!d) return null
  const shownBody = p ? null : (current?.body ?? '')
  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          {back}
          <span className="a-mono">{d.skill.name}</span>
        </span>
      }
      subtitle={
        p
          ? t(p.base ? 'skd.subPatch' : 'skd.subNew', { name: botName, v: p.version })
          : t(d.skill.status === 'archived' ? 'skd.subArchived' : 'skd.subActive', {
              name: botName,
              v: d.skill.version,
              n: d.skill.uses,
            })
      }
      actions={
        p ? (
          <>
            <Button disabled={busy} onClick={() => void act({ op: 'reject', id: p.id })}>
              {t('skd.reject')}
            </Button>
            {editing ? (
              <Button disabled={busy} onClick={() => void act({ op: 'approve', id: p.id, body })}>
                {t('skd.saveEnable', { v: `v${p.version}` })}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => (setBody(p.body), setEditing(true))}>
                {t('skd.editEnable')}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={busy || editing}
              onClick={() => void act({ op: 'approve', id: p.id })}
            >
              {t('skd.approve', { v: `v${p.version}` })}
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={busy}
              onClick={() => void act({ op: 'pin', skill: d.skill.id, on: !d.skill.pinned })}
            >
              {d.skill.pinned ? t('skd.unpin') : t('skd.pin')}
            </Button>
            {(current?.source ?? d.versions.find((v) => v.source)?.source)?.kind === 'github' && (
              <Button disabled={busy} onClick={() => void act({ op: 'import-check', skill: d.skill.id })}>
                {t('ski.checkNew')}
              </Button>
            )}
            {isTeam
              ? Array.isArray(d.skill.assigned) &&
                d.skill.assigned.length === 1 && (
                  <Button disabled={busy} onClick={() => void act({ op: 'unshare', skill: d.skill.id })}>
                    {t('ski.unshare')}
                  </Button>
                )
              : d.skill.status === 'active' && (
                  <Button disabled={busy} onClick={() => void act({ op: 'share', skill: d.skill.id })}>
                    {t('ski.share')}
                  </Button>
                )}
            {d.skill.status === 'archived' ? (
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void act({ op: 'unarchive', skill: d.skill.id })}
              >
                {t('skd.unarchive')}
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => void act({ op: 'archive', skill: d.skill.id })}>
                {t('skd.archive')}
              </Button>
            )}
          </>
        )
      }
    >
      {error && <div className="ap-error">{error}</div>}
      {info && <div className="ap-hint ap-hint-ok">{info}</div>}
      <div className="ap-cols">
        <Col grow={1.3} basis={480}>
          <section className="a-card" style={{ overflow: 'hidden' }}>
            <div
              style={{
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--a-line)',
              }}
            >
              <b>
                {p
                  ? p.base
                    ? t('skd.changesFrom', { a: p.base, b: p.version })
                    : t('skd.newSkill', { v: p.version })
                  : t('skd.current', { v: d.skill.version })}
              </b>
              {p && (
                <span className="a-mono a-muted" style={{ fontSize: 12 }}>
                  SKILL.md · +{p.stat.add} −{p.stat.del}
                </span>
              )}
            </div>
            {editing ? (
              <textarea
                className="ap-soul a-mono"
                aria-label={t('skd.editEnable')}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                style={{ border: 0, borderRadius: 0, minHeight: 320, width: '100%' }}
              />
            ) : (
              <div style={{ padding: '8px 0' }}>
                {(p
                  ? p.diff
                  : (shownBody ?? '').split('\n').map((text) => ({ kind: ' ' as const, text }))
                ).map((l, i) => (
                  <div key={i} className="ap-dl" data-kind={l.kind === ' ' ? undefined : l.kind}>
                    {l.kind === ' ' ? l.text || ' ' : `${l.kind === '+' ? '+' : '−'} ${l.text}`}
                  </div>
                ))}
              </div>
            )}
            {p?.why && (
              <div
                className="a-muted"
                style={{ padding: '10px 14px', borderTop: '1px solid var(--a-line)', fontSize: 13 }}
              >
                {t('skd.why', { why: p.why })}
                {p.sessionId && (
                  <>
                    {' '}
                    <a className="ap-link" onClick={() => nav.openSession(p.sessionId!)}>
                      {t('mem.openChat')}
                    </a>
                  </>
                )}
              </div>
            )}
            {p && p.warnings.length > 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  borderTop: '1px solid var(--a-line)',
                  fontSize: 13,
                  color: 'var(--a-warn)',
                }}
              >
                <b>{t('ap.skillLint')}:</b> {p.warnings.join(' ')}
              </div>
            )}
            {p && (p.risks?.length ?? 0) > 0 && (
              <div
                style={{
                  padding: '10px 14px',
                  borderTop: '1px solid var(--a-line)',
                  fontSize: 13,
                  color: 'var(--a-danger)',
                }}
              >
                <b>{t('ski.risksTitle')}:</b>
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {p.risks!.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </Col>
        <Col basis={380}>
          {isTeam && (
            <Box style={{ padding: 0 }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <b>
                  {t('ski.botsTitle', {
                    n: d.skill.assigned === 'all' ? members.length : (d.skill.assigned?.length ?? 0),
                  })}
                </b>
                <span style={{ marginLeft: 'auto' }}>
                  <Checkbox
                    checked={d.skill.assigned === 'all'}
                    onChange={(on) => void act({ op: 'assign', skill: d.skill.id, bots: on ? 'all' : [] })}
                    label={t('conn.scopeAll')}
                  />
                </span>
              </div>
              {members.map((b) => {
                const on = d.skill.assigned === 'all' || (d.skill.assigned ?? []).includes(b.id)
                const uses = d.skill.usesBy?.[b.id] ?? 0
                return (
                  <div className="a-row" key={b.id} style={{ alignItems: 'center' }}>
                    <Mascot id={b.mascot} accessory={b.accessory} size={26} />
                    <span style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                      <b>{b.name}</b>
                      <span className="a-muted" style={{ fontSize: 12.5 }}>
                        {on ? t('ski.usesBy', { n: uses }) : t('ski.notAssigned')}
                      </span>
                    </span>
                    <Switch
                      checked={on}
                      label={t(on ? 'ski.unassignFor' : 'ski.assignFor', { name: d.skill.name, bot: b.name })}
                      onChange={(next) =>
                        void act({
                          op: 'assign',
                          skill: d.skill.id,
                          bots: toggleAssigned(
                            d.skill.assigned,
                            b.id,
                            next,
                            members.map((m) => m.id),
                          ),
                        })
                      }
                    />
                  </div>
                )
              })}
            </Box>
          )}
          {(() => {
            const src = (p ?? current)?.source ?? d.versions.find((v) => v.source)?.source
            if (!src) return null
            const link = sourceUrl(src)
            const files = (p ?? current)?.files ?? []
            return (
              <Box style={{ padding: '10px 14px', fontSize: 13 }}>
                <b>{t('ski.source')}</b>
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>
                    <Pill tone="accent">{sourceLabel(src)}</Pill>{' '}
                    {src.sha &&
                      (link ? (
                        <a className="ap-link a-mono" href={link} target="_blank" rel="noreferrer">
                          {shortSha(src.sha)}
                        </a>
                      ) : (
                        <span className="a-mono">{shortSha(src.sha)}</span>
                      ))}
                  </span>
                  <span className="a-muted a-mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    {src.path}
                  </span>
                  {files.length > 0 && (
                    <span className="a-muted">{t('ski.filesCount', { n: files.length })}</span>
                  )}
                </div>
              </Box>
            )
          })()}
          <EvalPanel t={t} d={d} busy={busy} onRun={() => void act({ op: 'eval', skill: d.skill.id })} />
          <Box style={{ padding: '10px 14px', fontSize: 13 }}>
            <b>{t('skd.history')}</b>
            <div
              className="a-muted"
              style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {d.versions.map((v) => (
                <span key={v.id}>
                  v{v.version} · {dayOf(v.at) || t('sk.today')} · {t(`skd.st.${v.status}`)}
                  {v.by === 'restore' && v.from ? ` · ${t('skd.restoredFrom', { v: v.from })}` : ''}
                  {v.why ? ` · ${v.why}` : ''}
                  {v.status === 'superseded' && (
                    <>
                      {' · '}
                      <a
                        className="ap-link"
                        onClick={() => void act({ op: 'restore', skill: d.skill.id, version: v.version })}
                      >
                        {t('skd.restore')}
                      </a>
                    </>
                  )}
                </span>
              ))}
            </div>
          </Box>
        </Col>
      </div>
    </PageShell>
  )
}

const signed = (n: number) => (n > 0 ? `+${n}%` : `${n}%`)

/** Kiểm thử bằng chạy lại: số liệu, bảng ca thử, nút chạy (trần 5 ca, 0,20 USD). */
function EvalPanel({
  t,
  d,
  busy,
  onRun,
}: {
  t: PageProps['t']
  d: Detail
  busy: boolean
  onRun: () => void
}) {
  const e = d.eval
  const s = e?.summary
  const running = e?.status === 'running'
  const vb = (n: number) => (n ? `v${n}` : t('skd.noSkill'))
  const cell = (r?: Run) =>
    !r ? (
      <span className="a-muted">{running ? '…' : '—'}</span>
    ) : r.error ? (
      <span style={{ color: 'var(--a-danger)' }} title={r.error}>
        {t('skd.runError')}
      </span>
    ) : (
      <span style={{ color: r.pass ? 'var(--a-ok)' : 'var(--a-danger)' }} title={r.note}>
        {r.pass ? t('skd.pass') : t('skd.fail')}
      </span>
    )
  return (
    <>
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          textAlign: 'center',
        }}
      >
        <div>
          <div className="ap-k">{t('skd.metric.pass')}</div>
          <div
            className="ap-v"
            style={s && s.pass.cand >= s.pass.base && s.cases ? { color: 'var(--a-ok)' } : undefined}
          >
            {s?.cases ? `${s.pass.cand}/${s.cases}` : '—'}
          </div>
          <div className="ap-k">{s?.cases ? `${vb(e!.base)}: ${s.pass.base}/${s.cases}` : ' '}</div>
        </div>
        <div>
          <div className="ap-k">{t('skd.metric.steps')}</div>
          <div className="ap-v" style={s && s.steps.pct < 0 ? { color: 'var(--a-ok)' } : undefined}>
            {s?.cases ? signed(s.steps.pct) : '—'}
          </div>
          <div className="ap-k">
            {s?.cases
              ? `${s.steps.base.toFixed(1).replace('.', ',')} → ${s.steps.cand.toFixed(1).replace('.', ',')}`
              : ' '}
          </div>
        </div>
        <div>
          <div className="ap-k">{t('skd.metric.tokens')}</div>
          <div className="ap-v" style={s && s.tokens.pct < 0 ? { color: 'var(--a-ok)' } : undefined}>
            {s?.cases ? signed(s.tokens.pct) : '—'}
          </div>
          <div className="ap-k">{t('skd.perRun')}</div>
        </div>
      </Box>
      <Card
        title={t('skd.cases')}
        actions={
          <Button size="sm" disabled={busy || running || !(d.skill.cases ?? []).length} onClick={onRun}>
            {running ? t('skd.running') : t('skd.run')}
          </Button>
        }
      >
        {e && (
          <div className="ap-er a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
            <span>{t('skd.case')}</span>
            <span>{vb(e.base)}</span>
            <span>{vb(e.version)}</span>
            <span>{t('skd.metric.steps')}</span>
          </div>
        )}
        {e?.cases.map((c, i) => (
          <div className="ap-er" key={i}>
            <span className="ap-li-sub" title={c.request} style={{ color: 'var(--a-ink)' }}>
              {c.request}
            </span>
            {cell(c.base)}
            {cell(c.cand)}
            <span>{c.cand && !c.cand.error ? c.cand.steps : '—'}</span>
          </div>
        ))}
        <div
          className="a-muted"
          style={{ fontSize: 12.5, padding: '10px 14px', borderTop: '1px solid var(--a-line)' }}
        >
          {e
            ? t('skd.evalNote', {
                usd: e.usd.toFixed(3).replace('.', ','),
                cap: e.cap.toFixed(2).replace('.', ','),
              }) + (e.note ? ` · ${e.note}` : '')
            : (d.skill.cases ?? []).length
              ? t('skd.evalHint', { n: Math.min(5, (d.skill.cases ?? []).length) })
              : t('skd.noCases')}
        </div>
      </Card>
    </>
  )
}
