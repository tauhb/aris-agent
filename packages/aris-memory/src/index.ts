/**
 * Ký ức hai tầng của aris (đặc tả: docs/specs/aris-memory.md).
 * - Lõi: nạp vào mọi lượt qua ngữ cảnh động của dsh (`PromptContext`), nên ghi ký ức
 *   có hiệu lực ngay ở tin kế tiếp mà không viết lại đầu prompt.
 * - Lưu trữ: chỉ tìm khi cần (tool `memory`, action `search`).
 * - Trang Ký ức (3.1) đọc/sửa qua đường `/api/aris/memory` (chỉ ở mặt web).
 * @module @aris/memory
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { memoryDomain } from './domain.js'
import { handleApi } from './api.js'
import {
  MemoryError,
  MemoryStore,
  renderCore,
  type Book,
  type Kind,
  type MemoryItem,
  type Tier,
} from './store.js'

export * from './store.js'
export { handleApi } from './api.js'

export const name = 'aris-memory'
export const inject = ['systemPrompt', 'tools', 'storageDomain']

/** Bot của phiên. Giai đoạn 1 chỉ có Aris; giai đoạn 2 lấy từ agent preset. */
export const DEFAULT_BOT = 'aris'

/** Bản ghi trong log phiên mỗi lần ký ức đổi (truy vết: model thấy gì, log có nấy). */
export const MEMORY_OP_RECORD = 'plugin:aris/memory-op'

export interface MemoryOpRecord {
  op: 'save' | 'update' | 'forget'
  id: string
  revision: number
  book: Book
  tier: Tier
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/memory-op': MemoryOpRecord
  }
}

/** Vị trí đoạn hướng dẫn: sau persona và hướng dẫn chung của dsh. */
export const SECTION_ORDER = 60
/** Vị trí khối ký ức lõi giữa các ngữ cảnh động (sau thư mục làm việc, chính sách). */
export const CONTEXT_ORDER = 300

export const GUIDE = `Bạn có trí nhớ bền giữa các phiên qua tool \`memory\`. Ký ức lõi hiện có nằm trong khối <aris-memory> (nếu có) và luôn được nạp sẵn.
- Lưu khi chủ nhân nói "nhớ là…", sửa lại cách bạn làm, cho biết sở thích, thói quen, quy ước, người, dự án; hoặc khi bạn rút ra bài học sẽ dùng lại.
- book=owner cho điều về chủ nhân; book=notes cho môi trường, quy ước, bài học của bạn.
- tier=core cho điều cần nhớ mọi lúc, viết thành một câu ngắn; tier=archive cho chi tiết, sự kiện, dự án; tìm lại bằng action=search khi cần.
- origin=user khi chủ nhân nói ra; origin=inferred khi bạn tự suy ra; origin=external khi lấy từ web, tệp, email (chỉ được vào archive).
- Không lưu bí mật (mật khẩu, khoá, token) và không lưu tiến độ tạm thời của việc đang làm.
- Lõi có trần ký tự: khi đầy, gộp hoặc rút gọn bằng action=update, hoặc chuyển mục ít dùng xuống archive. Sửa ký ức sai bằng action=update với mã trong ngoặc vuông; xoá bằng action=forget.
Sau khi lưu, báo ngắn cho chủ nhân là đã nhớ.`

const TRUST = { user: 'user-stated', inferred: 'agent-inferred', external: 'external' } as const

function describe(item: MemoryItem): string {
  return `[${item.id}] (${item.book}/${item.tier}/${item.kind}) ${item.text}`
}

export async function apply(ctx: Context): Promise<void> {
  const domain = await ctx.storageDomain.open(memoryDomain)
  ctx.effect(() => () => void domain.close(), 'aris-memory: domain')
  const store = new MemoryStore(domain.table('items'))
  const bot = DEFAULT_BOT

  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'aris:memory-guide', order: SECTION_ORDER, text: GUIDE }),
    'aris-memory: guide',
  )
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'aris:memory',
        order: CONTEXT_ORDER,
        // Đọc lại mỗi lần dựng prompt: ký ức vừa ghi có ngay ở bước kế tiếp.
        text: () => renderCore(store.list(bot)),
        interpolate: false,
      }),
    'aris-memory: core context',
  )

  ctx.tools.register(
    defineTool({
      name: 'memory',
      description:
        'Trí nhớ bền của bạn: lưu, sửa, quên, tìm ký ức. Ký ức lõi luôn nằm sẵn trong <aris-memory>; lưu trữ chỉ thấy khi search.',
      parameters: {
        action: { type: 'string', enum: ['save', 'update', 'forget', 'search'], required: true },
        text: { type: 'string', description: 'Nội dung ký ức (save, update), viết thành một câu.' },
        id: { type: 'string', description: 'Mã ký ức trong ngoặc vuông (update, forget).' },
        query: { type: 'string', description: 'Từ khoá cần tìm (search).' },
        book: {
          type: 'string',
          enum: ['owner', 'notes'],
          description: 'save: owner = về chủ nhân, notes = môi trường, quy ước, bài học.',
        },
        tier: {
          type: 'string',
          enum: ['core', 'archive'],
          description: 'save: core = nhớ mọi lúc, archive = tìm khi cần.',
        },
        kind: {
          type: 'string',
          enum: ['preference', 'environment', 'convention', 'lesson', 'project', 'person', 'event', 'fact'],
          description: 'save: loại ký ức.',
        },
        origin: {
          type: 'string',
          enum: ['user', 'inferred', 'external'],
          description: 'save: chủ nhân nói (user), bạn suy ra (inferred), hay lấy từ nguồn ngoài (external).',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const session = exec.agent?.session
        const record = (op: MemoryOpRecord['op'], m: MemoryItem) => {
          if (session)
            appendPluginRecord(session, MEMORY_OP_RECORD, {
              op,
              id: m.id,
              revision: m.revision,
              book: m.book,
              tier: m.tier,
            })
        }
        try {
          switch (args.action) {
            case 'save': {
              const m = await store.save({
                bot,
                text: args.text ?? '',
                book: (args.book ?? 'owner') as Book,
                tier: (args.tier ?? 'core') as Tier,
                kind: (args.kind ?? 'fact') as Kind,
                trust: TRUST[(args.origin ?? 'inferred') as keyof typeof TRUST],
                sessionId: session?.id,
              })
              record('save', m)
              const u = store.usage(bot, m.book)
              return `Đã lưu ${describe(m)}.${m.tier === 'core' ? ` Cuốn ${m.book}: ${u.used}/${u.cap} ký tự.` : ''}`
            }
            case 'update': {
              const m = await store.update(args.id ?? '', args.text ?? '')
              record('update', m)
              return `Đã sửa ${describe(m)}.`
            }
            case 'forget': {
              const m = await store.forget(args.id ?? '')
              record('forget', m)
              return `Đã quên [${m.id}].`
            }
            case 'search': {
              const found = await store.search(bot, args.query ?? '')
              return found.length ? found.map(describe).join('\n') : 'Không thấy ký ức nào khớp.'
            }
            default:
              return 'action không hợp lệ.'
          }
        } catch (err) {
          if (err instanceof MemoryError) return `Không làm được: ${err.message}`
          throw err
        }
      },
    }),
  )

  // Trang Ký ức của web gọi qua đường /api của dsh (dsh kiểm cookie và chỉ cho chủ nhân).
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/memory',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleApi(store, request),
      })
      return () => void dispose()
    }, 'aris-memory: /api/aris/memory')
  })
}
