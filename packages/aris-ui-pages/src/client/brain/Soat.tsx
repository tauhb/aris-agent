/**
 * 5.5 · Soát bộ não (giai đoạn 5, đợt 4a; bản vẽ SoatBoNao.dc.html): phát hiện theo nhóm (Thủ thư thấy,
 * sửa nhanh, gọn kho, bot), chi tiết nhóm đang chọn với nút xử lý, lịch soát và các lần soát. Dữ liệu từ
 * `/api/aris/brain?soat`.
 */
import { Button, IconButton, Mascot } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { PageProps } from '../page.js'

type Space = 'ca-nhan' | 'cong-ty'
type Kind =
  | 'mau-thuan'
  | 'nhan-dinh-cu'
  | 'lien-ket-gay'
  | 'chua-co-trang'
  | 'phong-da-xoa'
  | 'mo-coi'
  | 'thieu-tom-tat'
  | 'trung-ten'
  | 'lau-chua-cap-nhat'
  | 'bot-bo-qua'
  | 'ky-uc-nen-vao'
  | 'so-lieu-chua-ngay'

interface Finding {
  id: string
  kind: Kind
  by: 'may' | 'thu-thu'
  space?: Space
  title: string
  detail?: string
  pages: string[]
  pageInfo: { path: string; title: string; exists: boolean }[]
  target?: string
  bot?: string
  count?: number
  quotes?: { page: string; text: string }[]
  note?: string
  stats?: { nudged: number; followed: number }
  memory?: { id: string; bot: string; text: string; at: string }
  forget?: boolean
  status: 'mo' | 'bo-qua' | 'xu-ly'
  batch?: string
  batchStatus?: string | null
}

interface Run {
  id: string
  at: string
  by: 'may' | 'thu-thu'
  status: 'dang-chay' | 'xong' | 'loi' | 'dung'
  found: number
  cost: number
  error?: string
}

interface Data {
  findings: Finding[]
  runs: Run[]
  running: boolean
  schedule: { machineHour: number; deepDay: number; deepHour: number; capUsd: number }
  strong: string[]
  departments: { id: string; name: string }[]
  bots: { id: string; name: string; mascot?: string; accessory?: string }[]
}

const GROUPS: { key: string; kinds: Kind[] }[] = [
  { key: 'deep', kinds: ['mau-thuan', 'nhan-dinh-cu'] },
  { key: 'edge', kinds: ['ky-uc-nen-vao'] },
  { key: 'quick', kinds: ['lien-ket-gay', 'so-lieu-chua-ngay', 'chua-co-trang', 'phong-da-xoa'] },
  { key: 'tidy', kinds: ['mo-coi', 'thieu-tom-tat', 'trung-ten', 'lau-chua-cap-nhat'] },
  { key: 'bot', kinds: ['bot-bo-qua'] },
]
const ICON: Record<Kind, [string, string]> = {
  'mau-thuan': ['⚠', 'warn'],
  'nhan-dinh-cu': ['↻', 'warn'],
  'lien-ket-gay': ['⛓', 'danger'],
  'chua-co-trang': ['＋', 'accent'],
  'phong-da-xoa': ['⌂', 'muted'],
  'mo-coi': ['◌', 'muted'],
  'thieu-tom-tat': ['≡', 'muted'],
  'trung-ten': ['⧉', 'muted'],
  'lau-chua-cap-nhat': ['⏱', 'muted'],
  'bot-bo-qua': ['◉', 'mem'],
  'ky-uc-nen-vao': ['⇢', 'mem'],
  'so-lieu-chua-ngay': ['📅', 'ok'],
}

/** Số liệu (con số kèm đơn vị) và ngày "tính đến" trong một câu trích, để tô (bản vẽ 5.5b). */
const FIGURE =
  /([$€]\s?\d[\d.,]*|\d[\d.,]*\s*(?:%|đ|đồng|vnđ|vnd|nghìn|ngàn|k|triệu|tr|tỷ|tỉ|usd|tờ|bản|cái|chiếc|đơn|khách|người|video|sản phẩm)(?![\p{L}\p{N}]))|(tính đến\s+(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}))/giu
function Marked({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(FIGURE)) {
    out.push(text.slice(last, m.index))
    out.push(
      m[2] ? (
        <span key={m.index} className="ap-sbdt">
          {m[2]}
        </span>
      ) : (
        <mark key={m.index}>{m[1]}</mark>
      ),
    )
    last = m.index + m[0].length
  }
  out.push(text.slice(last))
  return <>{out}</>
}
const ddmm = (day: string) => day.slice(8, 10) + '/' + day.slice(5, 7)

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const when = (iso: string) => {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}
const usd = (n: number) =>
  n.toLocaleString(document.documentElement.lang || undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function Pg({
  info,
  nav,
}: {
  info: { path: string; title: string; exists: boolean }
  nav: PageProps['nav']
}) {
  if (!info.exists) return <span className="ap-sbpg none">{info.title}</span>
  return (
    <button
      type="button"
      className="ap-sbpg"
      onClick={() =>
        nav.go('brain', { view: 'notes', space: info.path.split('/')[0] ?? 'ca-nhan', path: info.path })
      }
    >
      {info.title}
    </button>
  )
}

export function Soat({ t, nav }: PageProps) {
  const [data, setData] = useState<Data | null>(null)
  const [pick, setPick] = useState<Kind>('mau-thuan')
  const [space, setSpace] = useState<'' | Space>('')
  const [showDismissed, setShowDismissed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [names, setNames] = useState<{ name: string; title: string; space: Space }[]>([])
  const [relinkTo, setRelinkTo] = useState<Record<string, string>>({})
  const [moveTo, setMoveTo] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const r = await fetch(endpoint('?soat=1')).catch(() => null)
    if (r?.ok) setData((await r.json()) as Data)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), data?.running ? 2000 : 8000)
    return () => clearInterval(timer)
  }, [load, data?.running])
  useEffect(() => {
    void fetch(endpoint('?names=1'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { pages: { name: string; title: string; space: Space; layer: string }[] } | null) =>
        setNames((j?.pages ?? []).filter((p) => p.layer === 'wiki')),
      )
      .catch(() => undefined)
  }, [])

  const post = async (body: Record<string, unknown>) => {
    setError(null)
    setBusy(true)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    await load()
    return r?.ok ? j : null
  }

  const inSpace = (f: Finding) => !space || !f.space || f.space === space
  const all = (data?.findings ?? []).filter(inSpace)
  const live = all.filter((f) => f.status !== 'bo-qua')
  const dismissed = all.filter((f) => f.status === 'bo-qua')
  const of = (k: Kind) => (showDismissed ? dismissed : live).filter((f) => f.kind === k)
  const shown = of(pick)
  const lastRun = (by: 'may' | 'thu-thu') => data?.runs.find((r) => r.by === by)

  const actions = (f: Finding, fixLabel = t('sb.fix')) =>
    f.status === 'bo-qua' ? (
      <Button size="sm" disabled={busy} onClick={() => void post({ op: 'soat-restore', id: f.id })}>
        {t('sb.restore')}
      </Button>
    ) : f.status === 'xu-ly' ? (
      <span className="ap-sbstate">
        {t('sb.asked', { status: f.batchStatus ? t(`sb.batch.${f.batchStatus}`) : '…' })}{' '}
        <a className="ap-link" onClick={() => nav.go('brain', { view: 'inbox' })}>
          {t('sb.toInbox')}
        </a>
      </span>
    ) : (
      <>
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => void post({ op: 'soat-fix', id: f.id })}
        >
          {fixLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void post({ op: 'soat-dismiss', id: f.id })}
        >
          {t('sb.dismiss')}
        </Button>
      </>
    )

  return (
    <div className="ap-split ap-brain ap-soat">
      <main className="ap-soatmain">
        <div className="ap-soathead">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain', { view: 'notes' })}>
            ‹
          </IconButton>
          <div className="ap-soatttl">
            <h1>{t('sb.title')}</h1>
            <span className="a-muted">{t('sb.subtitle')}</span>
          </div>
          <div className="ap-seg" role="tablist" aria-label={t('sb.space')}>
            {(['', 'ca-nhan', 'cong-ty'] as const).map((s) => (
              <button
                type="button"
                role="tab"
                key={s}
                aria-selected={space === s}
                className={space === s ? 'on' : ''}
                onClick={() => setSpace(s)}
              >
                {t(s ? `nb.space.${s}` : 'sb.all')}
              </button>
            ))}
          </div>
          <Button
            variant="primary"
            disabled={busy || data?.running}
            onClick={() => void post({ op: 'soat-run' })}
          >
            {data?.running ? t('sb.running') : t('sb.runNow')}
          </Button>
        </div>
        {error && <div className="ap-askerr ap-soaterr">{error}</div>}
        <div className="ap-soatbody">
          <nav className="ap-soatnav" aria-label={t('sb.findings')}>
            {showDismissed && (
              <div className="ap-sbback">
                <a className="ap-link" onClick={() => setShowDismissed(false)}>
                  {t('sb.backLive')}
                </a>
              </div>
            )}
            {GROUPS.map((g) => (
              <div key={g.key}>
                <div className="ap-askgrp">
                  {g.key === 'deep' && <Mascot id="trang-giay" size={16} />}
                  {t(`sb.group.${g.key}`)}
                </div>
                {g.kinds.map((k) => {
                  const n = of(k).length
                  return (
                    <button
                      type="button"
                      key={k}
                      className={pick === k ? 'ap-sbit on' : 'ap-sbit'}
                      aria-current={pick === k}
                      onClick={() => setPick(k)}
                    >
                      <span className={`bd ${ICON[k][1]}`}>{ICON[k][0]}</span>
                      {t(`sb.kind.${k}`)}
                      <span className={n && (g.key === 'deep' || k === 'bot-bo-qua') ? 'n hot' : 'n'}>
                        {n}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
            {!showDismissed && (
              <div className="a-muted ap-sbfoot">
                {t('sb.dismissedN', { n: dismissed.length })}
                {dismissed.length > 0 && (
                  <>
                    {' · '}
                    <a className="ap-link" onClick={() => setShowDismissed(true)}>
                      {t('sb.review')}
                    </a>
                  </>
                )}
              </div>
            )}
          </nav>

          <section className="ap-soatdetail" aria-label={t(`sb.kind.${pick}`)}>
            <div className="ap-sbh">
              <h2>{t(`sb.kind.${pick}`)}</h2>
              <span className="a-muted">{t(`sb.about.${pick}`)}</span>
            </div>
            {!data && <div className="a-muted">{t('sb.loading')}</div>}
            {data && !shown.length && <div className="a-muted">{t('sb.none')}</div>}

            {(pick === 'mau-thuan' || pick === 'nhan-dinh-cu') &&
              shown.map((f) => (
                <div className="a-card ap-sbcard" key={f.id}>
                  <div className="ap-sbrow0">
                    {f.pageInfo.map((p, i) => (
                      <span key={p.path} className="ap-sbpair">
                        {i > 0 && <span className="a-muted">↔</span>}
                        <Pg info={p} nav={nav} />
                      </span>
                    ))}
                    {f.space && <span className="ap-sblab">{t(`nb.space.${f.space}`)}</span>}
                  </div>
                  {!!f.quotes?.length && (
                    <div className="ap-sbquotes">
                      {f.quotes.map((q, i) => (
                        <div className="ap-sbquote" key={i}>
                          <b className="a-muted">{q.page}</b>
                          <div>
                            “<Marked text={q.text} />”
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {f.note && (
                    <div className="ap-sbnote">
                      <b>{t('sb.librarian')}:</b> {f.note}
                    </div>
                  )}
                  <div className="ap-sbacts">{actions(f)}</div>
                </div>
              ))}

            {(pick === 'lien-ket-gay' || pick === 'chua-co-trang') && shown.length > 0 && (
              <div className="a-card ap-sblist">
                {shown.map((f) => {
                  const opts = names.filter((n) => !f.space || n.space === f.space)
                  return (
                    <div className="ap-sbline" key={f.id}>
                      <span className="ap-sbpg none">{f.target}</span>
                      <span className="a-muted ap-sbin">
                        {t('sb.inPages', { pages: f.pageInfo.map((p) => p.title).join(', ') })}
                        {f.count && f.count > 1 ? ` · ${t('sb.times', { n: f.count })}` : ''}
                      </span>
                      <span className="ap-sbacts">
                        {f.status === 'mo' && (
                          <>
                            <input
                              list={`ap-sbnames-${f.id}`}
                              placeholder={t('sb.relinkTo')}
                              aria-label={t('sb.relinkTo')}
                              value={relinkTo[f.id] ?? ''}
                              onChange={(e) => setRelinkTo({ ...relinkTo, [f.id]: e.target.value })}
                            />
                            <datalist id={`ap-sbnames-${f.id}`}>
                              {opts.map((n) => (
                                <option key={n.name} value={n.name}>
                                  {n.title}
                                </option>
                              ))}
                            </datalist>
                            <Button
                              size="sm"
                              disabled={busy || !relinkTo[f.id]?.trim()}
                              onClick={() => void post({ op: 'soat-relink', id: f.id, to: relinkTo[f.id] })}
                            >
                              {t('sb.relink')}
                            </Button>
                          </>
                        )}
                        {actions(f, t('sb.create'))}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {pick === 'phong-da-xoa' &&
              shown.map((f) => (
                <div className="a-card ap-sbcard" key={f.id}>
                  <div className="ap-sbrow0">
                    <b>{t('sb.dept', { id: f.target ?? '' })}</b>
                    <span className="a-muted ap-mono">cong-ty/wiki/phong-ban/{f.target}/</span>
                    <span className="ap-sblab danger">{t('sb.deptGone')}</span>
                  </div>
                  <div className="ap-sbpages">
                    {t('sb.nPages', { n: f.pages.length })}{' '}
                    {f.pageInfo.slice(0, 6).map((p) => (
                      <Pg key={p.path} info={p} nav={nav} />
                    ))}
                    {f.pageInfo.length > 6 && <span className="a-muted"> +{f.pageInfo.length - 6}</span>}
                  </div>
                  {f.status === 'mo' ? (
                    <div className="ap-sbacts">
                      <span className="a-muted">{t('sb.moveAll', { n: f.pages.length })}</span>
                      <select
                        aria-label={t('sb.moveTo')}
                        value={moveTo[f.id] ?? 'chung'}
                        onChange={(e) => setMoveTo({ ...moveTo, [f.id]: e.target.value })}
                      >
                        <option value="chung">{t('sb.common')}</option>
                        {data?.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {t('sb.deptOpt', { name: d.name })}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() => void post({ op: 'soat-move', id: f.id, to: moveTo[f.id] ?? 'chung' })}
                      >
                        {t('sb.move')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void post({ op: 'soat-dismiss', id: f.id })}
                      >
                        {t('sb.dismiss')}
                      </Button>
                    </div>
                  ) : (
                    <div className="ap-sbacts">{actions(f)}</div>
                  )}
                  <div className="a-muted ap-sbhint">{t('sb.moveHint')}</div>
                </div>
              ))}

            {(pick === 'mo-coi' ||
              pick === 'thieu-tom-tat' ||
              pick === 'trung-ten' ||
              pick === 'lau-chua-cap-nhat') &&
              shown.length > 0 && (
                <div className="a-card ap-sblist">
                  {shown.map((f) => (
                    <div className="ap-sbline" key={f.id}>
                      <Pg info={f.pageInfo[0] ?? { path: '', title: f.title, exists: false }} nav={nav} />
                      <span className="a-muted ap-sbin">
                        {pick === 'thieu-tom-tat'
                          ? t(`sb.missing.${f.detail ?? 'tom-tat'}`)
                          : pick === 'trung-ten'
                            ? f.pages.join(' · ')
                            : pick === 'lau-chua-cap-nhat'
                              ? t('sb.newer', {
                                  pages: f.pageInfo
                                    .slice(1)
                                    .map((p) => p.title)
                                    .join(', '),
                                })
                              : f.pages[0]?.split('/').slice(0, -1).join(' / ')}
                      </span>
                      <span className="ap-sbacts">
                        {actions(f, pick === 'mo-coi' ? t('sb.link') : t('sb.fix'))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {pick === 'ky-uc-nen-vao' && (
              <div className="ap-sbkho" aria-label={t('sb.kho')}>
                <div className="mem">
                  <b>{t('sb.kho.mem')}</b>
                  <span>{t('sb.kho.memAbout')}</span>
                </div>
                <div className="me">
                  <b>{t('sb.kho.owner')}</b>
                  <span>{t('sb.kho.ownerAbout')}</span>
                </div>
                <div className="lib">
                  <b>{t('sb.kho.brain')}</b>
                  <span>{t('sb.kho.brainAbout')}</span>
                </div>
              </div>
            )}
            {pick === 'ky-uc-nen-vao' &&
              shown.map((f) => {
                const bot = data?.bots.find((b) => b.id === f.bot)?.name ?? f.bot ?? ''
                const has = f.detail === 'co-roi'
                return (
                  <div className="a-card ap-sbcard" key={f.id}>
                    <div className="ap-sbrow0">
                      <span className="ap-sbmem">{t('sb.memOf', { bot })}</span>
                      <span className="a-muted">→</span>
                      <Pg info={f.pageInfo[0] ?? { path: '', title: f.title, exists: false }} nav={nav} />
                      {f.memory && (
                        <span className="ap-sblab">
                          {t('sb.savedOn', { day: ddmm(f.memory.at.slice(0, 10)) })}
                        </span>
                      )}
                    </div>
                    <div className="ap-sbquote mem">
                      <b className="a-muted">{t('sb.memory')}</b>
                      <div>{f.memory?.text}</div>
                    </div>
                    {has && (
                      <div className="ap-sbnote">
                        <b>{t('sb.librarian')}:</b> {t('sb.memHas')} “{f.quotes?.[0]?.text}”
                      </div>
                    )}
                    {f.status === 'xu-ly' ? (
                      <div className="ap-sbdone">
                        <span>
                          ✓ {t('sb.asked', { status: f.batchStatus ? t(`sb.batch.${f.batchStatus}`) : '…' })}{' '}
                          <a className="ap-link" onClick={() => nav.go('brain', { view: 'inbox' })}>
                            {t('sb.toInbox')}
                          </a>
                        </span>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!f.forget}
                            disabled={busy}
                            onChange={(e) =>
                              void post({ op: 'soat-forget-after', id: f.id, on: e.target.checked })
                            }
                          />
                          {t('sb.forgetAfter', { bot })}
                        </label>
                      </div>
                    ) : f.status === 'bo-qua' ? (
                      <div className="ap-sbacts">{actions(f)}</div>
                    ) : (
                      <div className="ap-sbacts">
                        {has && (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy}
                            onClick={() => void post({ op: 'soat-forget', id: f.id })}
                          >
                            {t('sb.forgetNow')}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={has ? 'secondary' : 'primary'}
                          disabled={busy}
                          onClick={() => void post({ op: 'soat-fix', id: f.id, forget: true })}
                        >
                          {t('sb.toBrain')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void post({ op: 'soat-dismiss', id: f.id })}
                        >
                          {t('sb.dismiss')}
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            {pick === 'ky-uc-nen-vao' && (
              <>
                <div className="ap-sbrule">
                  <b>{t('sb.ruleRoot')}</b> {t('sb.ruleRootText')}
                </div>
                <div className="a-muted ap-sbhint">{t('sb.toBrainHint')}</div>
              </>
            )}

            {pick === 'so-lieu-chua-ngay' && shown.length > 0 && (
              <div className="a-card ap-sblist">
                {shown.map((f) => (
                  <div className="ap-sbline ap-sbfig" key={f.id}>
                    <Pg info={f.pageInfo[0] ?? { path: '', title: f.title, exists: false }} nav={nav} />
                    <div className="ap-sbfiglines">
                      {(f.quotes ?? []).map((q, i) => (
                        <div className="ap-sbquote" key={i}>
                          <Marked text={q.text} />
                        </div>
                      ))}
                      {(f.count ?? 0) > (f.quotes?.length ?? 0) && (
                        <span className="a-muted">
                          {t('sb.moreLines', { n: (f.count ?? 0) - (f.quotes?.length ?? 0) })}
                        </span>
                      )}
                    </div>
                    <span className="ap-sbacts">
                      {f.status === 'mo' && f.detail && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          title={t('sb.dateTip', { day: f.detail })}
                          onClick={() => void post({ op: 'soat-date', id: f.id })}
                        >
                          {t(f.target === 'nguon' ? 'sb.dateSource' : 'sb.dateEdit', { day: ddmm(f.detail) })}
                        </Button>
                      )}
                      {f.status === 'mo' ? (
                        <>
                          <Button
                            size="sm"
                            disabled={busy}
                            onClick={() => void post({ op: 'soat-fix', id: f.id })}
                          >
                            {t('sb.checkSource')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => void post({ op: 'soat-dismiss', id: f.id })}
                          >
                            {t('sb.dismiss')}
                          </Button>
                        </>
                      ) : (
                        actions(f)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {pick === 'so-lieu-chua-ngay' && (
              <>
                <div className="a-muted ap-sbhint">{t('sb.dateHint')}</div>
                <div className="ap-sbrule">
                  <b>{t('sb.ruleFigures')}</b> {t('sb.ruleFiguresText')}
                </div>
              </>
            )}

            {pick === 'bot-bo-qua' && shown.length > 0 && (
              <div className="a-card ap-sblist">
                {shown.map((f) => {
                  const s = f.stats ?? { nudged: 0, followed: 0 }
                  const pct = s.nudged ? Math.round((s.followed / s.nudged) * 100) : 0
                  const bot = data?.bots.find((b) => b.id === f.bot)
                  const strong = !!f.bot && !!data?.strong.includes(f.bot)
                  return (
                    <div className="ap-sbline ap-sbbot" key={f.id}>
                      <Mascot id={bot?.mascot ?? 'aris'} size={22} accessory={bot?.accessory} />
                      <b>{f.title}</b>
                      <span className="a-muted">{t('sb.botStat', { n: s.nudged, m: s.followed })}</span>
                      <span className="ap-sbbar">
                        <span style={{ width: `${pct}%` }} className={pct >= 50 ? 'ok' : 'warn'} />
                      </span>
                      <Button
                        size="sm"
                        variant={strong ? 'secondary' : 'primary'}
                        disabled={busy}
                        onClick={() => void post({ op: 'soat-strong', bot: f.bot, on: !strong })}
                      >
                        {strong ? t('sb.strongOn') : t('sb.strong')}
                      </Button>
                      {f.status !== 'mo' ? null : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void post({ op: 'soat-dismiss', id: f.id })}
                        >
                          {t('sb.dismiss')}
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {pick === 'bot-bo-qua' && <div className="a-muted ap-sbhint">{t('sb.strongHint')}</div>}
            {(pick === 'mau-thuan' || pick === 'nhan-dinh-cu' || pick === 'mo-coi') && shown.length > 0 && (
              <div className="a-muted ap-sbhint">{t('sb.fixHint')}</div>
            )}
          </section>
        </div>
      </main>

      <aside className="ap-aside ap-soataside" aria-label={t('sb.schedule')}>
        <b>{t('sb.schedule')}</b>
        <div className="ap-sbsched">
          <span className="ap-sblab">{t('sb.machine')}</span>
          {t('sb.machineAt', { h: data?.schedule.machineHour ?? 6 })}
        </div>
        <div className="ap-sbsched">
          <span className="ap-sblab lib">{t('sb.librarian')}</span>
          {t('sb.deepAt', { h: data?.schedule.deepHour ?? 21, cap: usd(data?.schedule.capUsd ?? 0.3) })}
        </div>
        <b className="ap-sbsep">{t('sb.runs')}</b>
        {!data?.runs.length && <div className="a-muted">{t('sb.noRuns')}</div>}
        {data?.runs.map((r) => (
          <div className="ap-sbrun" key={r.id}>
            <span className={r.by === 'thu-thu' ? 'ap-sblab lib' : 'ap-sblab'}>
              {r.by === 'thu-thu' ? t('sb.librarian') : t('sb.machine')}
            </span>
            <span>{when(r.at)}</span>
            <span className="a-muted end">
              {r.status === 'dang-chay'
                ? t('sb.runRunning')
                : r.status === 'loi' || r.status === 'dung'
                  ? (r.error ?? t('sb.runFailed'))
                  : t('sb.runFound', { n: r.found }) + (r.cost ? ` · ${usd(r.cost)} USD` : '')}
            </span>
          </div>
        ))}
        <b className="ap-sbsep">{t('sb.elsewhere')}</b>
        <div className="a-muted ap-sbhint">{t('sb.elsewhereHint')}</div>
        <div className="a-muted ap-sbhint">
          {t('sb.last', {
            machine: lastRun('may') ? when(lastRun('may')!.at) : '—',
            deep: lastRun('thu-thu') ? when(lastRun('thu-thu')!.at) : '—',
          })}
        </div>
      </aside>
    </div>
  )
}
