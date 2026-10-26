/**
 * 6.2b · Model (bản vẽ `ModelViec.dc.html`): việc nào dùng model nào và model lỗi thì chuyển sang model kế
 * tiếp. Cột trái: Chat và việc nền (model chính, chuỗi dự phòng), thứ tự tạo ảnh và tạo video cho cả đội.
 * Cột phải: gán riêng theo bot, cách aris chọn model. Chuỗi dự phòng chat qua `/api/aris/providers/state`,
 * model chat chính ghi thẳng vào `agent-default-model` của dsh, ảnh và video qua `/api/aris/media`; model chat
 * riêng của bot đọc từ đội bot. Khoá và danh bạ provider ở mục Provider và khoá.
 */
import { Button, Card, PageShell, Select, useTeam } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { ModelGroup, ModelSettings, PageProps } from '../page.js'
import { modelOptions } from '../options.js'
import { Bot, Dot } from '../ui.js'
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
import { DEFAULT_NS, pairKey, str, useCatalog, useForm } from './model-common.js'
import { isChatModel, providerColor, providerName } from './provider-data.js'
import { usd, useProvidersState, type Link } from './providers-api.js'

type T = PageProps['t']

/** Trần riêng cố định của vòng học nền (USD mỗi ngày), cùng nguồn với mục Ngân sách. */
const REFLECT_CAP = FIXED_CAPS.find(([k]) => k === 'guard.cap.reflect')?.[1]

const splitPair = (v: string) => v.split('\u0000') as [string, string]

/** Chat: model chính (số 1) và chuỗi dự phòng 2, 3… dạng viên thuốc, thêm, bỏ, đổi thứ tự. */
function ChatRow({
  t,
  models,
  groups,
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
  nameOf: (id: string) => string
  chain: readonly Link[] | undefined
  busy: boolean
  error: string | null
  catalogError: string | null
  onSave: (chain: Link[]) => void
}) {
  const form = models.form(DEFAULT_NS)
  const snap = useForm(form)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [adding, setAdding] = useState('')
  const value = (snap?.value ?? {}) as Record<string, unknown>
  const provider = str(value.provider) ?? ''
  const model = str(value.model) ?? ''
  const current = provider && model ? pairKey(provider, model) : ''
  const links = chain ?? []
  const has = new Set([current, ...links.map((l) => pairKey(l.provider, l.model))])

  async function change(next: string) {
    setSaving(true)
    setFailed(false)
    const [p, m] = splitPair(next)
    const ok = await form.mutate([
      { op: 'set', path: ['provider'], value: p },
      { op: 'set', path: ['model'], value: m },
    ])
    setSaving(false)
    setFailed(!ok)
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...links]
    ;[next[i], next[i + d]] = [next[i + d]!, next[i]!]
    onSave(next)
  }

  return (
    <div className="ap-mv-task">
      <span>
        <b>{t('mv.chat')}</b>
        <span className="a-muted sub">{t('mv.chatSub')}</span>
      </span>
      <span className="ap-mv-col">
        {snap?.status === 'unavailable' ? (
          <span className="a-muted">{t('pv.notServed')}</span>
        ) : (
          <span className="ap-mv-chain">
            <span className="ap-mv-lk main">
              <span className="n">1</span>
              <Select
                variant="compact"
                align="start"
                label={t('mv.chat')}
                value={current}
                disabled={saving || snap?.status !== 'ready' || !snap.writable}
                onChange={(v) => void change(v)}
                options={modelOptions(groups, undefined, current ? { provider, model } : undefined, (_p, m) =>
                  isChatModel(m),
                )}
                searchPlaceholder={t('sel.search')}
                emptyLabel={t('sel.empty')}
              />
            </span>
            {links.map((l, i) => (
              <span className="ap-mv-step" key={pairKey(l.provider, l.model)}>
                <span className="a-muted">→</span>
                <span className="ap-mv-lk" title={`${l.provider}/${l.model}`}>
                  <span className="n">{i + 2}</span>
                  <Dot color={providerColor(l.provider)} size={8} />
                  <span className="txt">
                    {nameOf(l.provider)} · {l.model}
                  </span>
                  <span className="acts">
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      aria-label={t('mv.earlier')}
                      onClick={() => move(i, -1)}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === links.length - 1}
                      aria-label={t('mv.later')}
                      onClick={() => move(i, 1)}
                    >
                      ›
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={t('pv.remove')}
                      onClick={() => onSave(links.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                </span>
              </span>
            ))}
            <Select
              variant="compact"
              align="start"
              className="ap-mv-add"
              label={t('pv.fallbackAdd')}
              value={adding}
              disabled={busy}
              placeholder={t('mv.add')}
              onChange={(v) => {
                setAdding('')
                if (!v) return
                const [p, m] = splitPair(v)
                onSave([...links, { provider: p, model: m }])
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
          </span>
        )}
        {failed && <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>{t('pv.saveFailed')}</span>}
        {catalogError && (
          <span style={{ color: 'var(--a-danger)', fontSize: 12 }}>
            {t('pv.catalogError', { error: catalogError })}
          </span>
        )}
        <span className="a-muted" style={{ fontSize: 12 }}>
          {error ? (
            <span style={{ color: 'var(--a-danger)' }}>{error}</span>
          ) : links.length === 0 ? (
            t('pv.fallbackEmpty')
          ) : (
            t('pv.fallbackHint')
          )}
        </span>
      </span>
    </div>
  )
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
    const row = { b, mascot: chat?.mascot ?? b.id, chat: chat?.model }
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
            {rows.map(({ b, mascot, chat }) => (
              <button
                type="button"
                key={b.id}
                className={`ap-mv-br${editing === b.id ? ' on' : ''}`}
                aria-expanded={editing === b.id}
                onClick={() => setEditing(editing === b.id ? null : b.id)}
              >
                <span className="who">
                  <Bot id={mascot} />
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
              nameOf={nameOf}
              chain={ps.data?.chain}
              busy={ps.busy}
              error={ps.error}
              catalogError={error}
              onSave={(chain) => void ps.act({ op: 'chain', chain })}
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
