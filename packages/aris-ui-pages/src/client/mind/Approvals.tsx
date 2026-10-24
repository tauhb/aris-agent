/**
 * 3.4 · Hộp duyệt (giai đoạn 3, đợt 1): một danh sách cho yêu cầu quyền của bot (`@aris/commander`,
 * tự từ chối sau 15 phút) và ký ức bot đề xuất (`@aris/memory`, tự bỏ sau 7 ngày). Bên trái là danh
 * sách lọc theo loại, bên phải chi tiết việc đang chọn. Skill vào ở đợt 3; gợi ý luật để đợt sau.
 */
import { Button, Mascot, useTeamData, type BotData } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'
import { Later } from '../team/BotTools.js'

type T = PageProps['t']

/** Yêu cầu quyền đang chờ (hộp duyệt tập trung của `@aris/commander`). */
interface ActionItem {
  id: string
  source: 'external' | 'member'
  bot: string
  name: string
  parentSession?: string
  kind: string
  target?: string
  tool?: string
  reason?: string
  at: string
}

/** Ký ức bot đề xuất (`@aris/memory`, `?pending=all`). */
interface MemoryItem {
  id: string
  bot: string
  book: 'owner' | 'notes'
  kind: string
  tier: 'core' | 'archive'
  trust: 'user-stated' | 'agent-inferred' | 'external'
  text: string
  why?: string
  quote?: string
  via: 'tool' | 'reflect' | 'compaction'
  sessionId?: string
  at: string
  expiresAt: string
}

type Kind = 'action' | 'memory'
type Row = { type: 'action'; a: ActionItem } | { type: 'memory'; m: MemoryItem }

/** Yêu cầu quyền tự từ chối sau 15 phút (như thẻ Telegram). */
const ACTION_MINUTES = 15
const KINDS = ['run', 'edit', 'write', 'read', 'search', 'find', 'web', 'webSearch', 'agent', 'permission']

const url = (path: string) => new URL(path, document.baseURI)
const post = async (path: string, body: unknown) => {
  const res = await fetch(url(path), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out
}

function useInbox() {
  const [actions, setActions] = useState<ActionItem[] | null>(null)
  const [memories, setMemories] = useState<MemoryItem[] | null>(null)
  const [done, setDone] = useState({ actions: 0, memories: 0 })
  const load = useCallback(async () => {
    const [a, m] = await Promise.all([
      fetch(url('api/aris/commander?approvals=all'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ approvals: ActionItem[]; doneToday?: number }>) : null))
        .catch(() => null),
      fetch(url('api/aris/memory?pending=all'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? (r.json() as Promise<{ pending: MemoryItem[]; doneToday: number }>) : null))
        .catch(() => null),
    ])
    if (a) setActions(a.approvals)
    if (m) setMemories(m.pending)
    setDone((d) => ({ actions: a?.doneToday ?? d.actions, memories: m?.doneToday ?? d.memories }))
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [load])
  return { actions, memories, done: done.actions + done.memories, reload: load }
}

const hhmm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const minutesLeft = (a: ActionItem) =>
  Math.max(0, Math.ceil((Date.parse(a.at) + ACTION_MINUTES * 60_000 - Date.now()) / 60_000))
const daysLeft = (m: MemoryItem) =>
  Math.max(0, Math.ceil((Date.parse(m.expiresAt) - Date.now()) / 86_400_000))
const actionLabel = (t: T, a: ActionItem) =>
  KINDS.includes(a.kind) ? t(`ap.do.${a.kind}`) : t('ap.do.other', { tool: a.tool ?? a.kind })

export function Approvals({ t, nav }: PageProps) {
  const team = useTeamData()
  const { actions, memories, done, reload } = useInbox()
  const [filter, setFilter] = useState<'all' | Kind>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const botOf = (id: string): BotData | undefined => team?.bots.find((b) => b.id === id)
  const rows: Row[] = [
    ...(actions ?? []).map((a) => ({ type: 'action' as const, a })),
    ...(memories ?? []).map((m) => ({ type: 'memory' as const, m })),
  ]
  const idOf = (r: Row) => (r.type === 'action' ? r.a.id : r.m.id)
  const shown = rows.filter((r) => filter === 'all' || r.type === filter)
  const current = shown.find((r) => idOf(r) === selected) ?? shown[0]
  const chips: ['all' | Kind, string][] = [
    ['all', t('ap.all')],
    ['action', t('ap.action', { n: actions?.length ?? 0 })],
    ['memory', t('ap.memory', { n: memories?.length ?? 0 })],
  ]
  return (
    <div className="ap-split">
      <section className="ap-inbox" aria-label={t('ap.list')}>
        <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h1 className="a-page-title">{t('ap.title')}</h1>
          <span className="a-muted" style={{ fontSize: 12.5 }}>
            {t('ap.needYou', { n: rows.length })}
          </span>
        </div>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 12px' }}
          aria-label={t('ap.filter')}
        >
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ap-chip"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="ap-chip" disabled title={t('ap.skillLater')}>
            {t('ap.skill', { n: 0 })}
          </button>
        </div>
        {shown.length === 0 && (
          <div className="a-muted" style={{ padding: '6px 14px 14px', fontSize: 13 }}>
            {actions && memories ? t('ap.empty') : t('ap.loading')}
          </div>
        )}
        {shown.map((r) => {
          const id = idOf(r)
          const bot = botOf(r.type === 'action' ? r.a.bot : r.m.bot)
          const name = r.type === 'action' ? r.a.name : (bot?.name ?? r.m.bot)
          return (
            <button
              key={id}
              type="button"
              className="ap-li"
              aria-current={current && id === idOf(current) ? true : undefined}
              onClick={() => setSelected(id)}
            >
              <Mascot id={bot?.mascot ?? 'aris'} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <b>{r.type === 'action' ? actionLabel(t, r.a) : t('ap.memTitle')}</b>
                  <span className={r.type === 'action' ? 'ap-due warn' : 'ap-due'}>
                    {r.type === 'action'
                      ? t('ap.minutesLeft', { n: minutesLeft(r.a) })
                      : t('ap.daysLeft', { n: daysLeft(r.m) })}
                  </span>
                </span>
                <span className="a-muted ap-li-sub">
                  {name} · {r.type === 'action' ? (r.a.target ?? r.a.tool ?? '') : `“${r.m.text}”`}
                </span>
              </span>
            </button>
          )
        })}
        <div className="a-muted" style={{ padding: 14, fontSize: 12, borderTop: '1px solid var(--a-line)' }}>
          {t('ap.doneToday', { n: done })}
        </div>
        <div style={{ margin: 'auto 14px 14px' }}>
          <Later t={t} stage={3} label={t('ap.later')}>
            <div className="a-card" style={{ padding: 12, borderColor: 'var(--a-accent)', fontSize: 13 }}>
              <b>{t('ap.ruleTitle')}</b> — {t('ap.ruleHint')}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <Button size="sm" disabled>
                  {t('ap.always')}
                </Button>
                <Button size="sm" disabled>
                  {t('ap.ignore')}
                </Button>
              </div>
            </div>
          </Later>
        </div>
      </section>
      <main className="ap-detail">
        {!current && <div className="a-muted">{t('ap.nothing')}</div>}
        {current?.type === 'action' && (
          <ActionDetail
            key={current.a.id}
            t={t}
            a={current.a}
            bot={botOf(current.a.bot)}
            nav={nav}
            onDone={reload}
          />
        )}
        {current?.type === 'memory' && (
          <MemoryDetail
            key={current.m.id}
            t={t}
            m={current.m}
            bot={botOf(current.m.bot)}
            nav={nav}
            onDone={reload}
          />
        )}
      </main>
    </div>
  )
}

function Head({ mascot, title, context }: { mascot: string; title: string; context: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Mascot id={mascot} size={40} motion="waiting" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{title}</span>
        <span className="a-muted" style={{ fontSize: 13 }}>
          {context}
        </span>
      </div>
    </div>
  )
}

function ActionDetail({
  t,
  a,
  bot,
  nav,
  onDone,
}: {
  t: T
  a: ActionItem
  bot: BotData | undefined
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function answer(allow: boolean) {
    setBusy(true)
    setError(null)
    try {
      await post('api/aris/commander', { op: 'external-approve', id: a.id, allow })
      await onDone()
    } catch (e) {
      setError((e as Error).message === 'HTTP 404' ? t('ap.gone') : (e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <Head
        mascot={bot?.mascot ?? 'aris'}
        title={t('ap.wants', { name: a.name, what: actionLabel(t, a).toLowerCase() })}
        context={`${a.source === 'external' ? t('ap.external') : t('ap.member')} · ${hhmm(a.at)}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
        {a.tool && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.tool')}</span>
            <span className="a-mono">{a.tool}</span>
          </div>
        )}
        {a.target && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.target')}</span>
            <span className="a-mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {a.target}
            </span>
          </div>
        )}
        {a.reason && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.reason')}</span>
            <span>{a.reason}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => void answer(true)}>
          {t('ap.allowOnce')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void answer(false)}
        >
          {t('ap.reject')}
        </Button>
        {a.parentSession && (
          <Button size="lg" onClick={() => nav.openSession(a.parentSession!)}>
            {t('ap.openSession')}
          </Button>
        )}
      </div>
      {error && <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>{error}</div>}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ap.timeout', { t: t('ap.minutes', { n: minutesLeft(a) }) })}
      </p>
    </>
  )
}

const VIA_KEY = { tool: 'ap.via.tool', reflect: 'ap.via.reflect', compaction: 'ap.via.compaction' } as const

function MemoryDetail({
  t,
  m,
  bot,
  nav,
  onDone,
}: {
  t: T
  m: MemoryItem
  bot: BotData | undefined
  nav: PageProps['nav']
  onDone: () => Promise<void>
}) {
  const [text, setText] = useState(m.text)
  const [tier, setTier] = useState(m.tier)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; full?: boolean } | null>(null)
  const name = bot?.name ?? m.bot
  async function review(decision: 'save' | 'discard') {
    setBusy(true)
    setError(null)
    try {
      await post('api/aris/memory', { op: 'review', id: m.id, decision, text, tier })
      await onDone()
    } catch (e) {
      const message = (e as Error).message
      setError({ message, full: /trần|đầy/i.test(message) })
      setBusy(false)
    }
  }
  return (
    <>
      <Head
        mascot={bot?.mascot ?? 'aris'}
        title={t('ap.memWants', { name })}
        context={`${t(VIA_KEY[m.via])} · ${hhmm(m.at)} ${new Date(m.at).toLocaleDateString('vi-VN')}`}
      />
      <div className="a-card" style={{ padding: '4px 16px 8px', maxWidth: 720 }}>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memText')}</span>
          <textarea
            className="a-inp"
            rows={3}
            value={text}
            aria-label={t('ap.memText')}
            onChange={(e) => setText(e.target.value)}
            style={{ height: 'auto', padding: '8px 10px', resize: 'vertical', width: '100%' }}
          />
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memBook')}</span>
          <span>
            {m.book === 'owner' ? t('ap.book.owner') : t('ap.book.notes', { name })} ·{' '}
            {t(`mem.kind.${m.kind}`)}
          </span>
        </div>
        <div className="ap-kv">
          <span className="a-muted">{t('ap.memTier')}</span>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['core', 'archive'] as const).map((x) => (
              <button
                key={x}
                type="button"
                className="ap-chip"
                aria-pressed={tier === x}
                disabled={x === 'core' && m.trust === 'external'}
                onClick={() => setTier(x)}
              >
                {t(`ap.tier.${x}`)}
              </button>
            ))}
          </span>
        </div>
        {m.why && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.why')}</span>
            <span>{m.why}</span>
          </div>
        )}
        {m.quote && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.quote')}</span>
            <span style={{ fontStyle: 'italic' }}>“{m.quote}”</span>
          </div>
        )}
        {m.trust === 'external' && (
          <div className="ap-kv">
            <span className="a-muted">{t('ap.risk')}</span>
            <span style={{ color: 'var(--a-warn)', fontWeight: 600 }}>{t('ap.externalRisk')}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Button
          variant="primary"
          size="lg"
          disabled={busy || !text.trim()}
          onClick={() => void review('save')}
        >
          {t('ap.save')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          style={{ color: 'var(--a-danger)' }}
          onClick={() => void review('discard')}
        >
          {t('ap.discard')}
        </Button>
        {m.sessionId && (
          <Button size="lg" onClick={() => nav.openSession(m.sessionId!)}>
            {t('ap.openSession')}
          </Button>
        )}
      </div>
      {error && (
        <div style={{ color: 'var(--a-danger)', fontSize: 13 }}>
          {error.message}
          {error.full && tier === 'core' && (
            <>
              {' '}
              <a className="ap-link" onClick={() => setTier('archive')}>
                {t('ap.useArchive')}
              </a>
            </>
          )}
        </div>
      )}
      <p className="a-muted" style={{ margin: 0, fontSize: 12.5 }}>
        {t('ap.memTimeout', { n: daysLeft(m) })}
      </p>
    </>
  )
}
