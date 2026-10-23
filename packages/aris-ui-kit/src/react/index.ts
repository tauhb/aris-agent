/**
 * Bộ thành phần React của aris (`@aris/ui-kit/react`). Gói client của aris đóng
 * gói kèm mã nguồn này; React do Web UI của dsh cung cấp lúc chạy. Mọi thành
 * phần phải nằm trong một gốc có lớp `aris` và trang phải gắn {@link mountKitCss}.
 * @module @aris/ui-kit/react
 */
export { KIT_CSS, mountKitCss } from './css.js'
export * from './icons.js'
export {
  BrandMark,
  Button,
  Card,
  CardRow,
  IconButton,
  Mascot,
  Pill,
  StatusGlyph,
  StatusPill,
  Tag,
  type ButtonProps,
  type IconButtonProps,
} from './basics.js'
export * from './controls.js'
export * from './overlays.js'
export * from './layout.js'
