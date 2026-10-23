/**
 * Khung điều hướng và trang: dòng điều hướng (thanh bên, menu Cài đặt), đầu mục,
 * khung trang thường và khung trang Cài đặt 6.x.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Mascot, StatusGlyph, cx } from './basics.js'
import type { BotStatus } from '../status.js'

export interface NavItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  label: string
  icon?: ReactNode | undefined
  active?: boolean | undefined
  /** Chữ phụ bên phải, ví dụ "4 phiên". */
  meta?: ReactNode | undefined
  /** plain: mục đang mở nền xám (menu Cài đặt); warn: dòng cảnh báo (việc chờ duyệt). */
  variant?: 'accent' | 'plain' | 'warn' | undefined
  /** Thanh thu gọn: chỉ còn icon 40×40, nhãn thành `aria-label`. */
  collapsed?: boolean | undefined
}

/** Một dòng điều hướng: icon rỗng khi nghỉ, đổi màu nhấn khi đang mở. */
export const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  { label, icon, active, meta, variant = 'accent', collapsed, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('a-nav', variant !== 'accent' && variant, collapsed && 'icon', className)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      {...rest}
    >
      {icon && (
        <span className="g" aria-hidden="true">
          {icon}
        </span>
      )}
      {!collapsed && <span className="l">{children ?? label}</span>}
      {!collapsed && meta !== undefined && <span className="meta">{meta}</span>}
    </button>
  )
})

export interface BotRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Mã linh vật (thường trùng mã bot). */
  mascot: string
  name: string
  /** Dòng phụ: việc đang làm hoặc vai. */
  note: string
  status: BotStatus
  /** Nhãn trạng thái đã dịch (aria-label của glyph). */
  statusLabel: string
  /** Commander: thẻ nổi, linh vật lớn hơn, không hiện glyph trạng thái. */
  lead?: boolean | undefined
  collapsed?: boolean | undefined
}

/** Một bot trong đội hình: linh vật, tên, việc đang làm, glyph trạng thái. */
export const BotRow = forwardRef<HTMLButtonElement, BotRowProps>(function BotRow(
  { mascot, name, note, status, statusLabel, lead, collapsed, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('a-bot', lead && 'lead', collapsed && 'icon', className)}
      aria-label={collapsed ? `${name} · ${note}` : undefined}
      {...rest}
    >
      <Mascot id={mascot} size={lead ? 34 : 28} />
      {!collapsed && (
        <>
          <span className="txt">
            <span className="nm">{name}</span>
            <span className={cx('note', status === 'waiting' && 'waiting')}>{note}</span>
          </span>
          {!lead && <StatusGlyph status={status} label={statusLabel} />}
        </>
      )}
    </button>
  )
})

/** Đầu một mục (Đội hình, Phòng…) với nút thao tác bên phải. */
export function SectionHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="a-sec">
      <span>{title}</span>
      {action}
    </div>
  )
}

/** Nhãn nhóm nhỏ trong danh sách (ví dụ nhóm việc của bot). */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <div className="a-grp">{children}</div>
}

/** Khung trang thường: dải tiêu đề (tiêu đề, dòng phụ, thao tác) và phần thân. */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode | undefined
  actions?: ReactNode | undefined
  children?: ReactNode | undefined
}) {
  return (
    <main className="a-page">
      <header className="a-page-head">
        <div className="grow">
          <h1 className="a-page-title">{title}</h1>
          {subtitle && <span className="a-page-sub">{subtitle}</span>}
        </div>
        {actions && <div className="a-page-actions">{actions}</div>}
      </header>
      <div className="a-page-body">{children}</div>
    </main>
  )
}

export interface SettingsSection {
  id: string
  label: string
}

/** Khung trang Cài đặt 6.x: cột điều hướng các mục bên trái, trang của mục bên phải. */
export function SettingsShell({
  caption,
  sections,
  active,
  onSelect,
  navLabel,
  children,
}: {
  caption?: ReactNode | undefined
  sections: readonly SettingsSection[]
  active: string
  onSelect: (id: string) => void
  navLabel: string
  children: ReactNode
}) {
  return (
    <div className="a-settings">
      <nav className="a-settings-nav" aria-label={navLabel}>
        {caption && <div className="cap">{caption}</div>}
        {sections.map((s) => (
          <NavItem
            key={s.id}
            label={s.label}
            variant="plain"
            active={s.id === active}
            onClick={() => onSelect(s.id)}
          />
        ))}
      </nav>
      {children}
    </div>
  )
}
