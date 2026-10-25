import { describe, expect, it } from 'vitest'
import {
  chainFor,
  classifyMedia,
  cleanLinks,
  DEFAULT_MEDIA,
  generate,
  geminiBody,
  mediaBlocks,
  openrouterFiles,
} from './media.js'

const g = { provider: 'google', model: 'gemini-3.1-flash-lite-image' }
const o = { provider: 'openrouter', model: 'openai/gpt-image-2' }

describe('ảnh và video', () => {
  it('chọn chuỗi: chung, tắt, riêng, riêng rơi về chung', () => {
    expect(chainFor('image', DEFAULT_MEDIA)).toEqual([g, o])
    expect(chainFor('image', DEFAULT_MEDIA, { mode: 'off' })).toEqual([])
    expect(chainFor('image', DEFAULT_MEDIA, { mode: 'own', list: [o] })).toEqual([o])
    expect(chainFor('image', DEFAULT_MEDIA, { mode: 'own', list: [o], fallback: true })).toEqual([o, g])
    expect(chainFor('video', DEFAULT_MEDIA, { mode: 'own', list: [] })).toEqual([])
  })

  it('chỉ nhận model có trong danh mục của loại, bỏ trùng', () => {
    expect(cleanLinks('image', [o, o, { provider: 'x', model: 'y' }, 3])).toEqual([o])
    expect(cleanLinks('video', [o])).toEqual([])
  })

  it('phân loại lỗi để biết thử tiếp', () => {
    expect(
      classifyMedia(400, {
        error: {
          message: 'Image generation is not available on the free tier',
          status: 'FAILED_PRECONDITION',
        },
      }).kind,
    ).toBe('billing')
    expect(classifyMedia(402, {}).kind).toBe('money')
    expect(classifyMedia(429, {}).kind).toBe('rate')
    expect(
      classifyMedia(429, {
        error: { message: 'Quota exceeded for metric generate_content_free_tier_requests, limit: 0' },
      }).kind,
    ).toBe('billing')
    expect(classifyMedia(403, { error: { message: 'API key not valid' } }).kind).toBe('key')
    expect(classifyMedia(400, { error: { message: 'aspect ratio 21:9 unsupported' } }).kind).toBe(
      'unsupported',
    )
  })

  it('dựng yêu cầu Gemini, đọc khối ảnh và ảnh OpenRouter', () => {
    expect(geminiBody('m', { kind: 'image', prompt: 'p', ratio: '16:9' }).response_format).toEqual({
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '16:9',
    })
    expect(geminiBody('m', { kind: 'video', prompt: 'p' }).response_format).toMatchObject({
      type: 'video',
      aspect_ratio: '16:9',
    })
    const body = {
      id: 'x',
      steps: [
        {
          type: 'model_output',
          content: [
            { type: 'text', text: 'hi' },
            { type: 'image', mime_type: 'image/png', data: 'AAEC' },
          ],
        },
      ],
    }
    expect(mediaBlocks(body, 'image')).toEqual([{ mime: 'image/png', data: 'AAEC' }])
    expect(mediaBlocks(body, 'video')).toEqual([])
    const r = openrouterFiles({
      data: [{ b64_json: 'AAEC', media_type: 'image/webp' }],
      usage: { cost: 0.04 },
    })
    expect(r.usd).toBe(0.04)
    expect(Array.from(r.files[0]!.data)).toEqual([0, 1, 2])
  })

  it('model đầu chưa bật thanh toán thì thử model kế, ghi lại lần hỏng', async () => {
    const fetchFake = (async (url: string) =>
      url.includes('googleapis')
        ? new Response(
            JSON.stringify({ error: { message: 'billing not enabled', status: 'FAILED_PRECONDITION' } }),
            { status: 400 },
          )
        : new Response(
            JSON.stringify({ data: [{ b64_json: 'AAEC' }], usage: { cost: 0.05 } }),
          )) as unknown as typeof fetch
    const out = await generate({ fetch: fetchFake, key: async () => 'k' }, [g, o], {
      kind: 'image',
      prompt: 'p',
    })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.link).toEqual(o)
    expect(out.usd).toBe(0.05)
    expect(out.tried).toEqual([{ link: g, kind: 'billing', message: 'billing not enabled' }])
    const none = await generate({ fetch: fetchFake, key: async () => undefined }, [g], {
      kind: 'image',
      prompt: 'p',
    })
    expect(none).toMatchObject({ ok: false, tried: [{ kind: 'nokey' }] })
  })
})
