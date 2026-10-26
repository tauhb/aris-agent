/**
 * Ký ức hai tầng của aris (đặc tả: docs/specs/aris-memory.md).
 * - Lõi: nạp vào mọi lượt qua ngữ cảnh động của dsh (`PromptContext`), nên ghi ký ức
 *   có hiệu lực ngay ở tin kế tiếp mà không viết lại đầu prompt.
 * - Lưu trữ: chỉ tìm khi cần (tool `memory`, action `search`).
 * - Trang Ký ức (3.1) đọc/sửa qua đường `/api/aris/memory` (chỉ ở mặt web).
 * @module @aris/memory
 */
import { untrustedKind } from '@aris/shell'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { DEFAULT_BOT, bookOwner, itemsFor } from './books.js'
import { memoryDomain } from './domain.js'
import { handleApi } from './api.js'
import { Proposals } from './proposals.js'
import { watchConversation } from './watch.js'
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
export { DEFAULT_BOT, bookOwner, itemsFor } from './books.js'
export { Proposals, viewOf, type ProposalEvent, type ProposalView } from './proposals.js'

export const name = 'aris-memory'
export const inject = ['systemPrompt', 'tools', 'storageDomain', 'llm']

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
- Lưu khi người dùng nói "nhớ là…", sửa lại cách bạn làm, cho biết sở thích, thói quen, quy ước; hoặc khi bạn rút ra bài học sẽ dùng lại.
- Không lưu vào ký ức sự thật về người, dự án, khách hàng, sản phẩm, số liệu (ví dụ "chị Hà là đối tác dựng video", "giá in 1.200 đ/tờ"): đó là việc của bộ não. Ghi chúng bằng brain_note (vào nhật ký hôm nay, Thủ thư nạp vào đúng trang).
- book=owner cho điều về người dùng; book=notes cho môi trường, quy ước, bài học của bạn.
- tier=core cho điều cần nhớ mọi lúc, viết thành một câu ngắn; tier=archive cho chi tiết, sự kiện, dự án; tìm lại bằng action=search khi cần.
- origin=user khi người dùng nói ra; origin=inferred khi bạn tự suy ra; origin=external khi lấy từ web, tệp, email (chỉ được vào archive). Chỉ origin=user có hiệu lực ngay; inferred và external thành đề xuất chờ người dùng duyệt. Trong phiên nền, phiên con, việc được giao hay lượt của người khác thì mọi ký ức đều chờ duyệt và không sửa, quên được.
- Không lưu bí mật (mật khẩu, khoá, token) và không lưu tiến độ tạm thời của việc đang làm.
- Lõi có trần ký tự: khi đầy, gộp hoặc rút gọn bằng action=update, hoặc chuyển mục ít dùng xuống archive. Sửa ký ức sai bằng action=update với mã trong ngoặc vuông; xoá bằng action=forget.
Sau khi lưu (origin=user), báo ngắn cho người dùng là đã nhớ; với đề xuất chờ duyệt, báo là bạn đề xuất ghi nhớ.`

const TRUST = { user: 'user-stated', inferred: 'agent-inferred', external: 'external' } as const

/** Đề xuất ký ức từ plugin khác (vòng học nền). */
export interface ProposeInput {
  /** Bot đề xuất. */
  bot: string
  text: string
  book: Book
  kind: Kind
  tier: Tier
  origin: keyof typeof TRUST
  why?: string | undefined
  quote?: string | undefined
  sessionId?: string | undefined
  via: 'reflect' | 'compaction' | 'tool'
}

function describe(item: MemoryItem): string {
  return `[${item.id}] (${item.book}/${item.tier}/${item.kind}) ${item.text}`
}

export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('aris-memory')
  const domain = await ctx.storageDomain.open(memoryDomain)
  ctx.effect(() => () => void domain.close(), 'aris-memory: domain')
  const store = new MemoryStore(domain.table('items'))
  const proposals = new Proposals(store)
  ctx.provide('arisMemory', {
    // Nhân bản, xuất / nhập bot (@aris/bots): chép ký ức riêng của bot.
    notesOf: (bot: string) => store.notesOf(bot),
    statsOf: (bot: string) => store.statsOf(bot),
    importNotes: (bot: string, items: readonly { text: string; kind: string; tier: string }[]) =>
      store.importNotes(bot, items),
    /** Đồ thị bộ não (@aris/brain): ký ức đang hiệu lực của mọi bot, chỉ đọc. */
    activeAll: () =>
      store
        .activeAll()
        .map((m) => ({ id: m.id, bot: m.bot, book: m.book, tier: m.tier, text: m.text, at: m.updatedAt })),
    /** Soát bộ não (@aris/brain): xoá ký ức đã đưa vào bộ não, hay thừa vì trang đã có. */
    forget: (id: string) => store.forget(id),
    /** Hỏi bộ não (@aris/brain): tìm trong ký ức đang hiệu lực của mọi bot, chỉ đọc. */
    searchAll: (query: string, limit?: number) =>
      store.searchAll(query, limit).map((m) => ({
        id: m.id,
        bot: m.bot,
        book: m.book,
        tier: m.tier,
        text: m.text,
        at: m.updatedAt,
      })),
    /** Ký ức bot thấy (cả đề xuất đang chờ): vòng học nền đọc để khỏi đề xuất trùng. */
    textsFor: (bot: string) => itemsFor(store, bot).map((m) => m.text),
    /** Ký ức chờ duyệt: vòng học nền (@aris/reflect) đề xuất, Telegram (@aris/channels) nghe và trả lời. */
    proposals: {
      propose: (p: ProposeInput) =>
        proposals.propose({
          bot: bookOwner(p.bot, p.book),
          text: p.text,
          book: p.book,
          kind: p.kind,
          tier: p.origin === 'external' ? 'archive' : p.tier,
          trust: TRUST[p.origin],
          sessionId: p.sessionId,
          proposal: { by: p.bot, why: p.why, quote: p.quote, via: p.via },
        }),
      list: () => proposals.list(),
      on: (fn: Parameters<Proposals['on']>[0]) => proposals.on(fn),
      answer: (
        id: string,
        decision: 'saved' | 'discarded',
        by: 'user' | 'telegram',
        patch?: { text?: string; tier?: Tier },
      ) => proposals.review(id, decision, by, patch),
    },
  })
  // Đề xuất quá hạn tự bỏ: quét lúc khởi động và mỗi giờ.
  const sweep = () =>
    void proposals
      .expire()
      .then((n) => n && logger.info('bỏ %d đề xuất ký ức quá hạn', n))
      .catch((e: unknown) => logger.warn('bỏ đề xuất quá hạn: %s', String(e)))
  ctx.effect(() => {
    sweep()
    const timer = setInterval(sweep, 3_600_000)
    return () => clearInterval(timer)
  }, 'aris-memory: đề xuất quá hạn')
  await store
    .dropHardcodedAddress()
    .then((n) => n && logger.info('đổi chữ "chủ nhân" trong %d ký ức', n))
    .catch((e: unknown) => logger.warn('sửa cách gọi trong ký ức: %s', String(e)))
  // Bot của phiên do @aris/bots giữ; không có plugin đó thì mọi phiên là của Commander.
  const botOf = (sessionId: string | undefined) =>
    (ctx.get('arisBots') as { botOf(id: string | undefined): { id: string } } | undefined)?.botOf(sessionId)
      .id ?? DEFAULT_BOT

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
        text: (c) => renderCore(itemsFor(store, botOf(c?.agent?.session.id))),
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
        text: {
          type: 'string',
          description:
            'Nội dung ký ức (save, update), viết thành một câu. Nhắc tới người dùng thì viết "người dùng", không dùng anh, chị, chủ nhân.',
        },
        id: { type: 'string', description: 'Mã ký ức trong ngoặc vuông (update, forget).' },
        query: { type: 'string', description: 'Từ khoá cần tìm (search).' },
        book: {
          type: 'string',
          enum: ['owner', 'notes'],
          description: 'save: owner = về người dùng, notes = môi trường, quy ước, bài học.',
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
          description:
            'save: người dùng nói (user), bạn suy ra (inferred), hay lấy từ nguồn ngoài (external).',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const session = exec.agent?.session
        const bot = botOf(session?.id)
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
        const untrusted = untrustedKind((svc) => ctx.get(svc), session)
        // Kho đề xuất chỉ có kiểu thêm mới (chưa có đề xuất sửa hay quên), nên sửa và quên bị từ chối hẳn trong phiên
        // không tin cậy; bot muốn đổi ký ức thì đề xuất ký ức mới qua `save` để người dùng duyệt.
        const refuseUntrusted = (verb: string) =>
          `Không làm được: phiên này không phải chat trực tiếp của người dùng nên không được ${verb} ký ức. Muốn đổi ký ức thì lưu một ký ức mới (action=save): nó thành đề xuất để người dùng duyệt.`
        try {
          switch (args.action) {
            case 'save': {
              const book = (args.book ?? 'owner') as Book
              // `origin` do model tự khai nên không đủ để tin: trong phiên không phải chat trực tiếp của người dùng
              // (routine, Thủ thư, kiểm thử skill, phiên con, việc được giao, khách ACP, người lạ trên Telegram)
              // chữ có thể đến từ nguồn ngoài, nên `user` bị hạ thành `inferred` và chờ duyệt (đợt 7f, S5).
              const claimed = (args.origin ?? 'inferred') as keyof typeof TRUST
              const origin = claimed === 'user' && untrusted ? 'inferred' : claimed
              const input = {
                bot: bookOwner(bot, book),
                text: args.text ?? '',
                book,
                tier: (origin === 'external' ? 'archive' : (args.tier ?? 'core')) as Tier,
                kind: (args.kind ?? 'fact') as Kind,
                trust: TRUST[origin],
                sessionId: session?.id,
              }
              // Chỉ điều người dùng nói ra được lưu ngay; điều bot suy ra hay lấy từ nguồn ngoài chờ duyệt.
              if (origin !== 'user') {
                if (!input.text.trim()) return 'Không làm được: Nội dung ký ức rỗng.'
                const p = await proposals.propose({ ...input, proposal: { by: bot, via: 'tool' } })
                if (!p) return 'Đã có ký ức (hoặc đề xuất) gần giống; không ghi thêm.'
                record('save', p)
                return `Đã gửi đề xuất ký ức [${p.id}] cho người dùng duyệt (Hộp duyệt, Telegram); chưa có hiệu lực. Nói ngắn với người dùng là bạn đề xuất ghi nhớ điều này, không nói là đã nhớ.`
              }
              const m = await store.save(input)
              record('save', m)
              const u = store.usage(m.bot, m.book)
              return `Đã lưu ${describe(m)}.${m.tier === 'core' ? ` Cuốn ${m.book}: ${u.used}/${u.cap} ký tự.` : ''}`
            }
            case 'update': {
              if (untrusted) return refuseUntrusted('sửa')
              const m = await store.update(args.id ?? '', args.text ?? '')
              record('update', m)
              return `Đã sửa ${describe(m)}.`
            }
            case 'forget': {
              if (untrusted) return refuseUntrusted('quên')
              const m = await store.forget(args.id ?? '')
              record('forget', m)
              return `Đã quên [${m.id}].`
            }
            case 'search': {
              const found = [
                ...(await store.search(DEFAULT_BOT, args.query ?? '')).filter(
                  (m) => bot === DEFAULT_BOT || m.book === 'owner',
                ),
                ...(bot === DEFAULT_BOT
                  ? []
                  : (await store.search(bot, args.query ?? '')).filter((m) => m.book === 'notes')),
              ]
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

  // Tự nhắc lưu và lưu trước khi nén.
  const watch = watchConversation(ctx, store, proposals, (sessionId) => botOf(sessionId))

  // Trang Ký ức của web gọi qua đường /api của dsh (dsh kiểm cookie và chỉ cho người dùng).
  ctx.inject(['connection'], (ctx) => {
    ctx.effect(() => {
      const dispose = ctx.connection.fetch.register({
        path: '/api/aris/memory',
        methods: ['GET', 'POST'],
        requestBody: 'buffered',
        fetch: (request) => handleApi(store, request, watch.lastReflect, proposals),
      })
      return () => void dispose()
    }, 'aris-memory: /api/aris/memory')
  })
}
