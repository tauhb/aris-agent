/**
 * Thành phần cơ bản: nút, nút icon, trạng thái bot, pill, tem, thẻ, linh vật.
 * Không chứa chữ cố định; nhãn do nơi dùng truyền vào (đã dịch).
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { getMascot } from '../mascots.js'
import { STATUSES, type BotStatus } from '../status.js'

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ')

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>

export interface ButtonProps extends NativeButton {
  /** primary: nền mực (b1); secondary: viền (b2); ghost: chỉ chữ; danger: việc không hoàn tác. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | undefined
  size?: 'sm' | 'md' | 'lg' | undefined
  /** Giãn hết chiều ngang, chữ canh trái (ví dụ "Việc mới" ở thanh bên). */
  block?: boolean | undefined
  icon?: ReactNode | undefined
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('a-btn', variant, size !== 'md' && size, block && 'block', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

export interface IconButtonProps extends NativeButton {
  /** Nhãn cho trình đọc màn hình (bắt buộc vì nút chỉ có icon). */
  label: string
  size?: 'sm' | 'md' | undefined
  children: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx('a-ib', size === 'sm' && 'sm', className)}
      aria-label={label}
      {...rest}
    >
      {children}
    </button>
  )
})

/** Glyph 16×16 của 5 trạng thái; phân biệt được bằng hình, không chỉ bằng màu. */
export function StatusGlyph({
  status,
  label,
  size = 14,
}: {
  status: BotStatus
  /** Có nhãn thì glyph là ảnh có tên; không thì ẩn với trình đọc màn hình. */
  label?: string | undefined
  size?: number | undefined
}) {
  const spec = STATUSES[status]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg
      className={cx('a-glyph', status)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      style={{
        color: `var(--a-${spec.color})`,
        ['--line' as string]: 'var(--a-line)',
        ['--panel' as string]: 'var(--a-panel)',
      }}
      {...a11y}
      dangerouslySetInnerHTML={{ __html: spec.body }}
    />
  )
}

/** Viên trạng thái: glyph + nhãn trên nền nhạt theo trạng thái. */
export function StatusPill({
  status,
  label,
  size = 'md',
}: {
  status: BotStatus
  label: string
  size?: 'sm' | 'md' | undefined
}) {
  return (
    <span className={cx('a-st', status, size === 'sm' && 'sm')}>
      <StatusGlyph status={status} size={size === 'sm' ? 12 : 14} />
      {label}
    </span>
  )
}

/** Nhãn tròn có màu, ví dụ vai "Commander" cạnh tên bot. */
export function Pill({
  tone = 'accent',
  children,
}: {
  tone?: 'accent' | 'ok' | 'warn' | 'danger' | 'muted' | undefined
  children: ReactNode
}) {
  return <span className={cx('a-pill', tone)}>{children}</span>
}

/** Tem nhỏ nền xám, ví dụ "tự thêm", tên model. */
export function Tag({ mono, children }: { mono?: boolean; children: ReactNode }) {
  return <span className={cx('a-tag', mono && 'a-mono')}>{children}</span>
}

export function Card({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: ReactNode | undefined
  subtitle?: ReactNode | undefined
  actions?: ReactNode | undefined
  children?: ReactNode | undefined
}) {
  return (
    <section className="a-card">
      {(title || actions) && (
        <div className="a-card-head">
          <div>
            {title && <div className="a-card-title">{title}</div>}
            {subtitle && <div className="a-card-sub">{subtitle}</div>}
          </div>
          {actions && <div className="a-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Một dòng trong thẻ, có vạch ngăn phía trên; `label` chiếm phần còn lại. */
export function CardRow({ label, children }: { label?: ReactNode; children?: ReactNode }) {
  return (
    <div className="a-row">
      {label !== undefined && <span className="grow">{label}</span>}
      {children}
    </div>
  )
}

/** Linh vật của bot (khối màu, hai mắt). */
export function Mascot({ id, size = 28, label }: { id: string; size?: number; label?: string }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ flex: 'none' }}
      {...a11y}
      dangerouslySetInnerHTML={{ __html: getMascot(id)?.body ?? '' }}
    />
  )
}

/** Dấu aris: khối tròn màu mực với hai mắt. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flex: 'none' }}>
      <path
        d="M50 8C76 8 92 24 92 50C92 76 76 92 50 92C24 92 8 76 8 50C8 24 24 8 50 8Z"
        fill="var(--a-ink)"
      />
      <path d="M52 36L48 50M65 34L61 48" stroke="var(--a-panel)" strokeWidth={9} strokeLinecap="round" />
    </svg>
  )
}

export { cx }
