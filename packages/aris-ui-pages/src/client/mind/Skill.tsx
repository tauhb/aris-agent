/**
 * 3.3 · Chi tiết skill (giai đoạn 3, đợt 3): bản đề xuất so với bản đang dùng (từng dòng thêm/bớt),
 * lý do và lối mở đoạn chat, cảnh báo của bộ kiểm; Từ chối / Sửa rồi bật / Duyệt và bật; lịch sử các
 * bản với khôi phục. Chỉ số kiểm thử và ca thử chạy lại phiên cũ là đợt 4 (để mờ).
 */
import { Button, Card, IconButton, PageShell, useTeamData } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'
import { Box, Col } from '../ui.js'
import { dayOf } from './Skills.js'

interface Version {
  id: string
  skill: string
  version: number
  body: string
  status: 'proposed' | 'active' | 'superseded' | 'rejected'
  by: 'reflect' | 'user' | 'restore'
  why?: string
  quote?: string
  sessionId?: string
  from?: number
  warnings: string[]
  at: string
}

interface Detail {
  skill: { id: string; bot: string; name: string; description: string; version: number; uses: number }
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
  const out = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
}

export function Skill({ t, nav, params }: PageProps) {
  const team = useTeamData()
  const id = params.id ?? ''
  const [d, setD] = useState<Detail | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(new URL(`api/aris/skills?id=${encodeURIComponent(id)}`, document.baseURI), {
      credentials: 'same-origin',
    }).catch(() => null)
    setD(res?.ok ? ((await res.json()) as Detail) : null)
  }, [id])
  useEffect(() => void load(), [load])
  const bot = team?.bots.find((b) => b.id === d?.skill.bot)
  const p = d?.proposed
  const current = d?.versions.find((v) => v.status === 'active')
  async function act(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await post(body)
      setEditing(false)
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
          ? t(p.base ? 'skd.subPatch' : 'skd.subNew', { name: bot?.name ?? d.skill.bot, v: p.version })
          : t('skd.subActive', { name: bot?.name ?? d.skill.bot, v: d.skill.version, n: d.skill.uses })
      }
      actions={
        p && (
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
        )
      }
    >
      {error && <div className="ap-error">{error}</div>}
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
          </section>
        </Col>
        <Col basis={380}>
          <Later t={t} stage={3} label={t('sk.later')}>
            <Box
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 10,
                textAlign: 'center',
              }}
            >
              {(['pass', 'steps', 'tokens'] as const).map((m) => (
                <div key={m}>
                  <div className="ap-k">{t(`skd.metric.${m}`)}</div>
                  <div className="ap-v">—</div>
                </div>
              ))}
            </Box>
            <Card
              title={t('skd.cases')}
              actions={
                <span className="a-muted" style={{ fontSize: 12 }}>
                  {t('skd.sandbox')}
                </span>
              }
            >
              <div
                className="a-muted"
                style={{ fontSize: 12.5, padding: '10px 14px', borderTop: '1px solid var(--a-line)' }}
              >
                {t('skd.casesLater')}
              </div>
            </Card>
          </Later>
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
