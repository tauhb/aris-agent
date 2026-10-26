/**
 * Chọn linh vật gọn: một hàng (linh vật đang chọn luôn có mặt) và nút "Xem thêm" mở hộp thoại
 * với đủ mọi linh vật.
 */
import { MASCOTS, NO_ACCESSORY } from '@aris/ui-kit'
import { Dialog, Mascot, PlusIcon } from '@aris/ui-kit/react'
import { useState } from 'react'
import type { PageProps } from '../page.js'

/** Số linh vật hiện trên một hàng. */
export const ROW = 7

/** Linh vật trên hàng: đủ `ROW`, linh vật đang chọn đứng đầu nếu không nằm sẵn trong hàng. */
export function rowOf(selected: string, ids: readonly string[] = MASCOTS.map((m) => m.id), size = ROW) {
  const head = ids.slice(0, size)
  if (!ids.includes(selected) || head.includes(selected)) return head
  return [selected, ...head.slice(0, size - 1)]
}

function Choice({ id, checked, onPick }: { id: string; checked: boolean; onPick: () => void }) {
  const m = MASCOTS.find((x) => x.id === id)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={m?.shape ?? id}
      title={m ? `${m.shape} · ${m.role}` : id}
      onClick={onPick}
    >
      <Mascot id={id} size={26} accessory={NO_ACCESSORY} />
    </button>
  )
}

export function MascotPicker({
  t,
  value,
  onChange,
}: {
  t: PageProps['t']
  value: string
  onChange: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div role="radiogroup" aria-label={t('bot.mascot')} className="ap-mascot-row">
        {rowOf(value).map((id) => (
          <Choice key={id} id={id} checked={value === id} onPick={() => onChange(id)} />
        ))}
        <button type="button" className="ap-mascot-more" onClick={() => setOpen(true)}>
          <PlusIcon size={14} />
          {t('bot.mascotMore', { n: MASCOTS.length })}
        </button>
      </div>
      <Dialog
        open={open}
        width={560}
        title={t('bot.mascotAll')}
        description={t('bot.mascotAllHint', { n: MASCOTS.length })}
        closeLabel={t('cb.close')}
        onClose={() => setOpen(false)}
      >
        <div role="radiogroup" aria-label={t('bot.mascotAll')} className="ap-mascot-grid">
          {MASCOTS.map((m) => (
            <Choice
              key={m.id}
              id={m.id}
              checked={value === m.id}
              onPick={() => {
                onChange(m.id)
                setOpen(false)
              }}
            />
          ))}
        </div>
      </Dialog>
    </>
  )
}
