/**
 * 5.2 · Hộp thư vào (giai đoạn 5, đợt 2a; bản vẽ HopThuVao.dc.html): danh sách mục theo trạng thái (cần
 * duyệt, đang xử lý, đã xong hôm nay); chi tiết một bản nạp chia nhóm (⚠ cần xem, trang mới, bổ sung, chỉ
 * thêm liên kết), khác biệt theo câu, chọn từng thay đổi; Đồng ý, Nhờ sửa, Chỉ lưu, Bỏ. Dữ liệu từ
 * `/api/aris/brain?inbox`.
 */
import { Button, IconButton, Pill } from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PageProps, Translate } from '../page.js'
import { diffUnits, units, type Change } from './diff.js'
import { Inline, type LinkTarget } from './markdown.js'

type Space = 'ca-nhan' | 'cong-ty'
type OpKind = 'moi' | 'bo-sung' | 'lien-ket' | 'sua-y'

interface Op {
  path: string
  title: string
  kind: OpKind
  base?: string
  next: string
  summary: string
  warn?: string
  flag?: string
}

interface Batch {
  id: string
  createdAt: string
  updatedAt: string
  status:
    | 'moi'
    | 'dang-lap'
    | 'cho-duyet'
    | 'cho-mai'
    | 'chua-doc'
    | 'da-nap'
    | 'chi-luu'
    | 'bo'
    | 'hoan-tac'
    | 'loi'
  source: { path: string; title: string; kind: string; from: string; url?: string; by?: string }
  space?: Space
  dept?: string
  summary?: string
  level?: 'tu-nap' | 'nhanh' | 'ky'
  ops: Op[]
  cost: number
  conflicts?: string[]
  note?: string
}

interface Data {
  batches: Batch[]
  spend: { usd: number; cap: number }
  departments: { id: string; name: string }[]
}

/** Khác biệt chỉ để xem: liên kết hiện như chữ có gạch chân, không mở. */
const VIEW_LINKS: LinkTarget = { exists: () => true, open: () => undefined }
const plain = (s: string) => s.replace(/^([-*+]|\d+[.)])\s+/, '').replace(/^#+\s+/, '')

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const usd = (n: number) => n.toFixed(n < 0.01 ? 3 : 2).replace('.', ',')
const hm = (iso: string) => {
  const d = new Date(iso)
  const two = (n: number) => String(n).padStart(2, '0')
  const today = new Date().toDateString() === d.toDateString()
  return `${today ? '' : `${two(d.getDate())}/${two(d.getMonth() + 1)} `}${two(d.getHours())}:${two(d.getMinutes())}`
}

const WAITING = new Set(['moi', 'dang-lap', 'cho-mai', 'chua-doc', 'loi'])
const DONE = new Set(['da-nap', 'chi-luu', 'bo', 'hoan-tac'])

/** Thay đổi của một thao tác: trang mới thì vài câu đầu, trang cũ thì câu bỏ/thêm. */
function opChanges(o: Op): Change[] {
  if (o.base === undefined)
    return units(o.next)
      .filter((u) => !u.startsWith('#') && !/^\[\^/.test(u))
      .slice(0, 3)
      .map((text) => ({ kind: 'add' as const, text }))
  return diffUnits(o.base, o.next).slice(0, 8)
}

function Lane({ title, children, extra }: { title: string; children: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <div className="ap-lane">
        <span>{title}</span>
        {extra}
      </div>
      {children}
    </>
  )
}

function statusPill(t: Translate, b: Batch) {
  if (b.status === 'cho-duyet')
    return b.level === 'ky' ? (
      <Pill tone="warn">⚠ {t('ib.careful')}</Pill>
    ) : (
      <Pill tone="accent">{t('ib.quick')}</Pill>
    )
  const tone = b.status === 'loi' ? 'danger' : b.status === 'da-nap' ? 'ok' : 'muted'
  return <Pill tone={tone}>{t(`ib.st.${b.status}`)}</Pill>
}

export function Inbox({ t, nav }: PageProps) {
  const [data, setData] = useState<Data | null>(null)
  const [pick, setPick] = useState<string | null>(null)
  const [off, setOff] = useState<Record<string, Set<number>>>({})
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [ask, setAsk] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(endpoint('?inbox=1')).catch(() => null)
    if (r?.ok) setData((await r.json()) as Data)
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => void load(), 4000)
    return () => clearInterval(timer)
  }, [load])

  const list = data?.batches ?? []
  const review = list.filter((b) => b.status === 'cho-duyet')
  const working = list.filter((b) => WAITING.has(b.status))
  const done = list.filter((b) => DONE.has(b.status))
  const current = useMemo(
    () => list.find((b) => b.id === pick) ?? review[0] ?? working[0] ?? done[0],
    [list, pick, review, working, done],
  )

  const post = async (body: Record<string, unknown>) => {
    setError(null)
    setBusy(true)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string; batch?: Batch } | null
    setBusy(false)
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    await load()
    return r?.ok ? j : null
  }

  const send = async () => {
    const j = await post({ op: 'add', text: draft })
    if (j?.batch) {
      setDraft('')
      setAdding(false)
      setPick(j.batch.id)
    }
  }
  const pickFile = async (f: File | undefined) => {
    if (!f) return
    if (f.size > 25 * 1024 * 1024) return setError(t('ib.fileTooBig'))
    const bytes = new Uint8Array(await f.arrayBuffer())
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000)
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const j = await post({ op: 'add', file: { name: f.name, data: btoa(bin) } })
    if (j?.batch) {
      setAdding(false)
      setPick(j.batch.id)
    }
  }

  const offOf = (b: Batch) => off[b.id] ?? new Set<number>()
  const toggleOp = (b: Batch, i: number) =>
    setOff((o) => {
      const s = new Set(offOf(b))
      if (s.has(i)) s.delete(i)
      else s.add(i)
      return { ...o, [b.id]: s }
    })

  const item = (b: Batch) => (
    <button
      type="button"
      key={b.id}
      className={`ap-ibitem${current?.id === b.id ? ' sel' : ''}`}
      onClick={() => setPick(b.id)}
    >
      <span className="t">
        {statusPill(t, b)}
        <span className="ap-ell">{b.source.title}</span>
      </span>
      <span className="s">
        {[
          b.space ? t(`nb.space.${b.space}`) : null,
          t(`ib.kind.${b.source.kind}`),
          b.ops.length ? t('ib.opsCount', { n: b.ops.length }) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
      <span className="s">
        {t(`ib.from.${b.source.from}`)} · {hm(b.createdAt)}
      </span>
    </button>
  )

  // --- Chi tiết ---------------------------------------------------------------------------------
  const detail = (b: Batch) => {
    const chosen = b.ops.map((_, i) => i).filter((i) => !offOf(b).has(i))
    const flagged = b.ops.map((o, i) => [o, i] as const).filter(([o]) => o.flag)
    const fresh = b.ops.map((o, i) => [o, i] as const).filter(([o]) => !o.flag && o.kind === 'moi')
    const added = b.ops
      .map((o, i) => [o, i] as const)
      .filter(([o]) => !o.flag && (o.kind === 'bo-sung' || o.kind === 'sua-y'))
    const links = b.ops.map((o, i) => [o, i] as const).filter(([o]) => !o.flag && o.kind === 'lien-ket')
    const open = b.status === 'cho-duyet'
    const deptName = (id?: string) => data?.departments.find((d) => d.id === id)?.name ?? id
    const spaceValue = b.space ? (b.dept ? `${b.space}:${b.dept}` : b.space) : ''

    const opRow = ([o, i]: readonly [Op, number]) => (
      <div className="ap-ibop" key={o.path}>
        <input
          type="checkbox"
          aria-label={t('ib.choose', { page: o.title })}
          checked={!offOf(b).has(i)}
          disabled={!open}
          onChange={() => toggleOp(b, i)}
        />
        <div style={{ minWidth: 0 }}>
          <b>{o.title}</b>{' '}
          <span className="a-muted" style={{ fontSize: 12 }}>
            · {t(`ib.op.${o.kind}`)} · {o.path.split('/').slice(-2, -1)[0]}
          </span>
          <div className="ap-ibdiff">
            {opChanges(o).map((c, k) => (
              <span key={k} className={c.kind}>
                <Inline text={plain(c.text)} links={VIEW_LINKS} />
              </span>
            ))}
          </div>
          {o.flag && <div className="ap-ibwhy">{o.flag}</div>}
        </div>
        {o.base !== undefined && (
          <button
            type="button"
            className="ap-link"
            onClick={() =>
              nav.go('brain', { view: 'notes', space: o.path.split('/')[0] ?? 'ca-nhan', path: o.path })
            }
          >
            {t('ib.openPage')}
          </button>
        )}
      </div>
    )

    return (
      <div className="ap-ibdetail">
        <div className="ap-ibhead">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h2>{b.source.title}</h2>
            {statusPill(t, b)}
          </div>
          <div className="ap-ibmeta">
            <span className="a-muted">
              {t(`ib.from.${b.source.from}`)} · {hm(b.createdAt)} · {t(`ib.kind.${b.source.kind}`)}
            </span>
            {(open || WAITING.has(b.status)) && b.space && (
              <select
                className="a-inp"
                aria-label={t('ib.space')}
                value={spaceValue}
                disabled={busy}
                onChange={(e) => {
                  const [space, dept] = e.target.value.split(':')
                  void post({ op: 'space', id: b.id, space, ...(dept ? { dept } : {}) })
                }}
              >
                <option value="ca-nhan">{t('nb.space.ca-nhan')}</option>
                <option value="cong-ty">{t('ib.companyCommon')}</option>
                {(data?.departments ?? []).map((d) => (
                  <option key={d.id} value={`cong-ty:${d.id}`}>
                    {t('ib.companyDept', { name: d.name })}
                  </option>
                ))}
              </select>
            )}
            {b.source.url && (
              <a href={b.source.url} target="_blank" rel="noreferrer noopener">
                {t('ib.openLink')}
              </a>
            )}
          </div>
          {(b.summary || b.cost > 0) && (
            <div className="ap-ibsum">
              <b>{t('ib.libSummary')}</b> · {b.summary ?? b.source.title}{' '}
              {b.cost > 0 && <span className="a-muted">· {t('ib.cost', { usd: usd(b.cost) })}</span>}
            </div>
          )}
          {b.dept && (
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              🔒 {t('ib.deptOnly', { name: deptName(b.dept) })}
            </span>
          )}
        </div>

        <div className="ap-ibbody">
          {b.note && <div className="ap-bnotice">{b.note}</div>}
          {b.status === 'dang-lap' && <div className="a-muted">{t('ib.planning')}</div>}
          {b.status === 'moi' && <div className="a-muted">{t('ib.queued')}</div>}
          {flagged.length > 0 && (
            <div className="ap-ibgrp warn">
              <div className="gh">
                ⚠ {t('ib.g.flag')}
                <span className="n">{t('ib.pages', { n: flagged.length })}</span>
              </div>
              {flagged.map(opRow)}
            </div>
          )}
          {fresh.length > 0 && (
            <div className="ap-ibgrp">
              <div className="gh">
                {t('ib.g.new')}
                <span className="n">{fresh.length}</span>
              </div>
              {fresh.map(opRow)}
            </div>
          )}
          {added.length > 0 && (
            <div className="ap-ibgrp">
              <div className="gh">
                {t('ib.g.add')}
                <span className="n">{t('ib.pages', { n: added.length })}</span>
              </div>
              {added.map(opRow)}
            </div>
          )}
          {links.length > 0 && (
            <div className="ap-ibgrp">
              <div className="ap-ibop">
                <input
                  type="checkbox"
                  aria-label={t('ib.g.links')}
                  checked={links.every(([, i]) => !offOf(b).has(i))}
                  disabled={!open}
                  onChange={() => links.forEach(([, i]) => toggleOp(b, i))}
                />
                <div>
                  <b>{t('ib.g.links')}</b>{' '}
                  <span className="a-muted" style={{ fontSize: 12.5 }}>
                    · {links.map(([o]) => o.title).join(', ')}
                  </span>
                </div>
              </div>
            </div>
          )}
          {asking && (
            <div
              className="ap-ibgrp"
              style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              <b style={{ fontSize: 13 }}>{t('ib.askTitle')}</b>
              <textarea
                className="a-inp"
                rows={3}
                value={ask}
                placeholder={t('ib.askHint')}
                aria-label={t('ib.askTitle')}
                onChange={(e) => setAsk(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                  {t('nb.cancel')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy || !ask.trim()}
                  onClick={() =>
                    void post({ op: 'revise', id: b.id, text: ask }).then((j) => {
                      if (j) {
                        setAsk('')
                        setAsking(false)
                      }
                    })
                  }
                >
                  {t('ib.askSend')}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="ap-ibfoot">
          {open && (
            <>
              <Button
                variant="primary"
                disabled={busy || (!chosen.length && b.ops.length > 0)}
                onClick={() => void post({ op: 'approve', id: b.id, chosen })}
              >
                {b.ops.length ? t('ib.approve', { n: chosen.length, m: b.ops.length }) : t('ib.approveNone')}
              </Button>
              <Button disabled={busy} onClick={() => setAsking(true)}>
                {t('ib.revise')}
              </Button>
            </>
          )}
          {(open || b.status === 'chua-doc' || b.status === 'cho-mai' || b.status === 'loi') && (
            <Button disabled={busy} onClick={() => void post({ op: 'keep', id: b.id })}>
              {t('ib.keep')}
            </Button>
          )}
          {(b.status === 'loi' || (b.status === 'da-nap' && b.conflicts?.length)) && (
            <Button disabled={busy} onClick={() => void post({ op: 'replan', id: b.id })}>
              {t('ib.replan')}
            </Button>
          )}
          {(open || WAITING.has(b.status)) && b.status !== 'dang-lap' && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('ib.dropConfirm', { title: b.source.title })))
                  void post({ op: 'drop', id: b.id })
              }}
            >
              {t('ib.drop')}
            </Button>
          )}
          {open && <span className="a-muted ap-ibhint">{t('ib.approveHint')}</span>}
          {DONE.has(b.status) && (
            <button
              type="button"
              className="ap-link"
              onClick={() => nav.go('brain', { view: 'log', space: b.space ?? 'ca-nhan' })}
            >
              {t('ib.toLog')}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="ap-split ap-brain">
      <section className="ap-iblist" aria-label={t('br.inbox')}>
        <div className="ap-ibtop">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain', { view: 'notes' })}>
            ‹
          </IconButton>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
            <b style={{ fontSize: 17 }}>{t('br.inbox')}</b>
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('ib.sub', { a: review.length, b: working.length, c: done.length })}
            </span>
          </div>
          <Button size="sm" variant="primary" onClick={() => setAdding((v) => !v)}>
            + {t('ib.add')}
          </Button>
        </div>
        {adding && (
          <div className="ap-ibadd">
            <textarea
              className="a-inp"
              rows={3}
              value={draft}
              placeholder={t('ib.addHint')}
              aria-label={t('ib.addHint')}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label className="a-btn sm" style={{ cursor: 'pointer' }}>
                {t('ib.pickFile')}
                <input
                  type="file"
                  accept=".md,.markdown,.txt,.pdf,.doc,.docx,.rtf,.odt,.html,.htm,.png,.jpg,.jpeg,.heic,.webp,.gif,.tif,.tiff,.m4a,.mp3,.wav,.ogg,.oga,.opus,.aac,.flac"
                  style={{ display: 'none' }}
                  onChange={(e) => void pickFile(e.target.files?.[0])}
                />
              </label>
              <span className="a-muted" style={{ fontSize: 12 }}>
                {t('ib.addTypes')}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={busy || !draft.trim()}
                onClick={() => void send()}
              >
                {busy ? t('ib.sending') : t('ib.send')}
              </Button>
            </div>
          </div>
        )}
        {error && (
          <div className="ap-berror" role="alert">
            {error}
          </div>
        )}
        <div className="ap-ibscroll">
          {list.length === 0 ? (
            <div className="ap-ibempty">
              <b>{t('ib.emptyTitle')}</b>
              <span className="a-muted">{t('ib.emptyHow')}</span>
              <span>· {t('ib.emptyAdd')}</span>
              <span>· {t('ib.emptyDrop')}</span>
              <span>· {t('ib.emptyNote')}</span>
            </div>
          ) : (
            <>
              {review.length > 0 && (
                <Lane title={t('ib.lane.review', { n: review.length })}>{review.map(item)}</Lane>
              )}
              {working.length > 0 && (
                <Lane title={t('ib.lane.working', { n: working.length })}>{working.map(item)}</Lane>
              )}
              {done.length > 0 && (
                <Lane
                  title={t('ib.lane.done', { n: done.length })}
                  extra={
                    <button
                      type="button"
                      className="ap-link"
                      onClick={() => nav.go('brain', { view: 'log' })}
                    >
                      {t('ib.toLog')}
                    </button>
                  }
                >
                  {done.map(item)}
                </Lane>
              )}
            </>
          )}
        </div>
        {data && (
          <div className="a-muted ap-ibspend">
            {t('ib.spend', { usd: usd(data.spend.usd), cap: usd(data.spend.cap) })}
          </div>
        )}
      </section>
      <main className="ap-note-main">
        {current ? (
          detail(current)
        ) : (
          <div className="ap-note a-muted" style={{ textAlign: 'center' }}>
            {t('ib.nothing')}
          </div>
        )}
      </main>
    </div>
  )
}
