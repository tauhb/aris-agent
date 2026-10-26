/**
 * 6.2 · Provider và khoá (đặc tả: docs/specs/aris-providers.md), bố cục theo canvas:
 * - Cột trái: danh bạ nhà cung cấp của dsh chia nhóm (Chat, Ảnh và video, Nhúng, Có sẵn), ô tìm, thêm provider
 *   tuỳ chỉnh.
 * - Giữa: provider đang chọn: khoá (chỉ ghi, nhiều khoá xoay vòng), Base URL, gọi thử model, bảng model.
 * - Cột phải: "Đang dùng ở", model của provider này được gán cho việc nào (chọn model theo việc ở mục Model).
 * Nằm trong khung Cài đặt như các mục khác. Route, khoá, danh mục model đọc và ghi thẳng vào dịch
 * vụ của dsh; vòng khoá, giá và chuỗi dự phòng qua `/api/aris/providers/state`.
 */
import {
  Button,
  Card,
  NavItem,
  PageShell,
  Pill,
  SearchIcon,
  Select,
  Tag,
  TextInput,
  useTeam,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CredentialState,
  DiscoveredModel,
  ModelGroup,
  ModelSettings,
  PageProps,
  ProviderEntry,
} from '../page.js'
import { MediaProviderPanel, useMedia } from './Media.js'
import { DEFAULT_NS, pairKey, str, useNamespaces } from './model-common.js'
import { useSemantic } from './Semantic.js'
import { Box, Col, Dot } from '../ui.js'
import {
  ACCOUNT_ROUTE,
  MEDIA_PREFIX,
  ROUTE_RE,
  buildRows,
  credentialRefs,
  deriveKeyRef,
  groupDirectory,
  isChatModel,
  modelLines,
  probeReason,
  profileModel,
  profileModels,
  providerColor,
  routeIdOf,
  usedAt,
  type ProviderRow,
  type UseRow,
} from './provider-data.js'
import { fetchPrices, usd, useProvidersState, type Pool, type Price } from './providers-api.js'

/** Mã mục "Model" của dsh trong `settings.section`: trang này thay nó, nên nó không hiện trong Cài đặt. */
export const DSH_MODELS_SECTION = 'models'

/** Namespace của route pi-ai: nơi thêm provider tuỳ chỉnh và tự khai model. */
const PI_NS = 'llm-pi-ai'
/** Namespace của route DeepSeek chính thức. */
const DEEPSEEK_NS = 'llm-deepseek'
/** Endpoint mặc định của route DeepSeek (dsh-llm-deepseek `PUBLIC_BASE_URL`); dsh không báo qua danh bạ. */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic'
/** Kiểu API mà dsh dò được danh sách model. */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const
/** Số provider "có sẵn" hiện khi chưa mở hết. */
const FEW = 6

type T = PageProps['t']

function StatusMark({ t, row }: { t: T; row: ProviderRow }) {
  if (row.entry.declared) return <Tag>{t('pv.custom')}</Tag>
  const color = {
    ok: 'var(--a-ok)',
    nokey: 'var(--a-warn)',
    error: 'var(--a-danger)',
    off: 'var(--a-muted)',
  }[row.status]
  return (
    <span style={{ color }} title={t(`pv.st.${row.status}`)} aria-label={t(`pv.st.${row.status}`)}>
      {row.status === 'off' ? '○' : '●'}
    </span>
  )
}

/** Cột trái: danh bạ nhà cung cấp chia nhóm theo việc provider làm được. */
function Directory({
  t,
  rows,
  has,
  selected,
  adding,
  onSelect,
  onAdd,
}: {
  t: T
  rows: readonly ProviderRow[]
  /** Provider có model ảnh, video hay model nhúng (ngoài dòng `media:*`). */
  has: { media: ReadonlySet<string>; embed: ReadonlySet<string> }
  selected: string | undefined
  adding: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const groups = useMemo(() => groupDirectory(rows, query, has), [rows, query, has])
  const { available } = groups
  const shown = all || query ? available : available.slice(0, FEW)
  // Một provider nằm được ở nhiều nhóm: mã dòng kèm nhóm để không trùng khoá.
  const item = (group: string, r: ProviderRow, muted?: boolean) => (
    <NavItem
      key={`${group}:${r.entry.id}`}
      label={r.entry.name}
      variant="plain"
      className={muted ? 'a-muted' : undefined}
      active={!adding && r.entry.id === selected}
      icon={<Dot color={providerColor(r.entry.id)} />}
      meta={muted ? undefined : <StatusMark t={t} row={r} />}
      onClick={() => onSelect(r.entry.id)}
    />
  )
  const section = (group: 'chat' | 'media' | 'embed') =>
    groups[group].length > 0 && (
      <>
        <div className="ap-h">{t(`pv.grp.${group}`)}</div>
        {groups[group].map((r) => item(group, r))}
      </>
    )
  const none = groups.chat.length + groups.media.length + groups.embed.length + available.length === 0
  return (
    <nav className="ap-side" aria-label={t('sec.provider')}>
      <div style={{ fontWeight: 600, padding: '2px 10px 8px' }}>{t('pv.directory')}</div>
      <label className="ap-search">
        <SearchIcon size={14} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('pv.search', { n: rows.length })}
          placeholder={t('pv.search', { n: rows.length })}
        />
      </label>
      {section('chat')}
      {section('media')}
      {section('embed')}
      {available.length > 0 && <div className="ap-h">{t('pv.available')}</div>}
      {shown.map((r) => item('available', r, true))}
      {!query && available.length > FEW && (
        <NavItem
          label={all ? t('pv.less') : t('pv.all', { n: available.length })}
          style={{ color: 'var(--a-accent)' }}
          onClick={() => setAll(!all)}
        />
      )}
      {query && none && (
        <div className="a-muted" style={{ padding: '8px 10px', fontSize: 12.5 }}>
          {t('pv.none')}
        </div>
      )}
      <Button style={{ margin: 'auto 4px 0' }} onClick={onAdd}>
        {t('pv.add')}
      </Button>
    </nav>
  )
}

/** Khoá, Base URL và gọi thử model của provider đang chọn. */
function Connection({
  t,
  row,
  models,
  served,
  result,
  onChanged,
  onProbe,
  pool,
  act,
}: {
  t: T
  row: ProviderRow
  models: ModelSettings
  served: ModelGroup | undefined
  /** Vòng khoá của provider (khi có từ hai khoá). */
  pool: Pool | undefined
  act: (body: Record<string, unknown>) => Promise<boolean>
  /** Kết quả gọi thử gần nhất của provider này. */
  result: { ok: boolean; ms: number; model?: string | undefined; error?: string | undefined } | null
  onChanged: () => void
  onProbe: (r: { ok: boolean; ms: number; model: string; error?: string | undefined }) => void
}) {
  const { entry } = row
  const chatModels = useMemo(() => served?.models.filter((m) => isChatModel(m.id)) ?? [], [served])
  const [key, setKey] = useState('')
  const [baseURL, setBaseURL] = useState(str(row.profile.baseURL) ?? '')
  const [probeModel, setProbeModel] = useState(chatModels[0]?.id ?? '')
  const [busy, setBusy] = useState<'key' | 'url' | 'probe' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setKey('')
    setBaseURL(str(row.profile.baseURL) ?? '')
    setError(null)
    setSaved(false)
  }, [entry.id, row.profile.baseURL])
  useEffect(() => {
    if (!chatModels.some((m) => m.id === probeModel)) setProbeModel(chatModels[0]?.id ?? '')
  }, [chatModels, probeModel])

  const form = entry.ns ? models.form(entry.ns) : undefined
  const envOnly = row.key && !row.key.writable && row.key.configured
  const canWrite = !!entry.ns && !!row.keyRef && !envOnly

  async function saveKey() {
    const value = key.trim()
    if (!value || !form || !row.keyRef) return
    setBusy('key')
    setError(null)
    // Route pi-ai chưa ghi tên khoá thì ghi tên mặc định vào hồ sơ (giống trang Model của dsh);
    // route chưa có hồ sơ thì tạo hồ sơ cùng lúc.
    let ok = true
    if (entry.ns === PI_NS && !row.keyNamed)
      ok = await form.mutate(
        row.configured
          ? [{ op: 'set', path: [...entry.path, 'apiKeyEnv'], value: row.keyRef }]
          : [{ op: 'set', path: [...entry.path], value: { apiKeyEnv: row.keyRef } }],
      )
    else if (!row.configured && entry.path.length > 0)
      ok = await form.mutate([{ op: 'set', path: [...entry.path], value: {} }])
    const stored = ok
      ? await models.setCredential(row.keyRef, value)
      : { ok: false as const, error: t('pv.saveFailed') }
    setBusy(null)
    if (!stored.ok) return setError(stored.error)
    setKey('')
    onChanged()
  }

  async function saveURL() {
    if (!form) return
    setBusy('url')
    setError(null)
    const v = baseURL.trim()
    const ok = await form.mutate(
      v
        ? [{ op: 'set', path: [...entry.path, 'baseURL'], value: v }]
        : [{ op: 'unset', path: [...entry.path, 'baseURL'] }],
    )
    setBusy(null)
    if (!ok) setError(t('pv.saveFailed'))
    else setSaved(true)
  }

  async function probe() {
    if (!probeModel) return
    setBusy('probe')
    onProbe({ ...(await models.probe(entry.id, probeModel)), model: probeModel })
    setBusy(null)
  }

  const urlDirty = baseURL.trim() !== (str(row.profile.baseURL) ?? '')
  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entry.id === ACCOUNT_ROUTE ? (
        <div className="a-muted" style={{ fontSize: 13 }}>
          {t('pv.account')}
        </div>
      ) : (
        <label className="a-field">
          <span className="l">{t('pv.key')}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <TextInput
              mono
              type="password"
              autoComplete="off"
              value={key}
              disabled={!canWrite || busy === 'key'}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveKey()}
              placeholder={row.key?.configured || row.nativeKey ? t('pv.keyStored') : t('pv.keyEmpty')}
              aria-label={t('pv.key')}
            />
            <Button
              variant={row.configured ? 'secondary' : 'primary'}
              disabled={!canWrite || !key.trim() || busy === 'key'}
              onClick={() => void saveKey()}
            >
              {row.configured ? t('pv.saveKey') : t('pv.connect')}
            </Button>
          </span>
          <span className="h">
            {envOnly
              ? t('pv.keyEnv', { ref: row.keyRef })
              : row.nativeKey
                ? t('pv.keyNative', { env: entry.nativeEnv.join(', ') })
                : row.keyRef
                  ? t('pv.keyHint', { ref: row.keyRef })
                  : null}
          </span>
        </label>
      )}
      {entry.id !== ACCOUNT_ROUTE && row.keyRef && (canWrite || pool) && (
        <KeyRing t={t} provider={entry.id} keyRef={row.keyRef} pool={pool} act={act} />
      )}
      {entry.ns && (
        <label className="a-field">
          <span className="l">{t('pv.baseUrl')}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <TextInput
              mono
              value={baseURL}
              disabled={!row.configured || busy === 'url'}
              placeholder={entry.defaultBaseURL ?? (entry.ns === DEEPSEEK_NS ? DEEPSEEK_BASE_URL : '')}
              onChange={(e) => {
                setBaseURL(e.target.value)
                setSaved(false)
              }}
              aria-label={t('pv.baseUrl')}
            />
            {(urlDirty || saved) && (
              <Button disabled={!urlDirty || busy === 'url'} onClick={() => void saveURL()}>
                {saved && !urlDirty ? t('pv.saved') : t('pv.save')}
              </Button>
            )}
          </span>
        </label>
      )}
      {!row.configured && (
        <div className="a-muted" style={{ fontSize: 12.5 }}>
          {t('pv.notConfigured')}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="a-muted" style={{ fontSize: 12.5 }}>
          {t('pv.probeWith')}
        </span>
        {chatModels.length > 0 ? (
          <Select
            variant="compact"
            label={t('pv.probeWith')}
            value={probeModel}
            onChange={setProbeModel}
            options={chatModels.map((m) => ({ id: m.id, name: m.id }))}
          />
        ) : (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('pv.noModel')}
          </span>
        )}
        <Button
          style={{ marginLeft: 'auto' }}
          disabled={!probeModel || busy === 'probe'}
          onClick={() => void probe()}
        >
          {t('pv.probe')}
        </Button>
      </div>
      {result && !result.ok && (
        <div style={{ fontSize: 12.5 }}>
          <div style={{ color: 'var(--a-danger)' }}>
            {result.model ? `${result.model}: ` : ''}
            {t(`pv.why.${probeReason(result.error)}`)}
          </div>
          {result.error && (
            <details className="a-muted" style={{ marginTop: 2 }}>
              <summary style={{ cursor: 'pointer' }}>{t('pv.why.detail')}</summary>
              <div className="a-mono" style={{ fontSize: 11.5, wordBreak: 'break-word' }}>
                {result.error}
              </div>
            </details>
          )}
        </div>
      )}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</div>}
    </Box>
  )
}

/** Vòng khoá: thêm khoá phụ, xem khoá nào đang dùng, khoá nào vừa chạm giới hạn. */
function KeyRing({
  t,
  provider,
  keyRef,
  pool,
  act,
}: {
  t: T
  provider: string
  keyRef: string
  pool: Pool | undefined
  act: (body: Record<string, unknown>) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setOpen(false)
    setValue('')
  }, [provider])

  async function add() {
    if (!value.trim()) return
    setBusy(true)
    const ok = await act({ op: 'key-add', provider, ref: keyRef, value })
    setBusy(false)
    if (ok) {
      setValue('')
      setOpen(false)
    }
  }

  const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="a-muted">{pool ? t('pv.ring', { n: pool.keys.length }) : t('pv.ringOne')}</span>
        {!open && (
          <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => setOpen(true)}>
            {t('pv.addKey')}
          </Button>
        )}
      </div>
      {pool?.keys.map((k) => (
        <div key={k.slot} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="a-mono">{t('pv.keyN', { n: k.slot, fp: k.fp })}</span>
          {k.slot === pool.active ? (
            <Pill tone="ok">{t('pv.keyActive')}</Pill>
          ) : k.failedAt ? (
            <span className="a-muted">
              {t('pv.keyFailed', { at: time(k.failedAt), code: k.error ?? '' })}
            </span>
          ) : null}
          {k.slot !== pool.active && (
            <Button
              size="sm"
              variant="ghost"
              style={{ marginLeft: 'auto' }}
              aria-label={t('pv.removeKey', { n: k.slot })}
              onClick={() => void act({ op: 'key-remove', provider, slot: k.slot })}
            >
              ×
            </Button>
          )}
        </div>
      ))}
      {open && (
        <span style={{ display: 'flex', gap: 6 }}>
          <TextInput
            mono
            type="password"
            autoComplete="off"
            autoFocus
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder={t('pv.keyEmpty')}
            aria-label={t('pv.addKey')}
          />
          <Button variant="primary" disabled={busy || !value.trim()} onClick={() => void add()}>
            {t('pv.keyAddBtn')}
          </Button>
          <Button variant="ghost" onClick={() => (setOpen(false), setValue(''))}>
            {t('pv.cancel')}
          </Button>
        </span>
      )}
    </div>
  )
}

/** "0,30 / 1,20": USD cho 1 triệu token vào / ra. */
function priceText(t: T, p: Price | null | undefined): string {
  if (!p) return '—'
  const loc = t('pv.locale')
  return `${usd(p.input, loc)} / ${usd(p.output, loc)}`
}

/** Bảng model của provider: đang phục vụ, tự khai, vừa dò được. */
function ModelTable({
  t,
  row,
  models,
  served,
}: {
  t: T
  row: ProviderRow
  models: ModelSettings
  served: ModelGroup | undefined
}) {
  const { entry } = row
  const [found, setFound] = useState<readonly DiscoveredModel[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setFound([])
    setError(null)
  }, [entry.id])
  const lines = modelLines(served, profileModels(row.profile), found)
  const editable = entry.ns === PI_NS && row.configured
  const [prices, setPrices] = useState<Map<string, Price | null>>(new Map())
  const ids = lines.map((l) => l.id).join('\n')
  useEffect(() => {
    let live = true
    const items = ids ? ids.split('\n').map((model) => ({ provider: entry.id, model })) : []
    if (items.length)
      fetchPrices(items).then(
        (m) => live && setPrices(m),
        () => live && setPrices(new Map()),
      )
    return () => {
      live = false
    }
  }, [entry.id, ids])
  const raw = Array.isArray(row.profile.models) ? (row.profile.models as unknown[]) : []

  async function refresh() {
    setBusy(true)
    setError(null)
    const res = await models.discover(entry.ns, { provider: entry.id })
    setBusy(false)
    if (res.ok) setFound(res.value)
    else setError(res.error)
  }

  async function toggle(id: string, on: boolean) {
    const m = found.find((x) => x.id === id) ?? { id }
    const next = on
      ? [...raw, profileModel(m)]
      : raw.filter((x) => !(typeof x === 'object' && x !== null && (x as { id?: unknown }).id === id))
    const ok = await models
      .form(entry.ns)
      .mutate([{ op: 'set', path: [...entry.path, 'models'], value: next }])
    if (!ok) setError(t('pv.saveFailed'))
  }

  return (
    <Card
      title={t('pv.models', { n: lines.filter((l) => l.served || l.listed).length })}
      actions={
        entry.ns ? (
          <Button size="sm" disabled={busy} onClick={() => void refresh()}>
            {t('pv.refresh')}
          </Button>
        ) : undefined
      }
    >
      <div className="ap-mrow a-muted" style={{ fontSize: 12, fontWeight: 600 }}>
        <span />
        <span>{t('pv.model')}</span>
        <span>{t('pv.caps')}</span>
        <span>{t('pv.price')}</span>
      </div>
      {lines.length === 0 && (
        <div className="ap-mrow a-muted" style={{ display: 'block', fontSize: 12.5 }}>
          {t('pv.modelsEmpty')}
        </div>
      )}
      {lines.map((m) => {
        const on = m.served || m.listed
        // Model trong danh mục sẵn của provider luôn bật; chỉ model tự khai mới bật/tắt được.
        const locked = !editable || (m.served && !m.listed)
        return (
          <label className="ap-mrow" key={m.id}>
            <input
              type="checkbox"
              checked={on}
              // Khoá bằng aria-readonly thay vì disabled để giữ màu nhấn như thiết kế.
              aria-readonly={locked || undefined}
              title={locked && on ? t('pv.builtIn') : undefined}
              onChange={(e) => {
                if (!locked) void toggle(m.id, e.target.checked)
              }}
              onClick={(e) => {
                if (locked) e.preventDefault()
              }}
              aria-label={m.id}
              style={{ width: 17, height: 17, accentColor: 'var(--a-accent)' }}
            />
            <span className="a-mono" title={m.name !== m.id ? m.name : undefined}>
              {m.id}
            </span>
            <span className="ap-tags">
              {!isChatModel(m.id) && <Tag>{t('pv.cap.batch')}</Tag>}
              {m.reasoning && <Tag>{t('pv.cap.reasoning')}</Tag>}
              {m.image && <Tag>{t('pv.cap.image')}</Tag>}
              {m.contextWindow !== undefined && (
                <Tag>{t('pv.cap.ctx', { k: Math.round(m.contextWindow / 1000) })}</Tag>
              )}
            </span>
            <span className="a-muted a-num" style={{ fontSize: 12 }} title={t('pv.priceUnit')}>
              {priceText(t, prices.get(pairKey(entry.id, m.id)))}
            </span>
          </label>
        )
      })}
      <div className="ap-mrow a-muted" style={{ display: 'block', fontSize: 12 }}>
        {error ? <span style={{ color: 'var(--a-danger)' }}>{error}</span> : t('pv.modelsHint')}
      </div>
    </Card>
  )
}

/** Thêm provider tuỳ chỉnh: endpoint tương thích OpenAI/Anthropic, dò model rồi lưu. */
function NewProvider({
  t,
  models,
  taken,
  onDone,
}: {
  t: T
  models: ModelSettings
  taken: ReadonlySet<string>
  onDone: (id: string | null) => void
}) {
  const [name, setName] = useState('')
  const [route, setRoute] = useState<string | null>(null)
  const [baseURL, setBaseURL] = useState('')
  const [api, setApi] = useState<string>(PROTOCOLS[0])
  const [key, setKey] = useState('')
  const [found, setFound] = useState<readonly DiscoveredModel[] | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = route ?? routeIdOf(name)
  const idError = !id
    ? null
    : !ROUTE_RE.test(id)
      ? t('pv.newRouteBad')
      : taken.has(id)
        ? t('pv.newRouteTaken')
        : null
  const url = baseURL.trim()

  async function discover() {
    setBusy(true)
    setError(null)
    const res = await models.discover(PI_NS, {
      baseURL: url,
      api,
      ...(key.trim() ? { apiKey: key.trim() } : {}),
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setFound(res.value)
    setPicked(new Set(res.value.length <= 5 ? res.value.map((m) => m.id) : []))
  }

  async function create() {
    if (!found || picked.size === 0) return setError(t('pv.needModels'))
    setBusy(true)
    setError(null)
    const ref = deriveKeyRef(id)
    const profile = {
      ...(name.trim() ? { displayName: name.trim() } : {}),
      ...(key.trim() ? { apiKeyEnv: ref } : {}),
      api,
      baseURL: url,
      models: found.filter((m) => picked.has(m.id)).map(profileModel),
    }
    const ok = await models.form(PI_NS).mutate([{ op: 'set', path: ['providers', id], value: profile }])
    if (!ok) {
      setBusy(false)
      return setError(t('pv.saveFailed'))
    }
    if (key.trim()) {
      const stored = await models.setCredential(ref, key.trim())
      if (!stored.ok) {
        setBusy(false)
        return setError(stored.error)
      }
    }
    setBusy(false)
    onDone(id)
  }

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        {t('pv.newHint')}
      </div>
      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label className="a-field" style={{ flex: '1 1 180px' }}>
          <span className="l">{t('pv.newName')}</span>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} aria-label={t('pv.newName')} />
        </label>
        <label className="a-field" style={{ flex: '1 1 160px' }}>
          <span className="l">{t('pv.newRoute')}</span>
          <TextInput
            mono
            value={id}
            onChange={(e) => setRoute(e.target.value)}
            aria-label={t('pv.newRoute')}
          />
          {idError && (
            <span className="h" style={{ color: 'var(--a-danger)' }}>
              {idError}
            </span>
          )}
        </label>
      </span>
      <span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <label className="a-field" style={{ flex: '2 1 240px' }}>
          <span className="l">{t('pv.baseUrl')}</span>
          <TextInput
            mono
            value={baseURL}
            placeholder="http://localhost:4000/v1"
            onChange={(e) => setBaseURL(e.target.value)}
            aria-label={t('pv.baseUrl')}
          />
        </label>
        <label className="a-field" style={{ flex: '1 1 160px' }}>
          <span className="l">{t('pv.newApi')}</span>
          <Select
            label={t('pv.newApi')}
            value={api}
            onChange={setApi}
            options={PROTOCOLS.map((p) => ({ id: p, name: t(`pv.api.${p}`) }))}
          />
        </label>
      </span>
      <label className="a-field">
        <span className="l">{t('pv.newKeyOptional')}</span>
        <TextInput
          mono
          type="password"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label={t('pv.newKeyOptional')}
        />
      </label>
      <div style={{ display: 'flex', gap: 6 }}>
        <Button disabled={busy || !/^https?:\/\//.test(url)} onClick={() => void discover()}>
          {t('pv.discover')}
        </Button>
        <Button variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => onDone(null)}>
          {t('pv.cancel')}
        </Button>
        <Button
          variant="primary"
          disabled={busy || !id || !!idError || !found || picked.size === 0}
          onClick={() => void create()}
        >
          {t('pv.create')}
        </Button>
      </div>
      {found && (
        <div className="a-card" style={{ maxHeight: 260, overflowY: 'auto' }}>
          <div className="ap-mrow a-muted" style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>
            {t('pv.pick')}
          </div>
          {found.map((m) => (
            <label className="ap-mrow" key={m.id} style={{ gridTemplateColumns: '28px minmax(0,1fr)' }}>
              <input
                type="checkbox"
                checked={picked.has(m.id)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(m.id)
                  else next.delete(m.id)
                  setPicked(next)
                }}
                aria-label={m.id}
                style={{ width: 17, height: 17, accentColor: 'var(--a-accent)' }}
              />
              <span className="a-mono">{m.id}</span>
            </label>
          ))}
        </div>
      )}
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{error}</div>}
    </Box>
  )
}

/** Cột phải: model của provider đang chọn được gán cho việc nào. */
function UsedAt({
  t,
  nav,
  name,
  used,
}: {
  t: T
  nav: PageProps['nav']
  name: string
  used: ReturnType<typeof usedAt>
}) {
  const label = (r: UseRow) =>
    r.kind === 'chat' || r.kind === 'embed' ? t(`pv.used.${r.kind}`) : t(`pv.used.${r.kind}`, { n: r.step })
  const empty = used.rows.length === 0 && used.bots.length === 0
  return (
    <>
      <Card title={t('pv.used.title')} subtitle={t('pv.used.hint', { name })}>
        {empty && <div className="ap-grid2 a-muted">{t('pv.used.none')}</div>}
        {used.rows.map((r) => (
          <div className="ap-grid2" key={`${r.kind}:${r.step ?? 0}:${r.model}`}>
            <span>{label(r)}</span>
            <span className="a-mono" style={{ fontSize: 12.5 }}>
              {r.model}
            </span>
          </div>
        ))}
        {used.bots.length > 0 && (
          <div className="ap-grid2">
            <span>{t('pv.used.bots')}</span>
            <span style={{ fontSize: 12.5 }}>{used.bots.join(', ')}</span>
          </div>
        )}
        <div className="ap-grid2" style={{ display: 'block' }}>
          <a className="ap-link" onClick={() => nav.go('settings', { section: 'model' })}>
            {t('pv.used.go')}
          </a>
        </div>
      </Card>
      <Box style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="a-muted">
          {t('pv.see.cost')}:{' '}
          <a
            className="ap-link"
            style={{ fontSize: 12.5 }}
            onClick={() => nav.go('settings', { section: 'stats' })}
          >
            {t('pv.see.stats')}
          </a>
        </span>
        <span className="a-muted">
          {t('pv.see.cap')}:{' '}
          <a
            className="ap-link"
            style={{ fontSize: 12.5 }}
            onClick={() => nav.go('settings', { section: 'guard' })}
          >
            {t('pv.see.budget')}
          </a>
        </span>
      </Box>
    </>
  )
}

export function Provider({ t, models, nav, params }: PageProps) {
  const ps = useProvidersState()
  const sem = useSemantic()
  const media = useMedia()
  const team = useTeam()
  const [entries, setEntries] = useState<readonly ProviderEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [groups, setGroups] = useState<readonly ModelGroup[]>([])
  const [creds, setCreds] = useState<Readonly<Record<string, CredentialState>>>({})
  const [rev, setRev] = useState(0)
  // `params.provider` chọn sẵn một provider (link từ Tìm theo nghĩa).
  const [picked, setPicked] = useState<string | undefined>(params.provider || undefined)
  const [adding, setAdding] = useState(false)
  const [probe, setProbe] = useState<{
    id: string
    ok: boolean
    ms: number
    error?: string | undefined
  } | null>(null)
  const reload = useCallback(() => setRev((r) => r + 1), [])
  useEffect(() => {
    if (params.provider) {
      setPicked(params.provider)
      setAdding(false)
    }
  }, [params.provider])

  useEffect(() => {
    if (!models) return
    let live = true
    void models.providers().then((res) => {
      if (!live) return
      if (res.ok) {
        setEntries(res.value)
        setLoadError(null)
      } else setLoadError(res.error)
    })
    models
      .catalog()
      .then((g) => live && setGroups(g))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [models, rev])

  const namespaces = useMemo(
    () => [...new Set([DEFAULT_NS, ...(entries ?? []).map((e) => e.ns).filter(Boolean)])],
    [entries],
  )
  const nsValue = useNamespaces(models, namespaces)
  const refs = useMemo(() => (entries ? credentialRefs(entries, nsValue) : []), [entries, nsValue])
  const refsKey = refs.join('|')
  useEffect(() => {
    if (!models || refs.length === 0) return
    let live = true
    void models.credentials(refs).then((res) => live && res.ok && setCreds(res.value))
    return () => {
      live = false
    }
  }, [models, refsKey, rev]) // `refsKey` đại diện cho danh sách tên khoá

  const chatRows = useMemo(
    () => (entries ? buildRows(entries, nsValue, creds) : []),
    [entries, nsValue, creds],
  )
  // Nhà cung cấp chỉ cho ảnh, video (fal.ai): đứng chung danh bạ, khoá nhập ở đây như các nhà khác.
  const mediaRows = useMemo<ProviderRow[]>(
    () =>
      (media.data?.keys ?? []).map((k) => ({
        entry: {
          id: `${MEDIA_PREFIX}${k.provider}`,
          name: k.name,
          ns: '',
          path: [],
          nativeEnv: [],
          active: k.hasKey,
        },
        configured: k.hasKey,
        profile: {},
        keyRef: k.ref,
        keyNamed: false,
        key: undefined,
        nativeKey: false,
        status: k.hasKey ? 'ok' : 'nokey',
      })),
    [media.data],
  )
  const rows = useMemo(() => [...chatRows, ...mediaRows], [chatRows, mediaRows])
  // Provider có model ảnh, video (từ danh sách model của mục Model) và model nhúng (từ Tìm theo nghĩa).
  const has = useMemo(
    () => ({
      media: new Set((media.data?.models ?? []).map((m) => m.provider)),
      embed: new Set((sem.data?.models ?? []).map((m) => m.provider)),
    }),
    [media.data, sem.data],
  )
  const defaultValue = nsValue(DEFAULT_NS) as Record<string, unknown> | undefined
  const defaultProvider = str(defaultValue?.provider)
  const row =
    rows.find((r) => r.entry.id === picked) ??
    rows.find((r) => r.entry.id === defaultProvider) ??
    rows.find((r) => r.configured)
  const served = row ? groups.find((g) => g.id === row.entry.id) : undefined

  const select = (id: string) => {
    setPicked(id)
    setAdding(false)
    setProbe(null)
  }

  // Model của provider đang chọn được gán ở đâu (chat, dự phòng, ảnh, video, nhúng, bot riêng).
  const mediaId = row?.entry.id.startsWith(MEDIA_PREFIX)
    ? row.entry.id.slice(MEDIA_PREFIX.length)
    : row?.entry.id
  const used = useMemo(() => {
    const model = str(defaultValue?.model)
    const own = (p: { mode: string; list?: readonly { provider: string }[] | undefined } | undefined) =>
      p?.mode === 'own' ? (p.list ?? []).map((l) => l.provider) : []
    const bots = new Map<string, Set<string>>()
    const add = (name: string, ids: readonly (string | undefined)[]) => {
      const set = bots.get(name) ?? new Set<string>()
      for (const id of ids) if (id) set.add(id)
      bots.set(name, set)
    }
    for (const b of team.bots)
      add(b.name, [b.model?.provider, b.models?.goal?.provider, b.models?.fallback?.provider])
    for (const b of media.data?.bots ?? []) add(b.name, [...own(b.media.image), ...own(b.media.video)])
    return usedAt(mediaId ?? '', {
      chat: defaultProvider && model ? { provider: defaultProvider, model } : undefined,
      chain: ps.data?.chain ?? [],
      image: media.data?.settings.image ?? [],
      video: media.data?.settings.video ?? [],
      embed: sem.data?.model,
      bots: [...bots].map(([name, set]) => ({ name, providers: [...set] })),
    })
  }, [mediaId, defaultValue, defaultProvider, team.bots, media.data, ps.data, sem.data])

  // Route DeepSeek chính thức của dsh gọi endpoint tương thích Anthropic.
  const api = row
    ? (str(row.profile.api) ?? (row.entry.ns === DEEPSEEK_NS ? 'anthropic-messages' : undefined))
    : undefined
  const subtitle = row?.entry.id.startsWith(MEDIA_PREFIX)
    ? t('pv.mediaOnly', { ref: row.keyRef ?? '' })
    : row
      ? [
          api
            ? t('pv.sdk', { api: PROTOCOLS.includes(api as never) ? t(`pv.api.${api}`) : api })
            : t('pv.route', { id: row.entry.id }),
          row.entry.id === defaultProvider ? t('pv.default') : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : undefined
  const probed = probe && row && probe.id === row.entry.id ? probe : null

  if (!models)
    return (
      <PageShell title={t('sec.provider')}>
        <div className="a-muted">{t('pv.notServed')}</div>
      </PageShell>
    )

  return (
    <div className="ap-split">
      <Directory
        t={t}
        rows={rows}
        has={has}
        selected={row?.entry.id}
        adding={adding}
        onSelect={select}
        onAdd={() => setAdding(true)}
      />
      <PageShell
        title={
          adding ? (
            t('pv.newTitle')
          ) : row ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              <span className="ap-logo" style={{ background: providerColor(row.entry.id) }} />
              {row.entry.name}
            </span>
          ) : (
            t('sec.provider')
          )
        }
        subtitle={
          adding
            ? undefined
            : (subtitle ?? (loadError ? t('pv.loadError', { error: loadError }) : t('pv.loading')))
        }
        actions={
          probed && (
            <span title={probed.error}>
              <Pill tone={probed.ok ? 'ok' : 'danger'}>
                {probed.ok ? t('pv.probeOk', { ms: probed.ms }) : t('pv.probeFail')}
              </Pill>
            </span>
          )
        }
      >
        <div className="ap-cols">
          <Col grow={1.2} basis={440}>
            {adding ? (
              <NewProvider
                t={t}
                models={models}
                taken={new Set(rows.map((r) => r.entry.id))}
                onDone={(id) => {
                  setAdding(false)
                  if (id) {
                    setPicked(id)
                    reload()
                  }
                }}
              />
            ) : row?.entry.id.startsWith(MEDIA_PREFIX) ? (
              <MediaProviderPanel
                t={t}
                provider={row.entry.id.slice(MEDIA_PREFIX.length)}
                api={media}
                onOpenMedia={() => nav.go('settings', { section: 'model' })}
              />
            ) : row ? (
              <>
                <Connection
                  key={row.entry.id}
                  t={t}
                  row={row}
                  models={models}
                  served={served}
                  result={probed}
                  onChanged={reload}
                  onProbe={(r) => setProbe({ id: row.entry.id, ...r })}
                  pool={ps.data?.pools.find((p) => p.provider === row.entry.id)}
                  act={ps.act}
                />
                <ModelTable t={t} row={row} models={models} served={served} />
              </>
            ) : null}
          </Col>
          <Col basis={300}>
            {!adding && row && <UsedAt t={t} nav={nav} name={row.entry.name} used={used} />}
          </Col>
        </div>
      </PageShell>
    </div>
  )
}
