/**
 * Phần chạy của bot điều khiển máy (GĐ8.3): chọn cửa sổ, nhớ ảnh chụp gần nhất của mỗi cửa sổ trong phiên, tra bối
 * cảnh một thao tác cho lớp duyệt (ứng dụng đích, phần tử dưới chỗ bấm), rồi làm thao tác với các rào:
 * - một bot một lúc điều khiển máy (phiên khác xếp hàng);
 * - trần mỗi lượt: 40 ảnh chụp, 150 thao tác;
 * - người dùng "Cầm lái" thì bot chờ tới khi "Trả lại";
 * - người dùng vừa động chuột hay phím (2 giây) thì bot tạm dừng: lõi tiền cảnh thì luôn, lõi nền thì khi người dùng
 *   đang ở đúng ứng dụng bot đang làm;
 * - dừng khẩn cấp của aris;
 * - chặn cứng xét lại ngay trước khi làm (màn hình có thể đã đổi từ lúc duyệt).
 *
 * Không gọi thẳng thư viện của lõi: mọi thứ qua `ComputerDriver`, kiểm thử dùng bản giả.
 */
import { center, elementAt, insideImage } from './coords.js'
import { comboKeys, comboText, parseCombo, type Combo } from './keys.js'
import { hardVerdict, TOOL_ACTION, type Action, type ActContext } from './policy.js'
import {
  ComputerError,
  type App,
  type ComputerDriver,
  type Direction,
  type El,
  type Point,
  type Rect,
  type Snapshot,
  type Win,
  type WinRef,
} from './types.js'

export const LIMITS = {
  /** Ảnh chụp mỗi lượt. */
  shots: 40,
  /** Thao tác mỗi lượt. */
  actions: 150,
  /** Cạnh dài của ảnh chụp đưa cho bot (điểm ảnh). */
  maxEdge: 1280,
  /** Phần tử tối đa mỗi lần đọc cây Trợ năng. */
  maxElements: 300,
  /** Người dùng động chuột, phím trong chừng này giây thì bot tạm dừng. */
  idleSec: 2,
  /** Chờ người dùng thôi dùng máy tối đa chừng này rồi báo lỗi. */
  idleWaitMs: 60_000,
  /** Chờ người dùng trả lại quyền (Cầm lái) tối đa chừng này. */
  pauseWaitMs: 30 * 60_000,
  /** Chờ bot khác dùng xong máy tối đa chừng này. */
  queueWaitMs: 10 * 60_000,
  /** Bot giữ máy mà không thao tác quá chừng này thì nhả. */
  lockIdleMs: 2 * 60_000,
} as const

export interface RuntimeDeps {
  driver: () => ComputerDriver | undefined
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** aris đang dừng khẩn cấp. */
  stopped?: () => boolean
  limits?: Partial<typeof LIMITS>
}

interface SessionState {
  shots: number
  actions: number
  /** Ảnh chụp gần nhất theo cửa sổ (`pid:windowId`). */
  snaps: Map<string, Snapshot>
  /** Cửa sổ bot làm gần nhất. */
  last?: string | undefined
  /** Phần tử bấm gần nhất theo cửa sổ (đoán chỗ con trỏ gõ). */
  focus: Map<string, El>
}

/** Bối cảnh một lời gọi, cho lớp duyệt: thao tác gì, ở đâu, trên ảnh nào, đánh dấu chỗ nào. */
export interface Inspected extends ActContext {
  /** Một dòng tiếng Việt mô tả việc sắp làm (hiện trong hộp duyệt). */
  describe: string
  win?: Snapshot | undefined
  /** Chỗ đánh dấu trên ảnh chụp (điểm ảnh). */
  mark?: Rect | Point | undefined
}

export interface RunResult {
  text: string
  image?: { png: Uint8Array; width: number; height: number } | undefined
}

const winKey = (w: WinRef) => `${w.pid}:${w.windowId}`

/** `cua_so` bot gửi: `pid:windowId`. */
export function parseWin(v: unknown): WinRef | undefined {
  if (typeof v !== 'string') return undefined
  const m = /^\s*(\d+):(\d+)\s*$/.exec(v)
  return m ? { pid: Number(m[1]), windowId: m[2]! } : undefined
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.round(v)
    : typeof v === 'string' && v.trim() && Number.isFinite(Number(v))
      ? Math.round(Number(v))
      : undefined
const str = (v: unknown) => (typeof v === 'string' ? v : '')
/** Chữ trong ngoặc kép, một dòng (xuống dòng thành ↵), cắt ở 60 ký tự. */
const quote = (s: string | undefined) => {
  const t = (s ?? '').replace(/\r?\n/g, '↵')
  return t ? `"${t.length > 60 ? `${t.slice(0, 60)}…` : t}"` : ''
}
const elText = (e: El | undefined) => (e ? `${e.role}${e.label ? ` ${quote(e.label)}` : ''}` : '')

const DIRS: Record<string, Direction> = {
  len: 'up',
  up: 'up',
  xuong: 'down',
  xuống: 'down',
  down: 'down',
  trai: 'left',
  trái: 'left',
  left: 'left',
  phai: 'right',
  phải: 'right',
  right: 'right',
}

const sleepReal = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ComputerError('Đã huỷ.', 'paused'))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(new ComputerError('Đã huỷ.', 'paused'))
      },
      { once: true },
    )
  })

export class ComputerRuntime {
  private readonly sessions = new Map<string, SessionState>()
  private owner: { session: string; bot: string; at: number } | undefined
  private readonly paused = new Set<string>()
  private readonly now: () => number
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  readonly limits: typeof LIMITS

  constructor(private readonly d: RuntimeDeps) {
    this.now = d.now ?? Date.now
    this.sleep = d.sleep ?? sleepReal
    this.limits = { ...LIMITS, ...d.limits }
  }

  private state(sessionId: string): SessionState {
    let s = this.sessions.get(sessionId)
    if (!s) {
      s = { shots: 0, actions: 0, snaps: new Map(), focus: new Map() }
      this.sessions.set(sessionId, s)
    }
    return s
  }

  private driver(): ComputerDriver {
    const d = this.d.driver()
    if (!d)
      throw new ComputerError(
        'Chưa có lõi điều khiển máy (cua-driver) trên máy này. Chạy `pnpm aris:cli computer doctor` để xem cách cài.',
        'unavailable',
      )
    return d
  }

  // ======================================================================================
  // Lượt, khoá, cầm lái
  // ======================================================================================

  /** Lượt mới của phiên: đếm lại trần. */
  turnStart(sessionId: string) {
    const s = this.sessions.get(sessionId)
    if (s) {
      s.shots = 0
      s.actions = 0
    }
  }

  /** Lượt xong: nhả máy cho bot khác. */
  turnEnd(sessionId: string) {
    if (this.owner?.session === sessionId) this.owner = undefined
  }

  /** Phiên xoá hay đóng: quên mọi thứ của nó. */
  forget(sessionId: string) {
    this.turnEnd(sessionId)
    this.sessions.delete(sessionId)
    this.paused.delete(sessionId)
  }

  /** Ai đang điều khiển máy. */
  holder(): { session: string; bot: string } | undefined {
    if (this.owner && this.now() - this.owner.at > this.limits.lockIdleMs) this.owner = undefined
    return this.owner ? { session: this.owner.session, bot: this.owner.bot } : undefined
  }

  /** Người dùng "Cầm lái": bot của phiên chờ tới khi "Trả lại". */
  pause(sessionId: string) {
    this.paused.add(sessionId)
  }

  resume(sessionId: string) {
    this.paused.delete(sessionId)
  }

  isPaused(sessionId: string) {
    return this.paused.has(sessionId)
  }

  private async acquire(sessionId: string, bot: string, signal?: AbortSignal) {
    const until = this.now() + this.limits.queueWaitMs
    for (;;) {
      const h = this.holder()
      if (!h || h.session === sessionId) {
        this.owner = { session: sessionId, bot, at: this.now() }
        return
      }
      if (this.now() >= until)
        throw new ComputerError(`Bot ${h.bot} đang điều khiển máy; đã chờ quá lâu. Thử lại sau.`, 'busy')
      await this.sleep(1000, signal)
    }
  }

  private async waitResume(sessionId: string, signal?: AbortSignal) {
    const until = this.now() + this.limits.pauseWaitMs
    while (this.paused.has(sessionId)) {
      if (this.now() >= until)
        throw new ComputerError('Người dùng đang cầm lái và chưa trả lại; dừng việc này.', 'paused')
      await this.sleep(1000, signal)
    }
  }

  /** Người dùng đang dùng máy (vừa động chuột, phím): chờ họ ngừng. */
  private async waitIdle(app: App | undefined, signal?: AbortSignal) {
    const drv = this.driver()
    const until = this.now() + this.limits.idleWaitMs
    for (;;) {
      const idle = await drv.idleSeconds().catch(() => undefined)
      if (idle === undefined || idle >= this.limits.idleSec) return
      // Lõi chạy nền chỉ nhường khi người dùng ở đúng ứng dụng bot đang làm.
      if (drv.background && app && !app.active) return
      if (this.now() >= until)
        throw new ComputerError(
          'Người dùng đang dùng máy; bot tạm dừng để không giành chuột. Thử lại sau ít phút.',
          'paused',
        )
      await this.sleep(1000, signal)
    }
  }

  private gate(sessionId: string, kind: 'shot' | 'act' | 'look') {
    if (this.d.stopped?.())
      throw new ComputerError('aris đang dừng khẩn cấp: không điều khiển máy.', 'paused')
    const s = this.state(sessionId)
    if (kind === 'shot' && s.shots >= this.limits.shots)
      throw new ComputerError(
        `Đã chụp ${this.limits.shots} ảnh trong lượt này (trần). Dừng lại, báo người dùng việc đã làm và hỏi có làm tiếp không.`,
        'cap',
      )
    if (kind === 'act' && s.actions >= this.limits.actions)
      throw new ComputerError(
        `Đã làm ${this.limits.actions} thao tác trong lượt này (trần). Dừng lại, báo người dùng việc đã làm và hỏi có làm tiếp không.`,
        'cap',
      )
  }

  // ======================================================================================
  // Cửa sổ, ảnh chụp
  // ======================================================================================

  private async appOf(pid: number): Promise<App | undefined> {
    return (await this.driver().apps()).find((a) => a.pid === pid)
  }

  /** Tìm ứng dụng theo tên hay bundle id (đúng tên trước, rồi chứa chuỗi). */
  private async findApp(name: string): Promise<App | undefined> {
    const q = name.trim().toLowerCase()
    const apps = (await this.driver().apps()).filter((a) => a.running)
    return (
      apps.find((a) => a.bundleId?.toLowerCase() === q || a.name.toLowerCase() === q) ??
      apps.find((a) => a.name.toLowerCase().includes(q))
    )
  }

  /** Cửa sổ chính của ứng dụng: cửa sổ đang hiện đầu tiên. */
  private async mainWindow(pid: number): Promise<Win | undefined> {
    const wins = await this.driver().windows(pid)
    return wins.find((w) => w.onScreen && !w.minimized) ?? wins[0]
  }

  /**
   * Cửa sổ của lời gọi: `cua_so` nếu có; không thì ứng dụng `ung_dung`; không thì cửa sổ bot làm gần nhất; không thì
   * cửa sổ của ứng dụng đang ở tiền cảnh.
   */
  private async resolveWin(sessionId: string, args: Record<string, unknown>): Promise<WinRef> {
    const explicit = parseWin(args.cua_so)
    if (explicit) return explicit
    if (args.cua_so !== undefined && args.cua_so !== '')
      throw new ComputerError(
        '`cua_so` phải có dạng pid:mã_cửa_sổ, lấy từ kết quả man_hinh_xem.',
        'bad-input',
      )
    const appName = str(args.ung_dung)
    if (appName) {
      const app = await this.findApp(appName)
      if (!app)
        throw new ComputerError(
          `Không thấy ứng dụng "${appName}" đang chạy. Mở bằng ung_dung_mo trước.`,
          'bad-input',
        )
      const w = await this.mainWindow(app.pid)
      if (!w) throw new ComputerError(`${app.name} chưa có cửa sổ nào.`, 'bad-input')
      return w
    }
    const last = this.state(sessionId).last
    if (last) return parseWin(last)!
    const front = (await this.driver().apps()).find((a) => a.active)
    const w = front ? await this.mainWindow(front.pid) : undefined
    if (!w)
      throw new ComputerError('Không xác định được cửa sổ: gọi man_hinh_xem với ung_dung trước.', 'bad-input')
    return w
  }

  private cached(sessionId: string, w: WinRef): Snapshot | undefined {
    return this.state(sessionId).snaps.get(winKey(w))
  }

  /** Phần tử theo mã trong ảnh chụp đã nhớ của phiên. */
  private elementByToken(sessionId: string, token: string): { snap: Snapshot; el: El } | undefined {
    for (const snap of this.state(sessionId).snaps.values()) {
      const el = snap.elements.find((e) => e.token === token)
      if (el) return { snap, el }
    }
    return undefined
  }

  private async take(
    sessionId: string,
    w: WinRef,
    o: { screenshot: boolean; query?: string | undefined },
  ): Promise<Snapshot> {
    // Đọc cây không chụp ảnh thì không tính vào trần ảnh chụp, nhưng vẫn xét dừng khẩn cấp.
    this.gate(sessionId, o.screenshot ? 'shot' : 'look')
    const snap = await this.driver().snapshot(w, {
      screenshot: o.screenshot,
      tree: true,
      maxEdge: this.limits.maxEdge,
      maxElements: this.limits.maxElements,
      query: o.query,
    })
    const s = this.state(sessionId)
    if (o.screenshot) s.shots++
    // Chụp có lọc (`query`) chỉ có một phần cây: không thay ảnh chụp đã nhớ, chỉ thêm phần tử mới.
    const prev = s.snaps.get(winKey(w))
    if (o.query && prev)
      prev.elements = [
        ...prev.elements,
        ...snap.elements.filter((e) => !prev.elements.some((p) => p.token === e.token)),
      ]
    else s.snaps.set(winKey(w), snap)
    s.last = winKey(w)
    return snap
  }

  // ======================================================================================
  // Tra bối cảnh (cho lớp duyệt, không làm gì trên máy)
  // ======================================================================================

  /** Bối cảnh của lời gọi `tool`: ứng dụng đích, phần tử, phím; dùng cho chặn cứng, phạm vi và hộp duyệt. */
  async inspect(sessionId: string, tool: string, rawArgs: unknown): Promise<Inspected> {
    const action: Action | undefined = TOOL_ACTION[tool]
    if (!action) throw new ComputerError(`Không biết công cụ ${tool}.`, 'bad-input')
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>
    const drv = this.driver()
    const locked = await drv.screenLocked().catch(() => undefined)

    if (action === 'mo') {
      const name = str(args.ten).trim()
      if (!name) throw new ComputerError('Thiếu tên ứng dụng.', 'bad-input')
      const known = (await drv.apps()).find(
        (a) =>
          a.bundleId?.toLowerCase() === name.toLowerCase() || a.name.toLowerCase() === name.toLowerCase(),
      )
      return {
        action,
        locked,
        app: known ? { name: known.name, bundleId: known.bundleId } : { name },
        describe: `Mở ứng dụng ${known?.name ?? name}`,
      }
    }

    const w = await this.resolveWin(sessionId, args)
    const app = await this.appOf(w.pid)
    const appRef = app ? { name: app.name, bundleId: app.bundleId } : undefined
    const win = this.cached(sessionId, w)
    const where = app?.name ?? `tiến trình ${w.pid}`

    if (action === 'xem')
      return {
        action,
        locked,
        app: appRef,
        win,
        describe: tool === 'man_hinh_tim' ? `Đọc các phần tử trên cửa sổ ${where}` : `Chụp cửa sổ ${where}`,
      }

    if (action === 'phim') {
      const combo = parseCombo(str(args.phim))
      return {
        action,
        locked,
        app: appRef,
        combo,
        win,
        describe: `Bấm phím ${comboText(combo)} trong ${where}`,
      }
    }

    if (action === 'go') {
      const text = str(args.chu)
      const token = str(args.phan_tu)
      const el = token
        ? this.elementByToken(sessionId, token)?.el
        : this.state(sessionId).focus.get(winKey(w))
      return {
        action,
        locked,
        app: appRef,
        element: el,
        win,
        mark: el?.box,
        describe: `Gõ ${quote(text)} vào ${el ? `${elText(el)} trong ` : ''}${where}`,
      }
    }

    // Bấm, kéo, cuộn.
    if (tool === 'man_hinh_keo') {
      const from = this.point(args.tu, 'tu')
      const to = this.point(args.den, 'den')
      const el = win ? elementAt(win.elements, from) : undefined
      const dropOn = win ? elementAt(win.elements, to) : undefined
      return {
        action,
        locked,
        app: appRef,
        element: el,
        dropOn,
        win,
        mark: to,
        describe: `Kéo từ (${from.x}, ${from.y}) tới (${to.x}, ${to.y})${dropOn ? ` thả vào ${elText(dropOn)}` : ''} trong ${where}`,
      }
    }
    if (tool === 'man_hinh_cuon') {
      const dir = DIRS[str(args.huong).toLowerCase()]
      if (!dir) throw new ComputerError('`huong` phải là len, xuong, trai hay phai.', 'bad-input')
      return { action, locked, app: appRef, win, describe: `Cuộn ${str(args.huong)} trong ${where}` }
    }
    const token = str(args.phan_tu)
    if (token) {
      const hit = this.elementByToken(sessionId, token)
      if (!hit)
        throw new ComputerError(
          `Mã phần tử ${token} đã cũ hay không có. Gọi man_hinh_xem hay man_hinh_tim để lấy mã mới.`,
          'stale',
        )
      return {
        action,
        locked,
        app: appRef,
        element: hit.el,
        win: hit.snap,
        mark: hit.el.box,
        describe: `Bấm ${elText(hit.el)} trong ${where}`,
      }
    }
    const p = this.point(args, '')
    if (!win?.image)
      throw new ComputerError('Bấm theo toạ độ cần ảnh chụp cửa sổ trước: gọi man_hinh_xem.', 'bad-input')
    if (!insideImage(p, win.image))
      throw new ComputerError(
        `Điểm (${p.x}, ${p.y}) nằm ngoài ảnh chụp ${win.image.width}×${win.image.height} của cửa sổ.`,
        'bad-input',
      )
    const el = elementAt(win.elements, p)
    return {
      action,
      locked,
      app: appRef,
      element: el,
      win,
      mark: p,
      describe: `Bấm tại (${p.x}, ${p.y})${el ? ` vào ${elText(el)}` : ''} trong ${where}`,
    }
  }

  private point(v: unknown, name: string): Point {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
    const x = num(o.x)
    const y = num(o.y)
    if (x === undefined || y === undefined)
      throw new ComputerError(
        name
          ? `Thiếu toạ độ \`${name}\` ({ x, y } theo ảnh chụp).`
          : 'Cần `phan_tu` (ưu tiên) hoặc `x`, `y` theo ảnh chụp.',
        'bad-input',
      )
    return { x, y }
  }

  // ======================================================================================
  // Làm thao tác
  // ======================================================================================

  /**
   * Làm lời gọi `tool` cho phiên của `bot`. Chặn cứng được xét lại ngay trước khi làm. Trả chữ cho bot và (khi có)
   * ảnh chụp.
   */
  async run(
    sessionId: string,
    bot: string,
    tool: string,
    rawArgs: unknown,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>
    if (this.d.stopped?.())
      throw new ComputerError('aris đang dừng khẩn cấp: không điều khiển máy.', 'paused')
    await this.acquire(sessionId, bot, signal)
    await this.waitResume(sessionId, signal)
    const ctx = await this.inspect(sessionId, tool, args)
    const v = hardVerdict(ctx)
    if (v) throw new ComputerError(v.reason, 'blocked')
    const drv = this.driver()
    if (ctx.action !== 'xem') {
      this.gate(sessionId, 'act')
      const target =
        ctx.action === 'mo' ? undefined : await this.appOf((await this.resolveWin(sessionId, args)).pid)
      await this.waitIdle(target, signal)
      this.state(sessionId).actions++
    }
    if (this.owner?.session === sessionId) this.owner.at = this.now()

    switch (tool) {
      case 'man_hinh_xem':
        return this.view(sessionId, args)
      case 'man_hinh_tim':
        return this.find(sessionId, args)
      case 'ung_dung_mo': {
        const out = await drv.launch({ name: str(args.ten).trim() })
        return { text: `${out}\nGọi man_hinh_xem với ung_dung để xem cửa sổ.` }
      }
    }
    const w = await this.resolveWin(sessionId, args)
    const done = (line: string) => ({
      text: `${line}\nMàn hình đã đổi: gọi man_hinh_xem lại trước thao tác kế tiếp.`,
    })
    switch (tool) {
      case 'man_hinh_bam': {
        const token = str(args.phan_tu)
        const button = /phai|phải|right/i.test(str(args.nut)) ? 'right' : 'left'
        const count = Math.min(3, Math.max(1, num(args.so_lan) ?? 1))
        const out = await drv.click(w, token ? { token } : this.point(args, ''), { button, count })
        if (ctx.element) this.state(sessionId).focus.set(winKey(w), ctx.element)
        return done(`${ctx.describe}: ${out}`)
      }
      case 'man_hinh_go': {
        const token = str(args.phan_tu)
        // Có mã phần tử thì bấm vào đó trước để đặt con trỏ gõ.
        if (token) await drv.click(w, { token }, { button: 'left', count: 1 })
        const out = await drv.type(w, str(args.chu))
        return done(`${ctx.describe}: ${out}`)
      }
      case 'man_hinh_phim': {
        const out = await drv.keys(w, comboKeys(ctx.combo as Combo))
        return done(`${ctx.describe}: ${out}`)
      }
      case 'man_hinh_cuon': {
        const dir = DIRS[str(args.huong).toLowerCase()]!
        const amount = Math.min(20, Math.max(1, num(args.so_buoc) ?? 3))
        const at = num(args.x) !== undefined && num(args.y) !== undefined ? this.point(args, '') : undefined
        const out = await drv.scroll(w, at, dir, amount)
        return done(`${ctx.describe}: ${out}`)
      }
      case 'man_hinh_keo': {
        const out = await drv.drag(w, this.point(args.tu, 'tu'), this.point(args.den, 'den'))
        return done(`${ctx.describe}: ${out}`)
      }
    }
    throw new ComputerError(`Không biết công cụ ${tool}.`, 'bad-input')
  }

  /** `man_hinh_xem`: ảnh chụp cửa sổ, danh sách cửa sổ, các phần tử bấm được. */
  private async view(sessionId: string, args: Record<string, unknown>): Promise<RunResult> {
    const w = await this.resolveWin(sessionId, args)
    const snap = await this.take(sessionId, w, { screenshot: true })
    const wins = (await this.driver().windows()).filter((x) => x.onScreen && !x.minimized).slice(0, 12)
    const lines = [
      header(snap),
      wins.length > 1
        ? `Cửa sổ đang mở: ${wins.map((x) => `${x.app}${x.title ? ` ${quote(x.title)}` : ''} (${x.pid}:${x.windowId})`).join(' · ')}`
        : '',
      listElements(snap.elements, 120),
      snap.truncated ? '(Danh sách phần tử bị cắt: dùng man_hinh_tim với tu_khoa để tìm phần còn lại.)' : '',
    ]
    return { text: lines.filter(Boolean).join('\n'), image: snap.image }
  }

  /** `man_hinh_tim`: chỉ cây Trợ năng (có lọc theo từ khoá), không chụp ảnh. */
  private async find(sessionId: string, args: Record<string, unknown>): Promise<RunResult> {
    const w = await this.resolveWin(sessionId, args)
    const query = str(args.tu_khoa).trim() || undefined
    const snap = await this.take(sessionId, w, { screenshot: false, query })
    const els = query
      ? snap.elements.filter((e) =>
          `${e.role} ${e.label ?? ''} ${e.value ?? ''}`.toLowerCase().includes(query.toLowerCase()),
        )
      : snap.elements
    return {
      text: [
        header(snap),
        listElements(els.length ? els : snap.elements, 200),
        query && !els.length ? `(Không có phần tử nào khớp "${query}".)` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }
}

function header(s: Snapshot): string {
  const img = s.image ? ` · ảnh ${s.image.width}×${s.image.height}` : ''
  return `Cửa sổ: ${s.app}${s.title ? ` — ${quote(s.title)}` : ''} (cua_so: ${s.pid}:${s.windowId})${img}`
}

/** Danh sách phần tử cho bot: mã, vai, nhãn, giá trị, tâm trên ảnh chụp. */
export function listElements(els: readonly El[], limit: number): string {
  if (!els.length)
    return 'Không đọc được phần tử nào (ứng dụng tự vẽ hay chưa cấp quyền Trợ năng): bấm theo toạ độ trên ảnh.'
  const rows = els.slice(0, limit).map((e) => {
    const c = e.box ? center(e.box) : undefined
    return `[${e.token}] ${e.role}${e.label ? ` ${quote(e.label)}` : ''}${e.value ? ` = ${quote(e.value)}` : ''}${e.enabled === false ? ' (tắt)' : ''}${c ? ` @${c.x},${c.y}` : ''}`
  })
  return [
    'Phần tử (bấm bằng phan_tu = mã trong ngoặc vuông):',
    ...rows,
    els.length > limit ? `… và ${els.length - limit} phần tử nữa.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
