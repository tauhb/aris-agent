/**
 * 2.3 · Bot hiểu gì về người dùng (bản vẽ 2.3b): cách xưng hô (thật, `@aris/bots`, cả đội dùng chung), hồ sơ
 * chung mọi bot đọc và hồ sơ riêng của từng bot do vòng học nền ghi (`@aris/reflect`, `/api/aris/insights`):
 * điều đội chưa chắc, nhận định kèm độ tin cậy và bằng chứng; từ 80% trở lên nạp vào prompt. Cột phải: lần
 * suy luận ba vòng gần nhất, đầu phiên, nhịp và chi phí.
 */
import {
  BotPicker,
  Button,
  Card,
  Mascot,
  Menu,
  MenuItem,
  PageShell,
  TextInput,
  teamAction,
  useDismiss,
  useTeam,
  useTeamData,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { botName, botOptions } from '../mind/names.js'

type T = PageProps['t']

/** Nhận định về người dùng của một bot (`@aris/reflect`). */
interface Insight {
  id: string
  bot: string
  area: 'communication' | 'work'
  text: string
  confidence: number
  evidence: { sessionId?: string; at: string; quote?: string }[]
  hits: number
  confirmed?: boolean
  question?: { text: string; options: { label: string; text: string }[] }
  /** Hồ sơ chung: các bot đã thấy. */
  bots?: string[]
}

/** Mã của hồ sơ chung (`@aris/reflect`). */
const SHARED = 'chung'

interface ProfileRun {
  id: string
  at: string
  bot: string
  sessionId: string
  turns: number
  observed: number
  dropped: { text: string; why?: string }[]
  results: { kind: 'new' | 'raise' | 'ask' | 'share'; text: string; scope: string; confidence: number }[]
  usd?: number
  skipped?: 'budget' | 'no-model'
  error?: string
}
interface ProfileInfo {
  runs: ProfileRun[]
  today: number
  cap: number
  every: number
  model?: { provider: string; model: string }
  warm: { at: string; bot: string; first: string; picked: { text: string; shared: boolean }[] }[]
}

const api = () => new URL('api/aris/insights', document.baseURI)

function useProfileInfo() {
  const [info, setInfo] = useState<ProfileInfo | null>(null)
  useEffect(() => {
    const load = async () => {
      const r = await fetch(new URL('api/aris/insights?profile', document.baseURI), {
        credentials: 'same-origin',
      }).catch(() => null)
      if (r?.ok) setInfo((await r.json()) as ProfileInfo)
    }
    void load()
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [])
  return info
}

function useInsights(bot: string) {
  const [list, setList] = useState<Insight[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(new URL(`api/aris/insights?bot=${encodeURIComponent(bot)}`, document.baseURI), {
      credentials: 'same-origin',
    }).catch(() => null)
    if (res?.ok) setList(((await res.json()) as { insights: Insight[] }).insights)
  }, [bot])
  useEffect(() => {
    setList(null)
    void load()
    const timer = setInterval(() => void load(), 15_000)
    return () => clearInterval(timer)
  }, [load])
  async function act(body: Record<string, unknown>): Promise<{ copied?: number } | undefined> {
    setError(null)
    const res = await fetch(api(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const out = (await res.json().catch(() => ({}))) as {
      insights?: Insight[]
      error?: string
      copied?: number
    }
    if (!res.ok) return void setError(out.error ?? `HTTP ${res.status}`)
    if (out.insights) setList(out.insights)
    return out
  }
  return { list, error, act, reload: load }
}

const pct = (i: Insight) => Math.round((i.confirmed ? 1 : i.confidence) * 100)

function Row({
  t,
  i,
  color,
  act,
  open,
}: {
  t: T
  i: Insight
  color: string
  act: (body: Record<string, unknown>) => Promise<unknown>
  open: (sessionId: string) => void
}) {
  const shared = i.bot === SHARED
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(i.text)
  const weak = pct(i) < 60
  const last = [...i.evidence].reverse().find((e) => e.sessionId)
  if (editing)
    return (
      <div className="ap-cl ap-cl-edit">
        <TextInput value={text} aria-label={t('own.fix')} onChange={(e) => setText(e.target.value)} />
        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="primary"
            disabled={!text.trim()}
            onClick={() => void act({ op: 'edit', id: i.id, text }).then(() => setEditing(false))}
          >
            {t('own.save')}
          </Button>
          <Button size="sm" onClick={() => (setText(i.text), setEditing(false))}>
            {t('cb.cancel')}
          </Button>
          <Button
            size="sm"
            style={{ color: 'var(--a-danger)' }}
            onClick={() => void act({ op: 'reject', id: i.id })}
          >
            {t('own.remove')}
          </Button>
        </span>
      </div>
    )
  return (
    <div className="ap-cl">
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className={weak ? 'a-muted' : undefined} title={i.evidence.at(-1)?.quote}>
          {i.text}
        </span>
        {shared && !!i.bots?.length && (
          <span className="a-muted" style={{ fontSize: 12 }}>
            {t('own.seenBy', { names: i.bots.map(botName).join(', ') })}
          </span>
        )}
      </span>
      <span className="ap-conf" title={`${pct(i)}%`}>
        <span className="ap-track" style={{ height: 6, flex: 1 }}>
          <span style={{ width: `${pct(i)}%`, background: weak ? 'var(--a-warn)' : color }} />
        </span>
        <span className="a-muted">{pct(i)}%</span>
      </span>
      {last?.sessionId ? (
        <a className="ap-link" title={last.quote} onClick={() => open(last.sessionId!)}>
          {t('own.times', { n: i.hits })}
        </a>
      ) : (
        <span className="a-muted">{t('own.times', { n: i.hits })}</span>
      )}
      <span style={{ display: 'flex', gap: 6 }}>
        {i.confirmed ? (
          <span className="ap-chip2">{t('own.confirmed')}</span>
        ) : (
          <Button size="sm" onClick={() => void act({ op: 'confirm', id: i.id })}>
            {t('own.right')}
          </Button>
        )}
        {weak ? (
          <Button size="sm" onClick={() => void act({ op: 'reject', id: i.id })}>
            {t('own.wrong')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setEditing(true)}>
            {t('own.fix')}
          </Button>
        )}
        {!shared && !weak && (
          <Button
            size="sm"
            variant="ghost"
            title={t('own.shareHint')}
            onClick={() => void act({ op: 'share', id: i.id })}
          >
            {t('own.share')}
          </Button>
        )}
      </span>
    </div>
  )
}

function Section({
  t,
  title,
  rows,
  color,
  act,
  open,
}: {
  t: T
  title: string
  rows: readonly Insight[]
  color: string
  act: (body: Record<string, unknown>) => Promise<unknown>
  open: (sessionId: string) => void
}) {
  return (
    <div className="a-card">
      <div className="ap-cl a-muted" style={{ borderTop: 0, fontSize: 12, fontWeight: 600 }}>
        <span>{title}</span>
        <span>{t('own.confidence')}</span>
        <span>{t('own.evidence')}</span>
        <span />
      </div>
      {rows.length === 0 && (
        <div className="ap-cl a-muted" style={{ display: 'block', fontSize: 13 }}>
          {t('own.noneArea')}
        </div>
      )}
      {rows.map((r) => (
        <Row key={`${r.id}-${r.text}`} t={t} i={r} color={color} act={act} open={open} />
      ))}
    </div>
  )
}

/** "Sao chép sang bot khác": chọn bot đích trong menu. */
function CopyMenu({ t, bot, onCopy }: { t: T; bot: string; onCopy: (to: string) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)
  return (
    <span className="a-pop" ref={root}>
      <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('own.copy')}
      </Button>
      {open && (
        <Menu label={t('own.copy')} align="end" width={240}>
          {botOptions()
            .filter((o) => o.id !== bot)
            .map((o) => (
              <MenuItem
                key={o.id}
                icon={<Mascot id={o.mascot ?? o.id} size={18} />}
                meta={o.note}
                onSelect={() => (setOpen(false), onCopy(o.id))}
              >
                {o.name}
              </MenuItem>
            ))}
        </Menu>
      )}
    </span>
  )
}

/** Cách xưng hô: bot hỏi lần đầu rồi lưu; sửa tay ở đây. Cả đội dùng chung. */
function AddressCard({ t }: { t: PageProps['t'] }) {
  const owner = useTeam().owner
  const [form, setForm] = useState({ name: '', call: '', self: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    setForm({ name: owner.name ?? '', call: owner.call ?? '', self: owner.self ?? '' })
  }, [owner.name, owner.call, owner.self])
  const dirty =
    form.name !== (owner.name ?? '') || form.call !== (owner.call ?? '') || form.self !== (owner.self ?? '')
  async function save() {
    try {
      await teamAction({ op: 'owner', owner: { name: form.name, call: form.call, self: form.self } })
      setMsg({ ok: true, text: t('own.addrSaved') })
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message })
    }
  }
  const field = (k: keyof typeof form, label: string, hint: string) => (
    <label className="a-field" style={{ flex: 1, minWidth: 180 }}>
      <span className="l">{label}</span>
      <TextInput
        value={form[k]}
        onChange={(e) => (setForm({ ...form, [k]: e.target.value }), setMsg(null))}
      />
      <span className="h">{hint}</span>
    </label>
  )
  return (
    <Card title={t('own.addrTitle')} subtitle={t('own.addrHint')}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '4px 14px 12px' }}>
        {field('name', t('own.addrName'), t('own.addrNameHint'))}
        {field('call', t('own.addrCall'), t('own.addrCallHint'))}
        {field('self', t('own.addrSelf'), t('own.addrSelfHint'))}
      </div>
      <div className="a-row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        {msg && (
          <span style={{ fontSize: 12.5, color: msg.ok ? 'var(--a-ok)' : 'var(--a-danger)' }}>
            {msg.text}
          </span>
        )}
        <Button variant="primary" size="sm" disabled={!dirty} onClick={() => void save()}>
          {t('own.addrSave')}
        </Button>
      </div>
    </Card>
  )
}

const KIND_PILL: Record<ProfileRun['results'][number]['kind'] | 'drop', string> = {
  new: 'ap-pk ok',
  raise: 'ap-pk acc',
  ask: 'ap-pk warn',
  share: 'ap-pk acc',
  drop: 'ap-pk',
}

/** Cột phải: lần suy luận gần nhất, đầu phiên, nhịp và chi phí. */
function ProfileAside({ t, bot, info }: { t: T; bot: string; info: ProfileInfo | null }) {
  const runs = (info?.runs ?? []).filter((r) => !r.skipped && (bot === SHARED || r.bot === bot))
  const run = runs[0]
  const warm = (info?.warm ?? [])
    .filter((w) => bot === SHARED || w.bot === bot)
    .sort((a, b) => b.at.localeCompare(a.at))[0]
  const when = (iso: string) =>
    new Date(iso).toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    })
  const scope = (s: string) => (s === SHARED ? t('own.sharedShort') : botName(s))
  return (
    <aside style={{ flex: '0 0 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card
        title={t('own.lastRun')}
        subtitle={
          run ? t('own.runMeta', { at: when(run.at), name: botName(run.bot), n: run.turns }) : undefined
        }
      >
        <div
          style={{
            padding: '0 14px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            fontSize: 12.5,
          }}
        >
          {!run ? (
            <span className="a-muted">{t('own.noRun', { n: info?.every ?? 6 })}</span>
          ) : (
            <>
              <div className="ap-psteps">
                <div>
                  <b>{t('own.step1')}</b>
                  <span className="a-muted">{t('own.step1n', { n: run.observed })}</span>
                </div>
                <div>
                  <b>{t('own.step2')}</b>
                  <span className="a-muted">
                    {run.dropped.length
                      ? t('own.step2n', { n: run.dropped.length, why: run.dropped[0]!.why ?? '' })
                      : t('own.step2none')}
                  </span>
                </div>
                <div>
                  <b>{t('own.step3')}</b>
                  <span className="a-muted">{t('own.step3n', { n: run.results.length })}</span>
                </div>
              </div>
              {run.results.map((r, n) => (
                <span key={`r${n}`}>
                  <span className={KIND_PILL[r.kind]}>{t(`own.kind.${r.kind}`)}</span> {scope(r.scope)}:{' '}
                  {r.text} <span className="a-muted">({Math.round(r.confidence * 100)}%)</span>
                </span>
              ))}
              {run.dropped.map((d, n) => (
                <span key={`d${n}`} className="a-muted">
                  <span className={KIND_PILL.drop}>{t('own.kind.drop')}</span> {d.text}
                  {d.why ? ` — ${d.why}` : ''}
                </span>
              ))}
              {run.error && <span style={{ color: 'var(--a-danger)' }}>{run.error}</span>}
            </>
          )}
        </div>
      </Card>
      <Card title={t('own.warmTitle')}>
        <div
          style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}
        >
          {warm ? (
            <>
              <span className="a-muted">
                {t('own.warmLine', { name: botName(warm.bot), first: warm.first })}
              </span>
              <div className="ap-warm">
                {!warm.picked.length && <span className="a-muted">{t('own.warmEmpty')}</span>}
                {warm.picked.map((p, n) => (
                  <span key={n}>
                    · {p.text}
                    {p.shared ? <span className="a-muted"> ({t('own.sharedShort')})</span> : null}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <span className="a-muted">{t('own.warmNone')}</span>
          )}
        </div>
      </Card>
      <Card title={t('own.rhythm')}>
        <div
          style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}
        >
          <div className="a-row" style={{ justifyContent: 'space-between' }}>
            <span>{t('own.every')}</span>
            <span>
              <b>{t('own.everyN', { n: info?.every ?? 6 })}</b>{' '}
              <span className="a-muted">{t('own.orEnd')}</span>
            </span>
          </div>
          <div className="a-row" style={{ justifyContent: 'space-between' }}>
            <span>{t('own.cap')}</span>
            <span>
              <b>{(info?.cap ?? 0.2).toLocaleString('vi-VN', { minimumFractionDigits: 2 })} USD</b>{' '}
              <span className="a-muted">
                ·{' '}
                {t('own.today', {
                  usd: (info?.today ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 3 }),
                })}
              </span>
            </span>
          </div>
          <div className="a-row" style={{ justifyContent: 'space-between' }}>
            <span>{t('own.model')}</span>
            <span className="a-muted">{info?.model?.model ?? '—'}</span>
          </div>
          <span className="a-muted" style={{ fontSize: 12 }}>
            {t('own.rhythmNote')}
          </span>
        </div>
      </Card>
    </aside>
  )
}

export function OwnerProfile({ t, params, nav }: PageProps) {
  useTeam()
  useTeamData()
  const [bot, setBot] = useState<string>(params.bot ?? SHARED)
  const shared = bot === SHARED
  const name = shared ? t('own.team') : botName(bot)
  const mine = useInsights(bot)
  const common = useInsights(SHARED)
  const { list, error } = mine
  // Đưa vào chung đổi cả hồ sơ chung: đọc lại để thẻ "cũng đọc N nhận định chung" đúng ngay.
  const act = async (body: Record<string, unknown>) => {
    const r = await mine.act(body)
    if (body.op === 'share') void common.reload()
    return r
  }
  const info = useProfileInfo()
  const [note, setNote] = useState<string | null>(null)
  const unsure = (list ?? []).filter((i) => i.question)
  const area = (a: Insight['area']) => (list ?? []).filter((i) => i.area === a)
  const options = [
    {
      id: SHARED,
      name: t('own.sharedTab'),
      note: t('own.sharedNote'),
      icon: <span aria-hidden="true">✦</span>,
    },
    ...botOptions(),
  ]
  return (
    <PageShell
      title={t('own.title', { name })}
      subtitle={
        shared
          ? t('own.subtitleShared', { n: list?.length ?? 0 })
          : t('own.subtitle', { n: list?.length ?? 0 })
      }
      actions={
        <>
          <BotPicker
            label={t('mem.pickBot')}
            value={bot}
            onChange={(b) => (setBot(b), setNote(null))}
            options={options}
            searchPlaceholder={t('pick.search')}
            emptyLabel={t('pick.empty')}
          />
          {!shared && (
            <CopyMenu
              t={t}
              bot={bot}
              onCopy={(to) =>
                void act({ op: 'copy', bot, to }).then(
                  (r) => r && setNote(t('own.copied', { n: r.copied ?? 0, name: botName(to) })),
                )
              }
            />
          )}
        </>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          style={{
            flex: '1 1 560px',
            minWidth: 0,
            maxWidth: 820,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {shared && <AddressCard t={t} />}
          {!shared && !!common.list?.length && (
            <div className="a-card a-row" style={{ padding: '10px 14px', gap: 10, fontSize: 13 }}>
              <span className="a-muted" style={{ flex: 1 }}>
                {t('own.alsoShared', { name, n: common.list.length })}
              </span>
              <Button size="sm" onClick={() => setBot(SHARED)}>
                {t('own.viewShared')}
              </Button>
            </div>
          )}
          {(note ?? error) && (
            <div style={{ fontSize: 12.5, color: error ? 'var(--a-danger)' : 'var(--a-ok)' }}>
              {error ?? note}
            </div>
          )}
          {list && list.length === 0 && (
            <div className="a-muted" style={{ fontSize: 13 }}>
              {shared ? t('own.emptyShared') : t('own.empty', { name })}
            </div>
          )}
          {unsure.map((i) => (
            <div className="ap-warnbox" style={{ padding: '12px 14px' }} key={i.id}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <b>{t('own.unsure', { name })}</b> {i.question!.text}
              </div>
              {i.question!.options.map((o, n) => (
                <Button
                  key={o.label}
                  size="sm"
                  title={o.text}
                  onClick={() => void act({ op: 'answer', id: i.id, option: n })}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          ))}
          {list && list.length > 0 && (
            <>
              <Section
                t={t}
                title={t(shared ? 'own.communicationShared' : 'own.communication')}
                rows={area('communication')}
                color="var(--a-ok)"
                act={act}
                open={(s) => nav.openSession(s)}
              />
              <Section
                t={t}
                title={t(shared ? 'own.goalsShared' : 'own.goals')}
                rows={area('work')}
                color="var(--a-accent)"
                act={act}
                open={(s) => nav.openSession(s)}
              />
            </>
          )}
          <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
            {shared ? t('own.noteShared') : t('own.note', { name })}
          </p>
          {!shared && <AddressCard t={t} />}
        </div>
        <ProfileAside t={t} bot={bot} info={info} />
      </div>
    </PageShell>
  )
}
