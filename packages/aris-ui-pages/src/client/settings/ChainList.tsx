/**
 * Danh sách dọc của một chuỗi model (bản vẽ `ModelViec.dc.html`): số thứ tự, tên model, nhà cung cấp và giá,
 * trạng thái, các nút lên, xuống, bỏ; cuối danh sách là ô thêm model và dòng gợi ý. Chỉ lo phần trình bày: chuỗi
 * chat, tạo ảnh và tạo video cùng dùng, mỗi nơi tự dựng các dòng và tự quyết việc lưu.
 */
import { Select, type SelectOption } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { Dot } from '../ui.js'

type T = PageProps['t']

export interface ChainRow {
  key: string
  /** Tên model (chữ đơn cách). */
  title: string
  /** Dòng phụ: nhà cung cấp, giá, năng lực. */
  sub: string
  /** Gợi ý khi rê chuột (thường là `provider/model`). */
  tip?: string
  /** Màu chấm của nhà cung cấp. */
  dot?: string
  /** Nhãn trạng thái; bỏ trống thì chưa hiện. */
  status?: { label: string; tone?: 'ok' | 'warn' | undefined } | undefined
}

/** Tên model và dòng phụ của một mắt xích. */
export function RowLabel({ row }: Pick<{ row: ChainRow }, 'row'>) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }} title={row.tip}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {row.dot && <Dot color={row.dot} size={8} />}
        <span
          className="a-mono"
          style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {row.title}
        </span>
      </span>
      <span className="a-muted sub" style={{ fontSize: 11.5 }}>
        {row.sub}
      </span>
    </span>
  )
}

export function ChainList({
  t,
  rows,
  busy,
  canRemove,
  onMove,
  onRemove,
  addLabel,
  options,
  onAdd,
  hint,
  searchPlaceholder,
  emptyLabel,
}: {
  t: T
  rows: readonly ChainRow[]
  busy: boolean
  /** Dòng nào bỏ được; mặc định mọi dòng. */
  canRemove?: ((index: number) => boolean) | undefined
  onMove: (index: number, d: -1 | 1) => void
  onRemove: (index: number) => void
  /** Chữ trên ô thêm model. */
  addLabel: string
  /** Model còn thêm được; rỗng thì ẩn ô thêm. */
  options: readonly SelectOption[]
  onAdd: (id: string) => void
  /** Dòng gợi ý ở cuối danh sách, bên phải ô thêm. */
  hint?: string | undefined
  searchPlaceholder?: string | undefined
  emptyLabel?: string | undefined
}) {
  return (
    <div className="ap-mchain">
      {rows.length === 0 && <div className="ap-mchain-row a-muted">{t('md.empty')}</div>}
      {rows.map((row, i) => (
        <div className={`ap-mchain-row${i === 0 ? ' main' : ''}`} key={row.key}>
          <span className="n">{i + 1}</span>
          <RowLabel row={row} />
          {row.status && <span className={`ap-pill2 ${row.status.tone ?? ''}`}>{row.status.label}</span>}
          <span className="acts">
            <button
              type="button"
              disabled={busy || i === 0}
              aria-label={t('md.up')}
              onClick={() => onMove(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={busy || i === rows.length - 1}
              aria-label={t('md.down')}
              onClick={() => onMove(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              disabled={busy || (canRemove ? !canRemove(i) : false)}
              aria-label={t('md.remove')}
              onClick={() => onRemove(i)}
            >
              ×
            </button>
          </span>
        </div>
      ))}
      {(options.length > 0 || hint) && (
        <div className="ap-mchain-row">
          {options.length > 0 && (
            <span className="ap-mchain-add">
              <Select
                label={addLabel}
                value=""
                placeholder={addLabel}
                disabled={busy}
                options={options}
                onChange={onAdd}
                searchPlaceholder={searchPlaceholder}
                emptyLabel={emptyLabel}
              />
            </span>
          )}
          {hint && <span className="a-muted ap-mchain-hint">{hint}</span>}
        </div>
      )}
    </div>
  )
}
