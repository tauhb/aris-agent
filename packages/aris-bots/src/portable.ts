/**
 * Nhân bản và xuất / nhập bot (bản vẽ 2.4). Tệp xuất `aris-bot` chỉ chứa phần được chọn: danh tính,
 * cấu hình (model, phòng ban, bot ngoài), tính cách, ký ức riêng của bot. Không bao giờ chứa kênh
 * nhắn tin (token Telegram), khoá API hay lịch sử chat.
 */
import { z } from 'zod'
import { modelRef, type BotRecord } from './domain.js'
import type { ExternalConfig } from './external.js'
import { BotError, HANDLE_RE, type BotInput } from './store.js'

/** Phần được sao chép khi nhân bản hoặc xuất. */
export interface CopyParts {
  /** Model riêng, model theo việc, phòng ban, bộ công cụ, quyền. Cấu hình bot ngoài luôn đi kèm vì đó là loại bot. */
  config: boolean
  /** Tính cách (SOUL). */
  soul: boolean
  /** Ký ức riêng của bot (cuốn ghi chú); hồ sơ chủ nhân dùng chung cả đội nên không cần chép. */
  memory: boolean
}

/** Một mục ký ức trong tệp xuất. */
export const portableMemory = z.object({
  text: z.string().min(1).max(4000),
  kind: z.string().max(40),
  tier: z.enum(['core', 'archive']),
})
export type PortableMemory = z.infer<typeof portableMemory>

export const botFile = z.object({
  format: z.literal('aris-bot'),
  version: z.literal(1),
  exportedAt: z.string(),
  bot: z.object({
    name: z.string().min(1).max(40),
    handle: z.string().max(40),
    role: z.string().max(60).default(''),
    description: z.string().max(1000).default(''),
    soul: z.string().max(2000).optional(),
    mascot: z.string().max(40).default('tron'),
    model: modelRef.optional(),
    /** Model theo việc, bộ công cụ, quyền riêng (phần "Cấu hình"). */
    models: z.object({ goal: modelRef, fallback: modelRef }).partial().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    perms: z.record(z.string(), z.string()).optional(),
    assignable: z.boolean().optional(),
    /** Tên phòng ban (mã phòng khác nhau giữa các máy). */
    department: z.string().max(60).optional(),
    external: z.unknown().optional(),
  }),
  memory: z.array(portableMemory).max(500).optional(),
})
export type BotFile = z.infer<typeof botFile>

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase()

/** Tên gọi chưa ai dùng, dựa trên `base` (bỏ dấu); trùng thì thêm `-2`, `-3`… */
export function freeHandle(base: string, taken: (h: string) => boolean): string {
  let root = fold(base)
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '')
    .slice(0, 20)
  if (!HANDLE_RE.test(root)) root = 'bot'
  if (!taken(root)) return root
  for (let i = 2; i < 1000; i++) {
    const h = `${root.slice(0, 20)}-${i}`
    if (!taken(h)) return h
  }
  return `${root.slice(0, 16)}-${Date.now().toString(36).slice(-6)}`
}

/** Bản ghi bot ngoài thành dạng `cleanExternal` nhận (lệnh ACP gộp lại một dòng). */
export function externalInput(e: ExternalConfig): Record<string, unknown> {
  const { args, ...rest } = e
  return e.agent === 'acp' ? { ...rest, command: [e.command, ...(args ?? [])].join(' ') } : rest
}

/** Phần cấu hình ngoài model và phòng ban: model theo việc, bộ công cụ, quyền, nhận giao việc. */
// Kiểu rời (`object`): bản ghi và tệp xuất có kiểu trường hơi khác nhau; giá trị đã qua kiểm ở kho.
function extras(src: Pick<BotRecord, 'models' | 'tools' | 'perms' | 'assignable'>): object {
  return {
    ...(src.models && Object.keys(src.models).length ? { models: src.models } : {}),
    ...(src.tools && Object.keys(src.tools).length ? { tools: src.tools } : {}),
    ...(src.perms && Object.keys(src.perms).length ? { perms: src.perms } : {}),
    ...(src.assignable === false ? { assignable: false } : {}),
  }
}

/** Hồ sơ cho bot mới khi nhân bản: tên mới, tên gọi mới, phần được chọn. */
export function cloneInput(
  src: BotRecord,
  name: string,
  parts: CopyParts,
  taken: (h: string) => boolean,
): BotInput {
  return {
    name,
    handle: freeHandle(name, taken),
    role: src.role,
    description: src.description,
    mascot: src.mascot,
    ...(parts.soul ? { soul: src.soul } : {}),
    ...(parts.config && src.model ? { model: src.model } : {}),
    ...(parts.config && src.department ? { department: src.department } : {}),
    ...(parts.config ? extras(src) : {}),
    ...(src.external ? { external: externalInput(src.external) } : {}),
  }
}

/** Tệp xuất của một bot. */
export function exportBot(
  src: BotRecord,
  parts: CopyParts,
  o: { departmentName?: string | undefined; memory?: PortableMemory[]; now?: Date } = {},
): BotFile {
  return {
    format: 'aris-bot',
    version: 1,
    exportedAt: (o.now ?? new Date()).toISOString(),
    bot: {
      name: src.name,
      handle: src.handle,
      role: src.role,
      description: src.description,
      mascot: src.mascot,
      ...(parts.soul ? { soul: src.soul } : {}),
      ...(parts.config && src.model ? { model: src.model } : {}),
      ...(parts.config && o.departmentName ? { department: o.departmentName } : {}),
      ...(parts.config ? extras(src) : {}),
      ...(src.external ? { external: externalInput(src.external) } : {}),
    },
    ...(parts.memory && o.memory?.length ? { memory: o.memory } : {}),
  }
}

/** Đọc tệp nhập; lỗi thì ném với lời báo dễ hiểu. */
export function parseBotFile(raw: unknown): BotFile {
  const r = botFile.safeParse(raw)
  if (!r.success) throw new BotError('Tệp không phải tệp bot của aris (aris-bot, phiên bản 1) hoặc đã hỏng.')
  return r.data
}

/** Hồ sơ cho bot nhập từ tệp: tên gọi trùng thì đổi, phòng ban theo tên nếu máy này có. */
export function importInput(
  f: BotFile,
  taken: (h: string) => boolean,
  departmentByName: (name: string) => string | undefined,
): BotInput {
  const b = f.bot
  const department = b.department ? departmentByName(b.department) : undefined
  return {
    name: b.name,
    handle: freeHandle(HANDLE_RE.test(b.handle) ? b.handle : b.name, taken),
    role: b.role,
    description: b.description,
    mascot: b.mascot,
    ...(b.soul !== undefined ? { soul: b.soul } : {}),
    ...(b.model ? { model: b.model } : {}),
    ...(department ? { department } : {}),
    ...extras(b as Parameters<typeof extras>[0]),
    ...(b.external !== undefined ? { external: b.external } : {}),
  }
}
