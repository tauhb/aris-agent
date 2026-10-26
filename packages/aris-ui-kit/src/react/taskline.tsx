/**
 * "Dòng việc" trong chat (màn "Ngôn ngữ thiết kế mới" mục 7 và màn R3): khi Aris
 * giao việc, mỗi bot nhận việc thành một nhánh có viền màu của bot, các bước bên
 * trong dùng chung ngữ pháp 5 trạng thái; bước cần anh duyệt là một hộp nền cam.
 */
import type { CSSProperties, ReactNode } from 'react'
import { getMascot } from '../mascots.js'
import type { BotStatus } from '../status.js'
import { Mascot, StatusGlyph, cx } from './basics.js'

/** Màu nhánh của một bot: màu khối linh vật, mặc định màu nhấn. */
export function branchColor(mascot: string): string {
  return getMascot(mascot)?.color ?? 'var(--a-accent)'
}

/** Một nhánh việc: linh vật, tên bot, việc được giao, rồi các bước. */
export function TaskBranch({
  mascot,
  accessory,
  name,
  task,
  meta,
  children,
}: {
  mascot: string
  accessory?: string | undefined
  name: ReactNode
  task?: ReactNode | undefined
  /** Chữ phụ hoặc nút ở cuối dòng đầu nhánh. */
  meta?: ReactNode | undefined
  children?: ReactNode | undefined
}) {
  return (
    <div className="a-branch" style={{ ['--a-branch' as string]: branchColor(mascot) } as CSSProperties}>
      <div className="a-branch-head">
        <Mascot id={mascot} size={20} accessory={accessory} />
        <span className="nm">{name}</span>
        {task !== undefined && <span className="task">{task}</span>}
        {meta !== undefined && <span className="meta">{meta}</span>}
      </div>
      {children}
    </div>
  )
}

/** Một bước trong nhánh; bước chưa tới (`idle`) chữ mờ. */
export function BranchStep({
  status,
  label,
  children,
}: {
  status: BotStatus
  label?: string | undefined
  children: ReactNode
}) {
  return (
    <div className={cx('a-step', status)}>
      <StatusGlyph status={status} label={label} />
      {children}
    </div>
  )
}

/** Thanh tiến độ nhỏ theo màu nhánh; `value` từ 0 đến 1. */
export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <span
      className="a-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${pct}%` }} />
    </span>
  )
}

/** Hộp "bot đợi anh gật đầu": tiêu đề có glyph chờ, các nút trả lời bên dưới. */
export function ApprovalBox({ title, children }: { title: ReactNode; children?: ReactNode | undefined }) {
  return (
    <div className="a-approve" role="group">
      <div className="a-step waiting">
        <StatusGlyph status="waiting" />
        {title}
      </div>
      {children && <div className="acts">{children}</div>}
    </div>
  )
}
