import { describe, expect, it } from 'vitest'
import { ComputerRuntime } from './runtime.js'
import {
  ComputerError,
  type App,
  type ComputerDriver,
  type El,
  type Snapshot,
  type Win,
  type WinRef,
} from './types.js'

/** Lõi giả: ghi lại thao tác, trả ảnh chụp dựng sẵn. Không đụng máy thật. */
export class FakeDriver implements ComputerDriver {
  readonly name = 'giả'
  background = true
  apps_: App[] = [
    { pid: 10, name: 'Notes', bundleId: 'com.apple.Notes', running: true, active: true },
    { pid: 20, name: 'Safari', bundleId: 'com.apple.Safari', running: true, active: false },
    { pid: 30, name: 'Terminal', bundleId: 'com.apple.Terminal', running: true, active: false },
  ]
  wins: Win[] = [
    {
      pid: 10,
      windowId: '100',
      app: 'Notes',
      title: 'Ghi chú',
      bounds: { x: 0, y: 25, width: 800, height: 600 },
      onScreen: true,
    },
    {
      pid: 20,
      windowId: '200',
      app: 'Safari',
      title: 'Trang chủ',
      bounds: { x: 900, y: 25, width: 800, height: 600 },
      onScreen: true,
    },
    {
      pid: 30,
      windowId: '300',
      app: 'Terminal',
      title: 'zsh',
      bounds: { x: 0, y: 700, width: 600, height: 400 },
      onScreen: true,
    },
  ]
  /** Phần tử theo cửa sổ (khung theo toạ độ màn hình). */
  els: Record<string, Omit<El, 'token' | 'box'>[]> = {
    '10:100': [
      { index: 1, role: 'AXButton', label: 'Ghi chú mới', frame: { x: 10, y: 35, width: 40, height: 20 } },
      { index: 2, role: 'AXTextArea', label: 'Nội dung', frame: { x: 100, y: 100, width: 600, height: 400 } },
      { index: 3, role: 'AXTextField', label: 'Mật khẩu', frame: { x: 100, y: 520, width: 200, height: 20 } },
      { index: 4, role: 'AXSecureTextField', label: 'Mã', frame: { x: 400, y: 520, width: 200, height: 20 } },
      { index: 5, role: 'AXImage', label: 'Thùng rác', frame: { x: 700, y: 560, width: 40, height: 40 } },
    ],
  }
  calls: string[] = []
  snapshots = 0
  idle: number | undefined = 100
  locked: boolean | undefined = false

  async available() {
    return { ok: true }
  }
  async permissions() {
    return { accessibility: true, screenRecording: true, detail: 'ok' }
  }
  async apps() {
    return this.apps_
  }
  async windows(pid?: number) {
    return this.wins.filter((w) => pid === undefined || w.pid === pid)
  }
  async snapshot(w: WinRef, o: { screenshot: boolean; query?: string | undefined }): Promise<Snapshot> {
    const win = this.wins.find((x) => x.pid === w.pid && x.windowId === w.windowId)!
    const id = `s${++this.snapshots}`
    // Ảnh chụp Retina thu nhỏ: 2 điểm ảnh mỗi điểm, rồi cạnh dài về 1280 → 1,6 lần.
    const image = { width: Math.round(win.bounds.width * 1.6), height: Math.round(win.bounds.height * 1.6) }
    const s = image.width / win.bounds.width
    const elements = (this.els[`${w.pid}:${w.windowId}`] ?? []).map((e) => ({
      ...e,
      token: `${id}:${e.index}`,
      box: {
        x: Math.round((e.frame!.x - win.bounds.x) * s),
        y: Math.round((e.frame!.y - win.bounds.y) * s),
        width: Math.round(e.frame!.width * s),
        height: Math.round(e.frame!.height * s),
      },
    }))
    return {
      ...w,
      app: win.app,
      title: win.title,
      bounds: win.bounds,
      snapshotId: id,
      tree: '',
      elements: o.query ? elements.filter((e) => e.label?.includes(o.query!)) : elements,
      truncated: false,
      ...(o.screenshot ? { image: { png: new Uint8Array([0x89, 0x50]), ...image } } : {}),
    }
  }
  async click(
    w: WinRef,
    p: { token: string } | { x: number; y: number },
    o: { button: string; count: number },
  ) {
    this.calls.push(
      `click ${w.pid}:${w.windowId} ${'token' in p ? p.token : `${p.x},${p.y}`} ${o.button}x${o.count}`,
    )
    return 'đã bấm'
  }
  async type(w: WinRef, text: string) {
    this.calls.push(`type ${w.pid}:${w.windowId} ${text}`)
    return 'đã gõ'
  }
  async keys(w: WinRef, keys: string[]) {
    this.calls.push(`keys ${w.pid}:${w.windowId} ${keys.join('+')}`)
    return 'đã bấm phím'
  }
  async scroll(w: WinRef, _at: unknown, dir: string, amount: number) {
    this.calls.push(`scroll ${w.pid}:${w.windowId} ${dir} ${amount}`)
    return 'đã cuộn'
  }
  async drag(w: WinRef, f: { x: number; y: number }, t: { x: number; y: number }) {
    this.calls.push(`drag ${w.pid}:${w.windowId} ${f.x},${f.y}->${t.x},${t.y}`)
    return 'đã kéo'
  }
  async launch(a: { name?: string | undefined }) {
    this.calls.push(`launch ${a.name}`)
    return `đã mở ${a.name}`
  }
  async idleSeconds() {
    return this.idle
  }
  async screenLocked() {
    return this.locked
  }
  async close() {}
}

/** Phần chạy với lõi giả và đồng hồ giả (chờ thì cộng thẳng vào đồng hồ). */
export function setup(over: { stopped?: () => boolean } = {}) {
  const drv = new FakeDriver()
  const clock = { t: 1_000_000 }
  const rt = new ComputerRuntime({
    driver: () => drv,
    now: () => clock.t,
    sleep: async (ms) => void (clock.t += ms),
    ...over,
  })
  return { drv, rt, clock }
}

const err = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e as ComputerError
  }
  throw new Error('không ném lỗi')
}

describe('điều khiển máy · phần chạy', () => {
  it('xem màn hình: chụp cửa sổ của ứng dụng, liệt kê phần tử có mã và tâm trên ảnh, nhớ cửa sổ cho lần sau', async () => {
    const { drv, rt } = setup()
    const r = await rt.run('p1', 'Khoa', 'screen_view', { app: 'notes' })
    expect(r.text).toContain('Cửa sổ: Notes — "Ghi chú" (window: 10:100) · ảnh 1280×960')
    expect(r.text).toContain('[s1:1] AXButton "Ghi chú mới" @48,32')
    expect(r.image).toMatchObject({ width: 1280, height: 960 })
    // Lần sau không nói ứng dụng: dùng cửa sổ vừa làm.
    await rt.run('p1', 'Khoa', 'screen_click', { element: 's1:1' })
    expect(drv.calls).toEqual(['click 10:100 s1:1 leftx1'])
  })

  it('tra bối cảnh cho hộp duyệt: bấm theo mã hay toạ độ ra đúng phần tử và chỗ đánh dấu; gõ đoán ô vừa bấm', async () => {
    const { rt } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    const byToken = await rt.inspect('p1', 'screen_click', { element: 's1:2' })
    expect(byToken).toMatchObject({ action: 'click', app: { name: 'Notes' }, element: { label: 'Nội dung' } })
    expect(byToken.describe).toBe('Bấm AXTextArea "Nội dung" trong Notes')
    expect(byToken.mark).toEqual({ x: 160, y: 120, width: 960, height: 640 })
    const byPoint = await rt.inspect('p1', 'screen_click', { x: 60, y: 30 })
    expect(byPoint.element?.label).toBe('Ghi chú mới')
    expect(byPoint.mark).toEqual({ x: 60, y: 30 })
    await rt.run('p1', 'Khoa', 'screen_click', { element: 's1:2' })
    expect((await rt.inspect('p1', 'screen_type', { text: 'dòng 1\ndòng 2' })).describe).toContain(
      '"dòng 1↵dòng 2"',
    )
    const typing = await rt.inspect('p1', 'screen_type', { text: 'xin chào' })
    expect(typing.element?.label).toBe('Nội dung')
    expect(typing.describe).toBe('Gõ "xin chào" vào AXTextArea "Nội dung" trong Notes')
  })

  it('lỗi rõ ràng: mã phần tử cũ, toạ độ ngoài ảnh, bấm toạ độ khi chưa chụp, cửa sổ sai dạng, thiếu lõi', async () => {
    const { rt } = setup()
    expect((await err(rt.inspect('p1', 'screen_click', { element: 's9:1', app: 'Notes' }))).code).toBe(
      'stale',
    )
    expect((await err(rt.inspect('p1', 'screen_click', { x: 5, y: 5, app: 'Notes' }))).message).toContain(
      'cần ảnh chụp',
    )
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect((await err(rt.inspect('p1', 'screen_click', { x: 5000, y: 5 }))).message).toContain(
      'ngoài ảnh chụp',
    )
    expect((await err(rt.inspect('p1', 'screen_click', { window: 'abc', x: 1, y: 1 }))).code).toBe(
      'bad-input',
    )
    const none = new ComputerRuntime({ driver: () => undefined })
    const e = await err(none.run('p1', 'Khoa', 'screen_view', {}))
    expect(e.code).toBe('unavailable')
    expect(e.message).toContain('computer doctor')
  })

  it('chặn cứng xét lại ngay trước khi làm: ô mật khẩu, Terminal, kéo vào Thùng rác, phím khoá máy, màn hình khoá', async () => {
    const { drv, rt } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect((await err(rt.run('p1', 'Khoa', 'screen_type', { text: 'abc', element: 's1:3' }))).code).toBe(
      'blocked',
    )
    expect((await err(rt.run('p1', 'Khoa', 'screen_click', { element: 's1:4' }))).code).toBe('blocked')
    expect(
      (await err(rt.run('p1', 'Khoa', 'screen_drag', { from: { x: 100, y: 200 }, to: { x: 1150, y: 890 } })))
        .message,
    ).toContain('Thùng rác')
    expect((await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'ctrl+cmd+q' }))).message).toContain(
      'khoá máy',
    )
    expect((await err(rt.run('p1', 'Khoa', 'screen_view', { app: 'Terminal' }))).message).toContain(
      'Terminal',
    )
    expect((await err(rt.run('p1', 'Khoa', 'open_app', { name: 'Keychain Access' }))).code).toBe('blocked')
    drv.locked = true
    expect((await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+n' }))).message).toContain(
      'màn hình đang khoá',
    )
    expect(drv.calls).toEqual([])
  })

  it('trần mỗi lượt: 40 ảnh chụp và 150 thao tác; lượt mới thì đếm lại', async () => {
    const { rt } = setup()
    for (let i = 0; i < 40; i++) await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect((await err(rt.run('p1', 'Khoa', 'screen_view', {}))).code).toBe('cap')
    // Đọc cây không tính là ảnh chụp.
    await rt.run('p1', 'Khoa', 'screen_find', { query: 'Ghi chú' })
    for (let i = 0; i < 150; i++) await rt.run('p1', 'Khoa', 'screen_key', { keys: 'down' })
    expect((await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'down' }))).message).toContain(
      '150 thao tác',
    )
    rt.turnStart('p1')
    await rt.run('p1', 'Khoa', 'screen_view', {})
  })

  it('một bot một lúc: phiên khác chờ tới khi lượt của bot đang làm xong; giữ máy quá lâu không làm gì thì tự nhả', async () => {
    const { drv, rt, clock } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect(rt.holder()).toEqual({ session: 'p1', bot: 'Khoa' })
    // Phiên p2 chờ; trong lúc chờ thì lượt của p1 xong.
    const waiting = rt.run('p2', 'Mai', 'screen_view', { app: 'Safari' })
    rt.turnEnd('p1')
    await waiting
    expect(rt.holder()).toEqual({ session: 'p2', bot: 'Mai' })
    // p2 giữ máy rồi im 2 phút: p3 lấy được.
    clock.t += 2 * 60_000 + 1
    await rt.run('p3', 'Thơ', 'screen_view', { app: 'Notes' })
    expect(rt.holder()?.bot).toBe('Thơ')
    expect(drv.snapshots).toBe(3)
  })

  it('bot khác giữ máy quá 10 phút thì báo bận', async () => {
    const { rt } = setup()
    const busy = new ComputerRuntime({
      driver: () => new FakeDriver(),
      now: () => 0,
      sleep: async () => undefined,
      limits: { queueWaitMs: 0 },
    })
    await busy.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect((await err(busy.run('p2', 'Mai', 'screen_view', { app: 'Notes' }))).message).toContain(
      'Khoa đang điều khiển máy',
    )
    expect(rt.holder()).toBeUndefined()
  })

  it('người dùng cầm lái: bot chờ tới khi trả lại; quá 30 phút thì dừng', async () => {
    const { drv, rt, clock } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    rt.pause('p1')
    const start = clock.t
    const e = await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+n' }))
    expect(e.code).toBe('paused')
    expect(clock.t - start).toBeGreaterThanOrEqual(30 * 60_000)
    rt.resume('p1')
    await rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+n' })
    expect(drv.calls).toEqual(['keys 10:100 cmd+n'])
  })

  it('người dùng đang dùng máy: lõi nền chỉ nhường khi người dùng ở đúng ứng dụng; lõi tiền cảnh luôn nhường', async () => {
    const { drv, rt } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Safari' })
    drv.idle = 0.5
    // Lõi nền, người dùng ở Notes (đang ở trước), bot làm Safari: không cần chờ.
    await rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+l' })
    // Bot làm Notes (người dùng đang ở đó): chờ rồi báo.
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    expect((await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+n' }))).message).toContain(
      'đang dùng máy',
    )
    // Lõi tiền cảnh: luôn chờ.
    drv.background = false
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Safari' })
    expect((await err(rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+l' }))).code).toBe('paused')
    // Người dùng thôi động máy: làm tiếp.
    drv.idle = 5
    await rt.run('p1', 'Khoa', 'screen_key', { keys: 'cmd+l' })
    expect(drv.calls).toEqual(['keys 20:200 cmd+l', 'keys 20:200 cmd+l'])
  })

  it('dừng khẩn cấp của aris: không điều khiển máy', async () => {
    let stopped = false
    const { rt } = setup({ stopped: () => stopped })
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    stopped = true
    expect((await err(rt.run('p1', 'Khoa', 'screen_view', {}))).message).toContain('dừng khẩn cấp')
  })

  it('gõ có mã phần tử thì bấm vào ô trước; cuộn, kéo, mở ứng dụng gọi đúng lõi', async () => {
    const { drv, rt } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    await rt.run('p1', 'Khoa', 'screen_type', { text: 'aris thử', element: 's1:2' })
    await rt.run('p1', 'Khoa', 'screen_scroll', { direction: 'xuống', steps: 50 })
    await rt.run('p1', 'Khoa', 'screen_drag', { from: { x: 100, y: 200 }, to: { x: 300, y: 200 } })
    await rt.run('p1', 'Khoa', 'screen_click', { x: 60, y: 30, button: 'phai', count: 2 })
    const r = await rt.run('p1', 'Khoa', 'open_app', { name: 'Calendar' })
    expect(r.text).toContain('đã mở Calendar')
    expect(drv.calls).toEqual([
      'click 10:100 s1:2 leftx1',
      'type 10:100 aris thử',
      'scroll 10:100 down 20',
      'drag 10:100 100,200->300,200',
      'click 10:100 60,30 rightx2',
      'launch Calendar',
    ])
  })

  it('tìm phần tử theo từ khoá: không chụp ảnh, không thay ảnh chụp đã nhớ', async () => {
    const { rt } = setup()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    const r = await rt.run('p1', 'Khoa', 'screen_find', { query: 'Nội dung' })
    expect(r.image).toBeUndefined()
    expect(r.text).toContain('[s2:2] AXTextArea "Nội dung"')
    expect(r.text).not.toContain('Ghi chú mới')
    // Mã của lần chụp đầu vẫn dùng được, toạ độ vẫn theo ảnh đầu.
    expect((await rt.inspect('p1', 'screen_click', { element: 's1:1' })).element?.label).toBe('Ghi chú mới')
    expect((await rt.inspect('p1', 'screen_click', { element: 's2:2' })).element?.label).toBe('Nội dung')
  })

  it('tình trạng cho giao diện: ảnh mới nhất, chỗ vừa bấm, các bước, trần, cầm lái', async () => {
    const { rt } = setup()
    expect(rt.screenView('p1')).toBeUndefined()
    await rt.run('p1', 'Khoa', 'screen_view', { app: 'Notes' })
    await rt.run('p1', 'Khoa', 'screen_click', { element: 's1:1' })
    rt.pause('p1')
    const v = rt.screenView('p1')!
    expect(v.screen).toMatchObject({
      window: '10:100',
      app: 'Notes',
      mark: { x: 16, y: 16, width: 64, height: 32 },
    })
    expect(v.screen?.image?.width).toBe(1280)
    expect(v.steps.map((x) => x.text)).toEqual([
      'Chụp cửa sổ Notes',
      'Bấm AXButton "Ghi chú mới" trong Notes',
    ])
    expect(v).toMatchObject({ shots: 1, actions: 1, limits: { shots: 40, actions: 150 }, paused: true })
    expect(v.holder).toEqual({ session: 'p1', bot: 'Khoa' })
  })
})
