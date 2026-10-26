/**
 * Ảnh và video (giai đoạn 5, đợt 5c; bản vẽ 6.2b, 2.2f): dữ liệu và các mảnh dùng chung của mục Model (thứ tự
 * model tạo ảnh, tạo video cho cả đội, trần chi phí mỗi ngày, gán riêng theo bot: tắt, theo thứ tự chung, danh
 * sách riêng nhiều model), dòng Tạo ảnh / Tạo video ở tab Model của hồ sơ bot và khoá fal.ai ở mục Provider và
 * khoá. Tất cả cùng một dữ liệu (`/api/aris/media`). Mục "Ảnh và video" riêng đã gộp vào Model.
 */
import { Button, Card, Checkbox, Select } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { providerName } from './provider-data.js'

type T = PageProps['t']
export type MediaKind = 'image' | 'video'
type Kind = MediaKind
export const KINDS: readonly MediaKind[] = ['image', 'video']

export interface MediaLink {
  provider: string
  model: string
}
export interface MediaModel extends MediaLink {
  kind: Kind
  usd?: number
  paid: boolean
  hasKey: boolean
}
export interface Policy {
  mode: 'off' | 'shared' | 'own'
  list?: MediaLink[]
  fallback?: boolean
  capUsd?: number
}
export interface BotRow {
  id: string
  name: string
  kind: string
  media: Partial<Record<Kind, Policy>>
  today: Record<Kind, number>
}
export interface MediaState {
  settings: { image: MediaLink[]; video: MediaLink[]; caps: Record<Kind, number> }
  models: MediaModel[]
  today: Record<Kind, number>
  bots: BotRow[]
  keys: { provider: string; name: string; ref: string; site: string; hasKey: boolean }[]
}

const endpoint = () => new URL('api/aris/media', document.baseURI)
const same = (a: MediaLink, b: MediaLink) => a.provider === b.provider && a.model === b.model
const PROVIDER: Record<string, string> = { google: 'Google Gemini', openrouter: 'OpenRouter', fal: 'fal.ai' }
/** Tên hiển thị của provider ảnh, video, nhúng. */
export const providerLabel = (id: string) => PROVIDER[id] ?? providerName(id, id)
const usd = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 })

export function useMedia() {
  const [data, setData] = useState<MediaState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(endpoint()).catch(() => null)
    if (r?.ok) setData((await r.json()) as MediaState)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const act = useCallback(async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (MediaState & { error?: string }) | null
    setBusy(false)
    if (!r?.ok || !j) return void setError(j?.error ?? 'HTTP error')
    setData(j)
  }, [])
  return { data, busy, error, act }
}
export type MediaApi = ReturnType<typeof useMedia>

/** Một mắt xích: model, rồi nhà cung cấp và giá. */
function LinkLabel({ t, m, link }: { t: T; m: MediaModel | undefined; link: MediaLink }) {
  const price =
    m?.usd !== undefined
      ? t(m.kind === 'image' ? 'md.perImage' : 'md.perSecond', { usd: usd(m.usd) })
      : t('md.byProvider')
  return (
    <span
      style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}
      title={`${link.provider}/${link.model}`}
    >
      <span
        className="a-mono"
        style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {link.model}
      </span>
      <span
        className="a-muted"
        style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {PROVIDER[link.provider] ?? link.provider} · {price}
      </span>
    </span>
  )
}

/** Danh sách model theo thứ tự: lên, xuống, bỏ, thêm. */
export function ChainEditor({
  t,
  kind,
  links,
  models,
  busy,
  onChange,
}: {
  t: T
  kind: Kind
  links: readonly MediaLink[]
  models: readonly MediaModel[]
  busy: boolean
  onChange: (next: MediaLink[]) => void
}) {
  const ofKind = models.filter((m) => m.kind === kind)
  const missing = ofKind.filter((m) => !links.some((l) => same(l, m)))
  const move = (i: number, d: number) => {
    const next = [...links]
    const [x] = next.splice(i, 1)
    next.splice(i + d, 0, x!)
    onChange(next)
  }
  return (
    <div className="ap-mchain">
      {links.length === 0 && <div className="ap-mchain-row a-muted">{t('md.empty')}</div>}
      {links.map((l, i) => {
        const m = ofKind.find((x) => same(x, l))
        return (
          <div className="ap-mchain-row" key={`${l.provider}/${l.model}`}>
            <span className="n">{i + 1}</span>
            <LinkLabel t={t} m={m} link={l} />
            <span className={`ap-pill2 ${m?.hasKey ? (m.paid ? 'warn' : 'ok') : ''}`}>
              {!m?.hasKey ? t('md.noKey') : m.paid ? t('md.paid') : t('md.ready')}
            </span>
            <span className="acts">
              <button
                type="button"
                disabled={busy || i === 0}
                aria-label={t('md.up')}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={busy || i === links.length - 1}
                aria-label={t('md.down')}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                disabled={busy}
                aria-label={t('md.remove')}
                onClick={() => onChange(links.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          </div>
        )
      })}
      {missing.length > 0 && (
        <div className="ap-mchain-row">
          <Select
            label={t('md.add')}
            value=""
            placeholder={t('md.add')}
            disabled={busy}
            options={missing.map((m) => ({
              id: `${m.provider}/${m.model}`,
              name: m.model,
              note: `${PROVIDER[m.provider] ?? m.provider}${m.hasKey ? '' : ` · ${t('md.noKey')}`}`,
            }))}
            onChange={(id) => {
              const m = missing.find((x) => `${x.provider}/${x.model}` === id)
              if (m) onChange([...links, { provider: m.provider, model: m.model }])
            }}
          />
        </div>
      )}
    </div>
  )
}

/** Cách chọn model của một bot cho một loại: tắt, theo chung, riêng (nhiều model), rơi về chung, trần riêng. */
export function PolicyEditor({ t, kind, bot, api }: { t: T; kind: Kind; bot: BotRow; api: MediaApi }) {
  const d = api.data!
  const p: Policy = bot.media[kind] ?? { mode: 'shared' }
  const save = (next: Policy | null) => void api.act({ op: 'bot', bot: bot.id, kind, policy: next })
  const shared = d.settings[kind].map((l) => l.model).join(' → ') || t('md.empty')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Select
        label={t(kind === 'image' ? 'md.image' : 'md.video')}
        value={p.mode}
        disabled={api.busy}
        options={[
          {
            id: 'off',
            name: t('md.mode.off'),
            note: t(kind === 'image' ? 'md.mode.offImage' : 'md.mode.offVideo'),
          },
          { id: 'shared', name: t('md.mode.shared'), note: shared },
          { id: 'own', name: t('md.mode.own'), note: t('md.mode.ownNote') },
        ]}
        onChange={(mode) =>
          save(
            mode === 'shared'
              ? null
              : mode === 'off'
                ? { mode: 'off' }
                : {
                    mode: 'own',
                    list: p.list?.length ? p.list : d.settings[kind],
                    fallback: p.fallback ?? false,
                  },
          )
        }
      />
      {p.mode === 'shared' && (
        <span className="a-muted" style={{ fontSize: 11.5 }}>
          {t('md.nowUsing', { list: shared })}
        </span>
      )}
      {p.mode === 'own' && (
        <>
          <ChainEditor
            t={t}
            kind={kind}
            links={p.list ?? []}
            models={d.models}
            busy={api.busy}
            onChange={(list) => save({ ...p, list })}
          />
          <Checkbox
            checked={!!p.fallback}
            disabled={api.busy}
            onChange={(v) => save({ ...p, fallback: v })}
            label={t('md.fallback')}
          />
        </>
      )}
      {p.mode !== 'off' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
          {t('md.botCap')}
          <input
            className="a-inp"
            type="number"
            min={0}
            step={0.1}
            style={{ width: 90 }}
            defaultValue={p.capUsd ?? ''}
            placeholder={t('md.noCap')}
            onBlur={(e) => {
              const v = e.target.value.trim()
              const n = Number(v.replace(',', '.'))
              if (v === '' && p.capUsd === undefined) return
              if (v !== '' && (!(n >= 0) || n === p.capUsd)) return
              const next: Policy = { ...p }
              if (v === '') delete next.capUsd
              else next.capUsd = n
              save(next.mode === 'shared' && next.capUsd === undefined ? null : next)
            }}
          />
          <span className="a-muted">USD · {t('md.todaySpent', { usd: usd(bot.today[kind]) })}</span>
        </label>
      )}
    </div>
  )
}

/** Dòng Tạo ảnh, Tạo video trong tab Model của hồ sơ bot. */
export function BotMediaRows({ t, botId, onManage }: { t: T; botId: string; onManage: () => void }) {
  const api = useMedia()
  const bot = api.data?.bots.find((b) => b.id === botId)
  if (!api.data || !bot) return null
  return (
    <>
      {KINDS.map((kind) => (
        <div className="ap-taskrow" key={kind}>
          <span className="lbl">
            {t(kind === 'image' ? 'md.image' : 'md.video')}
            <span className="a-muted">{t(kind === 'image' ? 'md.imageHint' : 'md.videoHint')}</span>
          </span>
          <span className="ctl">
            <PolicyEditor t={t} kind={kind} bot={bot} api={api} />
          </span>
        </div>
      ))}
      {api.error && (
        <div className="a-row" style={{ fontSize: 12.5, color: 'var(--a-danger)' }}>
          {api.error}
        </div>
      )}
      <div className="a-row a-muted" style={{ fontSize: 12, justifyContent: 'space-between', gap: 8 }}>
        <span>{t('md.sameData')}</span>
        <a className="ap-link" onClick={onManage}>
          {t('md.manage')}
        </a>
      </div>
    </>
  )
}

/**
 * Nhà cung cấp chỉ dùng cho ảnh, video (fal.ai) ở mục Provider và khoá: khoá (chỉ ghi, không đọc lại được) và
 * các model của nó. Sắp thứ tự ở mục Model.
 */
export function MediaProviderPanel({
  t,
  provider,
  api,
  onOpenMedia,
}: {
  t: T
  provider: string
  api: MediaApi
  onOpenMedia: () => void
}) {
  const [value, setValue] = useState('')
  const k = api.data?.keys.find((x) => x.provider === provider)
  if (!k) return null
  const models = (api.data?.models ?? []).filter((m) => m.provider === provider)
  const save = () => {
    const v = value.trim()
    if (v) void api.act({ op: 'key', provider, value: v }).then(() => setValue(''))
  }
  return (
    <>
      <Card title={t('md.keyTitle')}>
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <form
            style={{ display: 'flex', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <input
              className="a-inp a-mono"
              type="password"
              autoComplete="off"
              aria-label={t('md.keyInput', { name: k.name })}
              placeholder={k.hasKey ? t('md.keyReplace') : t('md.keyPaste')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button size="sm" variant="primary" disabled={api.busy || !value.trim()} onClick={save}>
              {t('md.keySave')}
            </Button>
            {k.hasKey && (
              <Button
                size="sm"
                disabled={api.busy}
                onClick={() => void api.act({ op: 'key', provider, value: '' })}
              >
                {t('md.keyRemove')}
              </Button>
            )}
          </form>
          <span className="a-muted" style={{ fontSize: 12 }}>
            {t('md.keyNote', { ref: k.ref, site: k.site })}
          </span>
          <span className={`ap-pill2 ${k.hasKey ? 'ok' : ''}`} style={{ alignSelf: 'flex-start' }}>
            {k.hasKey ? t('md.keySet') : t('md.noKey')}
          </span>
          {api.error && <span style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{api.error}</span>}
        </div>
      </Card>
      <Card title={t('md.providerModels', { n: models.length })}>
        <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="ap-mchain">
            {models.map((m) => (
              <div className="ap-mchain-row" key={m.model}>
                <span className="ap-pill2">{t(m.kind === 'image' ? 'md.kindImage' : 'md.kindVideo')}</span>
                <LinkLabel t={t} m={m} link={m} />
              </div>
            ))}
          </div>
          <a className="ap-link" style={{ alignSelf: 'flex-end', fontSize: 12.5 }} onClick={onOpenMedia}>
            {t('md.orderThere')}
          </a>
        </div>
      </Card>
    </>
  )
}
