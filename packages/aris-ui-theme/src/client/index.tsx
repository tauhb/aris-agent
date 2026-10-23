/**
 * Theme và nhận diện aris cho toàn bộ Web UI: một lớp ghi đè token đặt trên theme
 * đang dùng (sáng hoặc tối, người dùng vẫn đổi như cũ), vài chỉnh CSS cho mảnh
 * token không với tới, tiêu đề và biểu tượng tab mang tên aris.
 */
import { keepArisTitle, useArisFavicon } from './brand.js'
import { OVERRIDES_CSS } from './overrides.js'
import { ARIS_TOKENS } from './tokens.js'

interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  theme: { overrideTokens(source: string, tokens: typeof ARIS_TOKENS): () => void }
}

export const inject = ['theme']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens('@aris/ui-theme', ARIS_TOKENS), 'aris-ui-theme: tokens')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = '@aris/ui-theme'
    style.textContent = OVERRIDES_CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'aris-ui-theme: overrides')
  ctx.effect(() => keepArisTitle(), 'aris-ui-theme: title')
  ctx.effect(() => useArisFavicon(), 'aris-ui-theme: favicon')
}
