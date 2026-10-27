/**
 * Giao diện chung giữa aris và lõi điều khiển máy (GĐ8.3). Lớp công cụ và lớp an toàn chỉ biết các kiểu ở đây; lõi
 * thật (cua-driver) nằm trọn trong `cua.ts`, nên đổi lõi sau này không phải sửa phần còn lại và kiểm thử dùng bản giả.
 *
 * Toạ độ: mọi `x`, `y` mà bot thấy và gửi là **điểm ảnh của ảnh chụp cửa sổ** lõi trả về (gốc ở góc trên trái cửa sổ).
 * `frame` của phần tử theo toạ độ màn hình (điểm, không phải điểm ảnh Retina); `box` là khung đó trên ảnh chụp.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** Một ứng dụng đang chạy hay đã cài. */
export interface App {
  pid: number
  name: string
  bundleId?: string | undefined
  running: boolean
  /** Ứng dụng đang ở tiền cảnh. */
  active: boolean
}

/** Cửa sổ: mã cửa sổ của lõi là số lớn, giữ dạng chuỗi để không mất chữ số. */
export interface Win {
  pid: number
  windowId: string
  app: string
  title: string
  /** Toạ độ màn hình (điểm). */
  bounds: Rect
  onScreen: boolean
  minimized?: boolean | undefined
}

export interface WinRef {
  pid: number
  windowId: string
}

/** Một phần tử giao diện từ cây Trợ năng. */
export interface El {
  /** Mã để bấm (`<snapshot>:<số>`), hết hạn khi chụp lại cửa sổ đó. */
  token: string
  index: number
  role: string
  label?: string | undefined
  value?: string | undefined
  enabled?: boolean | undefined
  /** Khung theo toạ độ màn hình (điểm). */
  frame?: Rect | undefined
  /** Khung trên ảnh chụp (điểm ảnh); lõi không trả thì tính từ `frame`. */
  box?: Rect | undefined
}

/** Ảnh chụp và cây Trợ năng của một cửa sổ. */
export interface Snapshot extends WinRef {
  app: string
  bundleId?: string | undefined
  title: string
  bounds: Rect
  snapshotId?: string | undefined
  /** Cây rút gọn dạng chữ (mỗi phần tử bấm được có `[số]`). */
  tree: string
  elements: El[]
  truncated: boolean
  image?: { png: Uint8Array; width: number; height: number } | undefined
}

/** Chỗ bấm: theo mã phần tử (ưu tiên) hay theo điểm ảnh của ảnh chụp. */
export type Pos = Point | { token: string }

export type Direction = 'up' | 'down' | 'left' | 'right'

/** Tình trạng quyền của macOS (không biết thì `undefined`). */
export interface Permissions {
  accessibility?: boolean | undefined
  screenRecording?: boolean | undefined
  /** Chữ lõi trả về, để in khi kiểm tra. */
  detail: string
}

export interface ComputerDriver {
  readonly name: string
  /** Lõi gửi sự kiện ở nền (không giành chuột của người dùng). */
  readonly background: boolean
  available(): Promise<{ ok: boolean; reason?: string | undefined }>
  permissions(): Promise<Permissions>
  apps(): Promise<App[]>
  windows(pid?: number): Promise<Win[]>
  snapshot(
    w: WinRef,
    o: {
      screenshot: boolean
      tree: boolean
      maxEdge: number
      maxElements: number
      query?: string | undefined
    },
  ): Promise<Snapshot>
  /** Mỗi thao tác trả một dòng mô tả kết quả của lõi. */
  click(w: WinRef, p: Pos, o: { button: 'left' | 'right'; count: number }): Promise<string>
  type(w: WinRef, text: string): Promise<string>
  /** Tổ hợp phím, ví dụ `['cmd', 's']`. */
  keys(w: WinRef, keys: string[]): Promise<string>
  scroll(w: WinRef, at: Point | undefined, dir: Direction, amount: number): Promise<string>
  drag(w: WinRef, from: Point, to: Point): Promise<string>
  launch(app: { name?: string | undefined; bundleId?: string | undefined }): Promise<string>
  /** Số giây kể từ lần cuối người dùng động chuột hay phím; không đọc được thì `undefined`. */
  idleSeconds(): Promise<number | undefined>
  /** Màn hình đang khoá; không đọc được thì `undefined`. */
  screenLocked(): Promise<boolean | undefined>
  close(): Promise<void>
}

/** Lỗi rõ ràng cho bot và người dùng (thiếu lõi, thiếu quyền, chạm trần…). */
export class ComputerError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unavailable'
      | 'permission'
      | 'blocked'
      | 'scope'
      | 'cap'
      | 'busy'
      | 'paused'
      | 'stale'
      | 'bad-input'
      | 'driver' = 'driver',
  ) {
    super(message)
    this.name = 'ComputerError'
  }
}
