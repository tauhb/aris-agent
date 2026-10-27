/**
 * `aris computer doctor` (GĐ8.3, B-1): kiểm lõi, quyền Trợ năng, quyền Ghi màn hình, và in hướng dẫn. Không tự cấp
 * quyền: chỉ chỉ chỗ bấm trong Cài đặt hệ thống (người dùng tự làm).
 */
import type { ComputerDriver } from './types.js'

export interface Check {
  name: string
  ok: boolean | null
  detail: string
  /** Việc người dùng cần làm khi chưa ổn. */
  fix?: string | undefined
}

export interface DoctorReport {
  platform: string
  /** Tiến trình macOS tính quyền cho (tiến trình aris đang chạy lõi). */
  process: { pid: number; execPath: string }
  checks: Check[]
  /** Các bot đang bật điều khiển máy. */
  bots: string[]
}

export const SETTINGS_URL = {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  screenRecording: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
} as const

export async function doctor(o: {
  load: () => Promise<{ driver: ComputerDriver } | { error: string }>
  platform?: string
  pid?: number
  execPath?: string
  bots: string[]
}): Promise<DoctorReport> {
  const platform = o.platform ?? process.platform
  const proc = { pid: o.pid ?? process.pid, execPath: o.execPath ?? process.execPath }
  const checks: Check[] = []
  checks.push(
    platform === 'darwin'
      ? { name: 'Hệ điều hành', ok: true, detail: 'macOS' }
      : {
          name: 'Hệ điều hành',
          ok: false,
          detail: `${platform}: aris chỉ hỗ trợ điều khiển máy trên macOS (lõi có bản Linux để thử).`,
        },
  )
  const loaded = await o.load()
  if ('error' in loaded) {
    checks.push({
      name: 'Lõi cua-driver',
      ok: false,
      detail: loaded.error,
      fix: 'Chạy `pnpm install` trong thư mục aris để cài lại gói @trycua/cua-driver (cần macOS 13 trở lên).',
    })
    return { platform, process: proc, checks, bots: o.bots }
  }
  const d = loaded.driver
  checks.push({ name: 'Lõi cua-driver', ok: true, detail: `${d.name}, gửi thao tác ở nền` })
  const p = await d.permissions().catch((e: unknown) => ({
    accessibility: undefined,
    screenRecording: undefined,
    detail: e instanceof Error ? e.message : String(e),
  }))
  const where = `macOS tính quyền cho tiến trình aris: ${proc.execPath} (pid ${proc.pid}).`
  checks.push({
    name: 'Quyền Trợ năng (đọc nút, bấm, gõ)',
    ok: p.accessibility ?? null,
    detail: p.accessibility === undefined ? 'lõi không báo' : p.accessibility ? 'đã cấp' : 'chưa cấp',
    ...(p.accessibility
      ? {}
      : {
          fix: `Cài đặt hệ thống › Quyền riêng tư và bảo mật › Trợ năng: bật cho ${proc.execPath}. ${where} Mở nhanh: open "${SETTINGS_URL.accessibility}"`,
        }),
  })
  checks.push({
    name: 'Quyền Ghi màn hình (chụp cửa sổ)',
    ok: p.screenRecording ?? null,
    detail: p.screenRecording === undefined ? 'lõi không báo' : p.screenRecording ? 'đã cấp' : 'chưa cấp',
    ...(p.screenRecording
      ? {}
      : {
          fix: `Cài đặt hệ thống › Quyền riêng tư và bảo mật › Ghi màn hình và âm thanh hệ thống: bật cho ${proc.execPath}, rồi khởi động lại aris (aris restart). Mở nhanh: open "${SETTINGS_URL.screenRecording}"`,
        }),
  })
  if (p.detail) checks.push({ name: 'Lõi báo', ok: null, detail: p.detail })
  checks.push({
    name: 'Model đọc ảnh',
    ok: null,
    detail:
      'Kiểm theo từng phiên: model đọc được ảnh thì bot nhận ảnh chụp kèm danh sách nút; không thì chỉ nhận danh sách nút.',
  })
  return { platform, process: proc, checks, bots: o.bots }
}

/** Báo cáo thành chữ cho dòng lệnh. */
export function doctorText(r: DoctorReport): string {
  const mark = (ok: boolean | null) => (ok === true ? '✓' : ok === false ? '✗' : '·')
  return [
    `Điều khiển máy · ${r.platform} · tiến trình ${r.process.execPath} (pid ${r.process.pid})`,
    ...r.checks.flatMap((c) => [
      `${mark(c.ok)} ${c.name}: ${c.detail}`,
      ...(c.fix ? [`    → ${c.fix}`] : []),
    ]),
    r.bots.length
      ? `Bot đang bật điều khiển máy: ${r.bots.join(', ')}`
      : 'Chưa bot nào bật điều khiển máy (Hồ sơ bot › Quyền).',
  ].join('\n')
}
