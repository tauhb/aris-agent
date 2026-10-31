import { describe, expect, it } from 'vitest'
import { center, elementAt, insideImage, screenToShot, shotToScreen } from './coords.js'
import { parseIdle, parseLocked } from './cua.js'
import { doctor, doctorText } from './doctor.js'
import { comboText, dangerousCombo, parseCombo } from './keys.js'
import {
  actionOf,
  appAllowed,
  blockedApp,
  boundedVerdict,
  cleanActions,
  cleanSettings,
  COMPUTER_TOOLS,
  DEFAULT_SETTINGS,
  hardVerdict,
  secureField,
  toolName,
} from './policy.js'
import { FakeDriver } from './runtime.test.js'

describe('điều khiển máy · phím tắt', () => {
  it('đọc nhiều cách viết, xếp phím bổ trợ theo một thứ tự', () => {
    expect(comboText(parseCombo('cmd+shift+s'))).toBe('cmd+shift+s')
    expect(comboText(parseCombo('Shift-Cmd-S'))).toBe('cmd+shift+s')
    expect(comboText(parseCombo('⌘⇧S'))).toBe('cmd+shift+s')
    expect(comboText(parseCombo('ctrl c'))).toBe('ctrl+c')
    expect(comboText(parseCombo('Enter'))).toBe('return')
    expect(comboText(parseCombo('opt+F12'))).toBe('option+f12')
    expect(comboText(parseCombo('cmd+-'))).toBe('cmd+-')
    expect(() => parseCombo('cmd+shift')).toThrow('thiếu phím chính')
    expect(() => parseCombo('cmd+a+b')).toThrow('hơn một phím chính')
    expect(() => parseCombo('cmd+banana')).toThrow('Không hiểu phím')
  })

  it('nhận ra tổ hợp nguy hiểm: khoá máy, đăng xuất, buộc thoát, phím nguồn; phím thường thì không', () => {
    expect(dangerousCombo(parseCombo('ctrl+cmd+q'))).toBe('khoá máy')
    expect(dangerousCombo(parseCombo('cmd+shift+q'))).toBe('đăng xuất')
    expect(dangerousCombo(parseCombo('cmd+opt+shift+q'))).toBe('đăng xuất')
    expect(dangerousCombo(parseCombo('cmd+opt+esc'))).toBe('buộc thoát ứng dụng')
    expect(dangerousCombo(parseCombo('ctrl+cmd+power'))).toContain('phím nguồn')
    expect(dangerousCombo(parseCombo('cmd+q'))).toBeUndefined()
    expect(dangerousCombo(parseCombo('cmd+s'))).toBeUndefined()
  })
})

describe('điều khiển máy · toạ độ', () => {
  it('Retina thu nhỏ, cửa sổ ở màn hình phụ bên trái (toạ độ âm): đổi qua lại khớp nhau', () => {
    const bounds = { x: -1440, y: 100, width: 1000, height: 500 }
    const image = { width: 1280, height: 640 } // 2 điểm ảnh mỗi điểm rồi thu về cạnh dài 1280: 1,28 lần.
    const r = screenToShot({ x: -1340, y: 150, width: 50, height: 25 }, bounds, image)
    expect(r).toEqual({ x: 128, y: 64, width: 64, height: 32 })
    expect(shotToScreen({ x: 128, y: 64 }, bounds, image)).toEqual({ x: -1340, y: 150 })
    expect(insideImage({ x: 1279, y: 639 }, image)).toBe(true)
    expect(insideImage({ x: 1280, y: 0 }, image)).toBe(false)
    expect(insideImage({ x: -1, y: 0 }, image)).toBe(false)
    expect(center(r)).toEqual({ x: 160, y: 80 })
  })

  it('phần tử dưới điểm bấm: lấy phần tử nhỏ nhất chứa điểm', () => {
    const els = [
      { token: 'a', index: 1, role: 'AXGroup', box: { x: 0, y: 0, width: 500, height: 500 } },
      { token: 'b', index: 2, role: 'AXButton', box: { x: 10, y: 10, width: 50, height: 20 } },
      { token: 'c', index: 3, role: 'AXStaticText' },
    ]
    expect(elementAt(els, { x: 20, y: 20 })?.token).toBe('b')
    expect(elementAt(els, { x: 200, y: 200 })?.token).toBe('a')
    expect(elementAt(els, { x: 900, y: 900 })).toBeUndefined()
  })
})

describe('điều khiển máy · luật', () => {
  it('ứng dụng chặn cứng theo bundle id hay tên (Anh, Việt)', () => {
    expect(blockedApp({ bundleId: 'com.apple.systempreferences' })).toBe('Cài đặt hệ thống')
    expect(blockedApp({ name: 'System Settings.app' })).toBe('Cài đặt hệ thống')
    expect(blockedApp({ name: 'Cài đặt hệ thống' })).toBe('Cài đặt hệ thống')
    expect(blockedApp({ bundleId: 'com.googlecode.iterm2' })).toBe('iTerm')
    expect(blockedApp({ name: '1Password' })).toBe('1Password')
    expect(blockedApp({ bundleId: 'com.apple.installer' })).toBe('Trình cài đặt')
    expect(blockedApp({ name: 'Notes', bundleId: 'com.apple.Notes' })).toBeUndefined()
  })

  it('ô mật khẩu: vai bảo mật, hay ô nhập có nhãn mật khẩu; ô thường thì không', () => {
    expect(secureField({ token: 't', index: 1, role: 'AXSecureTextField' })).toBe(true)
    expect(secureField({ token: 't', index: 1, role: 'AXTextField', label: 'Password' })).toBe(true)
    expect(secureField({ token: 't', index: 1, role: 'AXTextField', label: 'Mật khẩu' })).toBe(true)
    expect(secureField({ token: 't', index: 1, role: 'AXTextField', label: 'Tìm kiếm' })).toBe(false)
    expect(secureField({ token: 't', index: 1, role: 'AXButton', label: 'Quên mật khẩu' })).toBe(false)
  })

  it('chặn cứng áp cho mọi thao tác trong ứng dụng nhạy cảm, cả xem', () => {
    expect(hardVerdict({ action: 'view', app: { name: 'Keychain Access' } })?.what).toBe(
      'thao tác trong Keychain Access',
    )
    expect(hardVerdict({ action: 'open', app: { name: 'Terminal' } })?.reason).toContain('cấm cứng')
    expect(hardVerdict({ action: 'view', app: { name: 'Notes' } })).toBeUndefined()
  })

  it('chế độ trong phạm vi: theo ứng dụng và theo loại thao tác', () => {
    const s = cleanSettings({
      on: true,
      mode: 'bounded',
      apps: ['Notes', 'com.apple.finder'],
      actions: ['view', 'click'],
    })
    expect(boundedVerdict(s, { action: 'click', app: { name: 'Notes' } })).toBeUndefined()
    expect(
      boundedVerdict(s, { action: 'view', app: { name: 'Finder', bundleId: 'com.apple.finder' } }),
    ).toBeUndefined()
    expect(boundedVerdict(s, { action: 'click', app: { name: 'Safari' } })?.what).toBe('Safari ngoài phạm vi')
    expect(boundedVerdict(s, { action: 'type', app: { name: 'Notes' } })?.what).toBe('gõ chữ ngoài phạm vi')
    expect(appAllowed(s, undefined)).toBe(false)
  })

  it('cài đặt từ dữ liệu gửi lên: mặc định tắt, bỏ giá trị sai, giữ giá trị cũ khi không gửi', () => {
    expect(DEFAULT_SETTINGS.on).toBe(false)
    const a = cleanSettings({
      on: true,
      mode: 'lung-tung',
      apps: ['Notes', 'Notes', '', 5],
      actions: ['click', 'xoa'],
    })
    expect(a).toEqual({ on: true, mode: 'ask', apps: ['Notes'], actions: ['click'] })
    expect(cleanSettings({ mode: 'bounded' }, a)).toEqual({ ...a, mode: 'bounded' })
  })

  it('cài đặt đã lưu bằng giá trị cũ (tiếng Việt) quy về giá trị mới; tên công cụ cũ vẫn ra loại thao tác', () => {
    const old = {
      on: true,
      mode: 'bounded',
      apps: ['Notes'],
      actions: ['xem', 'bam', 'go', 'phim', 'mo', 'xem'],
    }
    expect(cleanSettings(old)).toEqual({
      on: true,
      mode: 'bounded',
      apps: ['Notes'],
      actions: ['view', 'click', 'type', 'key', 'open'],
    })
    expect(cleanActions(['go', 'view', 'la'])).toEqual(['view', 'type'])
    // Cài đặt cũ không gửi actions: giữ giá trị cũ, đã quy đổi.
    expect(cleanSettings({}, { ...DEFAULT_SETTINGS, actions: ['xem'] as never }).actions).toEqual(['view'])
    expect(actionOf('man_hinh_bam')).toBe('click')
    expect(actionOf('screen_click')).toBe('click')
    expect(toolName('ung_dung_mo')).toBe('open_app')
    expect(COMPUTER_TOOLS.has('man_hinh_xem')).toBe(true)
    expect(actionOf('read')).toBeUndefined()
  })
})

describe('điều khiển máy · đọc trạng thái macOS', () => {
  it('thời gian rảnh và màn hình khoá từ ioreg', () => {
    expect(parseIdle('|   "HIDIdleTime" = 2500000000\n')).toBe(2.5)
    expect(parseIdle('không có')).toBeUndefined()
    expect(
      parseLocked('"IOConsoleUsers" = ({"CGSSessionScreenIsLocked"=Yes,"kCGSSessionOnConsoleKey"=Yes})'),
    ).toBe(true)
    expect(parseLocked('"IOConsoleUsers" = ({"kCGSSessionOnConsoleKey"=Yes})')).toBe(false)
    expect(parseLocked('')).toBeUndefined()
  })
})

describe('điều khiển máy · computer doctor', () => {
  it('thiếu lõi: báo cách cài; có lõi nhưng thiếu quyền: chỉ chỗ bật trong Cài đặt hệ thống, nói tiến trình nào', async () => {
    const none = await doctor({
      load: async () => ({ error: 'không nạp được' }),
      platform: 'darwin',
      bots: [],
    })
    expect(none.checks.find((c) => c.name === 'Lõi cua-driver')).toMatchObject({ ok: false })
    expect(doctorText(none)).toContain('pnpm install')

    const drv = new FakeDriver()
    drv.permissions = async () => ({
      accessibility: false,
      screenRecording: true,
      detail: 'Accessibility: ❌',
    })
    const r = await doctor({
      load: async () => ({ driver: drv }),
      platform: 'darwin',
      pid: 42,
      execPath: '/opt/homebrew/bin/node',
      bots: ['Khoa'],
    })
    const ax = r.checks.find((c) => c.name.startsWith('Quyền Trợ năng'))!
    expect(ax.ok).toBe(false)
    expect(ax.fix).toContain('/opt/homebrew/bin/node')
    expect(ax.fix).toContain('Privacy_Accessibility')
    expect(r.checks.find((c) => c.name.startsWith('Quyền Ghi màn hình'))?.ok).toBe(true)
    const text = doctorText(r)
    expect(text).toContain('✗ Quyền Trợ năng')
    expect(text).toContain('Bot đang bật điều khiển máy: Khoa')
  })

  it('không phải macOS: nói rõ chỉ hỗ trợ macOS', async () => {
    const r = await doctor({ load: async () => ({ driver: new FakeDriver() }), platform: 'linux', bots: [] })
    expect(r.checks[0]).toMatchObject({ ok: false })
    expect(r.checks[0]!.detail).toContain('chỉ hỗ trợ điều khiển máy trên macOS')
  })
})
