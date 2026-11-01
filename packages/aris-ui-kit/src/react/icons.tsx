/**
 * Bộ icon riêng của aris: lưới 24, nét 1,75, đầu tròn (màn "Ngôn ngữ thiết kế
 * mới", mục 2). Icon chỉ để nhìn (`aria-hidden`); nhãn đặt ở nút chứa nó.
 */
import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  /** Độ dày nét, mặc định 1,75. */
  width?: number
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function Icon({ size = 18, children }: { size?: number | undefined; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {children}
    </svg>
  )
}

export function PlusIcon({ size, width = 2.2 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M12 5v14M5 12h14" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

export function PanelIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x={3.5} y={4.5} width={17} height={15} rx={3.5} {...stroke} strokeWidth={width} />
      <path d="M9 4.5v15" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Dự án: thư mục làm việc. */
export function ProjectIcon({ size = 16, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"
        {...stroke}
        strokeWidth={width}
      />
    </Icon>
  )
}

/** Việc chờ duyệt: nửa vòng đầy, cùng hình với trạng thái "Chờ anh". */
export function WaitingIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx={8} cy={8} r={6} fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 12, width = 2.4 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M6 9l6 6 6-6" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Soạn mới: tờ giấy và bút. */
export function ComposeIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M12 4.5H7a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-5"
        {...stroke}
        strokeWidth={width}
      />
      <path d="M17.5 3.5a2.1 2.1 0 0 1 3 3L13 14l-4 1 1-4z" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

export function CheckIcon({ size = 14, width = 2.4 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M5 12.5l4.5 4.5L19 7.5" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

export function CloseIcon({ size, width = 2 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M6 6l12 12M18 6L6 18" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

export function SearchIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx={11} cy={11} r={6.5} {...stroke} strokeWidth={width} />
      <path d="M16 16l4 4" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

export function GearIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx={12} cy={12} r={3} {...stroke} strokeWidth={width} />
      <path
        d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
        {...stroke}
        strokeWidth={width}
      />
    </Icon>
  )
}

export function PinIcon({ size = 13, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Vương miện: trưởng nhóm của phòng ban. */
export function CrownIcon({ size = 13, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M4 8l4 4 4-6 4 6 4-4-1.5 10h-13z" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Chuông của bảng Hoạt động (giao diện GĐ9). */
export function BellIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <path
        d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"
        {...stroke}
        strokeWidth={width}
      />
    </Icon>
  )
}

/** Màn hình máy của bot (giao diện GĐ9). */
export function ScreenIcon({ size, width = 1.75 }: IconProps) {
  return (
    <Icon size={size}>
      <rect x="3" y="4.5" width="18" height="12" rx="2.5" {...stroke} strokeWidth={width} />
      <path d="M9 20h6M12 16.5V20" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Mũi tên sang phải ở cuối dòng mở được (giao diện GĐ9). */
export function ChevronRightIcon({ size = 14, width = 2 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M9.5 6l6 6-6 6" {...stroke} strokeWidth={width} />
    </Icon>
  )
}

/** Mũi tên quay lại (giao diện GĐ9). */
export function ChevronLeftIcon({ size = 14, width = 2 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M14.5 6l-6 6 6 6" {...stroke} strokeWidth={width} />
    </Icon>
  )
}
