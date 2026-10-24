/**
 * Bộ chọn dùng chung thay cho `<select>` mặc định của trình duyệt. Mỗi lựa chọn có thể có
 * linh vật (hoặc biểu tượng), tên, dòng mô tả ngắn, nhóm (phòng ban…). Danh sách dài thì có ô
 * tìm (không dấu). Bàn phím: mũi tên lên/xuống, Enter chọn, Esc đóng.
 * - `Select` kiểu `field`: ô rộng như ô nhập, dùng trong biểu mẫu và hộp thoại.
 * - `BotPicker` (kiểu `compact`): nút gọn (linh vật, tên, mũi tên) trên đầu trang.
 * Danh sách vẽ ở `document.body` (vị trí cố định theo nút) nên không bị hộp thoại có thanh cuộn cắt.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Mascot } from './basics.js'
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons.js'

export interface BotOption {
  /** Mã lựa chọn (thường là mã bot). */
  id: string
  name: string
  /** Dòng phụ: vai trò hoặc mô tả ngắn. */
  note?: string | undefined
  /** Mã linh vật; bỏ trống thì dùng `icon`. */
  mascot?: string | undefined
  /** Biểu tượng cho lựa chọn không phải bot (ví dụ "Bot trống", "Để Aris chọn"). */
  icon?: ReactNode | undefined
  /** Nhãn nhóm (phòng ban); lựa chọn liền nhau cùng nhóm đứng dưới một nhãn. */
  group?: string | undefined
  /** Không chọn được (vẫn hiện, mờ). */
  disabled?: boolean | undefined
}
export type SelectOption = BotOption

/** Bỏ dấu để tìm ("lam" khớp "Lâm"). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

/** Lọc theo tên hoặc dòng phụ, không phân biệt dấu. */
export function filterBotOptions(options: readonly BotOption[], query: string): BotOption[] {
  const q = fold(query.trim())
  if (!q) return [...options]
  return options.filter((o) => fold(`${o.name} ${o.note ?? ''} ${o.group ?? ''}`).includes(q))
}

function Face({ option, size }: { option: BotOption; size: number }) {
  if (option.mascot) return <Mascot id={option.mascot} size={size} />
  if (option.icon === undefined) return null
  return (
    <span className="face" style={{ width: size, height: size }} aria-hidden="true">
      {option.icon}
    </span>
  )
}

export interface SelectProps {
  /** Tên của bộ chọn cho trình đọc màn hình (ví dụ "Chọn bot"). */
  label: string
  value: string
  options: readonly BotOption[]
  onChange: (id: string) => void
  /** `field`: ô rộng trong biểu mẫu; `compact`: nút gọn. */
  variant?: 'field' | 'compact' | undefined
  /** Canh danh sách theo mép trái hay phải của nút (kiểu `compact`). */
  align?: 'start' | 'end' | undefined
  /** Chữ khi chưa chọn gì (giá trị không khớp lựa chọn nào). */
  placeholder?: string | undefined
  disabled?: boolean | undefined
  /** Chữ gợi ý ô tìm; cần khi danh sách có ô tìm. */
  searchPlaceholder?: string | undefined
  /** Chữ khi tìm không thấy. */
  emptyLabel?: string | undefined
  /** Từ bao nhiêu lựa chọn thì hiện ô tìm. */
  searchFrom?: number | undefined
  /** Mã phần tử nút (để `<label htmlFor>` trỏ tới). */
  id?: string | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}

const GAP = 6
const MENU_MAX = 360

export function Select({
  label,
  value,
  options,
  onChange,
  variant = 'field',
  align = 'end',
  placeholder,
  disabled,
  searchPlaceholder,
  emptyLabel,
  searchFrom = 8,
  id,
  className,
  style,
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [pos, setPos] = useState<CSSProperties>({})
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])

  const current = options.find((o) => o.id === value) ?? (variant === 'compact' ? options[0] : undefined)
  const shown = useMemo(() => filterBotOptions(options, query), [options, query])
  const withSearch = options.length >= searchFrom

  // Đặt danh sách theo nút: dưới nút, hết chỗ thì lật lên trên.
  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return
    const width = variant === 'field' ? Math.max(r.width, 260) : 300
    const below = window.innerHeight - r.bottom - GAP - 8
    const up = below < Math.min(MENU_MAX, 220) && r.top > below
    const left = variant === 'compact' && align === 'end' ? r.right - width : r.left
    setPos({
      position: 'fixed',
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      width,
      ...(up
        ? {
            top: 'auto',
            bottom: window.innerHeight - r.top + GAP,
            maxHeight: Math.min(MENU_MAX + 60, r.top - GAP - 8),
          }
        : { top: r.bottom + GAP, bottom: 'auto', maxHeight: Math.min(MENU_MAX + 60, below) }),
    })
  }, [variant, align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setCursor(
      Math.max(
        0,
        options.findIndex((o) => o.id === value),
      ),
    )
    // Mở thì đưa con trỏ vào ô tìm (hoặc danh sách) để gõ ngay.
    requestAnimationFrame(() => (withSearch ? search.current : list.current)?.focus())
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (!btn.current?.contains(t) && !menu.current?.contains(t)) close()
    }
    // Trang hoặc hộp thoại cuộn: đặt lại chỗ; cuộn trong danh sách thì thôi.
    const onScroll = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) place()
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
    }
  }, [open, options, value, withSearch, close, place])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const pick = (o: BotOption) => {
    if (o.disabled) return
    onChange(o.id)
    setOpen(false)
    btn.current?.focus()
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setCursor((c) => (shown.length ? (c + step + shown.length) % shown.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = shown[cursor]
      if (o) pick(o)
    } else if (e.key === 'Escape') {
      // Chỉ đóng danh sách, không đóng hộp thoại chứa nó.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      btn.current?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  const field = variant === 'field'
  return (
    <span className={`a-bp${field ? ' a-sel' : ''}${className ? ` ${className}` : ''}`} style={style}>
      <button
        ref={btn}
        id={id}
        type="button"
        className={field ? 'a-sel-btn' : 'a-bp-btn'}
        aria-label={`${label}: ${current?.name ?? placeholder ?? ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {current && <Face option={current} size={field ? 24 : 20} />}
        {field ? (
          <span className="txt">
            <span className={current ? 'nm' : 'nm ph'}>{current?.name ?? placeholder ?? ''}</span>
            {current?.note && <span className="note">{current.note}</span>}
          </span>
        ) : (
          <span className="nm">{current?.name ?? placeholder ?? ''}</span>
        )}
        <ChevronDownIcon size={14} />
      </button>
      {open &&
        createPortal(
          <div className="aris a-sel-layer">
            <div ref={menu} className="a-menu a-bp-menu" style={pos} onKeyDown={onKey}>
              {withSearch && (
                <label className="a-bp-search">
                  <SearchIcon size={14} />
                  <input
                    ref={search}
                    type="search"
                    value={query}
                    placeholder={searchPlaceholder}
                    aria-label={searchPlaceholder ?? label}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setCursor(0)
                    }}
                  />
                </label>
              )}
              <div className="a-bp-list" role="listbox" aria-label={label} tabIndex={-1} ref={list}>
                {shown.length === 0 && <div className="a-bp-empty">{emptyLabel}</div>}
                {shown.map((o, i) => (
                  <div key={o.id} style={{ display: 'contents' }}>
                    {o.group && o.group !== shown[i - 1]?.group && <div className="a-bp-grp">{o.group}</div>}
                    <button
                      type="button"
                      role="option"
                      data-i={i}
                      className="a-bp-opt"
                      aria-selected={o.id === value}
                      aria-disabled={o.disabled || undefined}
                      data-cursor={i === cursor || undefined}
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => pick(o)}
                    >
                      <Face option={o} size={28} />
                      <span className="txt">
                        <span className="nm">{o.name}</span>
                        {o.note && <span className="note">{o.note}</span>}
                      </span>
                      {o.id === value && <CheckIcon size={15} />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}

/** Nút gọn chọn một bot (đầu trang Ký ức, Hồ sơ chủ nhân…). */
export function BotPicker(props: Omit<SelectProps, 'variant'> & { searchFrom?: number | undefined }) {
  return <Select variant="compact" searchFrom={7} {...props} />
}
