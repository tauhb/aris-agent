import { describe, expect, it, vi } from 'vitest'
import type { Link, PoolRecord } from './domain.js'
import { classify, nextLink, Router } from './fallback.js'
import { KeyPools } from './keys.js'
import { memCreds, memTable } from './testing.js'

const ds: Link = { provider: 'deepseek-official', model: 'deepseek-flash' }
const or: Link = { provider: 'openrouter', model: 'deepseek/deepseek-chat' }
const gq: Link = { provider: 'groq', model: 'openai/gpt-oss-120b' }

function router(
  chain: Link[],
  opts: { fits?: (l: Link) => boolean; pools?: KeyPools; botModel?: (s: string) => Link | undefined } = {},
) {
  const saved = new Map<string, { from: Link; to: Link; turn: number }>()
  const switched = vi.fn()
  const r = new Router({
    chain: () => chain,
    pools: opts.pools ?? new KeyPools(memTable<PoolRecord>(), memCreds()),
    fits: async (_s, l) => opts.fits?.(l) ?? true,
    switched,
    remember: async (s, rec) => void (rec ? saved.set(s, rec) : saved.delete(s)),
    recall: (s) => saved.get(s),
    ...(opts.botModel ? { botModel: opts.botModel } : {}),
  })
  return { r, switched, saved }
}

const cfg = (l: Link) => ({ ...l, reasoningEffort: 'high' })
const pass = async () => undefined
const quota = { code: 'QUOTA', message: 'hết tiền', status: 402 }

describe('phân loại lỗi', () => {
  it('đúng nhóm', () => {
    expect(classify({ code: 'AUTH', message: '' })).toBe('key')
    expect(classify({ code: 'INVALID_REQUEST', message: '', status: 402 })).toBe('key')
    expect(classify({ code: 'RATE_LIMIT', message: '' })).toBe('rate')
    expect(classify({ code: 'SERVER', message: '', status: 503 })).toBe('transient')
    expect(classify({ code: 'INVALID_REQUEST', message: '', status: 404 })).toBe('missing')
    expect(classify({ code: 'INVALID_REQUEST', message: '', status: 413 })).toBe('missing')
    expect(classify({ code: 'CONTEXT_WINDOW_EXCEEDED', message: '' })).toBe('overflow')
    expect(classify({ code: 'IMAGE_OFFLOAD_REQUIRED', message: '' })).toBe('pass')
  })

  it('mắt xích kế tiếp: sau model lỗi, bỏ cái đã lỗi và cái không chứa nổi', async () => {
    const all = async () => true
    expect(await nextLink([ds, or, gq], ds, new Set(), all)).toEqual(or)
    expect(await nextLink([ds, or, gq], or, new Set(), all)).toEqual(gq)
    expect(await nextLink([ds, or, gq], gq, new Set(), all)).toBeUndefined()
    expect(await nextLink([or, gq], ds, new Set(), all)).toEqual(or)
    expect(await nextLink([ds, or, gq], ds, new Set([`${or.provider}\n${or.model}`]), all)).toEqual(gq)
    expect(await nextLink([ds, or, gq], ds, new Set(), async (l) => l !== or)).toEqual(gq)
  })
})

describe('dự phòng', () => {
  it('hết tiền: chuyển ngay, lần thử lại dùng model kế tiếp, lượt sau về model đã chọn', async () => {
    const { r, switched } = router([ds, or, gq])
    expect(await r.request('s1', 1, 1, cfg(ds))).toEqual(cfg(ds))
    const next = vi.fn(pass)
    expect(await r.error('s1', 1, 1, ds.provider, ds.model, quota, next)).toEqual({ kind: 'retry' })
    expect(next).not.toHaveBeenCalled()
    expect(switched).toHaveBeenCalledWith('s1', ds, or, quota)
    // Lần thử lại: đổi provider/model, bỏ mức suy luận kế thừa.
    expect(await r.request('s1', 1, 1, cfg(ds))).toEqual(or)
    expect(await r.request('s1', 1, 2, cfg(ds))).toEqual(or)
    // OpenRouter cũng hết tiền: sang Groq.
    expect(await r.error('s1', 1, 2, or.provider, or.model, quota, pass)).toEqual({ kind: 'retry' })
    expect(await r.request('s1', 1, 2, cfg(ds))).toEqual(gq)
    // Hết chuỗi: lỗi đi tiếp.
    const last = vi.fn(pass)
    expect(await r.error('s1', 1, 2, gq.provider, gq.model, quota, last)).toBeUndefined()
    expect(last).toHaveBeenCalled()
    // Lượt sau: bộ chọn model của dsh đưa về model đã chọn; aris không đè.
    expect(await r.request('s1', 2, 1, cfg(ds))).toEqual(cfg(ds))
  })

  it('phiên không có model chọn: header còn giữ model dự phòng thì lượt sau trả về model cũ', async () => {
    const { r, saved } = router([ds, or])
    await r.request('s1', 1, 1, cfg(ds))
    await r.error('s1', 1, 1, ds.provider, ds.model, quota, pass)
    expect(saved.get('s1')).toEqual({ from: ds, to: or, turn: 1 })
    expect(await r.request('s1', 1, 1, cfg(ds))).toEqual(or)
    expect(await r.request('s1', 2, 1, { ...or })).toEqual(ds)
    expect(saved.has('s1')).toBe(false)
  })

  it('lỗi tạm: để dsh thử lại trước, hết lượt thử mới chuyển', async () => {
    const { r, switched } = router([ds, or])
    const server = { code: 'SERVER', message: '503', status: 503 }
    const retry = vi.fn(async () => ({ kind: 'retry' as const }))
    expect(await r.error('s1', 1, 1, ds.provider, ds.model, server, retry)).toEqual({ kind: 'retry' })
    expect(switched).not.toHaveBeenCalled()
    expect(await r.error('s1', 1, 1, ds.provider, ds.model, server, pass)).toEqual({ kind: 'retry' })
    expect(switched).toHaveBeenCalledWith('s1', ds, or, server)
  })

  it('giới hạn tốc độ: đổi khoá trước, hết khoá mới tới dsh rồi dự phòng', async () => {
    const creds = memCreds({ OR_KEY: 'k1' })
    const pools = new KeyPools(memTable<PoolRecord>(), creds)
    await pools.add('openrouter', 'OR_KEY', 'k2')
    const { r, switched } = router([or, gq], { pools })
    const limit = { code: 'RATE_LIMIT', message: '429', status: 429 }
    const next = vi.fn(pass)
    expect(await r.error('s1', 1, 1, or.provider, or.model, limit, next)).toEqual({ kind: 'retry' })
    expect(creds.map.get('OR_KEY')).toBe('k2')
    expect(next).not.toHaveBeenCalled()
    expect(await r.error('s1', 1, 1, or.provider, or.model, limit, next)).toEqual({ kind: 'retry' })
    expect(next).toHaveBeenCalledTimes(1)
    expect(switched).toHaveBeenCalledWith('s1', or, gq, limit)
  })

  it('lỗi không thuộc dự phòng: để dsh lo', async () => {
    const { r, switched } = router([ds, or])
    const next = vi.fn(async () => ({ kind: 'retry' as const }))
    const image = { code: 'IMAGE_OFFLOAD_REQUIRED', message: '' }
    expect(await r.error('s1', 1, 1, ds.provider, ds.model, image, next)).toEqual({ kind: 'retry' })
    expect(switched).not.toHaveBeenCalled()
  })

  it('tràn ngữ cảnh: dsh nén trước; nén không cứu được thì chuyển', async () => {
    const { r, switched } = router([gq, ds])
    const overflow = { code: 'CONTEXT_WINDOW_EXCEEDED', message: '413: Request too large' }
    const compact = vi.fn(async () => ({ kind: 'retry' as const }))
    expect(await r.error('s1', 1, 1, gq.provider, gq.model, overflow, compact)).toEqual({ kind: 'retry' })
    expect(switched).not.toHaveBeenCalled()
    expect(await r.error('s1', 1, 1, gq.provider, gq.model, overflow, pass)).toEqual({ kind: 'retry' })
    expect(switched).toHaveBeenCalledWith('s1', gq, ds, overflow)
  })

  it('bỏ qua mắt xích không chứa nổi ngữ cảnh', async () => {
    const { r, switched } = router([ds, or, gq], { fits: (l) => l !== or })
    await r.error('s1', 1, 1, ds.provider, ds.model, quota, pass)
    expect(switched).toHaveBeenCalledWith('s1', ds, gq, quota)
  })

  it('phiên bot được giao việc chạy bằng model riêng của bot; vẫn dự phòng được', async () => {
    const { r, switched } = router([or, gq], { botModel: (sid) => (sid === 'child' ? or : undefined) })
    expect(await r.request('child', 1, 1, cfg(ds))).toEqual(or)
    expect(await r.request('other', 1, 1, cfg(ds))).toEqual(cfg(ds))
    await r.error('child', 1, 1, or.provider, or.model, quota, pass)
    expect(switched).toHaveBeenCalledWith('child', or, gq, quota)
    expect(await r.request('child', 1, 1, cfg(ds))).toEqual(gq)
  })
})
