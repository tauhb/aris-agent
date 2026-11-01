/**
 * Công cụ Aris quản đội (GĐ9.2): `create_bot`, `read_bot_instructions`, `update_bot_instructions`,
 * `restore_bot_instructions`. Chỉ phiên của Commander (Aris) dùng được. Tạo bot và đổi lời dặn luôn hỏi duyệt
 * người dùng bằng thẻ đủ chi tiết (hook `tools/pre-execute`, soạn ở `manage.ts`); đổi lời dặn ghi một bản
 * lịch sử "aris" nên hoàn tác được (trang hồ sơ bot, hay nhờ Aris khôi phục bản cũ).
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { BotRecord } from './domain.js'
import { createCard, editCard, handleFrom, type BotProposal } from './manage.js'
import type { SoulHistory } from './soul.js'
import { SOUL_MAX } from './soul.js'
import type { BotStore } from './store.js'

/** Linh vật Aris được chọn cho bot mới (thư viện linh vật của `@aris/ui-kit`); mã lạ thì dùng `tron`. */
export const MASCOT_CHOICES = [
  'tron',
  'qua-trung',
  'dam-may',
  'luc-giac',
  'hat-dau',
  'co-bon-la',
  'bong-hoa',
  'khien',
  'chiec-la',
  'ngon-lua',
  'bong-den',
  'coc-ca-phe',
  'qua-tao',
  'vien-ngoc',
  'sao-nam-canh',
] as const

export const MANAGE_TOOLS = [
  'create_bot',
  'read_bot_instructions',
  'update_bot_instructions',
  'restore_bot_instructions',
] as const

const ONLY = 'Chỉ Aris (Commander) được tạo bot và sửa lời dặn của bot.'

/** Lời báo lời dặn quá dài, kèm số ký tự cần bớt để model khỏi phải tự đếm. */
const tooLong = (n: number) =>
  `Lời dặn dài ${n} ký tự, quá giới hạn ${SOUL_MAX}: bớt ít nhất ${n - SOUL_MAX} ký tự (gộp ý trùng, bỏ ví dụ) rồi gọi lại.`

type Args = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function registerManageTools(ctx: Context, store: BotStore, souls: SoulHistory): void {
  const isCommander = (sessionId: string | undefined) =>
    !!sessionId && store.botOf(sessionId).kind === 'commander'

  /** Bot theo tên gọi (`@lan`), mã, hay tên hiển thị (không phân biệt hoa thường). */
  const findBot = (ref: string): BotRecord | undefined => {
    const r = ref.replace(/^@/, '').trim().toLowerCase()
    if (!r) return undefined
    return (
      store.byHandle(r) ??
      store.get(ref.trim()) ??
      store.list().find((b) => b.name.trim().toLowerCase() === r)
    )
  }

  const department = (ref: string) => {
    const r = ref.trim().toLowerCase()
    if (!r) return undefined
    return store.departments().find((d) => d.id.toLowerCase() === r || d.name.trim().toLowerCase() === r)
  }

  /** Đề xuất tạo bot từ tham số công cụ; dùng chung cho thẻ duyệt và lúc tạo thật. */
  const proposal = (a: Args): BotProposal | string => {
    const name = str(a.name).slice(0, 40)
    if (!name) return 'Bot mới cần có tên.'
    const soul = str(a.instructions)
    if (!soul) return 'Cần lời dặn (instructions) cho bot mới.'
    if (soul.length > SOUL_MAX) return tooLong(soul.length)
    const dep = str(a.department)
    const d = dep ? department(dep) : undefined
    if (dep && !d)
      return `Không có phòng «${dep}». Các phòng: ${
        store
          .departments()
          .map((x) => x.name)
          .join(', ') || '(chưa có)'
      }.`
    const mascot = (MASCOT_CHOICES as readonly string[]).includes(str(a.mascot)) ? str(a.mascot) : 'tron'
    return {
      name,
      handle: handleFrom(name, (h) => !!store.byHandle(h)),
      role: str(a.role).slice(0, 60),
      description: str(a.description).slice(0, 1000),
      soul,
      mascot,
      department: d ? { id: d.id, name: d.name } : undefined,
    }
  }

  /** Bản lời dặn mới cho lời gọi sửa hay khôi phục; chuỗi là lỗi để trả cho model. */
  const nextSoul = (name: string, a: Args) => {
    const bot = findBot(str(a.bot))
    if (!bot) return `Không có bot «${str(a.bot)}».`
    if (bot.kind === 'commander') return 'Lời dặn của Aris chỉ người dùng sửa ở trang hồ sơ.'
    if (bot.external) return `${bot.name} là bot ngoài, không có lời dặn của aris.`
    const meta = souls.meta(bot)
    if (name === 'restore_bot_instructions') {
      const v = Number(a.version)
      const rec = Number.isInteger(v) ? souls.get(bot.id, v) : undefined
      if (!rec)
        return `${bot.name} không có bản ${str(String(a.version ?? ''))}. Gọi read_bot_instructions để xem các bản.`
      return { bot, soul: rec.soul, version: { from: meta.version, to: meta.version + 1, restore: v } }
    }
    const soul = str(a.instructions)
    if (!soul) return 'Cần toàn văn lời dặn mới (instructions).'
    if (soul.length > SOUL_MAX) return tooLong(soul.length)
    if (soul === bot.soul) return `Lời dặn mới giống hệt bản hiện tại của ${bot.name}.`
    return { bot, soul, version: { from: meta.version, to: meta.version + 1 } }
  }

  // Thẻ duyệt đủ chi tiết: thay câu hỏi chung (nếu có) bằng thẻ của Aris; lời từ chối thì giữ.
  ctx.on(
    'tools/pre-execute',
    async (exec, next) => {
      const decision = await next()
      if (decision.kind === 'deny') return decision
      const a = (exec.arguments ?? {}) as Args
      if (!isCommander(exec.agent?.session.id)) return decision
      if (exec.name === 'create_bot') {
        const p = proposal(a)
        if (typeof p === 'string') return decision
        return {
          kind: 'ask',
          reason: createCard(p, 'vi'),
          displayReason: { vi: createCard(p, 'vi'), en: createCard(p, 'en') },
        }
      }
      if (exec.name === 'update_bot_instructions' || exec.name === 'restore_bot_instructions') {
        const n = nextSoul(exec.name, a)
        if (typeof n === 'string') return decision
        const why = str(a.reason)
        const vi = editCard(n.bot, n.soul, n.version, why, 'vi')
        return {
          kind: 'ask',
          reason: vi,
          displayReason: { vi, en: editCard(n.bot, n.soul, n.version, why, 'en') },
        }
      }
      return decision
    },
    true,
  )

  const text = {
    schema: { type: 'string' },
    render: (_a: unknown, v: string) => [{ type: 'text' as const, text: v }],
  } as const

  ctx.tools.register(
    defineTool({
      name: 'create_bot',
      description:
        'Chỉ Aris: tạo một bot mới cho đội khi người dùng nhờ (hay đồng ý với đề xuất của bạn). Người dùng sẽ thấy thẻ duyệt có đủ tên, vai, mô tả, toàn văn lời dặn và phải bấm cho phép. Mỗi lần gọi tạo một bot; đề xuất nhiều bot thì gọi lần lượt. Lời dặn viết bằng tiếng Việt, ngôi thứ hai ("Bạn là…"), nói rõ việc của bot, cách xưng hô, việc không được làm, khi nào hỏi lại người dùng.',
      parameters: {
        name: { type: 'string', required: true, description: 'Tên hiển thị, ví dụ Lan.' },
        role: { type: 'string', required: true, description: 'Vai ngắn, ví dụ Chăm sóc khách hàng.' },
        description: {
          type: 'string',
          required: true,
          description: 'Mô tả cho đồng đội: bot này làm gì, khi nào nên nhờ (một hai câu).',
        },
        instructions: {
          type: 'string',
          required: true,
          description: `Toàn văn lời dặn (SOUL) của bot, tối đa ${SOUL_MAX} ký tự (nên dưới 1.500).`,
        },
        department: { type: 'string', description: 'Tên phòng ban bot thuộc về (bỏ trống nếu chưa có).' },
        mascot: { type: 'string', description: `Linh vật, một trong: ${MASCOT_CHOICES.join(', ')}.` },
      },
      output: text,
      async execute(args, exec) {
        if (!isCommander(exec.agent?.session.id)) return ONLY
        const p = proposal(args as Args)
        if (typeof p === 'string') return p
        const rec = await store.create({
          name: p.name,
          handle: p.handle,
          role: p.role,
          description: p.description,
          soul: p.soul,
          ...(p.mascot ? { mascot: p.mascot } : {}),
          ...(p.department ? { department: p.department.id } : {}),
        })
        return `Đã tạo ${rec.name} (@${rec.handle})${p.department ? ` ở phòng ${p.department.name}` : ''}. ${rec.name} đã có trên thanh bên; người dùng bấm vào là chat được. Không bật quyền quản đội cho bot này.`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'read_bot_instructions',
      description:
        'Chỉ Aris: đọc toàn văn lời dặn hiện tại của một bot và danh sách các bản cũ (để sửa hay khôi phục).',
      parameters: { bot: { type: 'string', required: true, description: 'Tên hay @tên gọi của bot.' } },
      output: text,
      async execute(args, exec) {
        if (!isCommander(exec.agent?.session.id)) return ONLY
        const bot = findBot(str(args.bot))
        if (!bot) return `Không có bot «${str(args.bot)}».`
        const meta = souls.meta(bot)
        const versions = souls
          .list(bot.id)
          .slice(0, 10)
          .map((v) => `bản ${v.version} · ${v.at.slice(0, 16).replace('T', ' ')} · ${v.by}`)
        return [
          `${bot.name} (@${bot.handle}) · bản hiện tại ${meta.version} · ${bot.soul.length}/${SOUL_MAX} ký tự`,
          `Lời dặn:\n${bot.soul || '(trống)'}`,
          versions.length ? `Các bản:\n${versions.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'update_bot_instructions',
      description:
        'Chỉ Aris: thay lời dặn của một bot (đọc bằng read_bot_instructions trước). Gửi toàn văn bản mới, không gửi riêng chỗ đổi. Người dùng thấy thẻ duyệt có chỗ đổi và toàn văn; bản cũ vẫn giữ để hoàn tác.',
      parameters: {
        bot: { type: 'string', required: true, description: 'Tên hay @tên gọi của bot.' },
        instructions: {
          type: 'string',
          required: true,
          description: `Toàn văn lời dặn mới, tối đa ${SOUL_MAX} ký tự.`,
        },
        reason: { type: 'string', required: true, description: 'Vì sao sửa, theo lời người dùng.' },
      },
      output: text,
      async execute(args, exec) {
        if (!isCommander(exec.agent?.session.id)) return ONLY
        const n = nextSoul('update_bot_instructions', args as Args)
        if (typeof n === 'string') return n
        const rec = await store.update(n.bot.id, { soul: n.soul })
        const v = await souls.record(rec, n.bot.soul, rec.soul, 'aris')
        return `Đã sửa lời dặn của ${rec.name}, giờ là bản ${v?.version ?? n.version.to}. Bản ${n.version.from} vẫn giữ: muốn quay lại thì gọi restore_bot_instructions.`
      },
    }),
  )

  ctx.tools.register(
    defineTool({
      name: 'restore_bot_instructions',
      description:
        'Chỉ Aris: khôi phục một bản lời dặn cũ của bot (thành bản mới nhất). Người dùng duyệt trước.',
      parameters: {
        bot: { type: 'string', required: true, description: 'Tên hay @tên gọi của bot.' },
        version: { type: 'number', required: true, description: 'Số bản cần khôi phục.' },
        reason: { type: 'string', description: 'Vì sao khôi phục.' },
      },
      output: text,
      async execute(args, exec) {
        if (!isCommander(exec.agent?.session.id)) return ONLY
        const n = nextSoul('restore_bot_instructions', args as Args)
        if (typeof n === 'string') return n
        const rec = await store.update(n.bot.id, { soul: n.soul })
        const v = await souls.record(rec, n.bot.soul, rec.soul, 'restore', n.version.restore)
        return `Đã khôi phục lời dặn bản ${n.version.restore} của ${rec.name}, giờ là bản ${v?.version ?? n.version.to}.`
      },
    }),
  )
}
