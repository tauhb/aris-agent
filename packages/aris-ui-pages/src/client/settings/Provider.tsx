/**
 * 6.2 · Provider và model (đặc tả: docs/specs/aris-providers.md), bố cục theo canvas:
 * - Cột trái: danh bạ nhà cung cấp của dsh (đã kết nối / có sẵn), ô tìm, thêm provider tuỳ chỉnh.
 * - Giữa: provider đang chọn: khoá (chỉ ghi), Base URL, gọi thử model, bảng model.
 * - Cột phải: chi phí, model theo việc, thứ tự dự phòng.
 * Nằm trong khung Cài đặt như các mục khác. Route, khoá, danh mục model đọc và ghi thẳng vào dịch
 * vụ của dsh; vòng khoá, thứ tự dự phòng, giá và chi phí qua `/api/aris/providers/state`.
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
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type {
  ConfigFormLike,
  CredentialState,
  DiscoveredModel,
  ModelGroup,
  ModelSettings,
  PageProps,
  ProviderEntry,
} from '../page.js'
import { modelOptions } from '../options.js'
import { EmbedSelect, SemanticCard, useSemantic, type SemanticApi } from './Semantic.js'
import { Box, Col, Dot } from '../ui.js'
import {
  ACCOUNT_ROUTE,
  ROUTE_RE,
  buildRows,
  credentialRefs,
  deriveKeyRef,
  isChatModel,
  modelLines,
  probeReason,
  profileModel,
  profileModels,
  providerColor,
  routeIdOf,
  splitDirectory,
  type ProviderRow,
} from './provider-data.js'
import {
  fetchPrices,
  usd,
  useProvidersState,
  type Cost,
  type Link,
  type Pool,
  type Price,
} from './providers-api.js'

/** Mã mục "Model" của dsh trong `settings.section`: trang này thay nó, nên nó không hiện trong Cài đặt. */
export const DSH_MODELS_SECTION = 'models'

/** Namespace của route pi-ai: nơi thêm provider tuỳ chỉnh và tự khai model. */
const PI_NS = 'llm-pi-ai'
/** Namespace của route DeepSeek chính thức. */
const DEEPSEEK_NS = 'llm-deepseek'
/** Endpoint mặc định của route DeepSeek (dsh-llm-deepseek `PUBLIC_BASE_URL`); dsh không báo qua danh bạ. */
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic'
/** Namespace model mặc định của phiên mới. */
const DEFAULT_NS = 'agent-default-model'
/** Kiểu API mà dsh dò được danh sách model. */
const PROTOCOLS = ['openai-completions', 'openai-responses', 'anthropic-messages'] as const
/** Số provider "có sẵn" hiện khi chưa mở hết. */
const FEW = 6

type T = PageProps['t']

/** Model theo việc: việc chỉnh được, việc đi theo model khác, việc chưa có ở giai đoạn này. */
const TASKS: readonly { id: string; note?: string }[] = [
  { id: 'chat' },
  { id: 'commander', note: 'pv.phase2' },
  { id: 'learn', note: 'pv.phase3' },
  { id: 'recall', note: 'pv.step3' },
  { id: 'judge', note: 'pv.phase3' },
  { id: 'compaction', note: 'pv.followSession' },
  { id: 'reflect', note: 'pv.followCompaction' },
  { id: 'title', note: 'pv.followSession' },
  { id: 'eval', note: 'pv.phase3' },
  { id: 'embed' },
]

const pairKey = (provider: string, model: string) => `${provider}\u0000${model}`
const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)

function useForm(form: ConfigFormLike | undefined) {
  return useSyncExternalStore(
    (fn) => form?.subscribe(fn) ?? (() => {}),
    () => form?.getSnapshot(),
  )
}

/** Giá trị các namespace cấu hình, vẽ lại khi một namespace đổi. */
function useNamespaces(models: ModelSettings | undefined, namespaces: readonly string[]) {
  const [version, setVersion] = useState(0)
  const key = namespaces.join('|')
  useEffect(() => {
    if (!models) return
    const offs = namespaces.map((ns) => models.form(ns).subscribe(() => setVersion((v) => v + 1)))
    return () => offs.forEach((off) => off())
  }, [models, key]) // `key` đại diện cho danh sách namespace
  return useCallback(
    (ns: string) => (models && ns ? models.form(ns).getSnapshot().value : undefined),
    [models, version], // `version` tăng khi một namespace đổi, buộc đọc lại
  )
}

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

/** Cột trái: danh bạ nhà cung cấp. */
function Directory({
  t,
  rows,
  selected,
  adding,
  onSelect,
  onAdd,
}: {
  t: T
  rows: readonly ProviderRow[]
  selected: string | undefined
  adding: boolean
  onSelect: (id: string) => void
  onAdd: () => void
}) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const { connected, available } = useMemo(() => splitDirectory(rows, query), [rows, query])
  const shown = all || query ? available : available.slice(0, FEW)
  const item = (r: ProviderRow, muted?: boolean) => (
    <NavItem
      key={r.entry.id}
      label={r.entry.name}
      variant="plain"
      className={muted ? 'a-muted' : undefined}
      active={!adding && r.entry.id === selected}
      icon={<Dot color={providerColor(r.entry.id)} />}
      meta={muted ? undefined : <StatusMark t={t} row={r} />}
      onClick={() => onSelect(r.entry.id)}
    />
  )
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
      {connected.length > 0 && <div className="ap-h">{t('pv.connected')}</div>}
      {connected.map((r) => item(r))}
      {available.length > 0 && <div className="ap-h">{t('pv.available')}</div>}
      {shown.map((r) => item(r, true))}
      {!query && available.length > FEW && (
        <NavItem
          label={all ? t('pv.less') : t('pv.all', { n: available.length })}
          style={{ color: 'var(--a-accent)' }}
          onClick={() => setAll(!all)}
        />
      )}
      {query && connected.length + available.length === 0 && (
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

/** Model theo việc: chat ghi thẳng vào `agent-default-model`; việc khác hiện trạng thái. */
function Tasks({
  t,
  models,
  groups,
  error,
  sem,
}: {
  t: T
  models: ModelSettings
  groups: readonly ModelGroup[]
  error: string | null
  sem: SemanticApi
}) {
  const form = models.form(DEFAULT_NS)
  const snap = useForm(form)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const value = (snap?.value ?? {}) as Record<string, unknown>
  const provider = str(value.provider) ?? ''
  const model = str(value.model) ?? ''
  const current = provider && model ? pairKey(provider, model) : ''

  async function change(next: string) {
    setBusy(true)
    setFailed(false)
    const [p, m] = next.split('\u0000')
    const ok = await form.mutate([
      { op: 'set', path: ['provider'], value: p },
      { op: 'set', path: ['model'], value: m },
    ])
    setBusy(false)
    setFailed(!ok)
  }

  return (
    <Card title={t('pv.byTask')} subtitle={t('pv.byTaskHint')}>
      {error && (
        <div className="ap-grid2" style={{ color: 'var(--a-danger)', display: 'block' }}>
          {t('pv.catalogError', { error })}
        </div>
      )}
      {TASKS.map((task) => (
        <div className="ap-grid2" key={task.id}>
          <span className={task.note ? 'a-muted' : undefined}>{t(`pv.task.${task.id}`)}</span>
          {task.id === 'chat' ? (
            snap?.status === 'unavailable' ? (
              <span className="a-muted">{t('pv.notServed')}</span>
            ) : (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <Select
                  label={t('pv.task.chat')}
                  value={current}
                  disabled={busy || snap?.status !== 'ready' || !snap.writable}
                  onChange={(v) => void change(v)}
                  options={modelOptions(
                    groups,
                    undefined,
                    current ? { provider, model } : undefined,
                    (_p, m) => isChatModel(m),
                  )}
                  searchPlaceholder={t('sel.search')}
                  emptyLabel={t('sel.empty')}
                />
                {failed && (
                  <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{t('pv.saveFailed')}</span>
                )}
              </span>
            )
          ) : task.id === 'embed' ? (
            <EmbedSelect t={t} sem={sem} />
          ) : (
            <span className="ap-sel a-muted">{t(task.note!)}</span>
          )}
        </div>
      ))}
    </Card>
  )
}

/** Chi phí hôm nay và 7 ngày, theo bảng giá pi-ai. */
function CostBox({ t, cost }: { t: T; cost: Cost | undefined }) {
  const loc = t('pv.locale')
  return (
    <Box>
      <b>{t('pv.cost')}</b>
      <div style={{ display: 'flex', gap: 18, marginTop: 6, fontSize: 13 }}>
        <span>
          <span className="a-num" style={{ fontSize: 20, fontWeight: 600 }}>
            {cost ? usd(cost.today, loc) : '—'}
          </span>{' '}
          <span className="a-muted">{t('pv.costToday')}</span>
        </span>
        <span>
          <span className="a-num" style={{ fontSize: 20, fontWeight: 600 }}>
            {cost ? usd(cost.week, loc) : '—'}
          </span>{' '}
          <span className="a-muted">{t('pv.costWeek')}</span>
        </span>
      </div>
      {cost?.byModel.slice(0, 4).map((m) => (
        <div key={pairKey(m.provider, m.model)} className="a-muted" style={{ fontSize: 12, marginTop: 4 }}>
          <span className="a-mono">{m.model}</span> · {t('pv.costCalls', { n: m.calls })} ·{' '}
          {m.priced ? `${usd(m.usd, loc)} USD` : t('pv.costUnpriced')}
        </div>
      ))}
      <div className="a-muted" style={{ fontSize: 12, marginTop: 6 }}>
        {t('pv.costHint')}
      </div>
    </Box>
  )
}

/** Thứ tự dự phòng: lỗi hoặc hết hạn mức thì chuyển sang mắt xích kế tiếp. */
function Fallback({
  t,
  chain,
  groups,
  rows,
  busy,
  error,
  onSave,
}: {
  t: T
  chain: readonly Link[] | undefined
  groups: readonly ModelGroup[]
  rows: readonly ProviderRow[]
  busy: boolean
  error: string | null
  onSave: (chain: Link[]) => void
}) {
  const [adding, setAdding] = useState('')
  const links = chain ?? []
  const name = (id: string) => rows.find((r) => r.entry.id === id)?.entry.name ?? id
  const has = new Set(links.map((l) => pairKey(l.provider, l.model)))
  const move = (i: number, d: -1 | 1) => {
    const next = [...links]
    ;[next[i], next[i + d]] = [next[i + d]!, next[i]!]
    onSave(next)
  }
  return (
    <Box>
      <b>{t('pv.fallback')}</b>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        {links.length === 0 && (
          <div className="a-muted" style={{ fontSize: 12.5 }}>
            {t('pv.fallbackEmpty')}
          </div>
        )}
        {links.map((l, i) => (
          <div key={pairKey(l.provider, l.model)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag>{`${i + 1} · ${name(l.provider)}`}</Tag>
            <span
              className="a-mono"
              style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {l.model}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || i === 0}
                aria-label={t('pv.up')}
                onClick={() => move(i, -1)}
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || i === links.length - 1}
                aria-label={t('pv.down')}
                onClick={() => move(i, 1)}
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                aria-label={t('pv.remove')}
                onClick={() => onSave(links.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </span>
          </div>
        ))}
      </div>
      <Select
        label={t('pv.fallbackAdd')}
        value={adding}
        disabled={busy}
        placeholder={t('pv.fallbackAdd')}
        style={{ marginTop: 8 }}
        onChange={(v) => {
          setAdding('')
          if (!v) return
          const [provider, model] = v.split('\u0000') as [string, string]
          onSave([...links, { provider, model }])
        }}
        options={modelOptions(
          groups,
          undefined,
          undefined,
          (p, m) => isChatModel(m) && !has.has(pairKey(p, m)),
        )}
        searchPlaceholder={t('sel.search')}
        emptyLabel={t('sel.empty')}
      />
      <div className="a-muted" style={{ fontSize: 12, marginTop: 6 }}>
        {error ? <span style={{ color: 'var(--a-danger)' }}>{error}</span> : t('pv.fallbackHint')}
      </div>
    </Box>
  )
}

export function Provider({ t, models }: PageProps) {
  const ps = useProvidersState()
  const sem = useSemantic()
  const [entries, setEntries] = useState<readonly ProviderEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [groups, setGroups] = useState<readonly ModelGroup[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [creds, setCreds] = useState<Readonly<Record<string, CredentialState>>>({})
  const [rev, setRev] = useState(0)
  const [picked, setPicked] = useState<string | undefined>()
  const [adding, setAdding] = useState(false)
  const [probe, setProbe] = useState<{
    id: string
    ok: boolean
    ms: number
    error?: string | undefined
  } | null>(null)
  const reload = useCallback(() => setRev((r) => r + 1), [])

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
      .then((g) => live && (setGroups(g), setCatalogError(null)))
      .catch((e: Error) => live && setCatalogError(e.message))
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

  const rows = useMemo(() => (entries ? buildRows(entries, nsValue, creds) : []), [entries, nsValue, creds])
  const defaultProvider = str((nsValue(DEFAULT_NS) as Record<string, unknown> | undefined)?.provider)
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

  // Route DeepSeek chính thức của dsh gọi endpoint tương thích Anthropic.
  const api = row
    ? (str(row.profile.api) ?? (row.entry.ns === DEEPSEEK_NS ? 'anthropic-messages' : undefined))
    : undefined
  const subtitle = row
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
          <Col basis={360}>
            <CostBox t={t} cost={ps.data?.cost} />
            <Tasks t={t} models={models} groups={groups} error={catalogError} sem={sem} />
            <SemanticCard t={t} sem={sem} />
            <Fallback
              t={t}
              chain={ps.data?.chain}
              groups={groups}
              rows={rows}
              busy={ps.busy}
              error={ps.error}
              onSave={(chain) => void ps.act({ op: 'chain', chain })}
            />
          </Col>
        </div>
      </PageShell>
    </div>
  )
}
