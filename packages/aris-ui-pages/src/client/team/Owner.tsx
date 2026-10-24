/**
 * 2.3 · Bot hiểu gì về người dùng: cách xưng hô (thật, `@aris/bots`, cả đội dùng chung), rồi hồ sơ
 * riêng của từng bot do vòng học nền ghi (`@aris/reflect`, `/api/aris/insights`): điều bot chưa chắc,
 * nhận định kèm độ tin cậy và bằng chứng; từ 80% trở lên nạp vào prompt của bot.
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
}

const api = () => new URL('api/aris/insights', document.baseURI)

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
  return { list, error, act }
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
      <span className={weak ? 'a-muted' : undefined} title={i.evidence.at(-1)?.quote}>
        {i.text}
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

export function OwnerProfile({ t, params, nav }: PageProps) {
  const team = useTeam()
  useTeamData()
  const [bot, setBot] = useState<string>(params.bot ?? team.commander.id)
  const name = botName(bot)
  const { list, error, act } = useInsights(bot)
  const [note, setNote] = useState<string | null>(null)
  const unsure = (list ?? []).filter((i) => i.question)
  const area = (a: Insight['area']) => (list ?? []).filter((i) => i.area === a)
  return (
    <PageShell
      title={t('own.title', { name })}
      subtitle={t('own.subtitle', { n: list?.length ?? 0 })}
      actions={
        <>
          <BotPicker
            label={t('mem.pickBot')}
            value={bot}
            onChange={(b) => (setBot(b), setNote(null))}
            options={botOptions()}
            searchPlaceholder={t('pick.search')}
            emptyLabel={t('pick.empty')}
          />
          <CopyMenu
            t={t}
            bot={bot}
            onCopy={(to) =>
              void act({ op: 'copy', bot, to }).then(
                (r) => r && setNote(t('own.copied', { n: r.copied ?? 0, name: botName(to) })),
              )
            }
          />
        </>
      }
    >
      <div style={{ maxWidth: 1040, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <AddressCard t={t} />
        {(note ?? error) && (
          <div style={{ fontSize: 12.5, color: error ? 'var(--a-danger)' : 'var(--a-ok)' }}>
            {error ?? note}
          </div>
        )}
        {list && list.length === 0 && (
          <div className="a-muted" style={{ fontSize: 13 }}>
            {t('own.empty', { name })}
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
              title={t('own.communication')}
              rows={area('communication')}
              color="var(--a-ok)"
              act={act}
              open={(s) => nav.openSession(s)}
            />
            <Section
              t={t}
              title={t('own.goals')}
              rows={area('work')}
              color="var(--a-accent)"
              act={act}
              open={(s) => nav.openSession(s)}
            />
          </>
        )}
        <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
          {t('own.note', { name })}
        </p>
      </div>
    </PageShell>
  )
}
