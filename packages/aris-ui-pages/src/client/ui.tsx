/** Mảnh nhỏ dùng lại giữa các trang: ô số, linh vật nhỏ, chấm màu, thanh tỉ lệ. */
import { Mascot } from '@aris/ui-kit/react'
import type { CSSProperties, ReactNode } from 'react'

/** Ô nhập số nhỏ canh giữa (ngân sách, giới hạn). */
export function Num({ value, label, width = 64 }: { value: string; label: string; width?: number }) {
  return (
    <input
      className="a-inp a-num"
      defaultValue={value}
      aria-label={label}
      inputMode="decimal"
      style={{ width, height: 30, textAlign: 'center', flex: 'none' }}
    />
  )
}

export function Bot({ id, size = 22 }: { id: string; size?: number }) {
  return <Mascot id={id} size={size} />
}

export function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return <span className="ap-dot" style={{ background: color, width: size, height: size }} />
}

/** Thanh tỉ lệ ngang (0–100). */
export function Track({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="ap-track">
      <span style={{ width: `${pct}%`, background: color }} />
    </span>
  )
}

/** Thẻ có phần đệm (thẻ của kit không đệm để chứa các dòng có vạch). */
export function Box({
  children,
  style,
  className,
}: {
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  return (
    <section className={`a-card ap-pad${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </section>
  )
}

/** Cột trong bố cục nhiều cột co giãn theo canvas (`flex: grow 1 basis`). */
export function Col({
  grow = 1,
  basis = 400,
  children,
}: {
  grow?: number
  basis?: number
  children: ReactNode
}) {
  return (
    <div className="ap-col" style={{ flex: `${grow} 1 ${basis}px` }}>
      {children}
    </div>
  )
}
