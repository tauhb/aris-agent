/**
 * 5.3 · Đồ thị bộ não 3D (giai đoạn 5, đợt 4b; bản vẽ DoThi.dc.html): trang wiki theo loại (ghi chú, dự án, chủ
 * đề, người), nguồn và ký ức bot bật thêm; cạnh là liên kết, cụm quanh trang dự án và chủ đề; lọc theo không
 * gian và thời gian, tìm nút, xem nút đang chọn. Dữ liệu từ `/api/aris/brain?graph`.
 */
import {
  Button,
  Checkbox,
  IconButton,
  KnowledgeGraph,
  NODE_COLORS,
  ZOOM_MAX,
  ZOOM_MIN,
  degrees,
  type Graph,
  type GraphFilter,
  type GraphNodeType,
} from '@aris/ui-kit/react'
import { useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../page.js'
import { Dot } from '../ui.js'

type Space = '' | 'ca-nhan' | 'cong-ty'

interface ServerNode {
  id: string
  name: string
  title: string
  type: GraphNodeType
  space?: string
  x: number
  y: number
  z: number
  hub: boolean
  cl: number
  t: number
}

interface ServerGraph {
  nodes: ServerNode[]
  edges: { a: number; b: number; off: number }[]
  clusters: string[]
}

const FILTERS: GraphNodeType[] = ['note', 'person', 'session', 'memory']
const LEGEND: GraphNodeType[] = ['note', 'project', 'area', 'person', 'session', 'memory']
const color = (type: GraphNodeType) => (type === 'session' ? 'var(--a-muted)' : NODE_COLORS[type])
const label = (type: GraphNodeType) => `nb.type.${type}`
const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

export function BrainGraph({ t, nav }: PageProps) {
  const [space, setSpace] = useState<Space>('')
  const [show, setShow] = useState<GraphFilter>({ note: true, person: true, session: false, memory: false })
  const [data, setData] = useState<ServerGraph | null>(null)
  const [timeCut, setTimeCut] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [reset, setReset] = useState(0)
  const [selected, setSelected] = useState(-1)
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    const p = new URLSearchParams({
      graph: '1',
      ...(space ? { space } : {}),
      sources: show.session ? '1' : '0',
      memory: show.memory ? '1' : '0',
    })
    void fetch(endpoint(`?${p.toString()}`))
      .then((r) => (r.ok ? (r.json() as Promise<ServerGraph>) : null))
      .then((g) => live && g && setData(g))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [space, show.session, show.memory])

  const graph: Graph = useMemo(
    () => ({
      nodes: (data?.nodes ?? []).map((n) => ({
        name: n.title,
        type: n.type,
        x: n.x,
        y: n.y,
        z: n.z,
        hub: n.hub,
        cl: n.cl,
        t: n.t,
      })),
      edges: data?.edges ?? [],
      clusters: data?.clusters ?? [],
    }),
    [data],
  )
  const deg = useMemo(() => degrees(graph), [graph])
  // Chưa chọn: nút nối nhiều nhất.
  const sel = selected >= 0 && selected < graph.nodes.length ? selected : deg.indexOf(Math.max(...deg, 0))
  const node = data?.nodes[sel]
  const page = node && !node.id.startsWith('ky-uc:') ? node.id : undefined

  const find = (text: string) => {
    setQ(text)
    const f = fold(text.trim())
    if (f.length < 2) return
    const i = (data?.nodes ?? []).findIndex((n) => fold(n.title).includes(f))
    if (i >= 0) setSelected(i)
  }

  return (
    <div className="ap-split ap-brain">
      <main className="ap-note-main">
        <div className="ap-note-bar">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain')}>
            ‹
          </IconButton>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t('gr.title')}</span>
          <div className="ap-seg" role="tablist" aria-label={t('gr.space')}>
            {(['', 'ca-nhan', 'cong-ty'] as const).map((s) => (
              <button
                type="button"
                role="tab"
                key={s}
                aria-selected={space === s}
                className={space === s ? 'on' : ''}
                onClick={() => {
                  setSpace(s)
                  setSelected(-1)
                }}
              >
                {t(s ? `nb.space.${s}` : 'gr.all')}
              </button>
            ))}
          </div>
          <input
            className="a-inp"
            type="search"
            value={q}
            onChange={(e) => find(e.target.value)}
            placeholder={t('gr.search')}
            aria-label={t('gr.search')}
            style={{ marginLeft: 'auto', flex: '0 1 240px', width: 'auto', minWidth: 140, height: 32 }}
          />
        </div>
        <div className="ap-gstage">
          {data && !graph.nodes.length ? (
            <div className="a-muted ap-gempty">{t('gr.empty')}</div>
          ) : (
            <KnowledgeGraph
              graph={graph}
              show={show}
              timeCut={timeCut}
              selected={sel}
              onSelect={setSelected}
              zoom={zoom}
              onZoom={setZoom}
              resetKey={reset}
              label={t('gr.alt', { n: graph.clusters.length, clusters: graph.clusters.join(', ') })}
            />
          )}
          <div className="zoom" role="group" aria-label={t('gr.zoomGroup')}>
            <button
              type="button"
              aria-label={t('gr.zoomIn')}
              onClick={() => setZoom(Math.min(ZOOM_MAX, zoom * 1.2))}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t('gr.zoomOut')}
              onClick={() => setZoom(Math.max(ZOOM_MIN, zoom / 1.2))}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={t('gr.reset')}
              onClick={() => {
                setZoom(1)
                setReset(reset + 1)
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7" />
                <path d="M3 4v5h5" />
              </svg>
            </button>
          </div>
          <div className="legend">
            {LEGEND.map((k) => (
              <span key={k}>
                <Dot color={color(k)} />
                {t(label(k))}
              </span>
            ))}
            <span className="note">{t('gr.note')}</span>
          </div>
          <div className="hint">{t('gr.hint')}</div>
        </div>
      </main>
      <aside className="ap-aside ap-gaside" aria-label={t('gr.panel')}>
        <div className="ap-col" style={{ gap: 4 }}>
          <div className="ap-h">{t('gr.show')}</div>
          {FILTERS.map((k) => (
            <Checkbox
              key={k}
              checked={show[k] === true}
              onChange={(v) => setShow({ ...show, [k]: v })}
              label={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Dot color={color(k)} />
                  {t(label(k))}
                </span>
              }
            />
          ))}
          <span className="a-muted" style={{ fontSize: 11.5, paddingLeft: 26 }}>
            {t('gr.hubs')}
          </span>
        </div>
        <div>
          <div className="ap-h">{t('gr.time')}</div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(timeCut * 100)}
            aria-label={t('gr.timeAlt')}
            onChange={(e) => setTimeCut(Number(e.target.value) / 100)}
            style={{ width: '100%', accentColor: 'var(--a-accent)' }}
          />
          <div className="a-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>{t('gr.from')}</span>
            <span>{t('gr.now')}</span>
          </div>
        </div>
        {node && (
          <div className="a-card ap-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="a-muted" style={{ fontSize: 12 }}>
              {t('gr.selected')}
            </span>
            <b style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Dot color={color(node.type)} />
              {node.title}
            </b>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('gr.cluster', { type: t(label(node.type)), cluster: graph.clusters[node.cl] ?? '' })}
            </span>
            <span style={{ fontSize: 12.5 }}>{t('gr.degree', { n: deg[sel] ?? 0 })}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {page && (
                <Button
                  size="sm"
                  onClick={() =>
                    nav.go('brain', { view: 'notes', space: page.split('/')[0] ?? 'ca-nhan', path: page })
                  }
                >
                  {t('gr.open')}
                </Button>
              )}
              <Button size="sm" onClick={() => nav.go('brain', { view: 'ask' })}>
                {t('gr.askAbout')}
              </Button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
