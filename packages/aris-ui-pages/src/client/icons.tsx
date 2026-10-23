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
      {id === 'map' && (
        <>
          <ellipse cx={12} cy={16} rx={9} ry={3.5} {...stroke} />
          <circle cx={12} cy={8} r={3} {...stroke} fill={fill} fillOpacity={soft} />
          <circle cx={5.5} cy={15} r={1.6} {...stroke} />
          <circle cx={18.5} cy={15} r={1.6} {...stroke} />
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
      {id === 'kanban' && (
        <>
          <rect x={4} y={4.5} width={4.5} height={15} rx={1.5} {...stroke} fill={fill} fillOpacity={soft} />
          <rect x={9.75} y={4.5} width={4.5} height={10} rx={1.5} {...stroke} />
          <rect x={15.5} y={4.5} width={4.5} height={12.5} rx={1.5} {...stroke} />
        </>
      )}
    </svg>
  )
}
