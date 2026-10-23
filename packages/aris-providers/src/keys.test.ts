import { describe, expect, it } from 'vitest'
import type { PoolRecord } from './domain.js'
import { KeyPools, fingerprint } from './keys.js'
import { memCreds, memTable } from './testing.js'

const setup = (init: Record<string, string> = { OR_KEY: 'k1' }) => {
  const creds = memCreds(init)
  const pools = new KeyPools(memTable<PoolRecord>(), creds, () => 1000)
  return { creds, pools }
}

describe('vòng khoá', () => {
  it('khoá đang có thành khoá 1, khoá thêm là khoá 2; không lộ giá trị', async () => {
    const { creds, pools } = setup()
    const info = await pools.add('openrouter', 'OR_KEY', ' k2 ')
    expect(info).toEqual({
      provider: 'openrouter',
      ref: 'OR_KEY',
      active: 1,
      keys: [
        { slot: 1, fp: fingerprint('k1'), addedAt: 1000 },
        { slot: 2, fp: fingerprint('k2'), addedAt: 1000 },
      ],
    })
    expect(JSON.stringify(info)).not.toMatch(/"k[12]"/)
    expect(creds.map.get('OR_KEY_ARIS_1')).toBe('k1')
    expect(creds.map.get('OR_KEY_ARIS_2')).toBe('k2')
    await expect(pools.add('openrouter', 'OR_KEY', 'k2')).rejects.toThrow('đã có')
    await expect(pools.add('openrouter', 'OTHER', 'k3')).rejects.toThrow('đang dùng khoá OR_KEY')
    await expect(pools.add('x', 'bad-name', 'k')).rejects.toThrow('không hợp lệ')
  })

  it('provider chưa có khoá: khoá đầu tiên thành khoá đang dùng', async () => {
    const { creds, pools } = setup({})
    await pools.add('groq', 'GROQ_KEY', 'g1')
    expect(creds.map.get('GROQ_KEY')).toBe('g1')
  })

  it('đổi vòng qua mỗi khoá một lần trong một lần gọi', async () => {
    const { creds, pools } = setup()
    await pools.add('openrouter', 'OR_KEY', 'k2')
    await pools.add('openrouter', 'OR_KEY', 'k3')
    const tried = new Set<number>()
    expect(await pools.rotate('openrouter', tried, 'RATE_LIMIT')).toBe(2)
    expect(creds.map.get('OR_KEY')).toBe('k2')
    expect(await pools.rotate('openrouter', tried, 'RATE_LIMIT')).toBe(3)
    expect(creds.map.get('OR_KEY')).toBe('k3')
    expect(await pools.rotate('openrouter', tried, 'RATE_LIMIT')).toBeUndefined()
    expect(pools.info('openrouter')!.keys.map((k) => k.error)).toEqual([
      'RATE_LIMIT',
      'RATE_LIMIT',
      'RATE_LIMIT',
    ])
    // Lần gọi mới: vòng tiếp từ khoá 3 sang khoá 1.
    expect(await pools.rotate('openrouter', new Set(), 'QUOTA')).toBe(1)
    expect(creds.map.get('OR_KEY')).toBe('k1')
  })

  it('anh gõ khoá mới vào ô khoá: giữ làm khoá đang dùng của vòng', async () => {
    const { creds, pools } = setup()
    await pools.add('openrouter', 'OR_KEY', 'k2')
    creds.map.set('OR_KEY', 'k1b')
    await pools.rotate('openrouter', new Set(), 'AUTH')
    expect(creds.map.get('OR_KEY_ARIS_1')).toBe('k1b')
    expect(pools.info('openrouter')!.keys[0]!.fp).toBe(fingerprint('k1b'))
  })

  it('bỏ khoá: dồn chỗ, không bỏ khoá đang dùng, còn một khoá thì thôi vòng', async () => {
    const { creds, pools } = setup()
    await pools.add('openrouter', 'OR_KEY', 'k2')
    await pools.add('openrouter', 'OR_KEY', 'k3')
    await expect(pools.remove('openrouter', 1)).rejects.toThrow('đang dùng')
    const info = await pools.remove('openrouter', 2)
    expect(info!.keys.map((k) => k.fp)).toEqual([fingerprint('k1'), fingerprint('k3')])
    expect(creds.map.get('OR_KEY_ARIS_2')).toBe('k3')
    expect(creds.map.has('OR_KEY_ARIS_3')).toBe(false)
    expect(await pools.remove('openrouter', 2)).toBeUndefined()
    expect(pools.info('openrouter')).toBeUndefined()
    expect(creds.map.get('OR_KEY')).toBe('k1')
    expect([...creds.map.keys()]).toEqual(['OR_KEY'])
  })
})
