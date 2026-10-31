/**
 * Brain: một trang, sáu khung (đồ thị, ghi chú, hộp thư vào, hỏi bộ não, nhật ký, soát) chọn qua `params.view`. Mở vào là
 * đồ thị. Đầu trang có thanh tab `Đồ thị | Cá nhân | Công ty` cho hai khung chính: đồ thị, và ghi chú của từng không
 * gian (`params.space`), cùng một ô tìm chung ở bên phải (từ khoá giữ nguyên khi đổi tab). Hộp thư vào, Hỏi, Nhật
 * ký, Soát là trang con có nút quay lại riêng nên không hiện thanh tab.
 */
import { createElement, useState } from 'react'
import type { PageProps } from '../page.js'
import { Ask } from './Ask.js'
import { BrainGraph } from './Graph.js'
import { Inbox } from './Inbox.js'
import { BrainLog } from './Log.js'
import { Notes, type Space } from './Notes.js'
import { Audit } from './Audit.js'
import { Ico } from './tree.js'

/** Các trang con không có thanh tab và ô tìm. */
const SUBPAGES = { inbox: Inbox, ask: Ask, log: BrainLog, audit: Audit } as const
type View = 'graph' | 'notes' | keyof typeof SUBPAGES
const VIEW_KEYS: readonly string[] = ['graph', 'notes', ...Object.keys(SUBPAGES)]

/** Khung mặc định khi đường vào không nói rõ (kể cả mở từ thanh bên): đồ thị. */
const DEFAULT_VIEW: View = 'graph'
const SPACES = ['ca-nhan', 'cong-ty'] as const

/** Đường vào cũ dùng `view=soat`: quy về `audit`. */
const viewOf = (raw: string | undefined): View => {
  const v = raw === 'soat' ? 'audit' : raw
  return v && VIEW_KEYS.includes(v) ? (v as View) : DEFAULT_VIEW
}
const spaceOf = (v: string | undefined): Space => (v === 'cong-ty' ? 'cong-ty' : 'ca-nhan')

export function Brain(props: PageProps) {
  const { t, nav, params } = props
  const view = viewOf(params.view)
  const space = spaceOf(params.space)
  const tabbed = view === 'graph' || view === 'notes'
  // Từ khoá tìm chung: đồ thị tô sáng nút khớp, ghi chú lọc cây; đổi tab không mất.
  const [q, setQ] = useState('')
  const search = { q, setQ }
  // Đổi không gian thì dựng lại ghi chú từ đầu (cây, trang đang mở) như trước khi tab ở đây.
  const body =
    view === 'notes' ? (
      <Notes key={space} {...props} {...search} />
    ) : view === 'graph' ? (
      <BrainGraph {...props} {...search} />
    ) : (
      createElement(SUBPAGES[view], props)
    )

  return (
    <div className="ap-brainpage">
      {tabbed && (
        <div className="ap-btabs">
          <div className="ap-seg" role="tablist" aria-label={t('br.tabs')}>
            <button
              type="button"
              role="tab"
              className={view === 'graph' ? 'on' : undefined}
              aria-selected={view === 'graph'}
              onClick={() => nav.go('brain', { view: 'graph' })}
            >
              <Ico name="graph" />
              {t('br.tab.graph')}
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
          <label className="ap-bsearch ap-bsearch-top">
            <Ico name="search" />
            <input
              type="search"
              placeholder={t('br.search')}
              aria-label={t('br.search')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
        </div>
      )}
      <div className="ap-brainbody">{body}</div>
    </div>
  )
}
