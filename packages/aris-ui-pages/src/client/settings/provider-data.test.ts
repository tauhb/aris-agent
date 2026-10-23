import { describe, expect, it } from 'vitest'
import type { ProviderEntry } from '../page.js'
import {
  buildRows,
  credentialRefs,
  deriveKeyRef,
  joinProviders,
  modelLines,
  isChatModel,
  probeReason,
  profileAt,
  providerName,
  routeIdOf,
  splitDirectory,
} from './provider-data.js'

const pi = (id: string, name = id, extra: Partial<ProviderEntry> = {}): Omit<ProviderEntry, 'active'> => ({
  id,
  name,
  ns: 'llm-pi-ai',
  path: ['providers', id],
  nativeEnv: [],
  ...extra,
})

describe('provider-data', () => {
  it('tên khoá mặc định giống dsh', () => {
    expect(deriveKeyRef('minimax-cn')).toBe('MINIMAX_CN_API_KEY')
    expect(deriveKeyRef('deepseek-official')).toBe('DEEPSEEK_OFFICIAL_API_KEY')
  })

  it('nối danh bạ: route đang chạy mà không cấu hình được vẫn có mặt; DeepSeek lên đầu', () => {
    const rows = joinProviders(
      [
        { id: 'anthropic', name: 'Anthropic' },
        { id: 'deepseek-official', name: 'DeepSeek' },
        { id: 'local', name: 'Local' },
      ],
      [
        pi('anthropic', 'Anthropic'),
        pi('openai', 'OpenAI'),
        { ...pi('deepseek-official', 'DeepSeek'), ns: 'llm-deepseek', path: [] },
      ],
    )
    expect(rows.map((r) => [r.id, r.active])).toEqual([
      ['deepseek-official', true],
      ['anthropic', true],
      ['openai', false],
      ['local', true],
    ])
  })

  it('đọc hồ sơ theo đường dẫn', () => {
    const v = { providers: { a: { apiKeyEnv: 'X' } } }
    expect(profileAt(v, ['providers', 'a'])).toEqual({ apiKeyEnv: 'X' })
    expect(profileAt(v, ['providers', 'b'])).toBeUndefined()
    expect(profileAt(v, [])).toBe(v)
  })

  it('trạng thái khoá: tên trong hồ sơ, tên mặc định, biến môi trường của provider', () => {
    const entries = joinProviders(
      [
        { id: 'anthropic', name: 'Anthropic' },
        { id: 'groq', name: 'Groq' },
        { id: 'openai', name: 'OpenAI' },
      ],
      [pi('anthropic'), pi('groq', 'groq', { nativeEnv: ['GROQ_API_KEY'] }), pi('openai'), pi('xai')],
    )
    const ns = { providers: { anthropic: { apiKeyEnv: 'MY_ANTHROPIC' }, openai: {} } }
    const value = (n: string) => (n === 'llm-pi-ai' ? ns : undefined)
    expect(credentialRefs(entries, value).sort()).toEqual(
      ['GROQ_API_KEY', 'MY_ANTHROPIC', 'OPENAI_API_KEY', 'XAI_API_KEY'].sort(),
    )
    const rows = buildRows(entries, value, {
      MY_ANTHROPIC: { configured: true, writable: true },
      GROQ_API_KEY: { configured: true, writable: false, source: 'env' },
    })
    const by = Object.fromEntries(rows.map((r) => [r.entry.id, r]))
    expect(by.anthropic).toMatchObject({
      configured: true,
      keyRef: 'MY_ANTHROPIC',
      keyNamed: true,
      status: 'ok',
    })
    expect(by.groq).toMatchObject({ configured: false, nativeKey: true, status: 'ok' })
    expect(by.openai).toMatchObject({ configured: true, keyRef: 'OPENAI_API_KEY', status: 'nokey' })
    expect(by.xai).toMatchObject({ configured: false, status: 'off' })
  })

  it('chia danh bạ và tìm không dấu', () => {
    const entries = joinProviders(
      [{ id: 'a', name: 'Anthropic' }],
      [pi('a', 'Anthropic'), pi('g', 'Google Gemini'), pi('q', 'Qwen')],
    )
    const rows = buildRows(entries, () => undefined, {})
    const all = splitDirectory(rows)
    expect(all.connected.map((r) => r.entry.id)).toEqual(['a'])
    expect(all.available.map((r) => r.entry.id)).toEqual(['g', 'q'])
    expect(splitDirectory(rows, 'gemini').available.map((r) => r.entry.id)).toEqual(['g'])
  })

  it('bảng model: gộp model đang phục vụ, tự khai và vừa dò', () => {
    const lines = modelLines(
      { id: 'p', name: 'P', models: [{ id: 'm1', name: 'M1', reasoning: true }] },
      [{ id: 'm2', contextWindow: 128000 }],
      [{ id: 'm1', inputModalities: ['text', 'image'] }, { id: 'm3' }],
    )
    expect(lines).toEqual([
      { id: 'm1', name: 'M1', served: true, listed: false, reasoning: true, image: true },
      {
        id: 'm2',
        name: 'm2',
        served: false,
        listed: true,
        reasoning: false,
        image: false,
        contextWindow: 128000,
      },
      { id: 'm3', name: 'm3', served: false, listed: false, reasoning: false, image: false },
    ])
  })

  it('tên hiển thị khi dsh chỉ có mã route', () => {
    expect(providerName('openai', 'openai')).toBe('OpenAI')
    expect(providerName('minimax-cn', 'minimax-cn')).toBe('Minimax CN')
    expect(providerName('moonshotai-cn', 'moonshotai-cn')).toBe('Moonshot AI CN')
    expect(providerName('x', 'Tên riêng')).toBe('Tên riêng')
  })

  it('mã route từ tên hiển thị', () => {
    expect(routeIdOf('LiteLLM nội bộ')).toBe('litellm-noi-bo')
    expect(routeIdOf('  vLLM / máy chủ ')).toBe('vllm-may-chu')
  })

  it('đọc lý do lỗi khi gọi thử model', () => {
    expect(
      probeReason('402: {"message":"Insufficient credits. This account never purchased credits."}'),
    ).toBe('credits')
    expect(probeReason('404: The model `llama-3.1-8b-instant` does not exist')).toBe('notFound')
    expect(probeReason('429: google/gemma is temporarily rate-limited upstream')).toBe('rateLimit')
    expect(
      probeReason('404: openai/gpt-4.1-nano:batch cannot be used with the chat/completions endpoint'),
    ).toBe('batch')
    expect(probeReason('401 Unauthorized')).toBe('auth')
    expect(probeReason('quá thời gian chờ')).toBe('timeout')
    expect(probeReason('ECONNRESET')).toBe('other')
    expect(isChatModel('openai/gpt-4.1-nano:batch')).toBe(false)
    expect(isChatModel('openrouter/free')).toBe(true)
  })
})
