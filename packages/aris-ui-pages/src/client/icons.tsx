/**
 * Icon mục thanh bên của các trang aris (màn "Ngôn ngữ thiết kế mới" mục 2): rỗng
 * khi nghỉ, tô nhẹ màu nhấn khi đang mở.
 */
import type { RouteId } from './routes.js'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function NavIcon({ id, size, active }: { id: RouteId; size: number; active: boolean }) {
  const fill = active ? 'currentColor' : 'none'
  const soft = active ? 0.2 : 0
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {id === 'office' && (
        <>
          <rect x={3} y={4} width={18} height={16} rx={2} {...stroke} fill={fill} fillOpacity={soft} />
          <path d="M3 10h18M9 10v10" {...stroke} />
        </>
      )}
      {id === 'brain' && (
        <>
          <path
            d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"
            {...stroke}
            fill={fill}
            fillOpacity={soft}
          />
          <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" {...stroke} />
        </>
      )}
      {id === 'routine' && (
        <>
          <circle cx={12} cy={12} r={8} {...stroke} fill={fill} fillOpacity={soft} />
          <path d="M12 7.5V12l3 2" {...stroke} />
        </>
      )}
      {id === 'learn' && (
        <>
          <path d="M12 3l9 5-9 5-9-5z" {...stroke} fill={fill} fillOpacity={soft} />
          <path d="M7 10.5V16c3 2 7 2 10 0v-5.5" {...stroke} />
        </>
      )}
    </svg>
  )
}
