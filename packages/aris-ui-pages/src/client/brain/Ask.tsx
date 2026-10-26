/**
 * 5.4 · Hỏi bộ não (giai đoạn 5, đợt 3a; bản vẽ HoiBoNao.dc.html): Thủ thư trả lời chỉ từ bộ não (và ký
 * ức các bot khi bật), mỗi ý kèm số trích dẫn; cột Nguồn có đoạn trích. Bên trái là các câu đã hỏi, mỗi
 * câu một phiên của Thủ thư, hỏi tiếp được. Dữ liệu từ `/api/aris/brain?asks`, `?ask=<mã>`.
 */
import { Button, IconButton, Mascot } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { PageProps, Translate } from '../page.js'
import { Inline, type LinkTarget } from './markdown.js'

type Space = 'ca-nhan' | 'cong-ty'
type Status = 'dang-tra' | 'xong' | 'loi' | 'dung'

interface Summary {
  id: string
  title: string
  updatedAt: string
  scope: string
  status: Status
  sources: number
  unseen: boolean
}

interface Step {
  kind: 'tim' | 'doc' | 'ky-uc'
  text: string
  n?: number
}

interface Source {
  n: number
  kind: 'page' | 'mem'
  ref: string
  missing?: boolean
  title?: string
  path?: string
  name?: string
  layer?: string
  space?: Space | null
  dept?: string | null
  group?: string | null
  snippet?: string
  terms?: string[]
  bot?: string
  botName?: string
  book?: string
  tier?: string
  at?: string
}

interface Turn {
  q: string
  at: string
  status: Status
  steps: Step[]
  answer?: string
  error?: string
  cost: number
  endedAt?: string
  sources: Source[]
}

interface Full {
  id: string
  session: string
  scope: { space?: Space; dept?: string; memory: boolean }
  scopeLabel: string
  turns: Turn[]
}

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const CITE = /\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g
const LIBRARIAN = 'trang-giay'

/** Bỏ dấu để tô chỗ khớp trong đoạn trích (như chỉ mục của bộ não). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

function Marked({ text, terms }: { text: string; terms: readonly string[] }) {
  if (!terms.length) return <>{text}</>
  // Chỉ tô từ có nghĩa (từ 3 chữ cái trở lên, hay số từ 2 chữ số): chữ số lẻ, từ ngắn làm rối.
  const set = new Set(terms.filter((w) => (/^\d+$/.test(w) ? w.length >= 2 : w.length >= 3)))
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (!set.has(fold(m[0]))) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<mark key={m.index}>{m[0]}</mark>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

/** Câu trả lời: Markdown gọn (đoạn, danh sách, đậm), `[[...]]` thành số trích dẫn. */
function Answer({
  text,
  sources,
  onCite,
  links,
}: {
  text: string
  sources: readonly Source[]
  onCite: (n: number) => void
  links: LinkTarget
}) {
  const num = new Map(sources.map((s) => [`${s.kind === 'mem' ? 'm' : 'p'}:${s.ref}`, s]))
  const line = (s: string, key: number) => {
    const out: ReactNode[] = []
    let last = 0
    for (const m of s.matchAll(CITE)) {
      if (m.index > last) out.push(<Inline key={`t${m.index}`} text={s.slice(last, m.index)} links={links} />)
      last = m.index + m[0].length
      const raw = m[1]!.trim().replace(/\.md$/i, '')
      const mem = /^ky-uc:(.+)$/.exec(raw)
      const src = num.get(mem ? `m:${mem[1]!.trim()}` : `p:${raw.split('/').pop()}`)
      if (src)
        out.push(
          <a
            key={`c${m.index}`}
            href={`#ap-src-${src.n}`}
            className={src.kind === 'mem' ? 'ap-cit mem' : 'ap-cit'}
            onClick={(e) => {
              e.preventDefault()
              onCite(src.n)
            }}
          >
            {src.n}
          </a>,
        )
    }
    if (last < s.length) out.push(<Inline key="end" text={s.slice(last)} links={links} />)
    return <span key={key}>{out}</span>
  }
  // Khối: dòng liền nhau cùng loại (đoạn hay danh sách) gộp lại; dòng trống tách khối.
  const ITEM = /^\s*([-*+]|\d+[.)])\s+/
  const blocks: { list: boolean; lines: string[] }[] = []
  for (const l of text.trim().split('\n')) {
    if (!l.trim()) {
      blocks.push({ list: false, lines: [] })
      continue
    }
    const list = ITEM.test(l)
    const last = blocks.at(-1)
    if (last && last.list === list && last.lines.length) last.lines.push(l)
    else blocks.push({ list, lines: [l] })
  }
  return (
    <>
      {blocks
        .filter((b) => b.lines.length)
        .map((b, i) =>
          b.list ? (
            <ul key={i}>
              {b.lines.map((l, j) => (
                <li key={j}>{line(l.replace(ITEM, ''), j)}</li>
              ))}
            </ul>
          ) : (
            <p key={i}>
              {b.lines.map((l, j) => {
                const h = /^#{1,6}\s+(.*)$/.exec(l)
                return [
                  j ? <br key={`b${j}`} /> : null,
                  h ? <b key={`h${j}`}>{line(h[1]!, j)}</b> : line(l, j),
                ]
              })}
            </p>
          ),
        )}
    </>
  )
}

const day = (iso: string) => iso.slice(0, 10)
/** Tiền theo ngôn ngữ trang (0,005 USD), dưới 1 xu thì 3 số lẻ. */
const usd = (n: number) =>
  `${n.toLocaleString(document.documentElement.lang || undefined, {
    minimumFractionDigits: n < 0.01 ? 3 : 2,
    maximumFractionDigits: n < 0.01 ? 3 : 2,
  })} USD`
const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

function groupOf(iso: string, now: Date): 'today' | 'week' | 'older' {
  const d = new Date(iso)
  if (day(iso) === now.toISOString().slice(0, 10)) return 'today'
  return now.getTime() - d.getTime() < 7 * 86_400_000 ? 'week' : 'older'
}

function summaryLine(t: Translate, turn: Turn): string {
  const n = (k: Step['kind']) => turn.steps.filter((s) => s.kind === k).length
  const secs =
    turn.endedAt && turn.at
      ? Math.max(1, Math.round((Date.parse(turn.endedAt) - Date.parse(turn.at)) / 1000))
      : 0
  return [
    t('ask.stepsSum', { s: n('tim'), r: n('doc') }) +
      (n('ky-uc') ? t('ask.stepsMem', { m: n('ky-uc') }) : ''),
    secs ? t('ask.secs', { n: secs }) : '',
    turn.cost ? usd(turn.cost) : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function StepRow({ t, s, live }: { t: Translate; s: Step; live?: boolean }) {
  return (
    <div className={live ? 'ap-step live' : 'ap-step'}>
      {live ? <span className="ap-pulse" /> : <span className="ok">✓</span>}
      {s.kind === 'doc'
        ? t('ask.stepRead', { x: s.text })
        : t(s.kind === 'tim' ? 'ask.stepFind' : 'ask.stepMem', { x: s.text, n: s.n ?? 0 })}
    </div>
  )
}

const LAYER: Record<string, string> = {
  wiki: 'ask.layer.wiki',
  nguon: 'ask.layer.nguon',
  'nhat-ky': 'ask.layer.nhat-ky',
}

export function Ask({ t, nav, params }: PageProps) {
  const [list, setList] = useState<Summary[]>([])
  const [spent, setSpent] = useState(0)
  const [depts, setDepts] = useState<{ id: string; name: string }[]>([])
  const [pick, setPick] = useState<string | null>(params.ask ?? null)
  const [full, setFull] = useState<Full | null>(null)
  const [space, setSpace] = useState<'all' | Space>('all')
  const [dept, setDept] = useState('')
  const [memory, setMemory] = useState(true)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState<{ turn: number; n: number } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)

  const loadList = useCallback(async () => {
    const r = await fetch(endpoint('?asks=1')).catch(() => null)
    if (!r?.ok) return
    const j = (await r.json()) as {
      asks: Summary[]
      usdToday: number
      departments: { id: string; name: string }[]
    }
    setList(j.asks)
    setSpent(j.usdToday)
    setDepts(j.departments)
  }, [])
  const loadAsk = useCallback(async (id: string) => {
    const r = await fetch(endpoint(`?ask=${encodeURIComponent(id)}`)).catch(() => null)
    if (r?.ok) setFull(((await r.json()) as { ask: Full }).ask)
  }, [])

  const running = full?.turns.at(-1)?.status === 'dang-tra'
  useEffect(() => {
    void loadList()
    const timer = setInterval(() => void loadList(), 5000)
    return () => clearInterval(timer)
  }, [loadList])
  useEffect(() => {
    setFocus(null)
    if (pick) void loadAsk(pick)
    else setFull(null)
  }, [pick, loadAsk])
  useEffect(() => {
    if (!pick || !running) return
    const timer = setInterval(() => void loadAsk(pick), 1000)
    return () => clearInterval(timer)
  }, [pick, running, loadAsk])
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [full?.turns.length, running])

  const post = async (body: Record<string, unknown>) => {
    setError(null)
    setBusy(true)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as {
      error?: string
      ask?: Full
      sessionId?: string
      batch?: { id: string }
    } | null
    setBusy(false)
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    return r?.ok ? j : null
  }

  const send = async (text = draft) => {
    if (!text.trim() || busy) return
    const j = full
      ? await post({ op: 'ask-follow', id: full.id, q: text })
      : await post({
          op: 'ask',
          q: text,
          scope: {
            ...(space === 'all' ? {} : { space }),
            ...(space === 'cong-ty' && dept ? { dept } : {}),
            memory,
          },
        })
    if (!j?.ask) return
    setDraft('')
    setFull(j.ask)
    setPick(j.ask.id)
    void loadList()
  }

  const links: LinkTarget = useMemo(
    () => ({
      exists: () => true,
      open: (name: string) => {
        const s = full?.turns.flatMap((x) => x.sources).find((x) => x.kind === 'page' && x.ref === name)
        if (s?.path) nav.go('brain', { view: 'notes', space: s.space ?? 'ca-nhan', path: s.path })
      },
    }),
    [full, nav],
  )

  const now = new Date()
  const groups = (['today', 'week', 'older'] as const)
    .map((g) => ({ g, items: list.filter((a) => groupOf(a.updatedAt, now) === g) }))
    .filter((x) => x.items.length)
  const shownTurn = focus?.turn ?? (full ? full.turns.length - 1 : -1)
  const sources = full?.turns[shownTurn]?.sources ?? []
  const locked = !!full

  const openSource = (s: Source) => {
    if (s.kind === 'mem' && s.bot) nav.go('memory', { bot: s.bot, focus: s.ref, tier: s.tier ?? 'core' })
    else if (s.path) nav.go('brain', { view: 'notes', space: s.space ?? 'ca-nhan', path: s.path })
  }
  const place = (s: Source) =>
    s.kind === 'mem'
      ? [s.dept, s.tier === 'archive' ? t('ask.tierArchive') : t('ask.tierCore'), s.at ? day(s.at) : '']
          .filter(Boolean)
          .join(' · ')
      : [
          s.space === 'cong-ty' ? t('ask.company') : t('ask.personal'),
          s.dept ? (depts.find((d) => d.id === s.dept)?.name ?? s.dept) : s.group,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <div className="ap-split ap-brain ap-askpage">
      <nav className="ap-asknav" aria-label={t('ask.history')}>
        <div className="ap-askhead">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain', { view: 'notes' })}>
            ‹
          </IconButton>
          <h1>{t('br.ask')}</h1>
        </div>
        <Button variant="primary" size="sm" onClick={() => setPick(null)}>
          {t('ask.new')}
        </Button>
        <div className="ap-asklist">
          {groups.map(({ g, items }) => (
            <div key={g}>
              <div className="ap-askgrp">{t(`ask.group.${g}`)}</div>
              {items.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  className={a.id === pick ? 'ap-hq on' : 'ap-hq'}
                  aria-current={a.id === pick}
                  onClick={() => setPick(a.id)}
                >
                  {a.title}
                  <span className="s">
                    {a.status === 'dang-tra' ? (
                      <>
                        <span className="ap-pulse" />
                        {t('ask.searching')}
                      </>
                    ) : (
                      [
                        a.scope,
                        a.unseen ? t('ask.notFound') : t('ask.nSources', { n: a.sources }),
                        g === 'today'
                          ? hhmm(a.updatedAt)
                          : day(a.updatedAt).slice(5).split('-').reverse().join('/'),
                      ].join(' · ')
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="a-muted ap-askfoot">{t('ask.foot', { usd: usd(spent) })}</div>
      </nav>

      <main className="ap-askmain">
        <div className="ap-askbar">
          <span className="a-muted ap-asklbl">{t('ask.scope')}</span>
          <div className="ap-seg" role="radiogroup" aria-label={t('ask.scope')}>
            {(['all', 'ca-nhan', 'cong-ty'] as const).map((s) => {
              const on = locked ? (full.scope.space ?? 'all') === s : space === s
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  key={s}
                  className={on ? 'on' : ''}
                  disabled={locked}
                  onClick={() => setSpace(s)}
                >
                  {t(`ask.scope.${s}`)}
                </button>
              )
            })}
          </div>
          {(locked ? full.scope.space === 'cong-ty' : space === 'cong-ty') && (
            <select
              aria-label={t('ask.dept')}
              title={t('ask.deptHint')}
              value={locked ? (full.scope.dept ?? '') : dept}
              disabled={locked}
              onChange={(e) => setDept(e.target.value)}
            >
              <option value="">{t('ask.dept.all')}</option>
              <option value="chung">{t('ask.dept.common')}</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {t('ask.dept.one', { name: d.name })}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className={(locked ? full.scope.memory : memory) ? 'ap-memtog on' : 'ap-memtog'}
            aria-pressed={locked ? full.scope.memory : memory}
            disabled={locked}
            onClick={() => setMemory(!memory)}
          >
            <span className="full">{t('ask.memory')}</span>
            <span className="short">{t('ask.memoryShort')}</span>
          </button>
          {locked && <span className="a-muted ap-asklock">{t('ask.locked')}</span>}
        </div>

        <div className="ap-askflow">
          {!full && (
            <div className="ap-askempty">
              <Mascot id={LIBRARIAN} size={52} />
              <h2>{t('ask.emptyTitle')}</h2>
              <div className="a-muted">{t('ask.emptyText')}</div>
              <div className="ap-askex">
                {['ask.ex1', 'ask.ex2', 'ask.ex3'].map((k) => (
                  <button type="button" key={k} onClick={() => void send(t(k))} disabled={busy}>
                    {t(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {full?.turns.map((turn, i) => {
            const live = turn.status === 'dang-tra'
            return (
              <div className="ap-turn" key={i}>
                <div className="ap-q">
                  {turn.q}
                  <span className="sc">{full.scopeLabel}</span>
                </div>
                <div className="ap-ans">
                  <div className="ap-who">
                    <Mascot id={LIBRARIAN} size={22} />
                    <b>{t('ask.librarian')}</b>
                    {live
                      ? t('ask.searching')
                      : turn.status === 'xong'
                        ? turn.sources.length
                          ? t('ask.fromN', { n: turn.sources.length })
                          : ''
                        : turn.status === 'dung'
                          ? t('ask.stopped')
                          : t('ask.failed')}
                  </div>
                  {live ? (
                    <div className="ap-steps open">
                      {turn.steps.map((s, j) => (
                        <StepRow key={j} t={t} s={s} live={j === turn.steps.length - 1} />
                      ))}
                      {!turn.steps.length && <StepRow t={t} s={{ kind: 'tim', text: '…' }} live />}
                    </div>
                  ) : turn.steps.length ? (
                    <details className="ap-steps">
                      <summary>{summaryLine(t, turn)}</summary>
                      {turn.steps.map((s, j) => (
                        <StepRow key={j} t={t} s={s} />
                      ))}
                    </details>
                  ) : null}
                  {turn.answer && !live && (
                    <Answer
                      text={turn.answer}
                      sources={turn.sources}
                      links={links}
                      onCite={(n) => {
                        setFocus({ turn: i, n })
                        document.getElementById(`ap-src-${n}`)?.scrollIntoView({ block: 'nearest' })
                      }}
                    />
                  )}
                  {turn.error && <div className="ap-askerr">{turn.error}</div>}
                  {live && (
                    <div>
                      <Button
                        size="sm"
                        onClick={() =>
                          void post({ op: 'ask-stop', id: full.id }).then(() => loadAsk(full.id))
                        }
                      >
                        {t('ask.stop')}
                      </Button>
                    </div>
                  )}
                  {!live && turn.answer && (
                    <>
                      {turn.answer.startsWith('Chưa thấy') && (
                        <div className="ap-askmiss">
                          <span>{t('ask.missHint')}</span>
                          <div className="ap-askacts">
                            <Button size="sm" onClick={() => nav.go('brain', { view: 'inbox' })}>
                              {t('ask.addInbox')}
                            </Button>
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                void post({ op: 'ask-aris', id: full.id, turn: i }).then(
                                  (j) => j?.sessionId && nav.openSession(j.sessionId),
                                )
                              }
                            >
                              {t('ask.askAris')}
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="ap-askacts">
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void post({ op: 'ask-save', id: full.id, turn: i }).then(
                              (j) => j?.batch && setError(t('ask.saved')),
                            )
                          }
                        >
                          {t('ask.save')}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void navigator.clipboard?.writeText(turn.answer ?? '')}
                        >
                          {t('ask.copy')}
                        </Button>
                        <Button size="sm" onClick={() => nav.openSession(full.session)}>
                          {t('ask.openSession')}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {full && (
            <div className="ap-askacts" style={{ justifyContent: 'flex-end' }}>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void post({ op: 'ask-delete', id: full.id }).then(() => {
                    setPick(null)
                    void loadList()
                  })
                }
              >
                {t('ask.delete')}
              </Button>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <div className="ap-askinput">
          {error && <div className={error === t('ask.saved') ? 'ap-asknote' : 'ap-askerr'}>{error}</div>}
          <div className="a-card ap-askbox">
            <textarea
              className="ap-bare"
              rows={2}
              value={draft}
              placeholder={full ? t('ask.followUp') : t('ask.placeholder')}
              aria-label={t('ask.question')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <Button
              variant="primary"
              size="sm"
              disabled={busy || running || !draft.trim()}
              onClick={() => void send()}
            >
              {t('ask.send')}
            </Button>
          </div>
        </div>
      </main>

      <aside className="ap-aside ap-asksrc" aria-label={t('ask.sources', { n: sources.length })}>
        <b>{t('ask.sources', { n: sources.length })}</b>
        {!sources.length && <div className="a-muted">{t('ask.noSources')}</div>}
        {sources.map((s) => (
          <div
            className={focus?.n === s.n ? 'ap-src hl' : 'ap-src'}
            id={`ap-src-${s.n}`}
            key={`${s.kind}${s.ref}`}
          >
            <span className={s.kind === 'mem' ? 'ap-cit mem' : 'ap-cit'}>{s.n}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <b>
                {s.kind === 'mem' ? t('ask.memOf', { name: s.botName ?? s.bot ?? '' }) : (s.title ?? s.ref)}
              </b>
              {s.missing ? (
                <div className="a-muted">{t('ask.missing')}</div>
              ) : (
                <>
                  <div className="ap-srcmeta">
                    <span className={`ap-lay ${s.kind === 'mem' ? 'mem' : (s.layer ?? '')}`}>
                      {s.kind === 'mem' ? t('ask.layer.mem') : t(LAYER[s.layer ?? ''] ?? 'ask.layer.wiki')}
                    </span>
                    <span className="a-muted">{place(s)}</span>
                  </div>
                  {s.snippet && (
                    <div className="ap-srcex">
                      “<Marked text={s.snippet} terms={s.terms ?? []} />”
                    </div>
                  )}
                  <a className="ap-link" onClick={() => openSource(s)}>
                    {s.kind === 'mem' ? t('ask.openMem', { name: s.botName ?? '' }) : t('ask.openPage')}
                  </a>
                </>
              )}
            </span>
          </div>
        ))}
        <div className="a-muted ap-asklegend">
          <div>
            <span className="ap-lay wiki">{t('ask.layer.wiki')}</span>
            <span className="ap-lay nguon">{t('ask.layer.nguon')}</span>
            <span className="ap-lay nhat-ky">{t('ask.layer.nhat-ky')}</span>
            <span className="ap-lay mem">{t('ask.layer.mem')}</span>
          </div>
          {t('ask.noGuess')}
        </div>
      </aside>
    </div>
  )
}
