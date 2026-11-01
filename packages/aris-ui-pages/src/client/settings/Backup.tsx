/**
 * 6.4b · Sao lưu (giai đoạn 7, đợt 7b; bản vẽ `SaoLuu.dc.html`): bật lần đầu ba bước (thư mục, mã khôi phục, bản
 * đầu tiên), lịch và số bản giữ, các phần được sao lưu, các bản đã có, diễn tập khôi phục, lệnh khôi phục đè, đổi
 * mã. Dữ liệu từ `/api/aris/backup` (`@aris/backup`).
 */
import { Button, Card, CardRow, Checkbox, PageShell, Pill, Tag, TextInput } from '@aris/ui-kit/react'
import { CheckIcon, CloseIcon } from '@aris/ui-kit/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { Col } from '../ui.js'

interface Settings {
  enabled: boolean
  dir: string
  time: string
  keepDaily: number
  keepWeekly: number
  notify: boolean
  codeId?: string
  codeSetAt?: string
}
type StepId = 'giai-ma' | 'giai-nen' | 'kho' | 'bo-nao' | 'khop'
interface Run {
  kind: 'backup' | 'drill'
  at: string
  ok: boolean
  file?: string
  bytes?: number
  files?: number
  ms: number
  error?: string
  steps?: { id: StepId; ok: boolean; n?: number; of?: number; error?: string }[]
}
interface State {
  settings: Settings
  hasPending: boolean
  busy: 'backup' | 'drill' | 'extract' | null
  dirError: string | null
  free: number | null
  parts: { id: string; files: number; bytes: number }[]
  copies: {
    name: string
    at: string
    bytes: number
    kind: 'ngay' | 'tuan' | null
    drilled: boolean
    oldCode: boolean
  }[]
  last: Run | null
  lastOk: Run | null
  drill: Run | null
  repo: string | null
  code?: string
  picked?: string | null
  extracted?: string | null
}

const endpoint = () => new URL('api/aris/backup', document.baseURI)
const PARTS = ['dsh', 'brain', 'workspace', 'projects', 'aris'] as const
const NOT_INCLUDED = ['keys', 'plugins', 'index', 'logs'] as const

const two = (n: number) => String(n).padStart(2, '0')
/** Cỡ tệp: KB dưới 1 MB, MB một số lẻ, GB khi lớn. */
const size = (b: number) =>
  (b < 1e6
    ? `${b > 0 ? Math.max(1, Math.round(b / 1e3)) : 0} KB`
    : b < 1e9
      ? `${(b / 1e6).toFixed(1)} MB`
      : `${(b / 1e9).toFixed(0)} GB`
  ).replace('.', ',')

function NumberField({
  label,
  value,
  min,
  max,
  onSave,
}: {
  label: string
  value: number
  min: number
  max: number
  onSave: (v: number) => void
}) {
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    const n = Number(v)
    if (Number.isInteger(n) && n >= min && n <= max && n !== value) onSave(n)
    else setV(String(value))
  }
  return (
    <input
      className="ap-gdnum"
      aria-label={label}
      inputMode="numeric"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function Backup({ t }: PageProps) {
  const [s, setS] = useState<State | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dir, setDir] = useState('')
  const asked = useRef(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setS((await r.json()) as State)
  }, [])
  const post = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (State & { error?: string }) | null
    setBusy(false)
    if (!r?.ok || !j) {
      setError(j?.error ?? 'HTTP error')
      return null
    }
    setS(j)
    return j
  }, [])
  const working = !!s?.busy
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), working ? 3_000 : 15_000)
    return () => clearInterval(timer)
  }, [load, working])
  useEffect(() => setDir(s?.settings.dir ?? ''), [s?.settings.dir])
  // Bật lần đầu: tạo mã khôi phục (đã có mã chờ thì lấy lại mã đó).
  const setup = !!s && !s.settings.enabled
  useEffect(() => {
    if (!setup || asked.current) return
    asked.current = true
    void post({ op: 'code-new' }).then((j) => j?.code && setCode(j.code))
  }, [setup, post])

  if (!s)
    return (
      <PageShell title={t('sec.backup')}>
        <div className="a-muted">{t('bk.loading')}</div>
      </PageShell>
    )
  const g = s.settings

  const when = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
    const time = `${two(d.getHours())}:${two(d.getMinutes())}`
    if (same(d, today)) return t('bk.today', { time })
    if (same(d, y)) return t('bk.yesterday', { time })
    return t('bk.onDay', {
      wd: t(`bk.wd.${d.getDay()}`),
      date: `${two(d.getDate())}/${two(d.getMonth() + 1)}`,
      time,
    })
  }
  const failed = !!s.last && !s.last.ok
  const pill = s.busy ? (
    <Pill tone="accent">{t(`bk.busy.${s.busy}`)}</Pill>
  ) : setup ? (
    <Pill tone="muted">{t('bk.off')}</Pill>
  ) : failed ? (
    <Pill tone="danger">{t('bk.lastFailed')}</Pill>
  ) : s.copies[0] ? (
    <Pill tone="ok">{t('bk.latest', { when: when(s.copies[0].at) })}</Pill>
  ) : (
    <Pill tone="muted">{t('bk.none')}</Pill>
  )
  const copyCode = () => code && void navigator.clipboard?.writeText(code).then(() => setNote(t('bk.copied')))
  const saveDir = () => {
    if (dir.trim() && dir.trim() !== g.dir) void post({ op: 'set-dir', dir: dir.trim() })
  }
  const pickDir = () => void post({ op: 'pick-dir' })
  const total = s.copies.reduce((n, c) => n + c.bytes, 0)
  const latest = s.copies[0]
  const drill = s.drill

  return (
    <PageShell
      title={t('sec.backup')}
      subtitle={t('bk.subtitle')}
      actions={
        <>
          {pill}
          {!setup && (
            <Button size="sm" disabled={busy || working} onClick={() => void post({ op: 'run' })}>
              {t('bk.runNow')}
            </Button>
          )}
        </>
      }
    >
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      {note && (
        <div className="a-muted" style={{ fontSize: 13 }}>
          {note}
        </div>
      )}
      {!setup && failed && s.last && (
        <div className="ap-intalert" role="status">
          <span className="grow">
            <b>{t('bk.failHead', { when: when(s.last.at) })}</b> {s.last.error}
            {'. '}
            {s.lastOk ? t('bk.failLastOk', { when: when(s.lastOk.at) }) : ''}
          </span>
          <Button size="sm" disabled={busy} onClick={pickDir}>
            {t('bk.otherDir')}
          </Button>
          <Button size="sm" disabled={busy || working} onClick={() => void post({ op: 'run' })}>
            {t('bk.retry')}
          </Button>
        </div>
      )}

      {setup ? (
        <div style={{ maxWidth: 760 }}>
          <Card title={t('bk.setupTitle')} subtitle={t('bk.setupHint')}>
            <div className="ap-bkstep">
              <span className={`ap-bknum${g.dir && !s.dirError ? ' done' : ''}`}>1</span>
              <div className="ap-bkbody">
                <b>{t('bk.step1')}</b>
                <span className="a-muted">{t('bk.step1Hint')}</span>
                <span className="ap-bkline">
                  <Button size="sm" disabled={busy} onClick={pickDir}>
                    {t(g.dir ? 'bk.changeDir' : 'bk.pickDir')}
                  </Button>
                  <TextInput
                    mono
                    className="grow"
                    aria-label={t('bk.dir')}
                    placeholder={t('bk.dirPlaceholder')}
                    value={dir}
                    onChange={(e) => setDir(e.target.value)}
                    onBlur={saveDir}
                    onKeyDown={(e) => e.key === 'Enter' && saveDir()}
                  />
                </span>
                {s.dirError && g.dir && <span style={{ color: 'var(--a-danger)' }}>{s.dirError}</span>}
              </div>
            </div>
            <div className="ap-bkstep">
              <span className={`ap-bknum${saved ? ' done' : ''}`}>2</span>
              <div className="ap-bkbody">
                <b>{t('bk.step2')}</b>
                <span className="a-muted">{t('bk.step2Hint')}</span>
                <div className="ap-bkcode a-mono">{code ?? '…'}</div>
                <span className="ap-bkline">
                  <Button size="sm" disabled={!code} onClick={copyCode}>
                    {t('bk.copy')}
                  </Button>
                  <Checkbox checked={saved} onChange={setSaved} label={t('bk.saved')} />
                </span>
              </div>
            </div>
            <div className="ap-bkstep">
              <span className="ap-bknum">3</span>
              <div className="ap-bkbody">
                <b>{t('bk.step3')}</b>
                <span className="a-muted">{t('bk.step3Hint')}</span>
                <span>
                  <Button
                    variant="primary"
                    disabled={busy || !saved || !code || !g.dir || !!s.dirError}
                    onClick={() => void post({ op: 'enable' }).then((j) => j && setCode(null))}
                  >
                    {t('bk.enable')}
                  </Button>
                </span>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="ap-cols">
          <Col basis={430}>
            <Card title={t('bk.schedule')}>
              <CardRow>
                <span className="grow">{t('bk.time')}</span>
                <input
                  className="ap-gdnum"
                  type="time"
                  aria-label={t('bk.time')}
                  value={g.time}
                  onChange={(e) =>
                    e.target.value && void post({ op: 'set', settings: { time: e.target.value } })
                  }
                />
                <span className="a-muted ap-bkunit">{t('bk.timeHint')}</span>
              </CardRow>
              <CardRow>
                <span className="grow">{t('bk.keepDaily')}</span>
                <NumberField
                  label={t('bk.keepDaily')}
                  value={g.keepDaily}
                  min={1}
                  max={60}
                  onSave={(v) => void post({ op: 'set', settings: { keepDaily: v } })}
                />
                <span className="a-muted ap-bkunit">{t('bk.keepDailyHint')}</span>
              </CardRow>
              <CardRow>
                <span className="grow">{t('bk.keepWeekly')}</span>
                <NumberField
                  label={t('bk.keepWeekly')}
                  value={g.keepWeekly}
                  min={0}
                  max={52}
                  onSave={(v) => void post({ op: 'set', settings: { keepWeekly: v } })}
                />
                <span className="a-muted ap-bkunit">{t('bk.keepWeeklyHint')}</span>
              </CardRow>
              <CardRow>
                <span className="ap-intwhat grow">
                  <span>{t('bk.dir')}</span>
                  <TextInput
                    mono
                    aria-label={t('bk.dir')}
                    value={dir}
                    onChange={(e) => setDir(e.target.value)}
                    onBlur={saveDir}
                    onKeyDown={(e) => e.key === 'Enter' && saveDir()}
                  />
                </span>
                <Button size="sm" disabled={busy} onClick={pickDir}>
                  {t('bk.change')}
                </Button>
              </CardRow>
              <CardRow>
                <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                  {s.dirError ??
                    (s.free !== null
                      ? t('bk.space', { free: size(s.free), used: size(total) })
                      : t('bk.used', { used: size(total) }))}
                </span>
              </CardRow>
              <CardRow>
                <span className="grow">
                  <Checkbox
                    checked={g.notify}
                    onChange={(v) => void post({ op: 'set', settings: { notify: v } })}
                    label={t('bk.notify')}
                  />
                </span>
              </CardRow>
              <CardRow>
                <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                  {t('bk.offHint')}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t('bk.offConfirm'))) void post({ op: 'disable' })
                  }}
                >
                  {t('bk.turnOff')}
                </Button>
              </CardRow>
            </Card>

            <Card
              title={
                <>
                  {t('bk.parts')} <span className="a-muted ap-inthint">{t('bk.partsHint')}</span>
                </>
              }
            >
              {PARTS.map((id) => {
                const p = s.parts.find((x) => x.id === id)
                if (!p || (!p.files && id === 'projects')) return null
                return (
                  <CardRow key={id}>
                    <span className="ap-intwhat grow">
                      <span>{t(`bk.part.${id}`)}</span>
                      <span className="a-muted">{t(`bk.partHint.${id}`)}</span>
                    </span>
                    <span className="a-muted ap-gdfig">
                      {t('bk.partSize', { size: size(p.bytes), n: p.files })}
                    </span>
                  </CardRow>
                )
              })}
              <CardRow>
                <span className="ap-tags grow">
                  <span className="a-muted" style={{ fontSize: 12.5, width: '100%' }}>
                    {t('bk.notIncluded')}
                  </span>
                  {NOT_INCLUDED.map((k) => (
                    <Tag key={k}>{t(`bk.not.${k}`)}</Tag>
                  ))}
                </span>
              </CardRow>
            </Card>
          </Col>

          <Col basis={440}>
            <Card
              title={
                <>
                  {t('bk.copies')}{' '}
                  <span className="a-muted ap-inthint">
                    {t('bk.copiesCount', { n: s.copies.length, size: size(total) })}
                  </span>
                </>
              }
            >
              {s.copies.length === 0 && (
                <CardRow>
                  <span className="a-muted">
                    {s.busy === 'backup' ? t('bk.busy.backup') : t('bk.noCopies')}
                  </span>
                </CardRow>
              )}
              {s.copies.map((c) => (
                <CardRow key={c.name}>
                  <span className="ap-intwhat grow">
                    <span>{when(c.at)}</span>
                    <span className="a-muted">
                      {[
                        c.kind ? t(`bk.kind.${c.kind}`) : null,
                        c.drilled ? t('bk.drilled') : null,
                        c.oldCode ? t('bk.oldCode') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className="a-muted ap-gdfig">{size(c.bytes)}</span>
                  <Button
                    size="sm"
                    disabled={busy || working}
                    onClick={() =>
                      void post({ op: 'extract', name: c.name }).then(
                        (j) => j?.extracted && setNote(t('bk.extracted', { path: j.extracted })),
                      )
                    }
                  >
                    {t('bk.extract')}
                  </Button>
                </CardRow>
              ))}
              <CardRow>
                <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                  {t('bk.extractHint')}
                </span>
              </CardRow>
            </Card>

            <Card
              title={
                <span className="ap-intwhat">
                  <b>{t('bk.drill')}</b>
                  <span className="a-muted">{t('bk.drillHint')}</span>
                </span>
              }
              actions={
                drill && (
                  <Pill tone={drill.ok ? 'ok' : 'danger'}>
                    {t(drill.ok ? 'bk.drillOk' : 'bk.drillFail', { when: when(drill.at) })}
                  </Pill>
                )
              }
            >
              {drill?.steps?.map((st) => (
                <CardRow key={st.id}>
                  <span className={`ap-bkmark${st.ok ? '' : ' bad'}`}>
                    {st.ok ? <CheckIcon size={15} /> : <CloseIcon size={15} />}
                  </span>
                  <span className="grow">{t(`bk.step.${st.id}`)}</span>
                  <span className="a-muted ap-gdfig">
                    {st.error ??
                      (st.ok || st.of === undefined
                        ? t(`bk.note.${st.id}`, { n: st.n ?? 0, of: st.of ?? 0 })
                        : `${st.n ?? 0} / ${st.of}`)}
                  </span>
                </CardRow>
              ))}
              <CardRow>
                <span className="a-muted grow" style={{ fontSize: 12.5 }}>
                  {drill
                    ? t('bk.drillTook', { s: Math.max(1, Math.round(drill.ms / 1000)) })
                    : t('bk.drillNever')}
                </span>
                <Button
                  size="sm"
                  disabled={busy || working || !latest}
                  onClick={() => void post({ op: 'drill' })}
                >
                  {t('bk.drillNow')}
                </Button>
              </CardRow>
            </Card>

            <Card title={t('bk.restore')}>
              <CardRow>
                <span className="ap-intwhat grow">
                  <span className="a-muted" style={{ fontSize: 13 }}>
                    {t('bk.restoreHint')}
                  </span>
                  <code className="ap-bkcmd a-mono">
                    {`${s.repo ? `cd "${s.repo}" && ` : ''}pnpm aris:cli stop && pnpm aris:cli restore "${g.dir}/${latest?.name ?? 'aris-….aris'}"`}
                  </code>
                  <span className="a-muted" style={{ fontSize: 13 }}>
                    {t('bk.restoreAfter')}
                  </span>
                </span>
              </CardRow>
            </Card>

            <Card>
              <CardRow>
                <span className="ap-intwhat grow">
                  <b>{t('bk.code')}</b>
                  <span className="a-muted">
                    {g.codeSetAt
                      ? t('bk.codeSince', { date: new Date(g.codeSetAt).toLocaleDateString('vi-VN') })
                      : ''}{' '}
                    {t('bk.codeHint')}
                  </span>
                </span>
                {!code && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void post({ op: 'code-new' }).then((j) => j?.code && (setSaved(false), setCode(j.code)))
                    }
                  >
                    {t('bk.codeRotate')}
                  </Button>
                )}
              </CardRow>
              {code && (
                <CardRow>
                  <span className="ap-bkbody grow">
                    <span className="a-muted">{t('bk.codeNew')}</span>
                    <div className="ap-bkcode a-mono">{code}</div>
                    <span className="ap-bkline">
                      <Button size="sm" onClick={copyCode}>
                        {t('bk.copy')}
                      </Button>
                      <Checkbox checked={saved} onChange={setSaved} label={t('bk.saved')} />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={!saved || busy}
                        onClick={() => void post({ op: 'code-confirm' }).then((j) => j && setCode(null))}
                      >
                        {t('bk.codeUse')}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void post({ op: 'code-cancel' }).then(() => setCode(null))}
                      >
                        {t('bk.cancel')}
                      </Button>
                    </span>
                  </span>
                </CardRow>
              )}
            </Card>
          </Col>
        </div>
      )}
    </PageShell>
  )
}
