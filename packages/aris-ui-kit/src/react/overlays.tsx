/**
 * Lớp nổi: menu thả (danh sách phiên, chọn bot…) và hộp thoại. Đóng khi bấm ra
 * ngoài hoặc bấm Esc.
 */
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { cx } from './basics.js'

/** Gọi `close` khi bấm chuột ra ngoài `ref` hoặc bấm Esc, chỉ trong lúc `open`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, close])
}

/**
 * Khung menu, đặt trong một phần tử `a-pop` (vị trí tương đối) cùng nút mở.
 * `role="listbox"` khi các mục là lựa chọn (có `aria-selected`).
 */
export function Menu({
  label,
  role = 'menu',
  align = 'start',
  inline,
  width,
  children,
}: {
  label: string
  role?: 'menu' | 'listbox' | undefined
  align?: 'start' | 'end' | undefined
  /** Vẽ trong luồng trang (trang thử thành phần). */
  inline?: boolean | undefined
  width?: number | undefined
  children: ReactNode
}) {
  return (
    <span
      className={cx('a-menu', align === 'end' && 'end', inline && 'inline')}
      role={role}
      aria-label={label}
      style={width ? { width } : undefined}
    >
      {children}
    </span>
  )
}

export function MenuItem({
  icon,
  meta,
  selected,
  role = 'menuitem',
  onSelect,
  children,
}: {
  icon?: ReactNode | undefined
  /** Chữ phụ bên phải: thời gian, phím tắt… */
  meta?: ReactNode | undefined
  selected?: boolean | undefined
  role?: 'menuitem' | 'option' | undefined
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="a-mi"
      role={role}
      aria-selected={role === 'option' ? !!selected : undefined}
      onClick={onSelect}
    >
      {icon}
      <span className="t">{children}</span>
      {meta !== undefined && <span className="meta">{meta}</span>}
    </button>
  )
}

/** Nhãn nhóm trong menu; `separated` thêm vạch ngăn phía trên. */
export function MenuLabel({ separated, children }: { separated?: boolean; children: ReactNode }) {
  return <span className={cx('a-ml', separated && 'sep')}>{children}</span>
}

export function MenuEmpty({ children }: { children: ReactNode }) {
  return <span className="a-mempty">{children}</span>
}

/**
 * Hộp thoại giữa màn hình, nền mờ phía sau. Esc hoặc bấm nền để đóng; khi mở,
 * con trỏ bàn phím chuyển vào hộp thoại.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  footer,
  inline,
  children,
}: {
  open: boolean
  title: ReactNode
  description?: ReactNode | undefined
  onClose: () => void
  footer?: ReactNode | undefined
  /** Vẽ trong luồng trang thay vì phủ màn hình (trang thử thành phần). */
  inline?: boolean | undefined
  children?: ReactNode | undefined
}) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || inline) return
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, inline, onClose])
  if (!open) return null
  return (
    <div
      className={cx('a-overlay', inline && 'inline')}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={box}
        className="a-dialog"
        role="dialog"
        aria-modal={inline ? undefined : true}
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
      >
        <div className="a-dialog-head">
          <div className="grow">
            <h2 className="a-dialog-title" id={`${id}-t`}>
              {title}
            </h2>
            {description && (
              <div className="a-dialog-desc" id={`${id}-d`}>
                {description}
              </div>
            )}
          </div>
        </div>
        {children && <div className="a-dialog-body">{children}</div>}
        {footer && <div className="a-dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}
