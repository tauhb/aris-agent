/** Một cảnh bàn làm việc (bản vẽ `VanPhong2D`): dòng terminal, linh vật ngồi sau bàn có laptop, tên và trạng thái. */
import { Mascot } from '@aris/ui-kit/react'
import type { PageProps } from '../page.js'
import { hhmm, type Desk } from './model.js'

type T = PageProps['t']

/** Màu chấm trạng thái của từng trạng thái. */
export const STATUS_DOT: Record<Desk['status'], string> = {
  working: 'var(--a-accent)',
  waiting: 'var(--a-warn)',
  done: 'var(--a-ok)',
  failed: 'var(--a-danger)',
  idle: 'var(--a-muted)',
}

/** Chữ trong terminal: việc đang làm, đang đợi người dùng, vấp, hay nghỉ từ lúc nào. */
export function termLine(d: Desk, t: T): string {
  const withTask = (head: string) => (d.task ? `${head} · ${d.task}` : head)
  if (d.status === 'working') return d.task || t('of.term.working')
  if (d.status === 'waiting') return withTask(t('of.term.waiting'))
  if (d.status === 'failed') return withTask(t('of.term.failed'))
  return d.since > 0 ? t('of.term.idleSince', { time: hhmm(d.since) }) : t('of.term.idle')
}

/** Bàn và laptop vẽ bằng SVG, màu theo biến của bản vẽ. */
function Table() {
  return (
    <svg className="ap-of-table" viewBox="0 0 220 70" aria-hidden="true">
      <rect x="58" y="2" width="104" height="40" rx="5" className="ap-of-lap" />
      <rect x="64" y="7" width="92" height="30" rx="2" className="ap-of-scr" />
      <path d="M44 44h132l8 8H36Z" className="ap-of-lapb" />
      <rect x="8" y="52" width="204" height="10" rx="3" className="ap-of-top" />
      <rect x="22" y="62" width="8" height="8" className="ap-of-leg" />
      <rect x="190" y="62" width="8" height="8" className="ap-of-leg" />
    </svg>
  )
}

export function DeskCard({
  desk,
  t,
  selected,
  onPick,
}: {
  desk: Desk
  t: T
  selected: boolean
  onPick: () => void
}) {
  const line = termLine(desk, t)
  return (
    <button
      type="button"
      className={`ap-of-desk ${desk.scene}${selected ? ' sel' : ''}`}
      aria-label={t('of.desk', { name: desk.name })}
      aria-pressed={selected}
      title={line}
      onClick={onPick}
    >
      <span className="ap-of-term">
        <span className="ap-of-typ" key={line}>
          {line}
        </span>
      </span>
      <span className="ap-of-stage">
        {desk.scene === 'wait' && (
          <span className="ap-of-bang" aria-hidden="true">
            !
          </span>
        )}
        {desk.scene === 'idle' && (
          <>
            <span className="ap-of-zz z1" aria-hidden="true">
              z
            </span>
            <span className="ap-of-zz z2" aria-hidden="true">
              z
            </span>
          </>
        )}
        <span className="ap-of-bot">
          <Mascot id={desk.mascot} size={104} accessory={desk.accessory} />
        </span>
        <Table />
      </span>
      <span className="ap-of-who">
        <b>{desk.name}</b>
        <span className="a-muted">{desk.role}</span>
        <span className="ap-of-st">
          <i style={{ background: STATUS_DOT[desk.status] }} />
          {t(`of.st.${desk.status}`)}
        </span>
        {desk.model && <span className="ap-of-md ap-of-mono a-muted">{desk.model}</span>}
      </span>
    </button>
  )
}
