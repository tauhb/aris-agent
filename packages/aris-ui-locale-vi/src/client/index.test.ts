import { describe, expect, it } from 'vitest'
import vi from '../../locales/vi.json' with { type: 'json' }
import { apply, LANGUAGE } from './index.js'

function fakeCtx() {
  const languages: unknown[] = []
  const registered: Record<string, { lang: string; dict: Record<string, string> }> = {}
  const ctx = {
    effect: (fn: () => unknown) => fn(),
    locale: {
      addLanguage: (lang: unknown) => languages.push(lang),
      register: (ns: string, lang: string, dict: Record<string, string>) => {
        registered[ns] = { lang, dict }
      },
    },
  }
  return { ctx, languages, registered }
}

describe('gói tiếng Việt', () => {
  it('thêm Tiếng Việt, lùi về tiếng Anh khi thiếu chuỗi', () => {
    const { ctx, languages } = fakeCtx()
    apply(ctx as never)
    expect(languages).toEqual([{ id: 'vi', label: 'Tiếng Việt', fallback: 'en' }])
    expect(LANGUAGE.fallback).toBe('en')
  })

  it('đăng ký mọi namespace dưới mã vi, không đè tiếng Anh', () => {
    const { ctx, registered } = fakeCtx()
    apply(ctx as never)
    expect(Object.keys(registered).sort()).toEqual(Object.keys(vi).sort())
    for (const { lang } of Object.values(registered)) expect(lang).toBe('vi')
  })
})
