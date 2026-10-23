/**
 * Điều khiển nhập liệu: công tắc (có câu "bật thì sao"), ô tích, nút chọn đoạn,
 * ô nhập, tab. Theo màn "Ngôn ngữ thiết kế mới" mục 4 và các màn Cài đặt.
 */
import { useRef, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { CheckIcon } from './icons.js'
import { cx } from './basics.js'

/**
 * Vị trí mới khi bấm phím mũi tên / Home / End trong một nhóm chọn một (đi vòng).
 * @returns chỉ số mới, hoặc `undefined` nếu phím không thuộc điều hướng.
 */
export function rovingIndex(current: number, key: string, count: number): number | undefined {
  if (count <= 0) return undefined
  if (key === 'ArrowRight' || key === 'ArrowDown') return (current + 1) % count
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return undefined
}

/** Màu khi bật; mặc định màu nhấn, có thể là màu của bot đang chỉnh. */
const onColor = (color: string | undefined) => (color ? { ['--a-on' as string]: color } : undefined)

export interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean | undefined
  color?: string | undefined
}

/** Công tắc đứng riêng (nhãn chỉ cho trình đọc màn hình). */
export function Switch({ checked, onChange, label, disabled, color }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      className="a-sw"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      style={onColor(color)}
      onClick={() => onChange(!checked)}
    >
      <i />
    </button>
  )
}

/** Dòng công tắc: tiêu đề, câu hệ quả bên dưới, công tắc bên phải; bấm cả dòng để đổi. */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
  color,
}: SwitchProps & { hint?: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      className="a-swrow"
      aria-checked={checked}
      disabled={disabled}
      style={onColor(color)}
      onClick={() => onChange(!checked)}
    >
      <span className="grow">
        <span className="t">{label}</span>
        {hint && <span className="h">{hint}</span>}
      </span>
      <span className="a-sw" aria-hidden="true">
        <i />
      </span>
    </button>
  )
}

/** Ô tích bo tròn cho danh sách chọn nhiều. */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
  color,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: ReactNode
  disabled?: boolean | undefined
  color?: string | undefined
}) {
  return (
    <label className="a-ck" style={onColor(color)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span className="a-ckbox" aria-hidden="true">
        <CheckIcon size={13} />
      </span>
      {label}
    </label>
  )
}

export interface Option<V extends string> {
  value: V
  label: ReactNode
}

/** Nút chọn đoạn (chọn một trong vài lựa chọn ngắn), điều hướng bằng phím mũi tên. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly Option<V>[]
  value: V
  onChange: (next: V) => void
  label: string
}) {
  const root = useRef<HTMLSpanElement>(null)
  const onKey = (e: KeyboardEvent, index: number) => {
    const next = rovingIndex(index, e.key, options.length)
    if (next === undefined) return
    e.preventDefault()
    onChange(options[next]!.value)
    root.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return (
    <span className="a-seg" role="radiogroup" aria-label={label} ref={root}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {o.label}
        </button>
      ))}
    </span>
  )
}

/** Ô nhập một dòng. */
export function TextInput({
  mono,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cx('a-inp', mono && 'mono', className)} {...rest} />
}

/** Nhãn + điều khiển + gợi ý, xếp dọc. */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode
  hint?: ReactNode | undefined
  children: ReactNode
}) {
  return (
    <label className="a-field">
      <span className="l">{label}</span>
      {children}
      {hint && <span className="h">{hint}</span>}
    </label>
  )
}

/** Tab gạch chân; nội dung tab do nơi dùng vẽ theo `value`. */
export function Tabs<V extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly Option<V>[]
  value: V
  onChange: (next: V) => void
  label: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const onKey = (e: KeyboardEvent, index: number) => {
    const next = rovingIndex(index, e.key, tabs.length)
    if (next === undefined) return
    e.preventDefault()
    onChange(tabs[next]!.value)
    root.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
  }
  return (
    <div className="a-tabs" role="tablist" aria-label={label} ref={root}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          className="a-tab"
          aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1}
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
