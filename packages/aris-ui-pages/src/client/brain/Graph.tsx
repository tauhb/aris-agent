/** 5.3 · Đồ thị bộ não 3D: lọc theo loại nút, theo thời gian, phóng to/thu nhỏ, xem nút đang chọn. */
import {
  Button,
  Checkbox,
  IconButton,
  KnowledgeGraph,
  NODE_COLORS,
  Segmented,
  ZOOM_MAX,
  ZOOM_MIN,
  degrees,
  type GraphFilter,
  type GraphNodeType,
} from '@aris/ui-kit/react'
import { useMemo, useState } from 'react'
import type { PageProps } from '../page.js'
import { Dot } from '../ui.js'
import { demoGraph } from './demo.js'

const FILTERS: GraphNodeType[] = ['note', 'person', 'memory', 'skill', 'session']
const LEGEND: GraphNodeType[] = ['note', 'project', 'area', 'person', 'memory', 'skill', 'session']
const color = (type: GraphNodeType) => (type === 'session' ? 'var(--a-muted)' : NODE_COLORS[type])

export function BrainGraph({ t, nav }: PageProps) {
  const graph = useMemo(demoGraph, [])
  const deg = useMemo(() => degrees(graph), [graph])
  const [show, setShow] = useState<GraphFilter>({
    note: true,
    person: true,
    memory: true,
    skill: true,
    session: false,
  })
  const [timeCut, setTimeCut] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [reset, setReset] = useState(0)
  const [selected, setSelected] = useState(0)
  const node = graph.nodes[selected]
  const typeName = node ? t(`type.${node.type}`) : ''
  return (
    <div className="ap-split ap-brain">
      <main className="ap-note-main">
        <div className="ap-note-bar">
          <IconButton label={t('br.back')} onClick={() => nav.go('brain')}>
            ‹
          </IconButton>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{t('gr.title')}</span>
          <Segmented
            label={t('gr.kind')}
            value="knowledge"
            onChange={(v) => v === 'team' && nav.go('map')}
            options={[
              { value: 'knowledge', label: t('gr.knowledge') },
              { value: 'learning', label: t('gr.learning') },
              { value: 'team', label: t('gr.team') },
            ]}
          />
          <input
            className="a-inp"
            type="search"
            placeholder={t('gr.search')}
            aria-label={t('gr.search')}
            style={{ marginLeft: 'auto', flex: '0 1 260px', width: 'auto', minWidth: 180, height: 32 }}
          />
        </div>
        <div className="ap-gstage">
          <KnowledgeGraph
            graph={graph}
            show={show}
            timeCut={timeCut}
            selected={selected}
            onSelect={setSelected}
            zoom={zoom}
            onZoom={setZoom}
            resetKey={reset}
            label={t('gr.alt', { clusters: graph.clusters.join(', ') })}
          />
          <div className="zoom">
            <button
              type="button"
              aria-label={t('gr.zoomIn')}
              onClick={() => setZoom(Math.min(ZOOM_MAX, zoom * 1.2))}
            >
              +
            </button>
            <button
              type="button"
              aria-label={t('gr.zoomOut')}
              onClick={() => setZoom(Math.max(ZOOM_MIN, zoom / 1.2))}
            >
              −
            </button>
            <button
              type="button"
              aria-label={t('gr.reset')}
              onClick={() => {
                setZoom(1)
                setReset(reset + 1)
              }}
            >
              ⟲
            </button>
          </div>
          <div className="legend">
            {LEGEND.map((k) => (
              <span key={k}>
                <Dot color={color(k)} />
                {t(`type.${k}`)}
              </span>
            ))}
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
                  {t(`type.${k}`)}
                </span>
              }
            />
          ))}
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
              {node.name || t('gr.untitled', { type: typeName })}
            </b>
            <span className="a-muted" style={{ fontSize: 12.5 }}>
              {t('gr.cluster', { type: typeName, cluster: graph.clusters[node.cl] ?? '' })}
            </span>
            <span style={{ fontSize: 12.5 }}>{t('gr.degree', { n: deg[selected] ?? 0 })}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => nav.go('brain')}>
                {t('gr.open')}
              </Button>
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
