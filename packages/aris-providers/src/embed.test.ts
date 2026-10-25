import { describe, expect, it } from 'vitest'
import { batchBody, classifyStatus, embed, EmbedError, framed, normalize, retryOf } from './embed.js'

describe('nhúng Gemini', () => {
  it('ghi việc vào đầu chữ cho gemini-embedding-2, dùng taskType cho model cũ', () => {
    expect(framed('gemini-embedding-2', 'giá in', 'query')).toBe('task: search result | query: giá in')
    expect(framed('gemini-embedding-2', 'nội dung', 'doc', 'In ấn')).toBe('title: In ấn | text: nội dung')
    const b = batchBody(
      { provider: 'google', model: 'gemini-embedding-001', texts: ['a'], mode: 'query' },
      768,
    )
    expect(b.requests[0]).toMatchObject({ taskType: 'RETRIEVAL_QUERY', output_dimensionality: 768 })
    const b2 = batchBody({ provider: 'google', model: 'gemini-embedding-2', texts: ['a'], mode: 'doc' }, 768)
    expect(b2.requests[0]).not.toHaveProperty('taskType')
  })

  it('chuẩn hoá vector, đọc giờ thử lại, phân loại lỗi', () => {
    const v = normalize([3, 4])
    expect(v[0]).toBeCloseTo(0.6)
    expect(v[1]).toBeCloseTo(0.8)
    expect(retryOf({ error: { details: [{ retryDelay: '37s' }] } })).toBe(37_000)
    expect(classifyStatus(429, {}).kind).toBe('rate')
    expect(classifyStatus(429, {}).retryMs).toBe(60_000)
    expect(classifyStatus(403, { error: { message: 'API key not valid' } }).kind).toBe('key')
    expect(classifyStatus(400, { error: { message: 'API key expired' } }).kind).toBe('key')
    expect(classifyStatus(500, {}).kind).toBe('other')
  })

  it('đọc khoá theo thứ tự tên, gọi lô, báo thiếu khoá', async () => {
    const asked: string[] = []
    const calls: { url: string; body: { requests: unknown[] }; key: string }[] = []
    const fetchFake = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { requests: unknown[] }
      calls.push({ url, body, key: (init.headers as Record<string, string>)['x-goog-api-key']! })
      return new Response(JSON.stringify({ embeddings: body.requests.map(() => ({ values: [1, 0] })) }))
    }) as unknown as typeof fetch
    const out = await embed(
      {
        fetch: fetchFake,
        key: async (ref) => {
          asked.push(ref)
          return ref === 'GEMINI_API_KEY' ? 'k' : undefined
        },
      },
      {
        provider: 'google',
        model: 'gemini-embedding-2',
        texts: Array.from({ length: 150 }, () => 'x'),
        mode: 'doc',
      },
    )
    expect(out).toHaveLength(150)
    expect(calls).toHaveLength(2)
    expect(calls[0]!.url).toContain('gemini-embedding-2:batchEmbedContents')
    expect(calls[0]!.key).toBe('k')
    expect(asked.slice(0, 2)).toEqual(['GOOGLE_API_KEY', 'GEMINI_API_KEY'])
    await expect(
      embed(
        { fetch: fetchFake, key: async () => undefined },
        { provider: 'google', model: 'gemini-embedding-2', texts: ['x'], mode: 'doc' },
      ),
    ).rejects.toMatchObject({ kind: 'nokey' })
    await expect(
      embed(
        { fetch: fetchFake, key: async () => 'k' },
        { provider: 'x', model: 'y', texts: ['x'], mode: 'doc' },
      ),
    ).rejects.toBeInstanceOf(EmbedError)
  })
})
