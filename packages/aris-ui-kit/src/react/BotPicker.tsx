/**
 * Bộ chọn một bot: nút gọn (linh vật, tên, mũi tên) mở danh sách có linh vật, tên, vai
 * trò, chia theo phòng ban. Danh sách dài thì có ô tìm (không dấu). Bàn phím: mũi tên
 * lên/xuống, Enter chọn, Esc đóng. Dùng thay dải tab khi lựa chọn là các bot, vì đội còn
 * lớn thêm và tên trần không cho biết bot làm gì.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Mascot } from './basics.js'
import { CheckIcon, ChevronDownIcon, SearchIcon } from './icons.js'
import { useDismiss } from './overlays.js'

export interface BotOption {
  /** Mã lựa chọn (thường là mã bot). */
  id: string
  name: string
  /** Dòng phụ: vai trò hoặc mô tả ngắn. */
  note?: string | undefined
  /** Mã linh vật; bỏ trống thì dùng `icon`. */
  mascot?: string | undefined
  /** Biểu tượng cho lựa chọn không phải bot (ví dụ "Bot trống"). */
  icon?: ReactNode | undefined
  /** Nhãn nhóm (phòng ban); lựa chọn liền nhau cùng nhóm đứng dưới một nhãn. */
  group?: string | undefined
}

/** Bỏ dấu để tìm ("lam" khớp "Lâm"). */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()

/** Lọc theo tên hoặc dòng phụ, không phân biệt dấu. */
export function filterBotOptions(options: readonly BotOption[], query: string): BotOption[] {
  const q = fold(query.trim())
  if (!q) return [...options]
  return options.filter((o) => fold(`${o.name} ${o.note ?? ''}`).includes(q))
}

function Face({ option, size }: { option: BotOption; size: number }) {
  if (option.mascot) return <Mascot id={option.mascot} size={size} />
  return (
    <span className="face" style={{ width: size, height: size }} aria-hidden="true">
      {option.icon}
    </span>
  )
}

export function BotPicker({
  label,
  value,
  options,
  onChange,
  align = 'end',
  searchPlaceholder,
  emptyLabel,
  searchFrom = 7,
}: {
  /** Tên của bộ chọn cho trình đọc màn hình (ví dụ "Chọn bot"). */
  label: string
  value: string
  options: readonly BotOption[]
  onChange: (id: string) => void
  align?: 'start' | 'end' | undefined
  /** Chữ gợi ý ô tìm; cần khi danh sách có ô tìm. */
  searchPlaceholder?: string | undefined
  /** Chữ khi tìm không thấy. */
  emptyLabel?: string | undefined
  /** Từ bao nhiêu lựa chọn thì hiện ô tìm. */
  searchFrom?: number | undefined
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(root, open, close)

  const current = options.find((o) => o.id === value) ?? options[0]
  const shown = useMemo(() => filterBotOptions(options, query), [options, query])
  const withSearch = options.length >= searchFrom

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
  }, [open, options, value, withSearch])

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setCursor((c) => (shown.length ? (c + step + shown.length) % shown.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = shown[cursor]
      if (o) pick(o.id)
    }
  }

  if (!current) return null
  return (
    <span className="a-pop a-bp" ref={root}>
      <button
        type="button"
        className="a-bp-btn"
        aria-label={`${label}: ${current.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Face option={current} size={20} />
        <span className="nm">{current.name}</span>
        <ChevronDownIcon size={14} />
      </button>
      {open && (
        <div className={`a-menu a-bp-menu${align === 'end' ? ' end' : ''}`} onKeyDown={onKey}>
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
                  data-cursor={i === cursor || undefined}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o.id)}
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
      )}
    </span>
  )
}
