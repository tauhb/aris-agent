/**
 * Tìm lại phiên cũ của aris (đặc tả: docs/specs/aris-recall.md).
 * - Tool `recall`: search = tìm toàn văn qua `ctx.sessionQuery` của dsh rồi tóm tắt có dẫn
 *   nguồn `[S1#12]`; open = đọc nguyên văn quanh một tin.
 * - Đường `/api/aris/recall` cho hộp "Tìm trong mọi phiên" (1.6): kết quả thô, không gọi model.
 * Chỉ mục do lớp aris bật trong `@aris/bundle` (dsh-base để `openAt: never`).
 * @module @aris/recall
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-llm'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { findSources, openText, searchHits, summarize, type ModelRef, type QueryEngine } from './recall.js'

export * from './recall.js'
export * from './text.js'

export const name = 'aris-recall'
export const inject = ['systemPrompt', 'tools', 'sessionQuery', 'llm']

export interface Config {
  /** Model tóm tắt khi tìm lại; bỏ trống thì dùng model phiên đang chạy. */
  summaryModel?: ModelRef | undefined
}

export const RECALL_RECORD = 'plugin:aris/recall'

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/recall': { query: string; sessions: string[]; summarized: boolean }
  }
}

/** Sau đoạn hướng dẫn trí nhớ (60). */
export const SECTION_ORDER = 61

export const GUIDE = `Bạn tìm lại được các cuộc trò chuyện cũ với người dùng qua tool \`recall\`.
- Khi người dùng hỏi về chuyện đã bàn ở phiên trước ("hôm trước", "tuần trước", "lần đó mình chốt gì") mà ký ức không có, gọi recall action=search với từ khoá đặc trưng (tên riêng, thuật ngữ), không dùng cả câu hỏi; thêm days nếu người dùng nói khoảng thời gian.
- Trả lời kèm nguồn như kết quả ghi (ví dụ [S1#12]). Cần trích nguyên văn hay số liệu chính xác thì gọi action=open với mã phiên và số tin.
- Không thấy thì nói thật là không tìm thấy, có thể thử lại một lần với từ khoá khác.`

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })

/** GET ?q=…&limit=… → { hits }. dsh đã kiểm Host/Origin, cookie và quyền người dùng. */
export async function handleApi(engine: QueryEngine, request: Request): Promise<Response> {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return json({ hits: [] })
  if (q.length > 200) return json({ error: 'câu tìm quá dài' }, 400)
  try {
    const hits = await searchHits(engine, { query: q, limit: Number(url.searchParams.get('limit')) || 10 })
    return json({ hits })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 503)
  }
}

export function apply(ctx: Context, config: Config = {}): void {
  const engine = ctx.sessionQuery
  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'aris:recall-guide', order: SECTION_ORDER, text: GUIDE }),
    'aris-recall: guide',
  )

  // Model phiên đang chạy, từ sự kiện `request/context` gần nhất của mỗi phiên.
  const models = new Map<string, ModelRef>()
  ctx.on('session/event', (session, event) => {
    if (event.type === 'request/context')
      models.set(session.id, { provider: event.data.provider, model: event.data.model })
  })
  ctx.on('session/disposed', (session) => void models.delete(session.id))

  ctx.tools.register(
    defineTool({
      name: 'recall',
      description:
        'Tìm lại các cuộc trò chuyện cũ với người dùng (các phiên trước). search: tìm và tóm tắt có dẫn nguồn; open: đọc nguyên văn quanh một tin.',
      parameters: {
        action: { type: 'string', enum: ['search', 'open'], required: true },
        query: { type: 'string', description: 'search: từ khoá đặc trưng cần tìm.' },
        days: { type: 'integer', description: 'search: chỉ xét tin trong N ngày gần đây.' },
        limit: { type: 'integer', description: 'search: số phiên tối đa (mặc định 5, tối đa 10).' },
        session: { type: 'string', description: 'open: mã phiên trong danh sách nguồn.' },
        seq: { type: 'integer', description: 'open: số tin (số sau dấu # trong nguồn).' },
        around: { type: 'integer', description: 'open: số tin đọc thêm mỗi bên (mặc định 2).' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const session = exec.agent?.session
        try {
          if (args.action === 'open') {
            if (!args.session || args.seq === undefined) return 'open cần session và seq.'
            return await openText(engine, args.session, args.seq, args.around ?? 2)
          }
          if (args.action !== 'search') return 'action không hợp lệ.'
          const query = (args.query ?? '').trim()
          if (!query) return 'search cần query.'
          const hits = await searchHits(engine, {
            query,
            days: args.days,
            limit: args.limit,
            exclude: session?.id,
          })
          if (!hits.length) return `Không tìm thấy phiên cũ nào khớp "${query}".`
          const sources = await findSources(engine, hits)
          const model = config.summaryModel ?? (session ? models.get(session.id) : undefined)
          const result = await summarize((o) => ctx.llm.stream(o), model, query, sources, exec.signal)
          if (session)
            appendPluginRecord(session, RECALL_RECORD, {
              query,
              sessions: hits.map((h) => h.sessionId),
              summarized: result.summarized,
            })
          return result.text
        } catch (err) {
          return `Không tìm lại được: ${err instanceof Error ? err.message : String(err)}`
        }
      },
    }),
  )

  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/recall',
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: (request) => handleApi(engine, request),
      })
      return () => void dispose()
    }, 'aris-recall: /api/aris/recall')
  })
}
