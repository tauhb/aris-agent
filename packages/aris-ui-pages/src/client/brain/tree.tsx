/**
 * Thành phần của cây bộ não (bản vẽ 5.1, phương án A): biểu tượng, dòng có mũi tên và số đếm, nhóm mở ra
 * được, khối lớp có màu (Nhật ký xanh, Wiki cam, Nguồn xám).
 */
import type { ReactNode } from 'react'

const PATHS = {
  user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 20c0-4 4-6 8-6s8 2 8 6',
  building: 'M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2zM9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1',
  pen: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z',
  lock: 'M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2zM8 11V7a4 4 0 0 1 8 0v4',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  cal: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 10h18',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  box: 'M4 4h16a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  right: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  search: 'M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-3.5-3.5',
  gem: 'M12 2l7 5-2 12-5 3-5-3-2-12z',
  graph:
    'M4 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0M16 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8 6.3l8 1.4M6.6 8l2.8 8M17 9.8l-6 6.4',
  undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
} as const
export type IconName = keyof typeof PATHS

export function Ico({ name, color }: { name: IconName; color?: string | undefined }) {
  return (
    <svg
      className="ap-ico"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** Biểu tượng theo nhóm trang wiki. */
export const GROUP_ICON: Record<string, IconName> = {
  nguoi: 'user',
  'du-an': 'folder',
  'chu-de': 'hash',
  'tom-tat': 'file',
  'tong-hop': 'spark',
  'khach-hang': 'tag',
  'san-pham': 'box',
  'quy-trinh': 'list',
  'so-lieu': 'chart',
  khac: 'dots',
}

export type Depth = 0 | 1 | 2

/** Một dòng của cây: chỗ mũi tên (hay trống), biểu tượng, nhãn, số đếm. */
export function Row({
  label,
  icon,
  color,
  count,
  note,
  open,
  depth = 0,
  current,
  muted,
  onClick,
}: {
  label: ReactNode
  icon?: IconName | undefined
  color?: string | undefined
  count?: number | undefined
  /** Chữ phụ bên phải (thay cho số đếm), ví dụ "+ Viết". */
  note?: string | undefined
  /** Có: dòng mở ra được (vẽ mũi tên). */
  open?: boolean | undefined
  depth?: Depth
  current?: boolean
  muted?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      className={`ap-row d${depth}${current ? ' cur' : ''}${muted ? ' mute' : ''}`}
      aria-current={current ? 'page' : undefined}
      aria-expanded={open}
      onClick={onClick}
    >
      {open === undefined ? <span className="ap-ico" /> : <Ico name={open ? 'down' : 'right'} />}
      {icon && <Ico name={icon} color={current ? undefined : color} />}
      <span className="lbl">{label}</span>
      {note ? <span className="n">{note}</span> : count ? <span className="n cnt">{count}</span> : null}
    </button>
  )
}

export interface PageLike {
  path: string
  title: string
}

/** Nhóm trang: dòng nhóm có mũi tên, mở ra là danh sách trang (thụt vào, có đường dẫn dọc). */
export function Group({
  id,
  label,
  icon,
  color,
  pages,
  open,
  toggle,
  current,
  select,
  depth = 0,
}: {
  id: string
  label: string
  icon?: IconName | undefined
  color?: string | undefined
  pages: PageLike[]
  open: boolean
  toggle: (id: string) => void
  current: string | undefined
  select: (p: string) => void
  depth?: Depth
}) {
  return (
    <>
      <Row
        label={label}
        icon={icon}
        color={color}
        count={pages.length}
        open={open}
        depth={depth}
        onClick={() => toggle(id)}
      />
      {open &&
        pages.map((p) => (
          <Row
            key={p.path}
            label={p.title}
            depth={(depth + 1) as Depth}
            current={p.path === current}
            onClick={() => select(p.path)}
          />
        ))}
    </>
  )
}

/** Khối một lớp: ô biểu tượng màu, tên lớp, dòng phụ (ai viết), nội dung. */
export function Layer({
  kind,
  icon,
  title,
  sub,
  children,
}: {
  kind: 'me' | 'lib' | 'src'
  icon: IconName
  title: string
  sub: string
  children: ReactNode
}) {
  return (
    <section className={`ap-layer l-${kind}`} aria-label={title}>
      <div className="lh">
        <span className="sq">
          <Ico name={icon} />
        </span>
        <span>
          <b>{title}</b>
          <small>{sub}</small>
        </span>
      </div>
      {children}
    </section>
  )
}
