/**
 * 6.3b · Ứng dụng khác (giai đoạn 6, bản vẽ `MatTichHop.dc.html`): Buzz Desktop, IDE mời bot của aris vào làm
 * việc qua ACP. Đang nối, nhật ký hôm nay, nối thêm, bộ quyền khi làm khách, bot mở ra. Dữ liệu từ
 * `/api/aris/acp` (`@aris/acp`).
 */
import { Button, Card, CardRow, Mascot, PageShell, Pill, Tag } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Col } from '../ui.js'

type Result = 'mo-phien' | 'cho-phep' | 'ung-dung-duyet' | 'ung-dung-tu-choi' | 'chan'
type RuleKey = 'ask' | 'untrusted' | 'nomem' | 'notools'

interface State {
  enabled: boolean
  listening: boolean
  socket: string
  command: string | null
  rules: Record<RuleKey, boolean>
  connections: {
    id: string
    app: string
    version: string | null
    bot: { id: string; name: string; handle: string }
    cwd: string
    sessions: string[]
    at: string
    last: string
    busy: boolean
  }[]
  bots: {
    id: string
    name: string
    handle: string
    role: string
    mascot: string | null
    kind: string
    open: boolean
  }[]
  log: {
    id: string
    at: string
    app: string
    bot: string
    session: string
    what: string
    result: Result
    reason?: string
  }[]
}

const endpoint = () => new URL('api/aris/acp', document.baseURI)
const hm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
/** Lần chặn gần nhất chỉ lên dải cảnh báo trong ngần này thời gian. */
const BLOCK_ALERT_MS = 24 * 3_600_000
const TONE: Record<Result, 'ok' | 'warn' | 'danger' | 'muted'> = {
  'mo-phien': 'muted',
  'cho-phep': 'muted',
  'ung-dung-duyet': 'warn',
  'ung-dung-tu-choi': 'warn',
  chan: 'danger',
}
const RULES: RuleKey[] = ['ask', 'untrusted', 'nomem', 'notools']
const DENY = ['rm', 'push', 'outside', 'secrets', 'send', 'sudo'] as const

export function Integrations({ t, nav }: PageProps) {
  const [s, setS] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<'all' | 'ask' | 'chan'>('all')
  const [pick, setPick] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setS((await r.json()) as State)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 5000)
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

  if (!s)
    return (
      <PageShell title={t('sec.integrations')}>
        <div className="a-muted">{t('int.loading')}</div>
      </PageShell>
    )

  const open = s.bots.filter((b) => b.open)
  const cmdBot = open.find((b) => b.handle === pick) ?? open[0]
  const cmd = `aris-acp --bot ${cmdBot?.handle ?? '<tên>'}`
  const work = s.log.filter((l) => l.result !== 'mo-phien')
  const n = (r: Result) => work.filter((l) => l.result === r).length
  const nAsk = n('ung-dung-duyet') + n('ung-dung-tu-choi')
  const rows = work.filter((l) =>
    filter === 'all' ? true : filter === 'chan' ? l.result === 'chan' : l.result.startsWith('ung-dung'),
  )
  // Dải đỏ chỉ báo lần chặn trong 24 giờ qua; cũ hơn chỉ còn trong nhật ký bên dưới.
  const lastBlocked = work.find(
    (l) => l.result === 'chan' && l.reason?.length && Date.now() - Date.parse(l.at) < BLOCK_ALERT_MS,
  )
  const mascotOf = (botId: string) => s.bots.find((b) => b.id === botId)?.mascot ?? 'aris'

  return (
    <PageShell
      title={t('sec.integrations')}
      subtitle={t('int.subtitle')}
      actions={
        <>
          <Pill tone={s.enabled ? 'ok' : 'muted'}>
            {s.enabled ? t('int.live', { n: s.connections.length }) : t('int.off')}
          </Pill>
          <Button
            size="sm"
            disabled={busy}
            aria-pressed={s.enabled}
            onClick={() => void post({ op: 'enabled', on: !s.enabled })}
          >
            {s.enabled ? t('int.turnOff') : t('int.turnOn')}
          </Button>
        </>
      }
    >
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      {!s.enabled ? (
        <div className="ap-intnote">{t('int.offNote')}</div>
      ) : (
        lastBlocked && (
          <div className="ap-intalert" role="status">
            <span className="grow">
              <b>{t('int.blockedHead', { time: hm(lastBlocked.at), app: lastBlocked.app })}</b>{' '}
              {t('int.blockedBody', { what: lastBlocked.what })}
            </span>
            <Button size="sm" onClick={() => setFilter('chan')}>
              {t('int.seeLog')}
            </Button>
          </div>
        )
      )}

      <Card
        title={
          <>
            {t('int.connected')} <span className="a-muted ap-inthint">{t('int.connectedHint')}</span>
          </>
        }
      >
        {s.connections.length === 0 && (
          <CardRow>
            <span className="a-muted">{t('int.noConn')}</span>
          </CardRow>
        )}
        {s.connections.map((c) => (
          <CardRow key={c.id}>
            <span className="ap-inttile" aria-hidden="true">
              {c.app.slice(0, 1)}
            </span>
            <span className="ap-intwho">
              <b>{c.app}</b>
              <span className="a-muted">
                {[c.version, t('int.sessions', { n: c.sessions.length })].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="ap-intarrow" aria-hidden="true">
              →
            </span>
            <Mascot id={mascotOf(c.bot.id)} size={22} />
            <span className="ap-intwho">
              <b>{c.bot.name}</b>
              <span className={c.busy ? 'ap-intbusy' : 'a-muted'}>
                {c.busy ? t('int.busy') : t('int.idle')}
              </span>
            </span>
            <span className="ap-intarrow" aria-hidden="true">
              →
            </span>
            <Tag mono>{c.cwd}</Tag>
            <span className="grow" />
            {c.sessions.length > 0 && (
              <Button size="sm" onClick={() => nav.openSession(c.sessions.at(-1)!)}>
                {t('int.openSession')}
              </Button>
            )}
          </CardRow>
        ))}
        <CardRow>
          <span className="a-muted">{t('int.connNote')}</span>
        </CardRow>
      </Card>

      <div className="ap-cols">
        <Col basis={470}>
          <Card
            title={t('int.logTitle')}
            actions={
              <span role="tablist" aria-label={t('int.logTitle')} className="ap-inttabs">
                {(
                  [
                    ['all', t('int.all', { n: work.length })],
                    ['ask', t('int.asked', { n: nAsk })],
                    ['chan', t('int.blockedN', { n: n('chan') })],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    type="button"
                    role="tab"
                    key={k}
                    aria-selected={filter === k}
                    className={filter === k ? 'on' : ''}
                    onClick={() => setFilter(k)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            }
          >
            {rows.length === 0 && (
              <CardRow>
                <span className="a-muted">{t('int.noLog')}</span>
              </CardRow>
            )}
            {rows.slice(0, 8).map((l) => (
              <CardRow key={l.id}>
                <span className="a-muted ap-inttime">{hm(l.at)}</span>
                <span className="grow ap-intwhat">
                  <span>{l.what}</span>
                  <span className="a-muted">
                    {l.app} · {l.bot}
                  </span>
                </span>
                <Pill tone={TONE[l.result]}>
                  {l.result === 'chan' && l.reason
                    ? t('int.res.chanWhy', { why: l.reason })
                    : t(`int.res.${l.result}`)}
                </Pill>
              </CardRow>
            ))}
            {rows.length > 8 && (
              <CardRow>
                <span className="a-muted">{t('int.shown', { n: 8, m: rows.length })}</span>
              </CardRow>
            )}
          </Card>

          <Card title={t('int.add')}>
            <CardRow>
              <span className="a-muted ap-intlab">{t('int.command')}</span>
              <span className="grow ap-tags">
                {open.length > 1 && (
                  <select
                    aria-label={t('int.botFor')}
                    value={cmdBot?.handle ?? ''}
                    onChange={(e) => {
                      setPick(e.target.value)
                      setCopied(false)
                    }}
                  >
                    {open.map((b) => (
                      <option key={b.id} value={b.handle}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                )}
                <Tag mono>{cmd}</Tag>
              </span>
              <Button
                size="sm"
                disabled={!cmdBot}
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(cmd)
                    .then(() => setCopied(true))
                    .catch(() => undefined)
                }
              >
                {copied ? t('int.copied') : t('int.copy')}
              </Button>
            </CardRow>
            {!cmdBot && (
              <CardRow>
                <span className="a-muted">{t('int.noOpenBot')}</span>
              </CardRow>
            )}
            <CardRow>
              <span className="a-muted ap-intlab">{t('int.onMac')}</span>
              <span className="grow ap-tags">
                <Pill tone={s.command ? 'ok' : 'warn'}>
                  {s.command ? t('int.inPath') : t('int.notInPath')}
                </Pill>
                {s.command && <Tag mono>{s.command}</Tag>}
              </span>
              {!s.command && (
                <Button size="sm" disabled={busy} onClick={() => void post({ op: 'install' })}>
                  {t('int.install')}
                </Button>
              )}
            </CardRow>
            <CardRow>
              <span className="a-muted ap-intlab">{t('int.how')}</span>
              <span className="grow" style={{ fontSize: 13 }}>
                {t('int.howText')}
              </span>
            </CardRow>
          </Card>
        </Col>

        <Col basis={370}>
          <Card
            title={
              <>
                {t('int.rules')} <span className="a-muted ap-inthint">{t('int.rulesHint')}</span>
              </>
            }
          >
            <CardRow>
              <span className="grow ap-intwhat">
                <b>{t('int.deny')}</b>
                <span className="a-muted">{t('int.denyHint')}</span>
                <span className="ap-tags" style={{ marginTop: 6 }}>
                  {DENY.map((k) => (
                    <Tag key={k} mono={k === 'push'}>
                      {t(`int.deny.${k}`)}
                    </Tag>
                  ))}
                </span>
              </span>
              <Pill tone="ok">{t('int.always')}</Pill>
            </CardRow>
            {RULES.map((k) => (
              <CardRow key={k}>
                <span className="grow ap-intwhat">
                  <b>{t(`int.rule.${k}`)}</b>
                  <span className="a-muted">{t(`int.rule.${k}.desc`)}</span>
                </span>
                <Pill tone={s.rules[k] ? 'ok' : 'muted'}>{s.rules[k] ? t('int.on') : t('int.off')}</Pill>
                <Button
                  size="sm"
                  disabled={busy}
                  aria-pressed={s.rules[k]}
                  onClick={() => void post({ op: 'rule', rule: k, on: !s.rules[k] })}
                >
                  {s.rules[k] ? t('int.turnOff') : t('int.turnOn')}
                </Button>
              </CardRow>
            ))}
            <CardRow>
              <span className="grow ap-intwhat">
                <span className="a-muted" style={{ fontSize: 12 }}>
                  {t('int.preview')}
                </span>
                <span className="ap-intmsg">{t('int.previewText')}</span>
              </span>
            </CardRow>
          </Card>

          <Card
            title={
              <>
                {t('int.bots')}{' '}
                <span className="a-muted ap-inthint">
                  {t('int.botsN', { n: open.length, m: s.bots.length })}
                </span>
              </>
            }
          >
            <CardRow>
              <span className="ap-tags grow">
                {s.bots.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    className={b.open ? 'ap-intbot on' : 'ap-intbot'}
                    aria-pressed={b.open}
                    disabled={busy}
                    onClick={() => void post({ op: 'bot', bot: b.id, on: !b.open })}
                  >
                    <Mascot id={b.mascot ?? 'aris'} size={14} />
                    {b.name} · {b.open ? t('int.open') : t('int.closed')}
                  </button>
                ))}
              </span>
            </CardRow>
            <CardRow>
              <span className="a-muted">{t('int.botsNote')}</span>
            </CardRow>
          </Card>

          {s.connections.length > 0 && (
            <Card>
              <CardRow>
                <span className="grow ap-intwhat">
                  <b>{t('int.cut')}</b>
                  <span className="a-muted">{t('int.cutHint')}</span>
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={() => void post({ op: 'disconnect' })}
                >
                  {t('int.cutN', { n: s.connections.length })}
                </Button>
              </CardRow>
            </Card>
          )}
        </Col>
      </div>
    </PageShell>
  )
}
