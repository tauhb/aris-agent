/**
 * 4.2 · Tạo routine bằng lời: người dùng mô tả, `@aris/routine` diễn giải thành bản nháp (model rẻ),
 * từng dòng sửa tại chỗ; chạy thử một lần, lưu tạm dừng hay lưu và bật.
 */
import { Button, IconButton, Mascot, PageShell, Pill, Select, useTeamData } from '@aris/ui-kit/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { botOptions } from '../options.js'
import type { PageProps, Translate } from '../page.js'

/** Bản nháp (`draft` của `/api/aris/routines`). */
interface Draft {
  title: string
  bot: string
  cron: string
  tz: string
  task: string
  deliver: 'telegram' | 'none'
  perms: 'read' | 'bot'
  catchupHours: number
  mode: 'agent' | 'script'
  command?: string
  clear: boolean
  question?: string
}
interface Preview {
  when: string
  next: string[]
}
interface Run {
  status: 'running' | 'done' | 'failed' | 'stopped' | 'cap' | 'missed'
  sessionId?: string
  answer?: string
  error?: string
}

type Field = 'title' | 'bot' | 'cron' | 'mode' | 'command' | 'task' | 'deliver' | 'perms' | 'catchup'

const CATCHUP = [0, 1, 3, 6, 12]
const RUN_TONE = {
  done: 'ok',
  failed: 'danger',
  cap: 'danger',
  running: 'accent',
  missed: 'warn',
  stopped: 'muted',
} as const

const endpoint = () => new URL('api/aris/routines', document.baseURI)
async function post<T>(
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: T & { error?: string } }> {
  const r = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null)
  const data = ((await r?.json().catch(() => null)) ?? {}) as T & { error?: string }
  return { ok: !!r?.ok, data }
}

/** "Thứ 2 27/10" theo giờ của máy. */
function dayOf(t: Translate, iso: string) {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${t(`rn.dow.${d.getDay()}`)} ${two(d.getDate())}/${two(d.getMonth() + 1)}`
}
const timeOf = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function RoutineNew({ t, nav }: PageProps) {
  const team = useTeamData()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Field | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [trial, setTrial] = useState<Run | null>(null)
  /** Bot đang nối Telegram riêng; bot khác gửi qua Telegram của Aris. */
  const [telegram, setTelegram] = useState<string[]>([])
  const seq = useRef(0)

  // Ngừng gõ 1,5 giây thì diễn giải.
  useEffect(() => {
    const said = text.trim()
    if (said.length < 8) return
    const n = ++seq.current
    const timer = setTimeout(() => {
      setThinking(true)
      setError(null)
      void post<{ draft: Draft; preview?: Preview; telegram?: string[] }>({ op: 'draft', text: said }).then(
        ({ ok, data }) => {
          if (n !== seq.current) return
          setThinking(false)
          if (!ok) return setError(data.error ?? 'HTTP error')
          setDraft(data.draft)
          setPreview(data.preview ?? null)
          setTelegram(data.telegram ?? [])
          setEditing(null)
        },
      )
    }, 1500)
    return () => clearTimeout(timer)
  }, [text])

  // Sửa lịch: xem trước lại.
  const cron = draft?.cron
  useEffect(() => {
    if (!cron || !draft) return
    const timer = setTimeout(() => {
      void post<{ preview: Preview }>({ op: 'preview', cron, tz: draft.tz }).then(({ ok, data }) =>
        setPreview(ok ? data.preview : null),
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [cron])

  // Lần chạy thử: hỏi lại tới khi xong.
  useEffect(() => {
    if (!saved || trial?.status !== 'running') return
    const timer = setInterval(() => {
      void fetch(new URL(`api/aris/routines?runs=${saved}`, document.baseURI))
        .then((r) => r.json() as Promise<{ runs: (Run & { trigger: string })[] }>)
        .then((d) => {
          const last = d.runs.find((x) => x.trigger === 'manual')
          if (last) setTrial(last)
        })
        .catch(() => undefined)
    }, 3000)
    return () => clearInterval(timer)
  }, [saved, trial?.status])

  const set = (patch: Partial<Draft>) => draft && setDraft({ ...draft, ...patch })
  const bot = team?.bots.find((b) => b.id === draft?.bot)
  // Nơi nhận trên Telegram: chat riêng của bot, hay chat của Aris khi bot chưa có Telegram riêng.
  const toName = draft && !telegram.includes(draft.bot) ? 'Aris' : (bot?.name ?? draft?.bot ?? '')
  const ready =
    !!draft &&
    !!preview &&
    (draft.mode === 'script' ? !!draft.command?.trim() : !!draft.task.trim()) &&
    !!draft.title

  async function save(enabled: boolean): Promise<string | null> {
    if (!draft) return null
    setError(null)
    const body = {
      title: draft.title,
      bot: draft.bot,
      cron: draft.cron,
      tz: draft.tz,
      task: draft.task,
      deliver: draft.deliver,
      perms: draft.perms,
      catchupHours: draft.catchupHours,
      mode: draft.mode,
      ...(draft.mode === 'script' ? { command: draft.command ?? '' } : {}),
      enabled,
    }
    const { ok, data } = await post<{ routine: { id: string } }>(
      saved ? { op: 'update', id: saved, ...body } : { op: 'create', ...body },
    )
    if (!ok) {
      setError(data.error ?? 'HTTP error')
      return null
    }
    setSaved(data.routine.id)
    return data.routine.id
  }

  async function tryNow() {
    const id = saved ?? (await save(false))
    if (!id) return
    const { ok, data } = await post({ op: 'run', id })
    if (!ok) return setError(data.error ?? 'HTTP error')
    setTrial({ status: 'running' })
  }

  const edit = (f: Field) => (
    <Button variant="ghost" size="sm" onClick={() => setEditing(editing === f ? null : f)}>
      {editing === f
        ? t('rn.done')
        : f === 'bot' || f === 'mode' || f === 'deliver' || f === 'perms' || f === 'catchup'
          ? t('rn.change')
          : t('rn.edit')}
    </Button>
  )
  const area = (value: string, onChange: (v: string) => void, label: string, mono = false) => (
    <textarea
      className={mono ? 'a-inp a-mono' : 'a-inp'}
      rows={3}
      value={value}
      aria-label={label}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
    />
  )
  const choose = <T extends string | number>(
    label: string,
    value: T,
    options: { id: T; name: string }[],
    onChange: (v: T) => void,
  ) => (
    <Select
      label={label}
      value={String(value)}
      options={options.map((o) => ({ id: String(o.id), name: o.name }))}
      onChange={(id) => onChange(options.find((o) => String(o.id) === id)!.id)}
    />
  )

  const rows: [Field | null, string, ReactNode][] = draft
    ? [
        [
          'title',
          t('rn.name'),
          editing === 'title' ? (
            <input
              className="a-inp"
              value={draft.title}
              aria-label={t('rn.name')}
              autoFocus
              onChange={(e) => set({ title: e.target.value })}
            />
          ) : (
            draft.title
          ),
        ],
        [
          'bot',
          t('rn.bot'),
          editing === 'bot' && team ? (
            <Select
              label={t('rn.bot')}
              value={draft.bot}
              options={botOptions(team, { commander: true, filter: (b) => !b.external })}
              onChange={(id) => set({ bot: id })}
            />
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mascot id={bot?.mascot ?? 'aris'} size={22} />
              {bot?.name ?? draft.bot}
            </span>
          ),
        ],
        [
          'cron',
          t('rn.schedule'),
          <span>
            {preview?.when ?? <span style={{ color: 'var(--a-danger)' }}>{t('rn.badCron')}</span>}
            {editing === 'cron' ? (
              <input
                className="a-inp a-mono"
                value={draft.cron}
                aria-label={t('rn.schedule')}
                autoFocus
                onChange={(e) => set({ cron: e.target.value })}
                style={{ marginTop: 4 }}
              />
            ) : (
              <div className="a-mono a-muted" style={{ fontSize: 12 }}>
                {draft.cron} · {t('rn.tz')}
              </div>
            )}
          </span>,
        ],
        [
          null,
          t('rn.nextRuns'),
          preview?.next.length ? preview.next.map((x) => dayOf(t, x)).join(' · ') : '—',
        ],
        [
          'mode',
          t('rn.mode'),
          editing === 'mode'
            ? choose(
                t('rn.mode'),
                draft.mode,
                [
                  { id: 'agent', name: t('rn.mode.agent') },
                  { id: 'script', name: t('rn.mode.script') },
                ],
                (v) => set({ mode: v }),
              )
            : t(`rn.mode.${draft.mode}`),
        ],
        draft.mode === 'script'
          ? [
              'command',
              t('rn.command'),
              editing === 'command' ? (
                area(draft.command ?? '', (v) => set({ command: v }), t('rn.command'), true)
              ) : (
                <span className="a-mono" style={{ fontSize: 12.5, whiteSpace: 'pre-wrap' }}>
                  {draft.command || '—'}
                </span>
              ),
            ]
          : [
              'task',
              t('rn.task'),
              editing === 'task'
                ? area(draft.task, (v) => set({ task: v }), t('rn.task'))
                : draft.task || '—',
            ],
        [
          'deliver',
          t('rn.to'),
          editing === 'deliver'
            ? choose(
                t('rn.to'),
                draft.deliver,
                [
                  { id: 'telegram', name: t('rn.to.telegram', { bot: toName }) },
                  { id: 'none', name: t('rn.to.none') },
                ],
                (v) => set({ deliver: v }),
              )
            : draft.deliver === 'none'
              ? t('rn.to.none')
              : draft.mode === 'script'
                ? t('rn.to.scriptTelegram', { bot: toName })
                : t('rn.to.telegram', { bot: toName }),
        ],
        ...(draft.mode === 'agent'
          ? ([
              [
                'perms',
                t('rn.perms'),
                editing === 'perms'
                  ? choose(
                      t('rn.perms'),
                      draft.perms,
                      [
                        { id: 'read', name: t('rn.perms.read') },
                        { id: 'bot', name: t('rn.perms.bot') },
                      ],
                      (v) => set({ perms: v }),
                    )
                  : t(`rn.perms.${draft.perms}`),
              ],
            ] as [Field, string, ReactNode][])
          : []),
        [
          'catchup',
          preview?.next[0] ? t('rn.catchUpAt', { time: timeOf(preview.next[0]) }) : t('rn.catchUpAny'),
          editing === 'catchup'
            ? choose(
                t('rn.catchUpAny'),
                draft.catchupHours,
                CATCHUP.map((n) => ({ id: n, name: n ? t('rn.catchUp.n', { n }) : t('rn.catchUp.0') })),
                (v) => set({ catchupHours: v }),
              )
            : draft.catchupHours
              ? t('rn.catchUp.n', { n: draft.catchupHours })
              : t('rn.catchUp.0'),
        ],
      ]
    : []

  return (
    <PageShell
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <IconButton label={t('rn.back')} onClick={() => nav.go('routine')}>
            ‹
          </IconButton>
          {t('rn.title')}
        </span>
      }
    >
      <div
        style={{
          maxWidth: 760,
          width: '100%',
          margin: '10px auto 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('rn.ask')}</div>
          <div className="a-muted" style={{ fontSize: 13.5 }}>
            {t('rn.hint')}
          </div>
        </div>
        <div className="a-card" style={{ padding: '12px 14px', borderColor: 'var(--a-accent)' }}>
          <textarea
            className="ap-bare"
            rows={2}
            value={text}
            placeholder={t('rn.placeholder')}
            aria-label={t('rn.describe')}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error && (
          <div role="alert" style={{ color: 'var(--a-danger)', fontSize: 13 }}>
            {error}
          </div>
        )}
        {(draft || thinking) && (
          <div className="a-card">
            <div
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <b>{t('rn.understood')}</b>
              {thinking ? (
                <span className="a-muted ap-pulse">{t('rn.thinking')}</span>
              ) : draft?.clear ? (
                <Pill tone="ok">{t('rn.clear')}</Pill>
              ) : (
                <Pill tone="warn">{t('rn.unclear')}</Pill>
              )}
              {!thinking && draft?.question && (
                <div className="a-muted" style={{ flexBasis: '100%', fontSize: 13 }}>
                  {draft.question}
                </div>
              )}
            </div>
            {rows.map(([f, k, v]) => (
              <div className="ap-rkv" key={k}>
                <span className="a-muted">{k}</span>
                <span style={{ minWidth: 0 }}>{v}</span>
                {f ? edit(f) : <span />}
              </div>
            ))}
          </div>
        )}
        {trial && (
          <div className="a-card" style={{ padding: '12px 16px', display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <b>{t('rn.trial')}</b>
              <Pill tone={RUN_TONE[trial.status]}>{t(`rt.st.${trial.status}`)}</Pill>
              {trial.sessionId && (
                <a
                  className="ap-link"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => nav.openSession(trial.sessionId!)}
                >
                  {t('rn.openRun')}
                </a>
              )}
            </div>
            {(trial.answer || trial.error) && (
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{trial.answer || trial.error}</div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button disabled={!ready || trial?.status === 'running'} onClick={() => void tryNow()}>
            {t('rn.tryNow')}
          </Button>
          <Button disabled={!ready} onClick={() => void save(false).then((id) => id && nav.go('routine'))}>
            {t('rn.savePaused')}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => void save(true).then((id) => id && nav.go('routine'))}
          >
            {t('rn.save')}
          </Button>
        </div>
      </div>
    </PageShell>
  )
}
