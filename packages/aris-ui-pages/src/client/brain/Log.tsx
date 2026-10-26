/**
 * 5.6 · Nhật ký bộ não (giai đoạn 5, đợt 2a; bản vẽ NhatKyBoNao.dc.html): mọi thay đổi của kho theo ngày
 * (nạp, tự nạp, sửa trên web, sửa trong Obsidian, ghi nhanh, hoàn tác), đọc từ git của kho; chi tiết khác
 * biệt và nút hoàn tác. Dữ liệu từ `/api/aris/brain?log=<không gian>`.
 */
import { Button, IconButton } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageProps, Translate } from '../page.js'
import { patchChanges, type Change } from './diff.js'
import { Inline, type LinkTarget } from './markdown.js'
import { Ico, type IconName } from './tree.js'

type Space = 'ca-nhan' | 'cong-ty'
type Kind =
  'nap' | 'tu-nap' | 'sua' | 'sua-obsidian' | 'ghi-nhanh' | 'hoan-tac' | 'luu-nguon' | 'bo' | 'he-thong'

interface LogEvent {
  sha: string
  at: number
  kind: Kind
  subject: string
  files: { status: string; path: string }[]
  reverted?: string
}

/** Khác biệt chỉ để xem: liên kết hiện như chữ có gạch chân, không mở. */
const VIEW_LINKS: LinkTarget = { exists: () => true, open: () => undefined }
const plain = (s: string) => s.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^#+\s+/, '')

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const HIDDEN = new Set<Kind>(['he-thong', 'luu-nguon'])
const UNDOABLE = new Set<Kind>(['nap', 'tu-nap', 'sua', 'sua-obsidian', 'ghi-nhanh'])
const FILTERS = ['all', 'nap', 'sua', 'hoan-tac'] as const
type Filter = (typeof FILTERS)[number]
const inFilter = (f: Filter, k: Kind) =>
  f === 'all' ||
  (f === 'nap'
    ? k === 'nap' || k === 'tu-nap'
    : f === 'sua'
      ? k === 'sua' || k === 'sua-obsidian' || k === 'ghi-nhanh'
      : k === 'hoan-tac')

const ICON: Record<Kind, IconName> = {
  nap: 'book',
  'tu-nap': 'cal',
  sua: 'pen',
  'sua-obsidian': 'gem',
  'ghi-nhanh': 'pen',
  'hoan-tac': 'undo',
  'luu-nguon': 'box',
  bo: 'box',
  'he-thong': 'dots',
}
/** Ai làm: Thủ thư (cam) hay người dùng (xanh). */
const byLibrarian = (k: Kind) => k === 'nap' || k === 'tu-nap'

const two = (n: number) => String(n).padStart(2, '0')
const hm = (ms: number) => {
  const d = new Date(ms)
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

/** Tiêu đề sự kiện: bỏ tiền tố, giữ phần nói về nguồn hay trang. */
function title(t: Translate, e: LogEvent): string {
  const rest = e.subject
    .replace(/^(Nạp|Tự nạp|Hoàn tác|Lưu nguồn|Bỏ nguồn): /, '')
    .replace(/ \([0-9a-f]{7}\)$/, '')
    // "<tên> sửa: a.md", "<tên> sửa Chị Hà", "<tên> ghi nhanh": tên đã có trong nhãn loại.
    .replace(
      e.kind === 'sua' || e.kind === 'sua-obsidian'
        ? /^.+? sửa:? /
        : e.kind === 'ghi-nhanh'
          ? /^.+? ghi nhanh\s*/
          : /^(?!)/,
      '',
    )
  return rest.trim() ? `${t(`lg.k.${e.kind}`)} · ${rest}` : t(`lg.k.${e.kind}`)
}

function dayLabel(t: Translate, ms: number) {
  const d = new Date(ms)
  const now = new Date()
  const diff = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  )
  const label = `${t(`nb.wd.${d.getDay()}`)} ${two(d.getDate())}/${two(d.getMonth() + 1)}`
  return diff === 0 ? t('lg.today', { d: label }) : diff === 1 ? t('lg.yesterday', { d: label }) : label
}

export function BrainLog({ t, nav, params }: PageProps) {
  const [space, setSpace] = useState<Space>(params.space === 'cong-ty' ? 'cong-ty' : 'ca-nhan')
  const [events, setEvents] = useState<LogEvent[] | null>(null)
  const [spend, setSpend] = useState<{ usd: number } | null>(null)
  const [days, setDays] = useState(7)
  const [filter, setFilter] = useState<Filter>('all')
  const [pick, setPick] = useState<string | null>(null)
  const [patch, setPatch] = useState<{ path: string; changes: Change[] }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint(`?log=${space}&days=${days}`)).catch(() => null)
    if (!r?.ok) return
    const j = (await r.json()) as { events: LogEvent[]; spend?: { usd: number } }
    setEvents(j.events)
    if (j.spend) setSpend(j.spend)
  }, [space, days])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => clearInterval(timer)
  }, [load])

  const shown = useMemo(
    () => (events ?? []).filter((e) => !HIDDEN.has(e.kind) && e.files.length && inFilter(filter, e.kind)),
    [events, filter],
  )
  const current = shown.find((e) => e.sha === pick) ?? shown[0]

  useEffect(() => {
    if (!current) return setPatch(null)
    setPatch(null)
    void fetch(endpoint(`?commit=${current.sha}&space=${space}`))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { patch: string } | null) => setPatch(j ? patchChanges(j.patch) : []))
      .catch(() => setPatch([]))
  }, [current?.sha, space])

  const undo = async (e: LogEvent) => {
    if (!window.confirm(t('lg.undoConfirm', { title: title(t, e) }))) return
    setError(null)
    setBusy(true)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'revert', commit: e.sha }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    await load()
  }

  const count = (f: Filter) =>
    (events ?? []).filter((e) => !HIDDEN.has(e.kind) && e.files.length && inFilter(f, e.kind)).length
  const groups: { day: string; list: LogEvent[] }[] = []
  for (const e of shown) {
    const d = dayLabel(t, e.at)
    const g = groups[groups.length - 1]
    if (g?.day === d) g.list.push(e)
    else groups.push({ day: d, list: [e] })
  }

  return (
    <div className="ap-split ap-brain">
      <main className="ap-note-main">
        <div className="ap-lghead">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain', { view: 'notes', space })}>
            ‹
          </IconButton>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
            <b style={{ fontSize: 19 }}>{t('lg.title')}</b>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('lg.sub')}
            </span>
          </div>
          <div role="tablist" aria-label={t('nb.space')} className="ap-spaces ap-lgspaces">
            {(['ca-nhan', 'cong-ty'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={space === s}
                className={space === s ? 'on' : undefined}
                onClick={() => {
                  setSpace(s)
                  setPick(null)
                }}
              >
                <Ico
                  name={s === 'ca-nhan' ? 'user' : 'building'}
                  color={space === s ? (s === 'ca-nhan' ? 'var(--a-accent)' : '#0E9F8F') : undefined}
                />
                {t(`nb.space.${s}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="ap-lgchips">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? 'on' : undefined}
              onClick={() => setFilter(f)}
            >
              {t(`lg.f.${f}`)}
              {f !== 'all' ? ` · ${count(f)}` : ''}
            </button>
          ))}
          {spend && (
            <span className="a-muted" style={{ marginLeft: 'auto', fontSize: 12.5 }}>
              {t('lg.spend', { usd: spend.usd.toFixed(spend.usd < 0.01 ? 3 : 2).replace('.', ',') })}
            </span>
          )}
        </div>
        {error && (
          <div className="ap-berror" role="alert">
            {error}
          </div>
        )}
        <div className="ap-lglist">
          {events === null && <div className="a-muted">{t('nb.loading')}</div>}
          {events !== null && !shown.length && <div className="a-muted ap-lgnone">{t('lg.none')}</div>}
          {groups.map((g) => (
            <div key={g.day}>
              <div className="ap-lgday">{g.day}</div>
              {g.list.map((e) => (
                <button
                  type="button"
                  key={e.sha}
                  className={`ap-lgev${current?.sha === e.sha ? ' sel' : ''}${e.reverted ? ' gone' : ''}`}
                  onClick={() => setPick(e.sha)}
                >
                  <span className="tm">{hm(e.at)}</span>
                  <span
                    className={`bd ${byLibrarian(e.kind) ? 'lib' : e.kind === 'hoan-tac' ? 'undo' : 'me'}`}
                  >
                    <Ico name={ICON[e.kind]} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="tt">{title(t, e)}</span>
                    <span className="ss">
                      {e.reverted ? t('lg.reverted') : t('lg.files', { n: e.files.length })}
                    </span>
                  </span>
                  <span className={`who ${byLibrarian(e.kind) ? 'lib' : 'me'}`}>
                    {byLibrarian(e.kind) ? t('lg.librarian') : t('lg.you')}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {events !== null && days < 90 && (
            <button
              type="button"
              className="ap-link ap-lgmore"
              onClick={() => setDays((d) => Math.min(90, d + 7))}
            >
              {t('lg.more')}
            </button>
          )}
        </div>
      </main>

      <aside className="ap-aside" aria-label={t('lg.detail')}>
        {current ? (
          <>
            <div>
              <b style={{ fontSize: 15 }}>{title(t, current)}</b>
              <div className="a-muted" style={{ fontSize: 12.5 }}>
                {dayLabel(t, current.at)} {hm(current.at)} ·{' '}
                <span className="a-mono">{current.sha.slice(0, 7)}</span>
              </div>
            </div>
            <div className="ap-lgfiles">
              <b>{t('lg.changed', { n: current.files.length })}</b>
              {current.files.map((f) => (
                <div key={f.path} className="ap-lgfile">
                  <span className={`st ${f.status}`}>{t(`lg.st.${f.status}`)}</span>
                  <span className="ap-ell">{f.path.split('/').slice(1).join('/')}</span>
                </div>
              ))}
            </div>
            {patch === null ? (
              <span className="a-muted">{t('nb.loading')}</span>
            ) : (
              patch
                .filter((f) => f.changes.length && !/\/(index|log)\.md$/.test(f.path))
                .slice(0, 6)
                .map((f) => (
                  <div key={f.path} className="ap-ibdiff">
                    <b style={{ fontSize: 13 }}>{f.path.split('/').pop()}</b>
                    {f.changes.slice(0, 8).map((c, i) => (
                      <span key={i} className={c.kind}>
                        <Inline text={plain(c.text)} links={VIEW_LINKS} />
                      </span>
                    ))}
                  </div>
                ))
            )}
            {UNDOABLE.has(current.kind) && !current.reverted && (
              <div className="ap-lgundo">
                <Button disabled={busy} onClick={() => void undo(current)}>
                  {byLibrarian(current.kind) ? t('lg.undoBatch') : t('lg.undoEdit')}
                </Button>
                <span className="a-muted">{t('lg.undoHint')}</span>
              </div>
            )}
          </>
        ) : (
          <span className="a-muted">{t('lg.pick')}</span>
        )}
      </aside>
    </div>
  )
}
