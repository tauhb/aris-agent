/**
 * Theme aris cho toàn bộ Web UI: một lớp ghi đè token đặt trên theme đang dùng
 * (sáng hoặc tối), nên người dùng vẫn đổi sáng/tối/theo hệ thống như cũ.
 */
import { ARIS_TOKENS } from './tokens.js'

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Lexend:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'

interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  theme: { overrideTokens(source: string, tokens: typeof ARIS_TOKENS): () => void }
}

export const inject = ['theme']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens('@aris/ui-theme', ARIS_TOKENS), 'aris-ui-theme: tokens')
  ctx.effect(() => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    link.dataset.plugin = '@aris/ui-theme'
    document.head.appendChild(link)
    return () => link.remove()
  }, 'aris-ui-theme: fonts')
}
