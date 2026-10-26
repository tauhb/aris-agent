/**
 * 5.3 · Đồ thị bộ não 3D (giai đoạn 5, đợt 4b; bản vẽ DoThi.dc.html): trang wiki theo loại (ghi chú, dự án, chủ
 * đề, người), nguồn và ký ức bot bật thêm; cạnh là liên kết, cụm quanh trang dự án, chủ đề và nút phòng ban; lọc
 * theo không gian, phòng ban và thời gian, tìm nút (từ khoá của ô tìm chung ở thanh tab Brain), xem nút đang
 * chọn. Dữ liệu từ `/api/aris/brain?graph`.
 */
import {
  Button,
  Checkbox,
  KnowledgeGraph,
  Select,
  NODE_COLORS,
  ZOOM_MAX,
  ZOOM_MIN,
  degrees,
  type Graph,
  type GraphFilter,
  type GraphNodeType,
} from '@aris/ui-kit/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../page.js'
import { Dot } from '../ui.js'
import { foldersOf } from './tree-layout.js'
import { TreeGraph } from './TreeGraph.js'
import { TreeGraph3D } from './TreeGraph3D.js'

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
  departments?: { id: string; name: string }[]
}

const FILTERS: GraphNodeType[] = ['note', 'person', 'session', 'memory']
const LEGEND: GraphNodeType[] = ['note', 'project', 'area', 'department', 'person', 'session', 'memory']
const color = (type: GraphNodeType) => (type === 'session' ? 'var(--a-muted)' : NODE_COLORS[type])
const label = (type: GraphNodeType) => `nb.type.${type}`
/** Nhãn trên đồ thị: tên dài (nguồn thường lấy dòng đầu) cắt còn ~28 ký tự; tên đầy đủ ở ô Đang chọn. */
type Mode = 'links' | 'tree' | 'tree3d'
const MODES: readonly Mode[] = ['links', 'tree', 'tree3d']
const MODE_KEY = 'aris.brain.graphMode'
/** Tên thư mục trên cây: không gian, lớp, nhóm có tên tiếng Việt; phòng ban theo tên phòng. */
const FOLDER: Record<string, string> = {
  'ca-nhan': 'nb.space.ca-nhan',
  'cong-ty': 'nb.space.cong-ty',
  wiki: 'gr.f.wiki',
  nguon: 'gr.f.nguon',
  'nhat-ky': 'gr.f.nhat-ky',
  nguoi: 'gr.f.nguoi',
  'du-an': 'gr.f.du-an',
  'chu-de': 'gr.f.chu-de',
  'tom-tat': 'gr.f.tom-tat',
  'tong-hop': 'gr.f.tong-hop',
  chung: 'gr.f.chung',
  'phong-ban': 'gr.f.phong-ban',
  'khach-hang': 'gr.f.khach-hang',
  'san-pham': 'gr.f.san-pham',
  'quy-trinh': 'gr.f.quy-trinh',
  'so-lieu': 'gr.f.so-lieu',
  'ky-uc-bot': 'nb.type.memory',
}
const shortLabel = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const endpoint = (q = '') => new URL(`api/aris/brain${q}`, document.baseURI)
/** Cây không vẽ nút phòng ban: phòng đã là nhánh thư mục. */
const inTree = (n: { type: string }) => n.type !== 'department'
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

/** Cách xem mặc định khi người dùng chưa chọn lần nào: cây 3D. */
const DEFAULT_MODE: Mode = 'tree3d'

/** Cách xem đã chọn lần trước (mỗi người xem một trình duyệt); chưa có thì cây 3D. */
const savedMode = (): Mode => {
  try {
    const m = localStorage.getItem(MODE_KEY)
    return MODES.find((x) => x === m) ?? DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

export function BrainGraph({ t, nav, q }: PageProps & { q: string }) {
  const [mode, setModeState] = useState<Mode>(savedMode)
  const setMode = (m: Mode) => {
    setModeState(m)
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      // Không lưu được (chế độ riêng tư): chỉ đổi trong lần xem này.
    }
  }
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [showLinks, setShowLinks] = useState(true)
  const [showJournal, setShowJournal] = useState(true)
  const [beta, setBeta] = useState(0.82)
  const [space, setSpace] = useState<Space>('')
  const [dept, setDept] = useState('')
  const [show, setShow] = useState<GraphFilter>({ note: true, person: true, session: false, memory: false })
  const [data, setData] = useState<ServerGraph | null>(null)
  const [timeCut, setTimeCut] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [reset, setReset] = useState(0)
  const [selected, setSelected] = useState(-1)

  useEffect(() => {
    let live = true
    const p = new URLSearchParams({
      graph: '1',
      ...(space ? { space } : {}),
      ...(space === 'cong-ty' && dept ? { dept } : {}),
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
  }, [space, dept, show.session, show.memory])

  const graph: Graph = useMemo(
    () => ({
      nodes: (data?.nodes ?? []).map((n) => ({
        name: shortLabel(n.title),
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
  const tree = mode !== 'links'
  // Chưa chọn: nút nối nhiều nhất (cây không có nút phòng ban nên bỏ qua chúng).
  const usable = (i: number) => selected >= 0 && i < graph.nodes.length && !(tree && !inTree(graph.nodes[i]!))
  const best = deg.map((d, i) => (tree && !inTree(graph.nodes[i]!) ? -1 : d))
  const sel = usable(selected) ? selected : best.indexOf(Math.max(...best, 0))
  const node = data?.nodes[sel]
  const page =
    node && !node.id.startsWith('ky-uc:') && !node.id.startsWith('phong-ban:') ? node.id : undefined

  const depts = data?.departments
  const folderLabel = useCallback(
    (seg: string) => {
      const k = FOLDER[seg]
      if (k) return t(k)
      return depts?.find((d) => d.id === seg)?.name ?? seg
    },
    [t, depts],
  )
  const skip = useCallback((n: { id: string }) => !showJournal && n.id.includes('/nhat-ky/'), [showJournal])
  // Ký ức mỗi bot gộp sẵn thành một nút (nhiều ký ức sẽ lấn hết vòng trang).
  const folded = useCallback((key: string) => key.startsWith('ky-uc-bot/'), [])
  const toggle = (key: string) => {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setCollapsed(next)
  }
  // Nút phòng ban nằm cuối danh sách, bỏ đi thì chỉ số các nút khác không đổi; cạnh nối phòng bị bỏ theo.
  const treeNodes = useMemo(() => (data?.nodes ?? []).filter(inTree), [data])
  const treeEdges = useMemo(
    () => (data?.edges ?? []).filter((e) => e.a < treeNodes.length && e.b < treeNodes.length),
    [data, treeNodes],
  )

  const treeProps = {
    t,
    nodes: treeNodes,
    edges: treeEdges,
    label: folderLabel,
    collapsed,
    onToggle: toggle,
    selected: sel,
    onSelect: setSelected,
    showLinks,
    beta,
    zoom,
    onZoom: (z: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))),
    resetKey: reset,
    skip,
    folded,
  }

  // Từ khoá của ô tìm chung: chọn nút đầu tiên có tên khớp (áp cho cả liên kết, cây 2D và cây 3D).
  useEffect(() => {
    const f = fold(q.trim())
    if (f.length < 2) return
    const i = (data?.nodes ?? []).findIndex((n) => fold(n.title).includes(f) && !(tree && !inTree(n)))
    if (i >= 0) setSelected(i)
  }, [q, data, tree])

  return (
    <div className="ap-split ap-brain">
      <main className="ap-note-main" aria-label={t('gr.title')}>
        <div className="ap-note-bar ap-gbar">
          <div className="ap-seg" role="tablist" aria-label={t('gr.mode')}>
            {MODES.map((m) => (
              <button
                type="button"
                role="tab"
                key={m}
                aria-selected={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
              >
                {t(`gr.mode.${m}`)}
              </button>
            ))}
          </div>
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
                  setDept('')
                  setSelected(-1)
                }}
              >
                {t(s ? `nb.space.${s}` : 'gr.all')}
              </button>
            ))}
          </div>
          {space === 'cong-ty' && depts && depts.length > 0 && (
            <Select
              variant="compact"
              align="start"
              label={t('gr.dept')}
              value={dept}
              options={[
                { id: '', name: t('gr.allDepts') },
                ...depts.map((d) => ({ id: d.id, name: d.name })),
              ]}
              onChange={(id) => {
                setDept(id)
                setSelected(-1)
              }}
            />
          )}
        </div>
        <div className="ap-gstage">
          {data && !graph.nodes.length ? (
            <div className="a-muted ap-gempty">{t('gr.empty')}</div>
          ) : tree ? (
            mode === 'tree3d' ? (
              <TreeGraph3D {...treeProps} />
            ) : (
              <TreeGraph {...treeProps} />
            )
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
            {tree && (
              <span>
                <svg width="12" height="12" aria-hidden="true">
                  <circle cx="6" cy="6" r="4.5" fill="none" stroke="var(--a-muted)" strokeWidth="2" />
                </svg>
                {t('gr.folder')}
              </span>
            )}
            {(tree
              ? LEGEND.filter((k) => (k !== 'memory' || show.memory) && k !== 'department')
              : LEGEND
            ).map((k) => (
              <span key={k}>
                <Dot color={color(k)} />
                {t(label(k))}
              </span>
            ))}
            {tree && (
              <span>
                <svg width="22" height="10" aria-hidden="true">
                  <path d="M1 8 Q11 -2 21 8" fill="none" stroke="var(--a-accent)" strokeWidth="1.8" />
                </svg>
                {t('gr.linkLegend')}
              </span>
            )}
            <span className="note">{t(tree ? 'gr.treeNote' : 'gr.note')}</span>
          </div>
        </div>
      </main>
      <aside className="ap-aside ap-gaside" aria-label={t('gr.panel')}>
        {tree ? (
          <>
            <div className="ap-col" style={{ gap: 4 }}>
              <div className="ap-h">{t('gr.show')}</div>
              <Checkbox checked={showLinks} onChange={setShowLinks} label={t('gr.t.links')} />
              <Checkbox
                checked={show.session === true}
                onChange={(v) => setShow({ ...show, session: v })}
                label={t('nb.type.session')}
              />
              <Checkbox checked={showJournal} onChange={setShowJournal} label={t('gr.f.nhat-ky')} />
              <Checkbox
                checked={show.memory === true}
                onChange={(v) => setShow({ ...show, memory: v })}
                label={t('gr.t.memory')}
              />
            </div>
            <div>
              <div className="ap-h">{t('gr.bend')}</div>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(beta * 100)}
                aria-label={t('gr.bendAlt')}
                onChange={(e) => setBeta(Number(e.target.value) / 100)}
                style={{ width: '100%', accentColor: 'var(--a-accent)' }}
              />
              <div
                className="a-muted"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
              >
                <span>{t('gr.bendLo')}</span>
                <span>{t('gr.bendHi')}</span>
              </div>
            </div>
            {collapsed.size > 0 && (
              <Button size="sm" onClick={() => setCollapsed(new Set())}>
                {t('gr.foldReset')}
              </Button>
            )}
          </>
        ) : (
          <>
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
              <div
                className="a-muted"
                style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}
              >
                <span>{t('gr.from')}</span>
                <span>{t('gr.now')}</span>
              </div>
            </div>
          </>
        )}
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
              {tree
                ? `${t(label(node.type))} · ${foldersOf(node).map(folderLabel).join(' / ')}`
                : t('gr.cluster', { type: t(label(node.type)), cluster: graph.clusters[node.cl] ?? '' })}
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
