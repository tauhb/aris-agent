/**
 * 6.2b · Model (bản vẽ `ModelViec.dc.html`): việc nào dùng model nào và model lỗi thì chuyển sang model kế
 * tiếp. Cột trái: Chat và việc nền (một danh sách dọc: dòng 1 là model chính, các dòng sau là dự phòng), thứ
 * tự tạo ảnh và tạo video cho cả đội, cả ba cùng kiểu `ChainList`. Cột phải: gán riêng theo bot, cách aris
 * chọn model. Chuỗi dự phòng chat qua `/api/aris/providers/state`, model chat chính ghi thẳng vào
 * `agent-default-model` của dsh, ảnh và video qua `/api/aris/media`; model chat riêng của bot đọc từ đội bot.
 * Khoá và danh bạ provider ở mục Provider và khoá.
 */
import { Button, Card, PageShell, useTeam } from '@aris/ui-kit/react'
import { useEffect, useMemo, useState } from 'react'
import type { CredentialState, ModelGroup, ModelSettings, PageProps, ProviderEntry } from '../page.js'
import { modelOptions } from '../options.js'
import { Bot } from '../ui.js'
import {
  joinChain,
  linkKey,
  linkStatus,
  moveLink,
  planChain,
  removeLink,
  type LinkStatus,
} from './chain-list.js'
import { ChainList, type ChainRow } from './ChainList.js'
import { FIXED_CAPS } from './Guard.js'
import {
  ChainEditor,
  KINDS,
  PolicyEditor,
  providerLabel,
  useMedia,
  type MediaApi,
  type MediaKind,
  type Policy,
} from './Media.js'
import { DEFAULT_NS, pairKey, str, useCatalog, useForm, useNamespaces } from './model-common.js'
import {
  buildRows,
  credentialRefs,
  isChatModel,
  modelLines,
  profileModels,
  providerColor,
  providerName,
} from './provider-data.js'
import { fetchPrices, usd, useProvidersState, type Link, type Price } from './providers-api.js'

type T = PageProps['t']

/** Trần riêng cố định của vòng học nền (USD mỗi ngày), cùng nguồn với mục Ngân sách. */
const REFLECT_CAP = FIXED_CAPS.find(([k]) => k === 'guard.cap.reflect')?.[1]

const splitPair = (v: string) => v.split('\u0000') as [string, string]

const toLink = (k: string): Link => {
  const [provider, model] = splitPair(k)
  return { provider, model }
}

/** Bảng giá của các model đang có trong chuỗi chat; `null` khi chưa tải được (không kết luận "chưa có giá"). */
function usePrices(links: readonly Link[]) {
  const [prices, setPrices] = useState<Map<string, Price | null> | null>(null)
  const key = links.map(linkKey).join('\n')
  useEffect(() => {
    let live = true
    if (!key) {
      setPrices(null)
      return
    }
    fetchPrices(key.split('\n').map(toLink)).then(
      (m) => live && setPrices(m),
      () => live && setPrices(null),
    )
    return () => {
      live = false
    }
  }, [key])
  return prices
}

/** Provider theo mã: có chạy và có khoá không (cùng cách tính với mục Provider và khoá). */
function useProviderRows(models: ModelSettings, entries: readonly ProviderEntry[]) {
  const namespaces = useMemo(
    () => [...new Set([DEFAULT_NS, ...entries.map((e) => e.ns).filter(Boolean)])],
    [entries],
  )
  const nsValue = useNamespaces(models, namespaces)
  const refs = useMemo(() => credentialRefs(entries, nsValue), [entries, nsValue])
  const refsKey = refs.join('|')
  const [creds, setCreds] = useState<Readonly<Record<string, CredentialState>>>({})
  useEffect(() => {
    if (refs.length === 0) return
    let live = true
    void models.credentials(refs).then((res) => live && res.ok && setCreds(res.value))
    return () => {
      live = false
    }
  }, [models, refsKey]) // `refsKey` đại diện cho danh sách tên khoá
  return useMemo(
    () => new Map(buildRows(entries, nsValue, creds).map((r) => [r.entry.id, r])),
    [entries, nsValue, creds],
  )
}

/** Chuỗi chat: dòng 1 là model chính (`agent-default-model`), dòng 2, 3… là dự phòng (API chuỗi), đổi thứ tự được. */
function ChatRow({
  t,
  models,
  groups,
  entries,
  nameOf,
  chain,
  busy,
  error,
  catalogError,
  onSave,
}: {
  t: T
  models: ModelSettings
  groups: readonly ModelGroup[]
  entries: readonly ProviderEntry[]
  nameOf: (id: string) => string
  chain: readonly Link[] | undefined
  busy: boolean
  error: string | null
  catalogError: string | null
  onSave: (chain: Link[]) => Promise<boolean>
}) {
  const form = models.form(DEFAULT_NS)
  const snap = useForm(form)
  const providers = useProviderRows(models, entries)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const value = (snap?.value ?? {}) as Record<string, unknown>
  const provider = str(value.provider) ?? ''
  const model = str(value.model) ?? ''
  const main = provider && model ? { provider, model } : undefined
  const fallback = chain ?? []
  const list = joinChain(main, fallback)
  const prices = usePrices(list)
  const loc = t('pv.locale')
  const has = new Set(list.map(linkKey))
  const locked = saving || busy || chain === undefined || snap?.status !== 'ready' || !snap.writable

  /** Ghi danh sách mới: chuỗi dự phòng trước (dễ bị từ chối hơn), rồi model chính; model chính lỗi thì trả chuỗi về. */
  async function apply(next: readonly Link[]) {
    const plan = planChain({ main, fallback }, next)
    if (!plan.mainChanged && !plan.fallbackChanged) return
    setSaving(true)
    setFailed(false)
    let ok = true
    if (plan.fallbackChanged) ok = await onSave(plan.fallback)
    if (ok && plan.mainChanged && plan.main) {
      const set = await form.mutate([
        { op: 'set', path: ['provider'], value: plan.main.provider },
        { op: 'set', path: ['model'], value: plan.main.model },
      ])
      if (!set) {
        setFailed(true)
        if (plan.fallbackChanged) await onSave([...fallback])
      }
    }
    setSaving(false)
  }

  const rows = list.map((l): ChainRow => {
    const row = providers.get(l.provider)
    const line = row
      ? modelLines(
          groups.find((g) => g.id === l.provider),
          profileModels(row.profile),
          [],
        ).find((x) => x.id === l.model)
      : undefined
    const price = prices ? (prices.get(linkKey(l)) ?? null) : undefined
    const status = linkStatus(row?.status, price)
    const sub = [
      nameOf(l.provider),
      price ? t('mv.priceLine', { input: usd(price.input, loc), output: usd(price.output, loc) }) : undefined,
      line?.reasoning ? t('pv.cap.reasoning') : undefined,
      line?.image ? t('pv.cap.image') : undefined,
      line?.contextWindow !== undefined
        ? t('pv.cap.ctx', { k: Math.round(line.contextWindow / 1000) })
        : undefined,
    ].filter(Boolean)
    return {
      key: linkKey(l),
      title: l.model,
      sub: sub.join(' · '),
      tip: `${l.provider}/${l.model}`,
      dot: providerColor(l.provider),
      status: status && STATUS[status](t),
    }
  })

  return (
    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="a-muted" style={{ fontSize: 12.5 }}>
        <b style={{ color: 'var(--a-ink)', fontSize: 13.5 }}>{t('mv.chat')}</b> {t('mv.chatSub')}
      </div>
      {snap?.status === 'unavailable' ? (
        <span className="a-muted">{t('pv.notServed')}</span>
      ) : (
        <ChainList
          t={t}
          rows={rows}
          busy={locked}
          canRemove={(i) => i > 0 || list.length > 1}
          onMove={(i, d) => void apply(moveLink(list, i, d))}
          onRemove={(i) => void apply(removeLink(list, i))}
          addLabel={t('mv.addChat')}
          options={modelOptions(
            groups,
            undefined,
            undefined,
            (p, m) => isChatModel(m) && !has.has(pairKey(p, m)),
          )}
          onAdd={(id) => void apply([...list, toLink(id)])}
          hint={t('mv.hintFirst')}
          searchPlaceholder={t('sel.search')}
          emptyLabel={t('sel.empty')}
        />
      )}
      {failed && <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{t('pv.saveFailed')}</span>}
      {catalogError && (
        <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>
          {t('pv.catalogError', { error: catalogError })}
        </span>
      )}
      {error && <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{error}</span>}
    </div>
  )
}

/** Nhãn trạng thái của một dòng chuỗi chat. */
const STATUS: Record<LinkStatus, (t: T) => NonNullable<ChainRow['status']>> = {
  ready: (t) => ({ label: t('md.ready'), tone: 'ok' }),
  nokey: (t) => ({ label: t('md.noKey') }),
  off: (t) => ({ label: t('pv.st.off') }),
  error: (t) => ({ label: t('pv.st.error'), tone: 'warn' }),
  noprice: (t) => ({ label: t('mv.noPrice'), tone: 'warn' }),
}

/** Việc nền: hiện model nó dùng (đọc từ mã nguồn của từng gói), không chọn được ở đây. */
function BackgroundRow({
  label,
  sub,
  note,
  extra,
}: {
  label: string
  sub?: string
  note: string
  extra?: string
}) {
  return (
    <div className="ap-mv-task">
      <span>
        {label}
        {sub && <span className="a-muted sub">{sub}</span>}
      </span>
      <span className="ap-mv-chain">
        <span className="ap-mv-lk">{note}</span>
        {extra && <span className="a-muted">{extra}</span>}
      </span>
    </div>
  )
}

/** Thứ tự tạo ảnh hay tạo video cho cả đội, kèm hôm nay đã tiêu bao nhiêu trên trần. */
function MediaChain({ t, kind, api, nav }: { t: T; kind: MediaKind; api: MediaApi; nav: PageProps['nav'] }) {
  const d = api.data
  const loc = t('pv.locale')
  return (
    <Card
      title={t(kind === 'image' ? 'mv.genImage' : 'mv.genVideo')}
      subtitle={t('md.chainHint')}
      actions={
        d && (
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('mv.capLine', { today: usd(d.today[kind], loc), cap: usd(d.settings.caps[kind], loc) })} ·{' '}
            <a
              className="ap-link"
              style={{ fontSize: 12.5 }}
              onClick={() => nav.go('settings', { section: 'guard' })}
            >
              {t('mv.editCap')}
            </a>
          </span>
        )
      }
    >
      <div style={{ padding: '0 14px 12px' }}>
        {d ? (
          <ChainEditor
            t={t}
            kind={kind}
            links={d.settings[kind]}
            models={d.models}
            busy={api.busy}
            onChange={(links) => void api.act({ op: 'chain', kind, links })}
            hint={t('mv.hintFirst')}
          />
        ) : (
          <span className="a-muted">…</span>
        )}
      </div>
    </Card>
  )
}

const policyText = (t: T, p: Policy | undefined) =>
  !p || p.mode === 'shared'
    ? t('md.mode.sharedShort')
    : p.mode === 'off'
      ? t('md.mode.offShort')
      : (p.list ?? []).map((l, i) => `${i + 1} · ${l.model}`).join('  ') || t('md.empty')

/** Bảng bot có cấu hình khác chuỗi chung: model chat riêng, ảnh, video. Bấm một dòng để sửa ảnh và video. */
function ByBot({ t, nav, api }: { t: T; nav: PageProps['nav']; api: MediaApi }) {
  const team = useTeam()
  const [editing, setEditing] = useState<string | null>(null)
  const d = api.data
  const own = (p: Policy | undefined) => !!p && p.mode !== 'shared'
  const rows = (d?.bots ?? []).flatMap((b) => {
    const chat = team.bots.find((x) => x.id === b.id)
    const row = { b, mascot: chat?.mascot ?? b.id, accessory: chat?.accessory, chat: chat?.model }
    return row.chat || own(b.media.image) || own(b.media.video) ? [row] : []
  })
  const editBot = d?.bots.find((b) => b.id === editing)
  const others = (d?.bots.length ?? 0) - rows.length
  return (
    <>
      <Card title={t('mv.byBot')} subtitle={t('mv.byBotHint')}>
        {d ? (
          <>
            <div className="ap-mv-br hd">
              <span>{t('md.bot')}</span>
              <span>{t('mv.chat')}</span>
              <span>{t('md.image')}</span>
              <span>{t('md.video')}</span>
              <span />
            </div>
            {rows.map(({ b, mascot, accessory, chat }) => (
              <button
                type="button"
                key={b.id}
                className={`ap-mv-br${editing === b.id ? ' on' : ''}`}
                aria-expanded={editing === b.id}
                onClick={() => setEditing(editing === b.id ? null : b.id)}
              >
                <span className="who">
                  <Bot id={mascot} accessory={accessory} />
                  <b>{b.name}</b>
                </span>
                <span className={chat ? undefined : 'a-muted'}>
                  {chat ? chat.model : t('md.mode.sharedShort')}
                </span>
                <span className={own(b.media.image) ? undefined : 'a-muted'}>
                  {policyText(t, b.media.image)}
                </span>
                <span className={own(b.media.video) ? undefined : 'a-muted'}>
                  {policyText(t, b.media.video)}
                </span>
                <span className="a-muted">{t('mv.edit')}</span>
              </button>
            ))}
            <div className="ap-mv-foot a-muted">
              {rows.length === 0 ? t('mv.noneDiff') : null}
              {rows.length === 0 && others > 0 ? ' ' : null}
              {others > 0 ? t('mv.others', { n: others }) : null}
            </div>
          </>
        ) : (
          <div className="ap-mv-foot a-muted">…</div>
        )}
      </Card>
      {editBot && (
        <Card
          title={t('md.editing', { name: editBot.name })}
          actions={
            <a
              className="ap-link"
              style={{ fontSize: 12.5 }}
              onClick={() => nav.go('bot', { id: editBot.id })}
            >
              {t('mv.profile')}
            </a>
          }
        >
          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {KINDS.map((kind) => (
              <div key={kind} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <b style={{ fontSize: 13 }}>{t(kind === 'image' ? 'md.image' : 'md.video')}</b>
                <PolicyEditor t={t} kind={kind} bot={editBot} api={api} />
              </div>
            ))}
            <Button size="sm" onClick={() => setEditing(null)}>
              {t('md.close')}
            </Button>
          </div>
        </Card>
      )}
      {api.error && <div style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{api.error}</div>}
    </>
  )
}

export function ModelPage({ t, nav, models }: PageProps) {
  const ps = useProvidersState()
  const media = useMedia()
  const { groups, entries, error } = useCatalog(models)
  const nameOf = (id: string) => {
    const e = entries.find((x) => x.id === id)
    return e ? providerName(id, e.name) : providerLabel(id)
  }
  if (!models)
    return (
      <PageShell title={t('sec.model')}>
        <div className="a-muted">{t('pv.notServed')}</div>
      </PageShell>
    )
  return (
    <PageShell title={t('sec.model')} subtitle={t('mv.subtitle')}>
      <div className="ap-cols">
        <div className="ap-col" style={{ flex: '1.3 1 470px' }}>
          <Card title={t('mv.chatTitle')} subtitle={t('mv.chatHint')}>
            <ChatRow
              t={t}
              models={models}
              groups={groups}
              entries={entries}
              nameOf={nameOf}
              chain={ps.data?.chain}
              busy={ps.busy}
              error={ps.error}
              catalogError={error}
              onSave={(chain) => ps.act({ op: 'chain', chain })}
            />
            <BackgroundRow
              label={t('pv.task.reflect')}
              sub={t('mv.reflectSub')}
              note={t('mv.cheap')}
              {...(REFLECT_CAP !== undefined
                ? { extra: t('mv.dailyCap', { cap: usd(REFLECT_CAP, t('pv.locale')) }) }
                : {})}
            />
            <BackgroundRow label={t('pv.task.title')} note={t('pv.followSession')} />
            <BackgroundRow label={t('pv.task.eval')} note={t('mv.cheap')} />
            <div className="ap-mv-foot a-muted">
              {t('mv.embedPre')}{' '}
              <a
                className="ap-link"
                style={{ fontSize: 12.5 }}
                onClick={() => nav.go('settings', { section: 'semantic' })}
              >
                {t('mv.embedLink')}
              </a>
            </div>
          </Card>
          {KINDS.map((kind) => (
            <MediaChain key={kind} t={t} kind={kind} api={media} nav={nav} />
          ))}
        </div>
        <div className="ap-col" style={{ flex: '1 1 330px' }}>
          <ByBot t={t} nav={nav} api={media} />
          <Card title={t('mv.how')}>
            {(['mv.step1', 'mv.step2', 'mv.step3'] as const).map((k, i) => (
              <div className="ap-mv-how" key={k}>
                <span className="s">{i + 1}</span>
                <span>{t(k)}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
