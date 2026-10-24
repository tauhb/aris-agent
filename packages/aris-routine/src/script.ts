/**
 * Chế độ chỉ chạy script (giai đoạn 4, đợt 2; đặc tả: docs/specs/aris-routine.md): một lệnh shell,
 * không dùng AI. Môi trường tối thiểu, không mang biến môi trường của daemon.
 */
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

/** Lệnh chạy quá chừng này thì huỷ. */
export const SCRIPT_TIMEOUT_MS = 2 * 60_000
/** Đầu ra gửi về Telegram tối đa. */
export const SCRIPT_OUTPUT_MAX = 3500
const BUFFER_MAX = 64 * 1024

export interface ScriptResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export function runScript(command: string, timeoutMs = SCRIPT_TIMEOUT_MS): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-c', command], {
      cwd: homedir(),
      env: {
        PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: homedir(),
        LANG: process.env.LANG ?? 'en_US.UTF-8',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.on('data', (b: Buffer) => {
      if (stdout.length < BUFFER_MAX) stdout += b.toString('utf8')
    })
    child.stderr.on('data', (b: Buffer) => {
      if (stderr.length < BUFFER_MAX) stderr += b.toString('utf8')
    })
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: null, stdout, stderr: `${stderr}${String(e)}`, timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

/** Kết quả của lần chạy script: trạng thái, đầu ra để gửi (rỗng thì không gửi), lỗi. */
export function scriptOutcome(r: ScriptResult): { ok: boolean; output: string; error?: string } {
  const output = r.stdout.trim().slice(0, SCRIPT_OUTPUT_MAX)
  if (r.timedOut) return { ok: false, output, error: 'lệnh chạy quá 2 phút' }
  if (r.code !== 0)
    return {
      ok: false,
      output,
      error: `mã thoát ${r.code ?? '?'}: ${r.stderr.trim().slice(-300) || '(không có thông báo lỗi)'}`,
    }
  return { ok: true, output }
}
