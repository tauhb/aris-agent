/**
 * 5.1 · Quanh trang này (giai đoạn 5, đợt 4b; bản vẽ GhiChu.dc.html): đồ thị 2D trang đang xem với các trang
 * nó trỏ tới và trỏ về nó, nút gợi ý (viền chấm); gợi ý nối (trang nhắc tên mà chưa liên kết) có Nối / Bỏ qua.
 * Dữ liệu từ `/api/aris/brain?around=<đường dẫn>`.
 */
import { Button } from '@aris/ui-kit/react'
import { useCallback, useEffect, useState } from 'react'
import type { PageProps } from '../page.js'

type NodeType = 'note' | 'project' | 'area' | 'person' | 'session'

interface Node {
  path: string
  name: string
  title: string
  space: string | null
  layer: string
  dir: 'out' | 'in' | 'both'
  type: NodeType
}

interface Suggestion {
  from: string
  fromTitle: string
  to: string
  toTitle: string
}

interface Around {
  center: { path: string; title: string }
  nodes: Node[]
  more: number
  suggestions: Suggestion[]
}

const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const COLOR: Record<NodeType, string> = {
  note: '#5B8DEF',
  project: '#00B5A5',
  area: '#D97706',
  person: '#FF6700',
  session: 'var(--a-muted)',
}
const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Hình một nút theo loại, tâm (x, y). */
function Shape({ type, x, y }: { type: NodeType | 'hint'; x: number; y: number }) {
  if (type === 'project')
    return (
      <g>
        <rect x={x - 13} y={y - 13} width={26} height={26} rx={8} fill={COLOR.project} />
        <rect
          x={x - 5.5}
          y={y - 5.5}
          width={11}
          height={11}
          rx={3}
          fill="none"
          stroke="#fff"
          strokeWidth={1.8}
        />
      </g>
    )
  if (type === 'area')
    return (
      <g>
        <rect x={x - 12} y={y - 12} width={24} height={24} rx={6} fill={COLOR.area} />
        <path
          d={`M${x - 6} ${y - 4}h12M${x - 6} ${y + 0.5}h12M${x - 6} ${y + 5}h8`}
          stroke="#fff"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      </g>
    )
  if (type === 'person')
    return (
      <g>
        <circle cx={x} cy={y} r={13} fill={COLOR.person} />
        <circle cx={x} cy={y - 3.5} r={3.2} fill="#fff" />
        <path
          d={`M${x - 6.5} ${y + 6.5}c1.2-3.2 3.6-4.6 6.5-4.6s5.3 1.4 6.5 4.6`}
          fill="none"
          stroke="#fff"
          strokeWidth={1.9}
          strokeLinecap="round"
        />
      </g>
    )
  if (type === 'session')
    return (
      <g>
        <circle cx={x} cy={y} r={12} fill="var(--a-panel)" stroke="var(--a-muted)" strokeWidth={2.4} />
        <path
          d={`M${x - 5} ${y - 3}h10M${x - 5} ${y + 1}h10M${x - 5} ${y + 5}h6`}
          stroke="var(--a-muted)"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </g>
    )
  if (type === 'hint')
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r={12}
          fill="var(--a-panel)"
          stroke="var(--a-accent)"
          strokeWidth={2}
          strokeDasharray="3 3"
        />
        <path
          d={`M${x} ${y - 5}v10M${x - 5} ${y}h10`}
          stroke="var(--a-accent)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </g>
    )
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill={COLOR.note} />
      <path
        d={`M${x - 5} ${y - 3}h10M${x - 5} ${y + 1}h10M${x - 5} ${y + 5}h6`}
        stroke="#fff"
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  )
}

export function AroundPanel({
  path,
  t,
  nav,
  onLinked,
}: {
  path: string
  t: PageProps['t']
  nav: PageProps['nav']
  onLinked: (from: string) => void
}) {
  const [data, setData] = useState<Around | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    const r = await fetch(endpoint(`?around=${encodeURIComponent(path)}`)).catch(() => null)
    setData(r?.ok ? ((await r.json()) as Around) : null)
  }, [path])
  useEffect(() => {
    setData(null)
    void load()
  }, [load])

  const act = async (op: 'link' | 'link-dismiss', s: Suggestion) => {
    setBusy(true)
    setError(null)
    const r = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op, from: s.from, to: s.to }),
    }).catch(() => null)
    const j = (await r?.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!r?.ok) setError(j?.error ?? 'HTTP error')
    else if (op === 'link') onLinked(s.from)
    await load()
  }

  const open = (p: string) => nav.go('brain', { view: 'notes', space: p.split('/')[0] ?? 'ca-nhan', path: p })
  const hints = (data?.suggestions ?? []).filter((s) => s.from === path).slice(0, 2)
  const ring: ({ kind: 'node'; n: Node } | { kind: 'hint'; s: Suggestion })[] = [
    ...(data?.nodes ?? []).map((n) => ({ kind: 'node' as const, n })),
    ...hints.map((s) => ({ kind: 'hint' as const, s })),
  ]
  const cx = 136
  const cy = 118
  const pos = ring.map((_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(ring.length, 1)
    return { x: cx + Math.cos(a) * 92, y: cy + Math.sin(a) * 82, a }
  })

  return (
    <div className="ap-around">
      <div className="ap-around-h">
        <b>{t('nb.around')}</b>
        <a className="ap-link" onClick={() => nav.go('brain', { view: 'graph' })}>
          {t('nb.graph3d')}
        </a>
      </div>
      <div className="ap-around-svg">
        <svg
          viewBox="0 0 272 240"
          width="100%"
          role="img"
          aria-label={t('nb.aroundAlt', { title: data?.center.title ?? '', n: data?.nodes.length ?? 0 })}
        >
          <circle cx={cx} cy={cy} r={58} fill="none" stroke="var(--a-line)" strokeDasharray="2 5" />
          {ring.map((r, i) => {
            const p = pos[i]!
            const mx = (cx + p.x) / 2 + Math.cos(p.a + Math.PI / 2) * 10
            const my = (cy + p.y) / 2 + Math.sin(p.a + Math.PI / 2) * 10
            return (
              <path
                key={`e${i}`}
                d={`M${cx} ${cy} Q${mx} ${my} ${p.x} ${p.y}`}
                fill="none"
                stroke={r.kind === 'hint' ? 'var(--a-accent)' : COLOR[r.n.type]}
                strokeWidth={r.kind === 'hint' ? 1.8 : 2.2}
                strokeDasharray={r.kind === 'hint' ? '4 5' : undefined}
                strokeLinecap="round"
                opacity={0.7}
              />
            )
          })}
          <circle cx={cx} cy={cy} r={30} fill="var(--a-accent)" opacity={0.16} />
          <circle cx={cx} cy={cy} r={21} fill="var(--a-accent)" />
          <path
            d={`M${cx - 7} ${cy - 6}h14M${cx - 7} ${cy}h14M${cx - 7} ${cy + 6}h9`}
            stroke="#fff"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          {ring.map((r, i) => {
            const p = pos[i]!
            const label = short(r.kind === 'hint' ? `${r.s.toTitle}?` : r.n.title)
            const w = Math.max(44, label.length * 6.1 + 14)
            const ly = p.y > cy ? p.y + 16 : p.y - 34
            const lx = Math.min(272 - w - 2, Math.max(2, p.x - w / 2))
            return (
              <g
                key={`n${i}`}
                className="ap-around-node"
                role="link"
                tabIndex={0}
                aria-label={r.kind === 'hint' ? t('nb.hintNode', { title: r.s.toTitle }) : r.n.title}
                onClick={() => open(r.kind === 'hint' ? r.s.to : r.n.path)}
                onKeyDown={(e) => e.key === 'Enter' && open(r.kind === 'hint' ? r.s.to : r.n.path)}
              >
                <Shape type={r.kind === 'hint' ? 'hint' : r.n.type} x={p.x} y={p.y} />
                <rect
                  x={lx}
                  y={ly}
                  width={w}
                  height={18}
                  rx={9}
                  fill={r.kind === 'hint' ? 'var(--a-accentSoft)' : 'var(--a-panel)'}
                  stroke={r.kind === 'hint' ? 'var(--a-accent)' : 'var(--a-line)'}
                  strokeDasharray={r.kind === 'hint' ? '3 3' : undefined}
                />
                <text
                  x={lx + w / 2}
                  y={ly + 12.5}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill={r.kind === 'hint' ? 'var(--a-accent)' : 'var(--a-ink)'}
                >
                  {label}
                </text>
              </g>
            )
          })}
        </svg>
        {data && !ring.length && <div className="a-muted ap-around-empty">{t('nb.aroundEmpty')}</div>}
      </div>
      <div className="ap-around-lg">
        {(['project', 'area', 'person', 'note', 'session'] as const).map((k) => (
          <span key={k}>
            <i style={{ background: k === 'session' ? 'transparent' : COLOR[k], borderColor: COLOR[k] }} />
            {t(`nb.type.${k}`)}
          </span>
        ))}
        <span>
          <i className="hint" />
          {t('nb.type.hint')}
        </span>
        {!!data?.more && <span>{t('nb.aroundMore', { n: data.more })}</span>}
      </div>
      {!!data?.suggestions.length && (
        <div className="ap-around-sug">
          <b>{t('nb.suggest')}</b>
          {data.suggestions.map((s) => (
            <div key={`${s.from}>${s.to}`} className="ap-around-row">
              <span>
                {s.from === path
                  ? t('nb.suggestOut', { to: s.toTitle })
                  : t('nb.suggestIn', { from: s.fromTitle, to: s.toTitle })}
              </span>
              <span className="ap-around-acts">
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void act('link', s)}>
                  {t('nb.link')}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act('link-dismiss', s)}>
                  {t('nb.skip')}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      {error && <div className="ap-askerr">{error}</div>}
    </div>
  )
}
