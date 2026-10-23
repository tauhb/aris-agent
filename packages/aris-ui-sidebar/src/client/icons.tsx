import { STATUSES, getMascot, type BotStatus } from '@aris/ui-kit'

/** Linh vật của bot từ @aris/ui-kit, chèn bằng SVG gốc của thư viện. */
export function Mascot({ id, size }: { id: string; size: number }) {
  const body = getMascot(id)?.body ?? ''
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  )
}

/** Glyph trạng thái 16×16 theo ngữ pháp 5 trạng thái. */
export function StatusGlyph({ status }: { status: BotStatus }) {
  const s = STATUSES[status]
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      role="img"
      aria-label={s.label}
      style={{
        color: `var(--a-${s.color})`,
        flex: 'none',
        ['--line' as string]: 'var(--a-line)',
        ['--panel' as string]: 'var(--a-panel)',
      }}
      dangerouslySetInnerHTML={{ __html: s.body }}
    />
  )
}

/** Dấu aris ở góc trên: khối tròn màu mực với hai mắt. */
export function BrandMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M50 8C76 8 92 24 92 50C92 76 76 92 50 92C24 92 8 76 8 50C8 24 24 8 50 8Z"
        fill="var(--a-ink)"
      />
      <path d="M52 36L48 50M65 34L61 48" stroke="var(--a-panel)" strokeWidth={9} strokeLinecap="round" />
    </svg>
  )
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const }

export function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 12a8.2 8.2 0 0 1-11.9 7.3L3.5 20.5l1.2-4.7A8.2 8.2 0 1 1 20.5 12z"
        fill="currentColor"
        fillOpacity={active ? 0.2 : 0}
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      <path d="M8.5 11h7M8.5 14h4" {...line} />
    </svg>
  )
}

export function PlusIcon({ size, width = 2.2 }: { size: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" {...line} strokeWidth={width} />
    </svg>
  )
}

export function PanelIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden="true">
      <rect x={3.5} y={4.5} width={17} height={15} rx={3.5} {...line} />
      <path d="M9 4.5v15" {...line} />
    </svg>
  )
}

export function WaitingIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  )
}
