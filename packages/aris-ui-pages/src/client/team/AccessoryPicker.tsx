/**
 * Chọn phụ kiện của linh vật trong hồ sơ bot (bản vẽ `PhuKienLinhVat`, khung "Hồ sơ bot"): ảnh lớn của bot đang đeo,
 * tên phụ kiện, và lưới ô "Không đeo" cùng 22 phụ kiện; mỗi ô là chính linh vật của bot đeo thử phụ kiện đó.
 */
import { ACCESSORIES, NO_ACCESSORY, resolveAccessory } from '@aris/ui-kit'
import { Mascot, rovingIndex } from '@aris/ui-kit/react'
import { useRef, type KeyboardEvent } from 'react'
import type { PageProps } from '../page.js'

/** Mọi lựa chọn theo thứ tự trong lưới: không đeo, rồi 22 phụ kiện. */
export const ACCESSORY_CHOICES: readonly string[] = [NO_ACCESSORY, ...ACCESSORIES.map((a) => a.id)]

/** Lựa chọn đang có hiệu lực: bot chưa lưu phụ kiện thì là mặc định của dáng, dáng không có mặc định là không đeo. */
export const chosenAccessory = (mascot: string, value: string | undefined): string =>
  resolveAccessory(mascot, value) ?? NO_ACCESSORY

export function AccessoryPicker({
  t,
  mascot,
  name,
  value,
  onChange,
}: {
  t: PageProps['t']
  mascot: string
  name: string
  /** Phụ kiện đã chọn: mã, `'none'`, hoặc chưa có (theo mặc định của dáng). */
  value: string | undefined
  onChange: (id: string) => void
}) {
  const grid = useRef<HTMLDivElement>(null)
  const current = chosenAccessory(mascot, value)
  const labelOf = (id: string) => (id === NO_ACCESSORY ? t('bot.accNone') : t(`acc.${id}`))
  const onKey = (e: KeyboardEvent, index: number) => {
    const next = rovingIndex(index, e.key, ACCESSORY_CHOICES.length)
    if (next === undefined) return
    e.preventDefault()
    onChange(ACCESSORY_CHOICES[next]!)
    grid.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
  }
  return (
    <div className="ap-acc">
      <div className="ap-acc-now">
        <Mascot id={mascot} size={104} accessory={current} />
        <b>{name}</b>
        <span className="ap-acc-chip">{labelOf(current)}</span>
      </div>
      <div className="ap-acc-main">
        <div className="ap-lb" style={{ paddingBottom: 6, color: 'var(--a-ink)' }}>
          {t('bot.accessory')}
        </div>
        <div role="radiogroup" aria-label={t('bot.accessory')} className="ap-acc-grid" ref={grid}>
          {ACCESSORY_CHOICES.map((id, i) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={id === current}
              aria-label={labelOf(id)}
              title={labelOf(id)}
              tabIndex={id === current ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(e) => onKey(e, i)}
            >
              <Mascot id={mascot} size={40} accessory={id} />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
