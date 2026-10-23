/**
 * Thêm "Tiếng Việt" vào danh sách ngôn ngữ của dsh (Cài đặt › Chung › Ngôn ngữ)
 * và đăng ký bản dịch cho từng namespace. Tiếng Anh, tiếng Trung giữ nguyên;
 * chuỗi chưa dịch tự hiện tiếng Anh nhờ `fallback: 'en'`.
 */
import vi from '../../locales/vi.json' with { type: 'json' }

interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  locale: {
    addLanguage(input: { id: string; label: string; fallback: string }): () => void
    register(ns: string, locale: string, dict: Record<string, string>): () => void
  }
}

export const inject = ['locale']
export const LANGUAGE = { id: 'vi', label: 'Tiếng Việt', fallback: 'en' }

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.addLanguage(LANGUAGE), 'aris-ui-locale-vi: language')
  for (const [ns, dict] of Object.entries(vi as Record<string, Record<string, string>>)) {
    ctx.effect(() => ctx.locale.register(ns, 'vi', dict), `aris-ui-locale-vi: ${ns}`)
  }
}
