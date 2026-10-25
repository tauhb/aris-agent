import { describe, expect, it } from 'vitest'
import { Keychain, isRefName, type KeychainRunner } from './keychain.js'

/** Keychain giả: giữ mục trong bộ nhớ, đọc lệnh như `security` thật. */
function fake(): KeychainRunner & { items: Map<string, string>; calls: string[][] } {
  const items = new Map<string, string>()
  const calls: string[][] = []
  return {
    items,
    calls,
    exec: (args, stdin) => {
      calls.push([...args])
      if (args[0] === '-i' && stdin) {
        const m = /-a (\S+) .*-X ([0-9a-f]+)/.exec(stdin)
        if (m) items.set(m[1]!, Buffer.from(m[2]!, 'hex').toString('utf8'))
        return Promise.resolve({ code: 0, stdout: '' })
      }
      const ref = args[args.indexOf('-a') + 1]!
      if (args[0] === 'find-generic-password')
        return Promise.resolve(
          items.has(ref) ? { code: 0, stdout: `${items.get(ref)}\n` } : { code: 44, stdout: '' },
        )
      if (args[0] === 'delete-generic-password') items.delete(ref)
      return Promise.resolve({ code: 0, stdout: '' })
    },
  }
}

describe('Keychain', () => {
  it('ghi qua stdin dạng hex (không có giá trị trong tham số), đọc lại, xoá', async () => {
    const run = fake()
    const kc = new Keychain(run, 'thu')
    await kc.set('DEEPSEEK_API_KEY', 'sk-"bí mật" \\ 123')
    expect(run.items.get('DEEPSEEK_API_KEY')).toBe('sk-"bí mật" \\ 123')
    expect(run.calls.flat().join(' ')).not.toContain('bí mật')
    expect(await new Keychain(run, 'thu').get('DEEPSEEK_API_KEY')).toBe('sk-"bí mật" \\ 123')
    await kc.delete('DEEPSEEK_API_KEY')
    expect(await kc.get('DEEPSEEK_API_KEY')).toBeUndefined()
  })
  it('tên khoá hợp lệ; tên lạ không chạm Keychain', async () => {
    expect(isRefName('telegram:aris')).toBe(true)
    expect(isRefName('x; rm -rf')).toBe(false)
    const run = fake()
    expect(await new Keychain(run).get('a b')).toBeUndefined()
    expect(run.calls).toHaveLength(0)
    await expect(new Keychain(run).set('a b', 'x')).rejects.toThrow('không hợp lệ')
  })
})
