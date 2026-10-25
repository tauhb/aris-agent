/**
 * Tìm theo nghĩa ở trang 6.2 (giai đoạn 5, đợt 5a; bản vẽ 6.2b): chọn model nhúng ở dòng "Nhúng" của Model theo
 * việc, và thẻ trạng thái lập chỉ mục, phần gửi đi nhúng, thử tìm. Dữ liệu qua `/api/aris/brain?semantic`.
 */
import { Button, Card, Checkbox, Select, TextInput } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'

type T = PageProps['t']
type Scope = 'personal' | 'company' | 'memory'

export interface SemanticStatus {
  state: 'off' | 'nokey' | 'running' | 'ready' | 'limited' | 'paused' | 'error'
  model: { provider: string; model: string } | null
  scopes: Record<Scope, boolean>
  done: number
  total: number
  parts: Record<Scope, number>
  resumeAt?: number
  error?: string
  etaMin?: number
  available: boolean
  models: { provider: string; model: string; dims: number }[]
  hasKey: boolean
}

interface TryHit {
  title: string
  path?: string
  place?: string
  text?: string
  via: 'tu-khoa' | 'nghia' | 'ca-hai'
}

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)

/** Trạng thái tìm theo nghĩa, tự làm mới khi đang nhúng hay chờ hạn mức. */
export function useSemantic() {
  const [data, setData] = useState<SemanticStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(endpoint('?semantic')).catch(() => null)
    if (r?.ok) setData((await r.json()) as SemanticStatus)
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const live = data?.state === 'running' || data?.state === 'limited' || data?.state === 'nokey'
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => void load(), 4000)
    return () => clearInterval(id)
  }, [live, load])
  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true)
      setError(null)
      const r = await fetch(endpoint(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null)
      const j = (await r?.json().catch(() => null)) as { error?: string } | null
      setBusy(false)
      if (!r?.ok) setError(j?.error ?? 'HTTP error')
      await load()
      return j
    },
    [load],
  )
  return { data, busy, error, act }
}

export type SemanticApi = ReturnType<typeof useSemantic>

const pairOf = (m: { provider: string; model: string } | null | undefined) =>
  m ? `${m.provider}/${m.model}` : 'off'

/** Ô chọn model nhúng ở dòng "Nhúng" của Model theo việc. */
export function EmbedSelect({ t, sem }: { t: T; sem: SemanticApi }) {
  const d = sem.data
  if (!d?.available) return <span className="ap-sel a-muted">{t('sm.unavailable')}</span>
  const options = [
    { id: 'off', name: t('sm.off') },
    ...d.models.map((m) => ({
      id: pairOf(m),
      name: m.model,
      note: m.provider === 'google' ? 'Google Gemini' : m.provider,
    })),
  ]
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <Select
        label={t('pv.task.embed')}
        value={pairOf(d.model)}
        options={options}
        disabled={sem.busy}
        onChange={(id) => {
          const m = d.models.find((x) => pairOf(x) === id)
          void sem.act({ op: 'semantic-config', model: m ? { provider: m.provider, model: m.model } : null })
        }}
      />
      {d.model && (
        <span className="a-muted" style={{ fontSize: 11.5 }}>
          {t('sm.reembedHint')}
        </span>
      )}
    </span>
  )
}

const STATE_TONE: Record<SemanticStatus['state'], string> = {
  running: 'var(--a-accent)',
  ready: 'var(--a-ok)',
  limited: 'var(--a-warn)',
  paused: 'var(--a-muted)',
  nokey: 'var(--a-muted)',
  off: 'var(--a-muted)',
  error: 'var(--a-danger)',
}

const clock = (ms: number) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

/** Thẻ Tìm theo nghĩa: trạng thái, phần gửi đi nhúng, thử tìm. */
export function SemanticCard({ t, sem }: { t: T; sem: SemanticApi }) {
  const d = sem.data
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<TryHit[] | null>(null)
  if (!d?.available) return null
  const pct = d.total ? Math.round((d.done / d.total) * 100) : 0
  const tryIt = async () => {
    const j = (await sem.act({ op: 'semantic-try', query: q })) as { hits?: TryHit[] } | null
    setHits(j?.hits ?? [])
  }
  const scope = (k: Scope, label: string, n: number, unit: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox
        checked={d.scopes[k]}
        disabled={sem.busy || !d.model}
        onChange={(v) => void sem.act({ op: 'semantic-config', scopes: { [k]: v } })}
        label={label}
      />
      <span className="a-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>
        {t(unit, { n })}
      </span>
    </div>
  )
  return (
    <Card
      title={t('sm.title')}
      actions={
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 999,
            padding: '2px 10px',
            color: STATE_TONE[d.state],
            border: `1px solid ${STATE_TONE[d.state]}`,
          }}
        >
          {t(`sm.state.${d.state}`)}
        </span>
      }
    >
      <div
        style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}
      >
        <span className="a-muted" style={{ fontSize: 12.5 }}>
          {t('sm.about')}
        </span>
        {(d.state === 'running' || d.state === 'limited' || d.state === 'paused') && d.model && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex' }}>
              <span>{t('sm.progress', { done: d.done, total: d.total })}</span>
              {d.etaMin !== undefined && (
                <span className="a-muted" style={{ marginLeft: 'auto' }}>
                  {t('sm.eta', { n: d.etaMin })}
                </span>
              )}
            </div>
            <div className="ap-track">
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: d.state === 'limited' ? 'var(--a-warn)' : 'var(--a-accent)',
                }}
              />
            </div>
            {d.state === 'limited' && d.resumeAt && (
              <div className="ap-warnbox" style={{ padding: '8px 10px', fontSize: 12.5 }}>
                {t('sm.limited', { at: clock(d.resumeAt), n: d.total - d.done })}
              </div>
            )}
            {d.state === 'running' && (
              <span className="a-muted" style={{ fontSize: 12 }}>
                {t('sm.runningHint')}
              </span>
            )}
          </div>
        )}
        {d.state === 'ready' && (
          <div style={{ display: 'flex', gap: 18, alignItems: 'baseline' }}>
            <span>
              <b style={{ fontSize: 20 }}>{d.done}</b> <span className="a-muted">{t('sm.chunks')}</span>
            </span>
            <span className="a-muted">{d.model ? `${d.model.model}` : ''}</span>
          </div>
        )}
        {d.state === 'nokey' && <div className="ap-box2">{t('sm.nokey')}</div>}
        {d.state === 'off' && <div className="ap-box2">{t('sm.offHint')}</div>}
        {d.state === 'error' && (
          <div style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>
            {t('sm.error', { error: d.error ?? '' })}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <b style={{ fontSize: 12.5 }}>{t('sm.send')}</b>
          {scope('personal', t('sm.personal'), d.parts.personal, 'sm.nChunks')}
          {scope('company', t('sm.company'), d.parts.company, 'sm.nChunks')}
          {scope('memory', t('sm.memory'), d.parts.memory, 'sm.nChunks')}
          <span className="a-muted" style={{ fontSize: 12 }}>
            {t('sm.sendHint')}
          </span>
        </div>

        {d.state === 'ready' && (
          <div
            style={{
              borderTop: '1px solid var(--a-line)',
              paddingTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <b style={{ fontSize: 12.5 }}>{t('sm.try')}</b>
            <form
              style={{ display: 'flex', gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault()
                if (q.trim()) void tryIt()
              }}
            >
              <TextInput
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('sm.tryPlaceholder')}
                aria-label={t('sm.try')}
                style={{ flex: 1, minWidth: 0 }}
              />
              <Button size="sm" disabled={sem.busy || !q.trim()} onClick={() => void tryIt()}>
                {t('sm.search')}
              </Button>
            </form>
            {hits && !hits.length && <span className="a-muted">{t('sm.none')}</span>}
            {hits?.map((h, i) => (
              <div
                key={`${h.path ?? h.title}-${i}`}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  borderTop: '1px solid var(--a-line)',
                  padding: '6px 0',
                  fontSize: 12.5,
                }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <b>{h.title}</b> <span className="a-muted">· {h.place ?? h.text}</span>
                </span>
                <span className={`ap-via ap-via-${h.via}`}>{t(`sm.via.${h.via}`)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {d.model && (
            <Button size="sm" disabled={sem.busy} onClick={() => void sem.act({ op: 'semantic-reset' })}>
              {t('sm.reset')}
            </Button>
          )}
          {d.model && (d.state === 'running' || d.state === 'limited' || d.state === 'paused') && (
            <Button
              size="sm"
              disabled={sem.busy}
              onClick={() => void sem.act({ op: 'semantic-config', paused: d.state !== 'paused' })}
            >
              {t(d.state === 'paused' ? 'sm.resume' : 'sm.pause')}
            </Button>
          )}
          <span className="a-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
            {t('sm.liveHint')}
          </span>
        </div>
        {sem.error && <div style={{ color: 'var(--a-danger)', fontSize: 12.5 }}>{sem.error}</div>}
      </div>
    </Card>
  )
}
