/**
 * Brain: một trang, sáu khung (đồ thị, ghi chú, hộp thư vào, hỏi bộ não, nhật ký, soát) chọn qua `params.view`. Mở vào là
 * đồ thị. Đầu trang có thanh tab `[đồ thị] | Cá nhân | Công ty` cho hai khung chính: đồ thị, và ghi chú của từng không
 * gian (`params.space`). Hộp thư vào, Hỏi, Nhật ký, Soát là trang con có nút quay lại riêng nên không hiện thanh tab.
 */
import type { PageProps } from '../page.js'
import { Ask } from './Ask.js'
import { BrainGraph } from './Graph.js'
import { Inbox } from './Inbox.js'
import { BrainLog } from './Log.js'
import { Notes, type Space } from './Notes.js'
import { Soat } from './Soat.js'
import { Ico } from './tree.js'

const VIEWS = { graph: BrainGraph, notes: Notes, inbox: Inbox, ask: Ask, log: BrainLog, soat: Soat } as const
type View = keyof typeof VIEWS

/** Khung mặc định khi đường vào không nói rõ (kể cả mở từ thanh bên): đồ thị. */
const DEFAULT_VIEW: View = 'graph'
const SPACES = ['ca-nhan', 'cong-ty'] as const

const viewOf = (v: string | undefined): View => (v && v in VIEWS ? (v as View) : DEFAULT_VIEW)
const spaceOf = (v: string | undefined): Space => (v === 'cong-ty' ? 'cong-ty' : 'ca-nhan')

export function Brain(props: PageProps) {
  const { t, nav, params } = props
  const view = viewOf(params.view)
  const space = spaceOf(params.space)
  const View = VIEWS[view]
  const tabbed = view === 'graph' || view === 'notes'
  // Đổi không gian thì dựng lại ghi chú từ đầu (cây, trang đang mở, ô tìm) như trước khi tab ở đây.
  const body = view === 'notes' ? <Notes key={space} {...props} /> : <View {...props} />

  return (
    <div className="ap-brainpage">
      {tabbed && (
        <div className="ap-btabs">
          <div className="ap-seg" role="tablist" aria-label={t('br.tabs')}>
            <button
              type="button"
              role="tab"
              className={`ap-btab-graph${view === 'graph' ? ' on' : ''}`}
              aria-selected={view === 'graph'}
              aria-label={t('br.tab.graph')}
              title={t('br.tab.graph')}
              onClick={() => nav.go('brain', { view: 'graph' })}
            >
              <Ico name="graph" />
            </button>
            {SPACES.map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                className={view === 'notes' && space === s ? 'on' : undefined}
                aria-selected={view === 'notes' && space === s}
                onClick={() => nav.go('brain', { view: 'notes', space: s })}
              >
                <Ico name={s === 'ca-nhan' ? 'user' : 'building'} />
                {t(`nb.space.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="ap-brainbody">{body}</div>
    </div>
  )
}
