/**
 * Danh mục connector (giai đoạn 8, plan 8.5; bản vẽ `DanhMucConnector.dc.html`): lưới thẻ có ô tìm và tab nhóm; bấm
 * một thẻ thì nhập khoá (hay Client ID / Secret), chọn phạm vi và mức hỏi, rồi "Đăng nhập <hãng>" (OAuth, mở cửa sổ
 * đăng nhập của hãng) hoặc "Kiểm tra" (token). Mẫu cũ (GitHub, Lark, Notion trên máy, Trình duyệt) mở hộp `mcp-add`.
 * Có `params.id` là sửa kết nối đã dựng từ danh mục.
 */
import {
  Button,
  Dialog,
  Pill,
  refreshTeam,
  teamAction,
  useTeam,
  type ConnectorData,
  type McpData,
} from '@aris/ui-kit/react'
import { useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { ALL_SCOPE, ScopePicker, type Scope } from './ScopePicker.js'

type Ask = 'write' | 'always' | 'never'
type T = PageProps['t']

const TABS = [
  'all',
  'work',
  'sales',
  'content',
  'ads',
  'analytics',
  'commerce',
  'automation',
  'internal',
  'other',
] as const
type Tab = (typeof TABS)[number]

/** Màu logo chữ theo mã (không dùng logo thương hiệu thật). */
const COLORS = [
  '#2563EB',
  '#EA580C',
  '#0891B2',
  '#7C3AED',
  '#16A34A',
  '#DB2777',
  '#CA8A04',
  '#475569',
  '#DC2626',
]
const colorOf = (id: string) => COLORS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length]!
const letterOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()

export function ConnectorLogo({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <span
      className="ap-mlogo"
      style={{ background: colorOf(id), width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {letterOf(name)}
    </span>
  )
}

/** Đường gọi về của OAuth trên web aris (người dùng thêm vào ứng dụng của mình ở hãng). */
export const callbackUrl = () => `${window.location.origin}/api/aris/mcp/oauth/callback`

/**
 * Mở cửa sổ đăng nhập của hãng. Cửa sổ mở ngay trong lúc bấm (để trình duyệt không chặn), rồi mới trỏ tới trang
 * đăng nhập khi máy chủ trả địa chỉ.
 */
export const openLoginWindow = () => window.open('about:blank', 'aris-oauth', 'popup,width=520,height=720')

export async function oauthLogin(
  id: string,
  w: Window | null = openLoginWindow(),
): Promise<'opened' | 'authorized'> {
  try {
    const r = await teamAction<{ authUrl?: string; authorized?: true }>({ op: 'mcp-oauth-start', id })
    if (r.authorized || !r.authUrl) {
      w?.close()
      return 'authorized'
    }
    if (w) w.location.href = r.authUrl
    else window.open(r.authUrl, '_blank', 'noopener')
    return 'opened'
  } catch (e) {
    w?.close()
    throw e
  }
}

function Grid({ t, list, onPick }: { t: T; list: ConnectorData[]; onPick: (e: ConnectorData) => void }) {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const query = q.trim().toLowerCase()
  const shown = list.filter(
    (e) =>
      (tab === 'all' || e.category === tab) &&
      (!query || `${e.name} ${e.vendor} ${e.blurb}`.toLowerCase().includes(query)),
  )
  return (
    <>
      <input
        className="a-input"
        placeholder={t('cat.search')}
        aria-label={t('cat.search')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ap-cat-tabs" role="tablist" aria-label={t('cat.groups')}>
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : undefined}
            onClick={() => setTab(k)}
          >
            {t(`cat.tab.${k}`)}
          </button>
        ))}
      </div>
      <div className="ap-cat-grid">
        {shown.map((e) => (
          <button key={e.id} type="button" className="ap-cat-card" onClick={() => onPick(e)}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ConnectorLogo id={e.id} name={e.name} />
              <b style={{ fontSize: 14 }}>{e.name}</b>
            </span>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {e.blurb}
            </span>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {e.status === 'verified' && e.official ? (
                <Pill tone="ok">{t('cat.official')}</Pill>
              ) : (
                <Pill tone="muted">{t('cat.unverified')}</Pill>
              )}
              {e.writes && <Pill tone="warn">{t('cat.writes')}</Pill>}
            </span>
          </button>
        ))}
        {shown.length === 0 && <div className="ap-hint a-muted">{t('cat.none')}</div>}
      </div>
    </>
  )
}

function Setup({
  t,
  entry,
  prev,
  onDone,
  onBack,
}: {
  t: T
  entry: ConnectorData
  prev: McpData | undefined
  onDone: () => void
  onBack: (() => void) | undefined
}) {
  const team = useTeam()
  const [url, setUrl] = useState(prev?.url ?? '')
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [scope, setScope] = useState<Scope>(prev?.scope ?? ALL_SCOPE)
  const [ask, setAsk] = useState<Ask>(prev?.ask ?? entry.defaultAsk)
  const [id, setId] = useState<string | undefined>(prev?.id)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = team.mcp.find((c) => c.id === id)
  const oauth = entry.auth === 'oauth'

  // Đang chờ đăng nhập ở cửa sổ của hãng: đọc lại vài giây một lần tới khi kết nối đã đăng nhập.
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void refreshTeam(), 3000)
    return () => clearInterval(timer)
  }, [waiting])
  useEffect(() => {
    if (waiting && rec?.oauth?.state === 'ok' && rec.check) setWaiting(false)
  }, [waiting, rec])

  const input = () => ({
    preset: 'custom',
    catalog: entry.id,
    ask,
    secrets: Object.fromEntries(entry.keys.map((k) => [k, secrets[k] ?? ''])),
    ...(entry.url ? {} : { url }),
  })

  async function save(): Promise<string> {
    if (id) {
      await teamAction({ op: 'mcp-update', id, input: input() })
      await teamAction({ op: 'mcp-team-scope', id, scope })
      return id
    }
    const r = await teamAction<{ connection: string }>({ op: 'mcp-team-add', input: input(), scope })
    setId(r.connection)
    return r.connection
  }

  async function run() {
    setBusy(true)
    setError(null)
    // Mở cửa sổ ngay trong lúc bấm, trước mọi lời gọi máy chủ, để trình duyệt không chặn.
    const w = oauth ? openLoginWindow() : null
    try {
      const saved = await save()
      if (oauth) {
        const how = await oauthLogin(saved, w)
        if (how === 'opened') setWaiting(true)
      } else if (prev) await teamAction({ op: 'mcp-check', id: saved })
      await refreshTeam()
    } catch (e) {
      w?.close()
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const asks: [Ask, string][] = [
    ['write', t('mcp.askWriteShort')],
    ['always', t('mcp.askAlwaysShort')],
    ['never', t('mcp.askNeverShort')],
  ]
  const tools = rec?.check?.tools.length ?? 0
  const status = !rec
    ? t(oauth ? 'cat.notLogged' : 'mcp.unchecked')
    : rec.oauth?.state === 'login'
      ? waiting
        ? t('cat.waiting')
        : t('cat.needLogin')
      : rec.check?.ok
        ? t('cat.okTools', { n: tools })
        : rec.check
          ? t('mcp.failed', { error: rec.check.error ?? '' })
          : t('mcp.unchecked')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <ConnectorLogo id={entry.id} name={entry.name} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 15 }}>{entry.name}</b>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {entry.blurb}
            {entry.url ? ` · ${new URL(entry.url).host}` : ''}
          </span>
        </span>
        {entry.status === 'verified' && entry.official ? (
          <Pill tone="ok">{t('cat.official')}</Pill>
        ) : (
          <Pill tone="muted">{t('cat.unverified')}</Pill>
        )}
        {entry.writes && <Pill tone="warn">{t('cat.writes')}</Pill>}
      </div>
      {entry.notes && (
        <div className="a-muted" style={{ fontSize: 12.5 }}>
          ⓘ {entry.notes}{' '}
          {entry.docs && (
            <a href={entry.docs} target="_blank" rel="noreferrer">
              {t('cat.docs')}
            </a>
          )}
        </div>
      )}
      {!entry.url && (
        <label className="a-field">
          <span className="l">{t('cat.url')}</span>
          <input
            className="a-input"
            placeholder={entry.urlHint ?? 'https://…'}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
      )}
      {entry.keys.map((k) => (
        <label className="a-field" key={k}>
          <span className="l">
            {k === 'CLIENT_ID' ? 'Client ID' : k === 'CLIENT_SECRET' ? 'Client Secret' : k}
          </span>
          <input
            className="a-input"
            type={k === 'CLIENT_ID' || k === 'LOCATION_ID' ? 'text' : 'password'}
            autoComplete="off"
            placeholder={prev?.secretKeys.includes(k) ? t('cat.keepKey') : ''}
            value={secrets[k] ?? ''}
            onChange={(e) => setSecrets({ ...secrets, [k]: e.target.value })}
          />
        </label>
      ))}
      {oauth && entry.needsClient && (
        <div className="a-field">
          <span className="l">{t('cat.redirect')}</span>
          <code className="ap-cat-code">{callbackUrl()}</code>
        </div>
      )}
      <span className="a-muted" style={{ fontSize: 12 }}>
        {t('cat.keychain')}
      </span>
      <div className="a-field">
        <span className="l">{t('conn.whoUses')}</span>
        <ScopePicker t={t} value={scope} onChange={setScope} />
      </div>
      <div>
        <div className="a-field">
          <span className="l">{t('conn.askWhen')}</span>
        </div>
        {asks.map(([v, label]) => (
          <label className="ap-radio" key={v}>
            <input type="radio" name="cat-ask" checked={ask === v} onChange={() => setAsk(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <div className="a-muted" style={{ fontSize: 12.5 }} role="status">
        {status}
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <div className="ap-dfoot">
        {onBack && (
          <Button size="lg" onClick={onBack}>
            {t('cat.back')}
          </Button>
        )}
        {rec?.check?.ok && rec.oauth?.state !== 'login' ? (
          <Button variant="primary" size="lg" onClick={onDone}>
            {t('cat.done')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void run()}>
            {oauth ? t('cat.login', { vendor: entry.vendor }) : t('cat.check')}
          </Button>
        )}
      </div>
    </>
  )
}

export function CatalogDialog({ t, nav, params }: PageProps) {
  const team = useTeam()
  const prev = team.mcp.find((c) => c.id === params.id)
  const fromPrev = prev?.catalog ? team.connectors.find((e) => e.id === prev.catalog) : undefined
  const [picked, setPicked] = useState<ConnectorData | undefined>(undefined)
  const entry = fromPrev ?? picked
  const done = () => nav.go('settings', { section: 'connections' })

  function pick(e: ConnectorData) {
    // Mẫu cũ: hộp thêm kết nối có sẵn, điền sẵn mẫu.
    if (e.preset) nav.go('mcp-add', { team: '1', preset: e.preset })
    else setPicked(e)
  }

  return (
    <Dialog
      open
      width={entry ? 640 : 860}
      title={entry ? t('cat.setupTitle', { name: entry.name }) : t('cat.title')}
      closeLabel={t('cb.close')}
      onClose={nav.close}
    >
      {entry ? (
        <Setup
          t={t}
          entry={entry}
          prev={prev}
          onDone={done}
          onBack={fromPrev ? undefined : () => setPicked(undefined)}
        />
      ) : (
        <Grid t={t} list={team.connectors} onPick={pick} />
      )}
    </Dialog>
  )
}
