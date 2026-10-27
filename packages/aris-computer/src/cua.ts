/**
 * Bộ nối lõi thật: `@trycua/cua-driver` 0.37.0 (MIT; tệp nhị phân Rust theo máy đi kèm gói phụ của npm). Phần duy nhất
 * của aris gọi thư viện này.
 *
 * Chạy trong tiến trình (`embedded`), không cần cài CuaDriver.app: macOS tính quyền Trợ năng và Ghi màn hình cho chính
 * tiến trình aris (daemon node). Thao tác gửi ở nền (`Background`): lõi không kích hoạt hay đưa cửa sổ lên trước, không
 * giành chuột; ứng dụng không nhận được sự kiện nền thì lõi báo lỗi, aris không tự chuyển sang tiền cảnh.
 *
 * Toạ độ `x`, `y` của bấm, cuộn, kéo là điểm ảnh của ảnh chụp cửa sổ do `getWindowState` trả (lõi tự đổi ra màn hình).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { screenToShot } from './coords.js'
import {
  ComputerError,
  type App,
  type ComputerDriver,
  type Direction,
  type El,
  type Permissions,
  type Point,
  type Pos,
  type Snapshot,
  type Win,
  type WinRef,
} from './types.js'

const run = promisify(execFile)
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'lỗi không rõ'

type Cua = typeof import('@trycua/cua-driver')
type Native = ReturnType<Cua['CuaDriver']['create']>

/** Kết quả chung của các thao tác (chữ và cờ lỗi). */
interface ToolResultLike {
  text: string
  isError: boolean
  errorCode?: string | undefined
  structuredJson?: string | undefined
}

const resultLine = (
  r: ToolResultLike | { summary?: string | undefined; hint?: string | undefined },
): string => {
  if ('isError' in r) {
    if (r.isError)
      throw new ComputerError(`Lõi từ chối: ${r.text.trim().split('\n')[0] || r.errorCode || 'lỗi'}`)
    return r.text.trim().split('\n')[0] || 'xong'
  }
  return r.summary?.trim() || 'xong'
}

/** Thời gian rảnh của người dùng (giây) trên macOS: `HIDIdleTime` (nano giây) của `IOHIDSystem`. */
export function parseIdle(ioreg: string): number | undefined {
  const m = /"HIDIdleTime"\s*=\s*(\d+)/.exec(ioreg)
  return m ? Number(m[1]) / 1e9 : undefined
}

/** Màn hình khoá trên macOS: `CGSSessionScreenIsLocked` trong phiên của người dùng. */
export function parseLocked(ioreg: string): boolean | undefined {
  if (!/IOConsoleUsers/.test(ioreg)) return undefined
  return /"CGSSessionScreenIsLocked"\s*=\s*Yes/.test(ioreg)
}

class CuaDriverAdapter implements ComputerDriver {
  readonly name = 'cua-driver 0.37.0'
  readonly background = true

  constructor(
    private readonly cua: Cua,
    private readonly d: Native,
  ) {}

  private target(w: WinRef) {
    return new this.cua.ActionTarget.Window({ pid: w.pid, windowId: BigInt(w.windowId) })
  }

  async available() {
    return this.d.isAvailable() ? { ok: true } : { ok: false, reason: 'lõi cua-driver không sẵn sàng' }
  }

  async permissions(): Promise<Permissions> {
    const r = (await this.d.callTool('check_permissions', '{}')) as ToolResultLike
    const flags: Record<string, unknown> = r.structuredJson
      ? (JSON.parse(r.structuredJson) as Record<string, unknown>)
      : {}
    const pick = (re: RegExp) => {
      const k = Object.keys(flags).find((x) => re.test(x) && typeof flags[x] === 'boolean')
      return k ? (flags[k] as boolean) : undefined
    }
    return {
      accessibility: pick(/accessib/i),
      screenRecording: pick(/screen/i),
      detail: r.text.trim(),
    }
  }

  async apps(): Promise<App[]> {
    const r = await this.d.listApps({})
    return r.apps.map((a) => ({
      pid: a.pid,
      name: a.name,
      ...(a.bundleId ? { bundleId: a.bundleId } : {}),
      running: a.running,
      active: a.active,
    }))
  }

  async windows(pid?: number): Promise<Win[]> {
    const r = await this.d.listWindows(pid === undefined ? {} : { pid })
    return r.windows.map((w) => ({
      pid: w.pid ?? 0,
      windowId: w.windowId.toString(),
      app: w.appName,
      title: w.title,
      bounds: { x: w.bounds.x, y: w.bounds.y, width: w.bounds.width, height: w.bounds.height },
      onScreen: w.isOnScreen,
      ...(w.minimized !== undefined ? { minimized: w.minimized } : {}),
    }))
  }

  async snapshot(
    w: WinRef,
    o: {
      screenshot: boolean
      tree: boolean
      maxEdge: number
      maxElements: number
      query?: string | undefined
    },
  ): Promise<Snapshot> {
    const r = await this.d.getWindowState({
      pid: w.pid,
      windowId: BigInt(w.windowId),
      includeScreenshot: o.screenshot,
      includeAccessibilityTree: o.tree,
      treeFormat: 'elements',
      maxElements: o.maxElements,
      maxImageDimension: o.maxEdge,
      ...(o.query ? { query: o.query } : {}),
    })
    const bounds = r.windowBounds ?? { x: 0, y: 0, width: 0, height: 0 }
    const img = r.images[0]
    const image =
      img && r.screenshotWidth && r.screenshotHeight
        ? {
            png: new Uint8Array(Buffer.from(img.dataBase64, 'base64')),
            width: r.screenshotWidth,
            height: r.screenshotHeight,
          }
        : undefined
    const elements: El[] = (r.elements ?? [])
      .filter((e) => e.elementToken)
      .map((e) => {
        const frame = e.frame
          ? { x: e.frame.x, y: e.frame.y, width: e.frame.w, height: e.frame.h }
          : undefined
        return {
          token: e.elementToken!,
          index: Number(e.elementIndex),
          role: e.role,
          ...(e.label ? { label: e.label } : {}),
          ...(e.value ? { value: e.value } : {}),
          ...(e.enabled !== undefined ? { enabled: e.enabled } : {}),
          ...(frame ? { frame } : {}),
          ...(frame && image && bounds.width ? { box: screenToShot(frame, bounds, image) } : {}),
        }
      })
    return {
      pid: r.pid,
      windowId: r.windowId.toString(),
      app: r.appName ?? '',
      title: r.windowTitle ?? '',
      bounds,
      ...(r.snapshotId ? { snapshotId: r.snapshotId } : {}),
      tree: r.treeMarkdown ?? '',
      elements,
      truncated: r.truncated === true,
      ...(image ? { image } : {}),
    }
  }

  async click(w: WinRef, p: Pos, o: { button: 'left' | 'right'; count: number }) {
    const position =
      'token' in p
        ? new this.cua.ClickPosition.Element({ elementToken: p.token })
        : new this.cua.ClickPosition.Coordinates({ x: p.x, y: p.y })
    try {
      const r = await this.d.click({
        target: this.target(w),
        position,
        deliveryMode: this.cua.InputDeliveryMode.Background,
        button: o.button === 'right' ? this.cua.ClickButton.Right : this.cua.ClickButton.Left,
        count: o.count,
      })
      return resultLine(r)
    } catch (e) {
      throw new ComputerError(`Lõi từ chối bấm: ${errText(e)}`)
    }
  }

  async type(w: WinRef, text: string) {
    return resultLine((await this.d.typeText({ text, target: this.target(w) })) as ToolResultLike)
  }

  async keys(w: WinRef, keys: string[]) {
    return resultLine((await this.d.hotkey({ keys, target: this.target(w) })) as ToolResultLike)
  }

  async scroll(w: WinRef, at: Point | undefined, dir: Direction, amount: number) {
    const d = this.cua.ScrollDirection
    const direction = dir === 'up' ? d.Up : dir === 'down' ? d.Down : dir === 'left' ? d.Left : d.Right
    return resultLine(
      (await this.d.scroll({
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        direction,
        amount: BigInt(amount),
        target: this.target(w),
      })) as ToolResultLike,
    )
  }

  async drag(w: WinRef, from: Point, to: Point) {
    return resultLine(
      (await this.d.drag({
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        target: this.target(w),
      })) as ToolResultLike,
    )
  }

  async launch(app: { name?: string | undefined; bundleId?: string | undefined }) {
    const args = app.bundleId ? { bundle_id: app.bundleId } : { name: app.name ?? '' }
    return resultLine((await this.d.callTool('launch_app', JSON.stringify(args))) as ToolResultLike)
  }

  async idleSeconds() {
    if (process.platform !== 'darwin') return undefined
    const { stdout } = await run('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { timeout: 3000 })
    return parseIdle(stdout)
  }

  async screenLocked() {
    if (process.platform !== 'darwin') return undefined
    const { stdout } = await run('/usr/sbin/ioreg', ['-n', 'Root', '-d', '1'], { timeout: 3000 })
    return parseLocked(stdout)
  }

  async close() {
    await this.d.shutdown().catch(() => undefined)
  }
}

/**
 * Nạp lõi thật. Không có gói (máy khác hệ điều hành, cài thiếu) hay tạo lõi lỗi thì trả lý do, không ném: aris vẫn
 * chạy, công cụ báo "chưa có lõi".
 */
export async function loadCua(): Promise<{ driver: ComputerDriver } | { error: string }> {
  try {
    const cua = (await import('@trycua/cua-driver')) as Cua
    const d = cua.CuaDriver.create({ embedded: true, claudeCodeCompatibility: false })
    if (!d.isAvailable()) return { error: 'cua-driver không sẵn sàng trên máy này' }
    return { driver: new CuaDriverAdapter(cua, d) }
  } catch (e) {
    return { error: `không nạp được cua-driver: ${errText(e)}` }
  }
}
