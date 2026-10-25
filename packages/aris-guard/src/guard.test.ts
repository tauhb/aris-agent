import { describe, expect, it } from 'vitest'
import { cleanGuard, DEFAULT_GUARD, hardVerdict, lowRisk, protectedPath, warnLevel } from './policy.js'

const HOME = '/Users/tau'
const CWD = '/Users/tau/code/app'
const hv = (tool: string, args: unknown) => hardVerdict(tool, args, CWD, HOME)

describe('danh sách cấm cứng (mọi bot, cả khi đã duyệt)', () => {
  it('xoá đệ quy ngoài thư mục làm việc; trong thư mục thì để luồng thường quyết', () => {
    expect(hv('bash', { command: 'rm -rf build' })).toBeUndefined()
    expect(hv('bash', { command: 'rm -r ./dist ./tmp' })).toBeUndefined()
    expect(hv('bash', { command: 'rm a.txt' })).toBeUndefined()
    expect(hv('bash', { command: 'rm -rf ~/Documents' })?.what).toBe('xoá đệ quy ngoài thư mục làm việc')
    expect(hv('bash', { command: 'cd x && rm -r ../other' })?.what).toBe('xoá đệ quy ngoài thư mục làm việc')
    expect(hv('bash', { command: 'rm -rf /' })?.what).toBe('xoá đệ quy ngoài thư mục làm việc')
  })
  it('push đè, sudo, Keychain, khoá, dữ liệu của aris', () => {
    expect(hv('bash', { command: 'git push --force origin main' })?.what).toBe('git push --force')
    expect(hv('bash', { command: 'git push origin main' })).toBeUndefined()
    expect(hv('bash', { command: 'sudo rm x' })?.what).toBe('lệnh sudo')
    expect(hv('bash', { command: 'security find-generic-password -s aris -w' })?.what).toBe(
      'đọc khoá trong Keychain',
    )
    expect(hv('bash', { command: 'cat ~/.ssh/id_ed25519' })?.what).toContain('khoá')
    expect(hv('read', { file_path: '.env' })?.what).toContain('đọc khoá')
    expect(hv('read', { file_path: '.env.example' })).toBeUndefined()
    expect(hv('write', { file_path: '/Users/tau/.aris/acp.sock' })?.what).toContain('sửa cấu hình')
    expect(hv('edit', { file_path: 'src/index.ts' })).toBeUndefined()
    expect(protectedPath('/Users/tau/code/app/.dsh-home/.credentials.yaml', HOME)).toBe(true)
    expect(protectedPath('/Users/tau/code/app/src/env.ts', HOME)).toBe(false)
  })
})

describe('việc rủi ro thấp (chế độ tự cho)', () => {
  it('lệnh chỉ đọc, đọc tệp, ghi trong thư mục; không: lệnh ghi, mạng, ghi ngoài thư mục', () => {
    expect(lowRisk('bash', { command: 'ls -la && git status' }, CWD, HOME)).toBe(true)
    expect(lowRisk('bash', { command: 'git log --oneline | head -5' }, CWD, HOME)).toBe(true)
    expect(lowRisk('bash', { command: 'ls > out.txt' }, CWD, HOME)).toBe(false)
    expect(lowRisk('bash', { command: 'npm install' }, CWD, HOME)).toBe(false)
    expect(lowRisk('bash', { command: 'find . -name x -delete' }, CWD, HOME)).toBe(false)
    expect(lowRisk('bash', { command: 'curl https://x' }, CWD, HOME)).toBe(false)
    expect(lowRisk('read', { file_path: 'a' }, CWD, HOME)).toBe(true)
    expect(lowRisk('write', { file_path: 'notes/a.md' }, CWD, HOME)).toBe(true)
    expect(lowRisk('write', { file_path: '/Users/tau/Desktop/a.md' }, CWD, HOME)).toBe(false)
    expect(lowRisk('web_fetch', { url: 'https://x' }, CWD, HOME)).toBe(false)
  })
})

describe('trần cả đội', () => {
  it('mức báo theo ngưỡng; không đặt trần thì không báo', () => {
    const s = { teamCapUsd: 5, warnPct: 80 }
    expect(warnLevel(3.9, s)).toBeUndefined()
    expect(warnLevel(4, s)).toBe('nguong')
    expect(warnLevel(5, s)).toBe('tran')
    expect(warnLevel(100, { teamCapUsd: 0, warnPct: 80 })).toBeUndefined()
  })
  it('cài đặt giữ giá trị cũ khi gửi sai; không đổi được trạng thái dừng qua đây', () => {
    const s = cleanGuard(
      { teamCapUsd: 8, warnPct: 150, capMode: 'all', mode: 'x', stopped: true },
      DEFAULT_GUARD,
    )
    expect(s).toMatchObject({ teamCapUsd: 8, warnPct: 80, capMode: 'all', mode: 'ask', stopped: false })
  })
})
