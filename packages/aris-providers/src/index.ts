/**
 * Phần riêng của aris cho nhà cung cấp model (đặc tả: docs/specs/aris-providers.md).
 * Lõi (route, khoá, danh mục model) là của dsh; plugin này chỉ thêm đường
 * `/api/aris/providers/probe` để trang 6.2 gọi thử một model và đo kết nối.
 * Thứ tự dự phòng và xoay vòng khoá sẽ nằm ở đây.
 * @module @aris/providers
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import { probe, probeInputError } from './probe.js'

export * from './probe.js'

export const name = 'aris-providers'
export const inject = ['llm']

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** POST { provider, model } → { ok, ms, error? }. dsh đã kiểm cookie và quyền chủ nhân. */
export async function handleProbe(ctx: Context, request: Request): Promise<Response> {
  let body: { provider?: unknown; model?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'JSON không hợp lệ' }, 400)
  }
  const invalid = probeInputError(body.provider, body.model)
  if (invalid) return json({ error: invalid }, 400)
  return json(await probe((o) => ctx.llm.stream(o), body.provider as string, body.model as string))
}

export function apply(ctx: Context) {
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/providers/probe',
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: (request) => handleProbe(ctx, request),
      })
      return () => void dispose()
    }, 'aris-providers: /api/aris/providers/probe')
  })
}
