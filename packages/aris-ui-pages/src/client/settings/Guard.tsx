/**
 * 6.4 · Ngân sách, duyệt, an toàn (giai đoạn 7, đợt 7a; bản vẽ `BaoMat.dc.html`): trần cả đội và trần riêng, báo
 * khi tới ngưỡng, dừng khẩn cấp, danh sách cấm cứng, chế độ và hạn duyệt, kho khoá trong Keychain. Dữ liệu từ
 * `/api/aris/guard` (`@aris/guard`, `@aris/keychain`).
 */
import { Button, Card, CardRow, PageShell, Pill, Segmented, Tag } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Col } from '../ui.js'

interface Settings {
  teamCapUsd: number
  warnPct: number
  capMode: 'bg' | 'all'
  mode: 'ask' | 'auto'
  approvalMin: number
  stopped: boolean
  stoppedAt?: string
}
interface State {
  settings: Settings
  spent: number
  level: 'nguong' | 'tran' | null
  departments: { id: string; name: string; spent: number; cap: number | null; onBudget: 'stop' | 'warn' }[]
  media: { image: number; video: number }
  blocked: { id: string; at: string; bot: string; tool: string; what: string }[]
  blockedCount: number
  waiting: number
  keys: { name: string; where: 'keychain' | 'file' }[]
  stopped?: { sessions: number; apps: number }
  moved?: number
}

const endpoint = () => new URL('api/aris/guard', document.baseURI)
const money = (n: number) => n.toFixed(2).replace('.', ',')
const when = (iso: string) => {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())} ${two(d.getDate())}/${two(d.getMonth() + 1)}`
}
/** Trần riêng cố định của các việc nền (USD mỗi ngày), theo mã nguồn của từng gói. */
const FIXED_CAPS = [
  ['guard.cap.librarian', 0.5],
  ['guard.cap.reflect', 0.3],
  ['guard.cap.profile', 0.2],
  ['guard.cap.soat', 0.3],
] as const
const DENY = ['outside', 'push', 'sudo', 'secrets', 'aris', 'self'] as const

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onSave,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onSave: (v: number) => void
}) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Number(v.replace(',', '.'))
    if (Number.isFinite(n) && n >= min && n <= max && n !== value) onSave(n)
    else setV(String(value))
  }
  return (
    <input
      className="ap-gdnum"
      aria-label={label}
      inputMode="decimal"
      value={v}
      step={step}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Bar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0
  return (
    <span className="ap-gdbar" aria-hidden="true">
      <span style={{ width: `${pct}%` }} className={pct >= 80 ? 'warn' : ''} />
    </span>
  )
}

export function Guard({ t, nav }: PageProps) {
  const [s, setS] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setS((await r.json()) as State)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [load])
  const post = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (State & { error?: string }) | null
    setBusy(false)
    if (!r?.ok || !j) return setError(j?.error ?? 'HTTP error')
    setS(j)
  }
  const set = (patch: Partial<Settings>) => void post({ op: 'set', settings: patch })

  if (!s)
    return (
      <PageShell title={t('sec.guard')}>
        <div className="a-muted">{t('guard.loading')}</div>
      </PageShell>
    )
  const g = s.settings
  const fileKeys = s.keys.filter((k) => k.where === 'file').length
  const pct = g.teamCapUsd > 0 ? Math.round((s.spent / g.teamCapUsd) * 100) : 0

  return (
    <PageShell
      title={t('sec.guard')}
      subtitle={t('guard.subtitle')}
      actions={
        <>
          <Pill tone={g.stopped ? 'danger' : 'ok'}>
            {g.stopped ? t('guard.stoppedPill') : t('guard.runningPill')}
          </Pill>
          {g.stopped ? (
            <Button size="sm" disabled={busy} onClick={() => void post({ op: 'resume' })}>
              {t('guard.resume')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('guard.stopConfirm'))) void post({ op: 'stop' })
              }}
            >
              {t('guard.stop')}
            </Button>
          )}
        </>
      }
    >
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      {g.stopped && (
        <div className="ap-intalert" role="status">
          <span className="grow">
            <b>{t('guard.stoppedHead', { time: g.stoppedAt ? when(g.stoppedAt) : '' })}</b>{' '}
            {t('guard.stoppedBody')}
          </span>
          <Button size="sm" disabled={busy} onClick={() => void post({ op: 'resume' })}>
            {t('guard.resume')}
          </Button>
        </div>
      )}
      {!g.stopped && s.level && (
        <div className="ap-gdwarn" role="status">
          <b>{t(s.level === 'tran' ? 'guard.atCap' : 'guard.nearCap', { pct })}</b>{' '}
          {t('guard.spentOf', { spent: money(s.spent), cap: money(g.teamCapUsd) })}
        </div>
      )}

      <div className="ap-cols">
        <Col basis={430}>
          <Card
            title={
              <>
                {t('guard.today')} <span className="a-muted ap-inthint">{t('guard.todayHint')}</span>
              </>
            }
          >
            <CardRow>
              <span className="ap-gdbig">{money(s.spent)}</span>
              <span className="a-muted">{t('guard.ofTeam', { cap: money(g.teamCapUsd) })}</span>
              <Bar used={s.spent} max={g.teamCapUsd} />
            </CardRow>
            <CardRow>
              <span className="grow">{t('guard.teamCap')}</span>
              <NumberField
                label={t('guard.teamCap')}
                value={g.teamCapUsd}
                min={0}
                max={1000}
                step={0.5}
                onSave={(v) => set({ teamCapUsd: v })}
              />
              <span className="a-muted">USD</span>
            </CardRow>
            <CardRow>
              <span className="grow">{t('guard.warnAt')}</span>
              <NumberField
                label={t('guard.warnAt')}
                value={g.warnPct}
                min={1}
                max={100}
                step={5}
                onSave={(v) => set({ warnPct: v })}
              />
              <span className="a-muted">%</span>
            </CardRow>
            <CardRow>
              <span className="grow">{t('guard.whenCap')}</span>
              <Segmented
                label={t('guard.whenCap')}
                value={g.capMode}
                onChange={(v) => set({ capMode: v })}
                options={[
                  { value: 'bg', label: t('guard.capBg') },
                  { value: 'all', label: t('guard.capAll') },
                ]}
              />
            </CardRow>
            <CardRow>
              <span className="a-muted" style={{ fontSize: 12.5 }}>
                {t('guard.ownCaps')}
              </span>
            </CardRow>
            {s.departments
              .filter((d) => d.cap !== null)
              .map((d) => (
                <CardRow key={d.id}>
                  <span className="grow">{t('guard.dept', { name: d.name })}</span>
                  <Bar used={d.spent} max={d.cap ?? 0} />
                  <span className="a-muted ap-gdfig">
                    {money(d.spent)} / {money(d.cap ?? 0)}
                  </span>
                </CardRow>
              ))}
            <CardRow>
              <span className="grow">{t('guard.media')}</span>
              <span className="a-muted ap-gdfig">{money(s.media.image + s.media.video)}</span>
              <Button size="sm" onClick={() => nav.go('settings', { section: 'media' })}>
                {t('guard.edit')}
              </Button>
            </CardRow>
            {FIXED_CAPS.map(([k, cap]) => (
              <CardRow key={k}>
                <span className="grow">{t(k)}</span>
                <span className="a-muted ap-gdfig">{t('guard.perDay', { cap: money(cap) })}</span>
              </CardRow>
            ))}
            <CardRow>
              <span className="a-muted" style={{ fontSize: 12.5 }}>
                {t('guard.capNote')}
              </span>
            </CardRow>
          </Card>

          <Card title={t('guard.learning')}>
            {(['guard.memoryApproval', 'guard.skillApproval', 'guard.webNever'] as const).map((k) => (
              <CardRow key={k}>
                <span className="grow">{t(k)}</span>
                <span className="a-muted">{t('guard.always')}</span>
              </CardRow>
            ))}
          </Card>
        </Col>

        <Col basis={440}>
          <Card
            title={
              <span className="ap-intwhat">
                <b>{t('guard.denyTitle')}</b>
                <span className="a-muted">{t('guard.denyHint')}</span>
              </span>
            }
            actions={<Pill tone="ok">{t('guard.alwaysOn')}</Pill>}
          >
            <CardRow>
              <span className="ap-tags grow">
                {DENY.map((k) => (
                  <Tag key={k} mono={k === 'push' || k === 'sudo'}>
                    {t(`guard.deny.${k}`)}
                  </Tag>
                ))}
              </span>
            </CardRow>
            <CardRow>
              <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                {s.blocked[0]
                  ? t('guard.blockedLast', {
                      n: s.blockedCount,
                      bot: s.blocked[0].bot || '—',
                      what: s.blocked[0].what,
                      at: when(s.blocked[0].at),
                    })
                  : t('guard.blockedNone')}
              </span>
            </CardRow>
          </Card>

          <Card
            title={t('guard.approvals')}
            actions={
              <Segmented
                label={t('guard.approvals')}
                value={g.mode}
                onChange={(v) => set({ mode: v })}
                options={[
                  { value: 'ask', label: t('guard.ask') },
                  { value: 'auto', label: t('guard.autoLow') },
                ]}
              />
            }
          >
            <CardRow>
              <span className="a-muted" style={{ fontSize: 13 }}>
                {t(g.mode === 'ask' ? 'guard.askText' : 'guard.autoText')}
              </span>
            </CardRow>
            <CardRow>
              <span className="grow">{t('guard.timeout')}</span>
              <NumberField
                label={t('guard.timeout')}
                value={g.approvalMin}
                min={0}
                max={1440}
                step={5}
                onSave={(v) => set({ approvalMin: v })}
              />
              <span className="a-muted">{t('guard.timeoutUnit')}</span>
            </CardRow>
            <CardRow>
              <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                {t('guard.waiting', { n: s.waiting })}
              </span>
              <Button size="sm" onClick={() => nav.go('approvals')}>
                {t('guard.inbox')}
              </Button>
            </CardRow>
          </Card>

          <Card
            title={
              <>
                {t('guard.vault')} <span className="a-muted ap-inthint">{t('guard.keychain')}</span>
              </>
            }
            actions={
              <Pill tone={fileKeys ? 'warn' : 'ok'}>
                {fileKeys ? t('guard.inFile', { n: fileKeys }) : t('guard.allKeychain')}
              </Pill>
            }
          >
            {s.keys.map((k) => (
              <CardRow key={k.name}>
                <span className="grow mono ap-gdkey">{k.name}</span>
                <Pill tone={k.where === 'keychain' ? 'ok' : 'warn'}>
                  {k.where === 'keychain' ? 'Keychain' : t('guard.file')}
                </Pill>
              </CardRow>
            ))}
            <CardRow>
              <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                {s.moved !== undefined ? t('guard.moved', { n: s.moved }) : t('guard.vaultNote')}
              </span>
              {fileKeys > 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('guard.moveConfirm', { n: fileKeys })))
                      void post({ op: 'keys-move' })
                  }}
                >
                  {t('guard.moveAll')}
                </Button>
              )}
            </CardRow>
          </Card>

          <Card>
            <CardRow>
              <b className="grow">{t('guard.network')}</b>
              <span className="a-muted">{t('guard.networkLater')}</span>
            </CardRow>
          </Card>
        </Col>
      </div>
    </PageShell>
  )
}
