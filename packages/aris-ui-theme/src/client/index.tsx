/**
 * Theme và nhận diện aris cho toàn bộ Web UI: một lớp ghi đè token đặt trên theme
 * đang dùng (sáng hoặc tối, người dùng vẫn đổi như cũ), vài chỉnh CSS cho mảnh
 * token không với tới, tiêu đề và biểu tượng tab mang tên aris. Bật "Giao diện mới (GĐ9)"
 * thì dùng bảng màu, phông và kiểu thẻ của bản vẽ GĐ9 (`v2.ts`).
 */
import { isUiV2 } from '@aris/ui-kit/react'
import { keepArisTitle, useArisFavicon } from './brand.js'
import { OVERRIDES_CSS } from './overrides.js'
import { ARIS_TOKENS, G9_TOKENS } from './tokens.js'
import { V2_CLASS, V2_CSS } from './v2.js'

interface ClientContext {
  effect(fn: () => () => void, label?: string): void
  theme: { overrideTokens(source: string, tokens: typeof ARIS_TOKENS): () => void }
}

export const inject = ['theme']

function addStyle(id: string, css: string): () => void {
  const style = document.createElement('style')
  style.dataset.plugin = id
  style.textContent = css
  document.head.appendChild(style)
  return () => style.remove()
}

export function apply(ctx: ClientContext): void {
  const v2 = isUiV2()
  ctx.effect(
    () => ctx.theme.overrideTokens('@aris/ui-theme', v2 ? G9_TOKENS : ARIS_TOKENS),
    'aris-ui-theme: tokens',
  )
  ctx.effect(() => addStyle('@aris/ui-theme', OVERRIDES_CSS), 'aris-ui-theme: overrides')
  if (v2) {
    ctx.effect(() => addStyle('@aris/ui-theme-v2', V2_CSS), 'aris-ui-theme: v2')
    ctx.effect(() => {
      document.body.classList.add(V2_CLASS)
      return () => document.body.classList.remove(V2_CLASS)
    }, 'aris-ui-theme: v2 class')
  }
  ctx.effect(() => keepArisTitle(), 'aris-ui-theme: title')
  ctx.effect(() => useArisFavicon(), 'aris-ui-theme: favicon')
}
