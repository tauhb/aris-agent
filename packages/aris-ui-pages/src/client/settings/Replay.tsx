/**
 * 6.5b · Phát lại phiên (giai đoạn 7, đợt 7c; bản vẽ `PhatLai.dc.html`): từng bước của một phiên (tin nhắn, suy nghĩ,
 * gọi công cụ, duyệt, bị chặn) kèm token và tiền, phát tự động hoặc bấm từng bước. Chỉ đọc nhật ký đã ghi, không chạy
 * lại gì. Dữ liệu từ `/api/aris/stats?replay=` (`@aris/stats`); phiên đang chạy thì hỏi lại mỗi 3 giây.
 */
import { Button, Card, IconButton, Pill, Segmented } from '@aris/ui-kit/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PageProps } from '../page.js'
import { Bot } from '../ui.js'
import {
  clock,
  clockSec,
  dateShort,
  fmtDuration,
  fmtInt,
  fmtTokens,
  fmtUsd,
  sameDay,
} from './stats-format.js'

type StepType = 'user' | 'assistant' | 'thinking' | 'tool' | 'duyet' | 'hoi' | 'chan'
interface Step {
  n: number
  at: number
  type: StepType
  title: string
  tool?: string
  error?: boolean
  model?: string
  input?: number
  cacheRead?: number
  output?: number
  usd?: number
  ms?: number
  inLabel: string
  body: string
  bodyFull: boolean
  outLabel?: string
  out?: string
  outFull?: boolean
}
interface Data {
  session: string
  bot: string
  botName: string
  mascot: string
  accessory?: string | undefined
  title: string
  by: string
  source: string
  firstAt: number
  lastAt: number
  usd: number
  tokens: number
  running: boolean
  steps: Step[]
}

const SPEEDS = ['1', '2', '4'] as const
type Speed = (typeof SPEEDS)[number]
/** Thời gian giữa hai bước khi phát: 1×, 2×, 4×. */
const STEP_MS: Record<Speed, number> = { '1': 1200, '2': 600, '4': 300 }
const DECISIONS = new Set(['allowed-once', 'rejected', 'cancelled', 'unavailable'])
const POLL_MS = 3000

const endpoint = (sid: string, extra: Record<string, string> = {}) => {
  const u = new URL('api/aris/stats', document.baseURI)
  u.searchParams.set('replay', sid)
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v)
  return u
}

/** Màu ô của bước (bản vẽ: tin nhắn, gọi công cụ, duyệt, lỗi hay bị chặn). */
const colorOf = (s: Step) =>
  s.type === 'chan' || (s.type === 'tool' && s.error)
    ? 'var(--a-danger)'
    : s.type === 'tool'
      ? 'var(--ap-c2)'
      : s.type === 'duyet' || s.type === 'hoi'
        ? 'var(--ap-c4)'
        : 'var(--ap-c1)'
const toneOf = (s: Step) =>
  s.type === 'chan' || (s.type === 'tool' && s.error)
    ? 'danger'
    : s.type === 'tool'
      ? 'ok'
      : s.type === 'duyet' || s.type === 'hoi'
        ? 'warn'
        : 'accent'

const Icon = ({ d }: { d: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
)

/** Phím tắt không áp khi người dùng đang gõ, đang chọn tốc độ hay đang đứng trên nút. */
const typing = (el: EventTarget | null) => {
  const e = el as HTMLElement | null
  return !!e?.closest?.(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role=radiogroup]',
  )
}

export function Replay({ t, nav, sid }: PageProps & { sid: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [sel, setSel] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>('2')
  const [full, setFull] = useState<Record<number, Step | 'loading' | 'error'>>({})
  const rows = useRef<(HTMLButtonElement | null)[]>([])
  const count = useRef(0)
  const stepCount = useRef(-1)
  const dec = t('sx.dec')

  const load = useCallback(async () => {
    const r = await fetch(endpoint(sid)).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (Data & { error?: string }) | null
    if (!r?.ok || !j || j.error) {
      setFailed(true)
      return
    }
    setFailed(false)
    // Bước mới chen vào giữa (duyệt ghi sau) làm số bước đổi: bỏ các bản "Xem đủ" đã nhớ.
    if (stepCount.current !== j.steps.length) {
      stepCount.current = j.steps.length
      setFull({})
    }
    setData(j)
  }, [sid])
  useEffect(() => {
    setData(null)
    setFailed(false)
    stepCount.current = -1
    setSel(0)
    setPlaying(false)
    setFull({})
    void load()
  }, [load])
  const running = data?.running ?? false
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [running, load])

  const steps = data?.steps ?? []
  count.current = steps.length
  const last = Math.max(0, steps.length - 1)
  const cur = Math.min(sel, last)

  // Phát: mỗi nhịp tới bước sau; tới cuối thì dừng, trừ phiên đang chạy (chờ bước mới).
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setSel((i) => {
        if (i + 1 < count.current) return i + 1
        return i
      })
    }, STEP_MS[speed])
    return () => clearInterval(timer)
  }, [playing, speed])
  useEffect(() => {
    if (playing && !running && steps.length > 0 && cur >= last) setPlaying(false)
  }, [playing, running, steps.length, cur, last])

  // Dòng đang chọn tự cuộn vào tầm nhìn.
  useEffect(() => {
    rows.current[cur]?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  // ← → lùi, tới; phím cách phát hay dừng.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSel((i) => Math.max(0, Math.min(i, count.current - 1) - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setSel((i) => Math.min(Math.max(0, count.current - 1), i + 1))
      } else if (e.key === ' ' && !(e.target as HTMLElement | null)?.closest?.('button, a')) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const loadFull = async (n: number) => {
    setFull((f) => ({ ...f, [n]: 'loading' }))
    const r = await fetch(endpoint(sid, { step: String(n), full: '1' })).catch(() => null)
    const j = (await r?.json().catch(() => null)) as (Step & { error?: string }) | null
    setFull((f) => ({ ...f, [n]: r?.ok && j && !j.error ? j : 'error' }))
  }

  const back = () => nav.go('settings', { section: 'stats' })
  if (failed && !data)
    return (
      <main className="a-page ap-rp">
        <header className="a-page-head">
          <Button size="sm" onClick={back}>
            {t('rp.back')}
          </Button>
          <span className="ap-error" style={{ margin: 0 }}>
            {t('rp.error')}
          </span>
        </header>
      </main>
    )
  if (!data)
    return (
      <main className="a-page ap-rp">
        <header className="a-page-head">
          <Button size="sm" onClick={back}>
            {t('rp.back')}
          </Button>
          <span className="a-muted">{t('rp.loading')}</span>
        </header>
      </main>
    )

  const step = steps[cur]
  const over = step ? full[step.n] : undefined
  const view: Step | undefined = step && typeof over === 'object' ? { ...step, ...over } : step
  const now = Date.now()
  const span = sameDay(data.firstAt, data.lastAt)
    ? `${sameDay(data.firstAt, now) ? t('rp.today') : dateShort(data.firstAt)} ${clock(data.firstAt)}–${clock(data.lastAt)}`
    : `${dateShort(data.firstAt)} ${clock(data.firstAt)}–${dateShort(data.lastAt)} ${clock(data.lastAt)}`
  const sub = [
    data.botName,
    data.by ? t('sx.by', { name: data.by }) : '',
    t(`sx.src.${data.source}`),
    span,
    t('rp.stepsCount', { n: steps.length }),
    t('rp.tokensCount', { n: fmtTokens(data.tokens, dec) }),
    `${fmtUsd(data.usd, dec)} USD`,
  ]
    .filter(Boolean)
    .join(' · ')
  const title = data.title || t('sx.untitled')
  const kindLabel = (s: Step) => t(s.type === 'tool' && s.error ? 'rp.kind.error' : `rp.kind.${s.type}`)
  const dur = (ms: number) =>
    fmtDuration(
      ms,
      (n) => t('rp.sec', { n }),
      (m, s) => t('rp.min', { m, s }),
      dec,
    )
  const legend: [string, string][] = [
    ['var(--ap-c1)', t('rp.leg.msg')],
    ['var(--ap-c2)', t('rp.leg.tool')],
    ['var(--ap-c4)', t('rp.leg.approval')],
    ['var(--a-danger)', t('rp.leg.bad')],
  ]
  const outText = (s: Step) =>
    s.outLabel === 'decision' && s.out && DECISIONS.has(s.out) ? t(`rp.dec.${s.out}`) : (s.out ?? '')

  return (
    <main className="a-page ap-rp" aria-label={title}>
      <header className="a-page-head ap-rphead">
        <Button size="sm" onClick={back}>
          {t('rp.back')}
        </Button>
        <Bot id={data.mascot} accessory={data.accessory} size={26} />
        <div className="grow ap-rptitle">
          <h1 className="a-page-title ap-rpname">{title}</h1>
          <span className="a-page-sub">{sub}</span>
        </div>
        {data.running && (
          <span className="ap-sxlive">
            <span aria-hidden="true" className="ap-sxdot" />
            {t('sx.running')}
          </span>
        )}
        <Button size="sm" onClick={() => nav.openSession(sid)}>
          {t('rp.open')}
        </Button>
      </header>

      <div className="ap-rpbar" role="group" aria-label={t('rp.controls')}>
        <IconButton
          className="ap-rppb"
          label={t('rp.first')}
          onClick={() => setSel(0)}
          disabled={!steps.length}
        >
          <Icon d="M6 5h2v14H6zM20 5v14L9 12z" />
        </IconButton>
        <IconButton
          className="ap-rppb"
          label={t('rp.prev')}
          onClick={() => setSel(Math.max(0, cur - 1))}
          disabled={!steps.length}
        >
          <Icon d="M18 5v14L7 12z" />
        </IconButton>
        <IconButton
          className="ap-rppb main"
          label={playing ? t('rp.pause') : t('rp.play')}
          onClick={() => {
            // Đang ở cuối thì phát lại từ đầu.
            if (!playing && cur >= last && !running) setSel(0)
            setPlaying(!playing)
          }}
          disabled={!steps.length}
        >
          <Icon d={playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M7 5v14l11-7z'} />
        </IconButton>
        <IconButton
          className="ap-rppb"
          label={t('rp.next')}
          onClick={() => setSel(Math.min(last, cur + 1))}
          disabled={!steps.length}
        >
          <Icon d="M6 5v14l11-7z" />
        </IconButton>
        <IconButton
          className="ap-rppb"
          label={t('rp.last')}
          onClick={() => setSel(last)}
          disabled={!steps.length}
        >
          <Icon d="M16 5h2v14h-2zM4 5v14l11-7z" />
        </IconButton>
        <span className="ap-rppos">{steps.length ? t('rp.pos', { i: cur + 1, n: steps.length }) : '—'}</span>
        <Segmented
          label={t('rp.speed')}
          value={speed}
          onChange={setSpeed}
          options={SPEEDS.map((v) => ({ value: v, label: `${v}×` }))}
        />
        <div className="ap-rpticks" role="group" aria-label={t('rp.timeline')}>
          {steps.map((s, i) => (
            <button
              key={s.n}
              type="button"
              className={`ap-rptick${i === cur ? ' on' : ''}`}
              style={{ background: colorOf(s), opacity: i <= cur ? 1 : 0.3 }}
              aria-label={t('rp.stepAria', { n: s.n, title: s.title })}
              aria-current={i === cur ? 'step' : undefined}
              onClick={() => setSel(i)}
            />
          ))}
        </div>
      </div>

      <div className="a-page-body">
        <div className="ap-cols">
          <div className="ap-col" style={{ flex: '1.3 1 480px' }}>
            <Card
              title={t('rp.steps')}
              actions={
                <span className="ap-rpleg">
                  {legend.map(([color, label]) => (
                    <span key={label}>
                      <span className="ap-rpdot" style={{ background: color }} /> {label}
                    </span>
                  ))}
                </span>
              }
            >
              {steps.length === 0 && <div className="ap-sxempty a-muted">{t('rp.noStep')}</div>}
              <div className="ap-rplist">
                {steps.map((s, i) => (
                  <button
                    key={s.n}
                    type="button"
                    ref={(el) => {
                      rows.current[i] = el
                    }}
                    className={`ap-rpst${i === cur ? ' on' : ''}`}
                    aria-current={i === cur ? 'step' : undefined}
                    onClick={() => setSel(i)}
                  >
                    <span className="a-muted ap-rpfig">{s.n}</span>
                    <span className="a-mono a-muted ap-rpat">{clockSec(s.at)}</span>
                    <span className="ap-rpdot" style={{ background: colorOf(s) }} />
                    <span className="ap-rptext">{s.title}</span>
                    <span className="a-muted ap-rpfig ap-rpr">
                      {s.input !== undefined ? fmtTokens(s.input + (s.output ?? 0), dec) : ''}
                    </span>
                    <span className="a-mono ap-rpfig ap-rpr">
                      {s.usd !== undefined ? fmtUsd(s.usd, dec) : ''}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          <div className="ap-col" style={{ flex: '1 1 400px' }}>
            {view && (
              <section className="a-card ap-rpdetail" aria-live="polite">
                <div className="ap-rpdh">
                  <Pill tone={toneOf(view)}>{kindLabel(view)}</Pill>
                  <b className="ap-rpdt">{view.title}</b>
                  <span className="a-muted a-mono" style={{ fontSize: 12 }}>
                    {clockSec(view.at)}
                  </span>
                </div>
                <div className="ap-rpkv a-muted">
                  <span>{view.model || '—'}</span>
                  {view.input !== undefined && (
                    <span className="ap-rpfig">
                      {t('rp.tokenLine', {
                        input: fmtInt(view.input, dec),
                        cache: fmtInt(view.cacheRead ?? 0, dec),
                        output: fmtInt(view.output ?? 0, dec),
                      })}
                    </span>
                  )}
                  {view.usd !== undefined && <span className="ap-rpfig">{fmtUsd(view.usd, dec)} USD</span>}
                  {view.ms !== undefined && (
                    <span className="ap-rpfig">
                      {view.type === 'duyet' || view.type === 'hoi'
                        ? t('rp.waited', { time: dur(view.ms) })
                        : dur(view.ms)}
                    </span>
                  )}
                </div>
                <div className="ap-rpblock">
                  <span className="ap-rplabel">
                    <span className="a-muted">{t(`rp.in.${view.inLabel}`)}</span>
                    {!view.bodyFull && (
                      <>
                        <span className="a-muted"> · {t('rp.shortened')}</span>
                        <FullButton t={t} state={over} onClick={() => void loadFull(view.n)} />
                      </>
                    )}
                  </span>
                  <pre className="a-mono ap-rppre">{view.body}</pre>
                </div>
                {view.outLabel && (
                  <div className="ap-rpblock">
                    <span className="ap-rplabel">
                      <span className="a-muted">{t(`rp.out.${view.outLabel}`)}</span>
                      {view.outFull === false && (
                        <>
                          <span className="a-muted"> · {t('rp.shortened')}</span>
                          <FullButton t={t} state={over} onClick={() => void loadFull(view.n)} />
                        </>
                      )}
                    </span>
                    <pre className="a-mono ap-rppre">{outText(view)}</pre>
                  </div>
                )}
              </section>
            )}
            <section className="a-card ap-pad ap-rpnote a-muted">{t('rp.note')}</section>
          </div>
        </div>
      </div>
    </main>
  )
}

function FullButton({
  t,
  state,
  onClick,
}: {
  t: PageProps['t']
  state: Step | 'loading' | 'error' | undefined
  onClick: () => void
}) {
  return (
    <>
      <span className="grow" />
      {state === 'error' && <span className="ap-error ap-rperr">{t('rp.fullError')}</span>}
      <Button size="sm" onClick={onClick} disabled={state === 'loading'}>
        {state === 'loading' ? t('rp.fullLoading') : t('rp.full')}
      </Button>
    </>
  )
}
