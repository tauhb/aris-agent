/**
 * Tính cách (SOUL) theo phiên bản (bản vẽ 2.2, tab Tính cách): mỗi lần đổi SOUL ghi một phiên bản
 * (ai sửa, lúc nào); khôi phục phiên bản cũ là một phiên bản mới. "Nhờ Aris viết lại" dựng lời nhắc
 * cho model và làm sạch câu trả lời thành SOUL.
 */
import { z } from 'zod'
import type { BotRecord, Table } from './domain.js'

export const soulRecord = z.object({
  bot: z.string(),
  version: z.number().int().positive(),
  soul: z.string(),
  at: z.string(),
  /** Bản lúc tạo bot, người dùng sửa, nhận bản Aris viết, hay khôi phục phiên bản cũ (`from`). */
  by: z.enum(['create', 'user', 'aris', 'restore']),
  from: z.number().int().optional(),
})
export type SoulRecord = z.infer<typeof soulRecord>

/** Độ dài tối đa của SOUL (như kho bot). */
export const SOUL_MAX = 2000

export class SoulHistory {
  constructor(
    private readonly table: Table<SoulRecord>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Các phiên bản của bot, mới trước. */
  list(bot: string): SoulRecord[] {
    return [...this.table.entries()]
      .map(([, r]) => r)
      .filter((r) => r.bot === bot)
      .sort((a, b) => b.version - a.version)
  }

  /** Phiên bản hiện tại và lần sửa cuối; chưa có lịch sử thì là bản 1 lúc tạo bot. */
  meta(bot: Pick<BotRecord, 'id' | 'createdAt'>): { version: number; at: string } {
    const last = this.list(bot.id)[0]
    return last ? { version: last.version, at: last.at } : { version: 1, at: bot.createdAt }
  }

  /**
   * Ghi lần đổi SOUL. Bot chưa có lịch sử thì bản cũ thành phiên bản 1 (lúc tạo bot) trước, để
   * khôi phục được về bản gốc.
   */
  async record(
    bot: Pick<BotRecord, 'id' | 'createdAt'>,
    prev: string,
    next: string,
    by: SoulRecord['by'],
    from?: number,
  ): Promise<SoulRecord | undefined> {
    if (prev === next) return undefined
    const list = this.list(bot.id)
    let version = list[0]?.version ?? 0
    if (!list.length) {
      version = 1
      await this.put({ bot: bot.id, version, soul: prev, at: bot.createdAt, by: 'create' })
    }
    const rec: SoulRecord = {
      bot: bot.id,
      version: version + 1,
      soul: next,
      at: this.now().toISOString(),
      by,
      ...(from !== undefined ? { from } : {}),
    }
    await this.put(rec)
    return rec
  }

  get(bot: string, version: number): SoulRecord | undefined {
    return this.table.get(keyOf(bot, version))
  }

  async removeBot(bot: string): Promise<void> {
    for (const r of this.list(bot)) await this.table.delete(keyOf(bot, r.version))
  }

  private put(r: SoulRecord) {
    return this.table.put(keyOf(r.bot, r.version), r)
  }
}

const keyOf = (bot: string, version: number) => `${bot}-v${version}`.replace(/[^A-Za-z0-9-]/g, '-')

/** Lời nhắc "Nhờ Aris viết lại" tính cách của một bot. */
export function rewritePrompt(
  bot: Pick<BotRecord, 'name' | 'role' | 'description'>,
  current: string,
  wish: string,
): string {
  return [
    `Bạn là Aris, người chỉ huy một đội bot AI. Hãy viết lại phần "Tính cách" (SOUL) cho bot ${bot.name}.`,
    `Vai trò: ${bot.role || 'chưa ghi'}.`,
    `Việc của bot: ${bot.description || 'chưa ghi'}.`,
    '',
    'Bản hiện tại:',
    current.trim() || '(trống)',
    '',
    wish.trim()
      ? `Người dùng muốn: ${wish.trim()}`
      : 'Người dùng muốn: viết lại cho rõ, gọn, hợp vai trò hơn.',
    '',
    'Yêu cầu:',
    '- Tiếng Việt có dấu, 4 đến 8 câu ngắn, mỗi câu một dòng, không đánh số, không gạch đầu dòng.',
    '- Viết ở ngôi thứ hai với bot ("Bạn là…", "Luôn…"): tính cách, cách làm việc, giọng văn, điều tránh.',
    '- Không viết cứng cách xưng hô với người dùng (không "anh", "chị", "chủ nhân"); cần thì gọi là "người dùng".',
    `- Tối đa ${SOUL_MAX - 500} ký tự. Giữ ý hay của bản hiện tại nếu người dùng không bảo bỏ.`,
    '- Chỉ trả về nội dung SOUL, không lời dẫn, không giải thích, không markdown.',
  ].join('\n')
}

/** Làm sạch câu trả lời của model thành SOUL: bỏ khối mã, lời dẫn kiểu "Đây là…", dấu đầu dòng. */
export function cleanRewrite(raw: string): string {
  let t = raw.trim()
  const fence = /^```[a-zA-Z]*\n([\s\S]*?)\n```$/.exec(t)
  if (fence) t = fence[1]!.trim()
  const lines = t
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
  if (lines[0] && /^(đây là|dưới đây|bản viết lại|soul)[^\n]*:\s*$/i.test(lines[0])) lines.shift()
  return lines.join('\n').slice(0, SOUL_MAX)
}
