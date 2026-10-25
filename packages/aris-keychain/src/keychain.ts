/**
 * Keychain của macOS qua lệnh `security`. Giá trị không bao giờ nằm trong tham số lệnh: đọc lấy từ stdout, ghi đưa
 * qua stdin của `security -i` dưới dạng hex. Mỗi khoá là một mục "generic password" (dịch vụ `SERVICE`, tài
 * khoản là tên khoá).
 */
import { execFile, spawn } from 'node:child_process'

export const SERVICE = 'aris-dsh-credentials'
/** Tên khoá hợp lệ (tên biến môi trường hay `nhóm:tên`). */
export const isRefName = (s: string) => /^[A-Za-z0-9_.:@-]{1,128}$/.test(s)

export interface KeychainRunner {
  /** Chạy `security` với tham số; trả stdout và mã thoát. */
  exec(args: readonly string[], stdin?: string): Promise<{ code: number; stdout: string }>
}

export const securityRunner: KeychainRunner = {
  exec: (args, stdin) =>
    new Promise((resolve) => {
      if (stdin === undefined) {
        execFile('/usr/bin/security', [...args], { encoding: 'utf8', timeout: 15_000 }, (err, stdout) =>
          resolve({ code: err ? ((err as { code?: number }).code ?? 1) : 0, stdout: String(stdout ?? '') }),
        )
        return
      }
      const p = spawn('/usr/bin/security', [...args], { stdio: ['pipe', 'pipe', 'ignore'] })
      let out = ''
      p.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')))
      p.on('close', (code) => resolve({ code: code ?? 1, stdout: out }))
      p.on('error', () => resolve({ code: 1, stdout: '' }))
      p.stdin.end(stdin)
    }),
}

const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex')

export class Keychain {
  private cache = new Map<string, string | null>()
  constructor(
    private run: KeychainRunner = securityRunner,
    private service = SERVICE,
  ) {}

  async get(ref: string): Promise<string | undefined> {
    if (!isRefName(ref)) return undefined
    if (this.cache.has(ref)) return this.cache.get(ref) ?? undefined
    const r = await this.run.exec(['find-generic-password', '-s', this.service, '-a', ref, '-w'])
    const value = r.code === 0 ? r.stdout.replace(/\n$/, '') : null
    this.cache.set(ref, value)
    return value ?? undefined
  }

  async set(ref: string, value: string): Promise<void> {
    if (!isRefName(ref)) throw new Error(`keychain: tên khoá không hợp lệ: ${ref}`)
    if (!value) throw new Error('keychain: giá trị rỗng')
    // `-U`: thay mục cũ cùng tên. Giá trị dạng hex qua stdin của chế độ tương tác.
    const r = await this.run.exec(
      ['-i'],
      `add-generic-password -U -s ${this.service} -a ${ref} -l ${this.service} -X ${hex(value)}\n`,
    )
    this.cache.delete(ref)
    const back = await this.get(ref)
    if (r.code !== 0 || back !== value) throw new Error(`keychain: không ghi được khoá ${ref}`)
  }

  async delete(ref: string): Promise<void> {
    if (!isRefName(ref)) return
    await this.run.exec(['delete-generic-password', '-s', this.service, '-a', ref])
    this.cache.set(ref, null)
  }

  forget(ref: string) {
    this.cache.delete(ref)
  }
}
