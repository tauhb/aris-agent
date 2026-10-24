import { describe, expect, it } from 'vitest'
import { pickModel } from './index.js'
import { parseReflection, reflectPrompt, transcriptOf } from './prompt.js'
import { emptyTurn } from './signals.js'

describe('lời nhắc vòng học', () => {
  it('kể lại lượt: lời người dùng, công cụ (đánh dấu lỗi), câu trả lời; quá dài giữ phần cuối', () => {
    const t = {
      ...emptyTurn(1),
      user: ['Chạy test giúp'],
      tools: [
        { name: 'bash', ok: false, brief: '{"command":"npm test"}' },
        { name: 'bash', ok: true, brief: '{"command":"pnpm test"}' },
      ],
      assistant: ['Đã chạy bằng pnpm, đạt hết.'],
    }
    const text = transcriptOf([t])
    expect(text).toContain('Người dùng: Chạy test giúp')
    expect(text).toContain('bash({"command":"npm test"}) → lỗi; bash({"command":"pnpm test"})')
    expect(transcriptOf([t], 20)).toMatch(/^…/)
    const prompt = reflectPrompt({
      bot: 'Kiệt',
      transcript: text,
      existing: ['Dùng pnpm'],
      reasons: ['recovered'],
    })
    expect(prompt).toContain('bot gặp lỗi rồi tự tìm ra cách')
    expect(prompt).toContain('- Dùng pnpm')
  })

  it('đọc JSON: tối đa 3 mục, nguồn ngoài không lên lõi, bỏ câu viết cứng xưng hô, sai định dạng thì rỗng', () => {
    const raw =
      '```json\n{"memories": [' +
      '{"text": "Người dùng muốn báo cáo có cột so tuần trước", "book": "owner", "kind": "preference", "tier": "core", "origin": "user", "why": "Người dùng sửa 2 lần", "quote": "phải có cột so tuần trước"},' +
      '{"text": "Giá vàng tăng 2%", "book": "notes", "tier": "core", "origin": "external"},' +
      '{"text": "Chủ nhân thích cà phê", "book": "owner"},' +
      '{"text": "a"}, {"text": "b"}, {"text": "c"}' +
      ']}\n```'
    const { memories } = parseReflection(raw)
    expect(memories).toHaveLength(3)
    expect(memories[0]).toMatchObject({
      book: 'owner',
      tier: 'core',
      origin: 'user',
      why: 'Người dùng sửa 2 lần',
    })
    expect(memories[1]).toMatchObject({ tier: 'archive', origin: 'external', kind: 'lesson' })
    expect(memories.map((m) => m.text)).not.toContain('Chủ nhân thích cà phê')
    expect(parseReflection('không có gì')).toEqual({ memories: [], insights: [] })
    expect(parseReflection('{"memories": 1}')).toEqual({ memories: [], insights: [] })
  })

  it('chọn model Flash của nhà cung cấp mặc định, không có thì model mặc định', () => {
    const groups = [
      { id: 'openrouter', models: [{ id: 'x/flash-1' }] },
      {
        id: 'deepseek',
        models: [
          { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
          { id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash' },
        ],
      },
    ]
    expect(pickModel({ default: { provider: 'deepseek', model: 'deepseek-v4-pro' }, groups })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })
    expect(
      pickModel({ default: { provider: 'a', model: 'b' }, groups: [{ id: 'a', models: [{ id: 'b' }] }] }),
    ).toEqual({
      provider: 'a',
      model: 'b',
    })
  })
})
