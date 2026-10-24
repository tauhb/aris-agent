/**
 * Bot ngoài (bước 4, bản vẽ 2.1b): Claude Code, Codex qua plugin chính thức của dsh, hoặc một agent
 * nói ACP. Mỗi bot ngoài một cấu hình: mức quyền đúng theo plugin, model, giới hạn thời gian mỗi
 * việc, worktree riêng, lệnh khởi chạy (ACP). Chạy thật nằm ở `@aris/commander`.
 */
import { z } from 'zod'

export const EXTERNAL_AGENTS = ['claude-code', 'codex', 'acp'] as const
export type ExternalAgent = (typeof EXTERNAL_AGENTS)[number]

/** Tên hiển thị của từng loại agent. */
export const EXTERNAL_LABEL: Record<ExternalAgent, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  acp: 'ACP',
}

/** Gói plugin chính thức của dsh cho từng loại agent. */
export const EXTERNAL_PACKAGES: Record<ExternalAgent, string> = {
  'claude-code': '@deepseek-ai/dsh-subagent-claude-code',
  codex: '@deepseek-ai/dsh-subagent-codex',
  acp: '@deepseek-ai/dsh-subagent-acp',
}

/** Mức quyền mỗi plugin nhận (`permissionMode` của Claude Code, Codex; `permission` của ACP). */
export const EXTERNAL_PERMISSIONS: Record<ExternalAgent, readonly string[]> = {
  'claude-code': ['manual', 'acceptEdits', 'dontAsk', 'auto', 'plan', 'bypassPermissions'],
  codex: ['ask', 'approve-for-me', 'never', 'dangerously-bypass-approvals-and-sandbox'],
  acp: ['reject', 'allow'],
}

/**
 * Mức "hỏi người dùng" chỉ có khi aris tự chạy CLI trên máy; plugin dsh chạy không người trông nên
 * lùi về mức không hỏi gần nhất.
 */
export const PLUGIN_PERMISSION: Record<string, string> = { manual: 'dontAsk', ask: 'never' }

/** Mức mặc định trong hộp Thêm bot ngoài (bản vẽ: "khuyên dùng"). */
export const DEFAULT_PERMISSION: Record<ExternalAgent, string> = {
  'claude-code': 'manual',
  codex: 'ask',
  acp: 'reject',
}

/** Mức bỏ mọi kiểm tra: giao diện tô đỏ. */
export const DANGEROUS_PERMISSIONS = new Set([
  'bypassPermissions',
  'dangerously-bypass-approvals-and-sandbox',
  'allow',
])

export const externalRecord = z.object({
  agent: z.enum(EXTERNAL_AGENTS),
  permission: z.string(),
  /** Model cố định; không có là theo cài đặt của agent trên máy. */
  model: z.string().optional(),
  /** Tự dừng việc nếu chạy quá ngần này phút. */
  timeoutMin: z.number().int(),
  /** Mỗi việc chạy trong một git worktree riêng (khi thư mục là repo git). */
  worktree: z.boolean(),
  /** Commander được giao việc cho bot này. */
  assignable: z.boolean(),
  /** Trần tiền mỗi việc (USD), chỉ Claude Code chạy bằng CLI trên máy báo được tiền. */
  budgetUsd: z.number().optional(),
  /** Lệnh khởi chạy agent ACP (chỉ `acp`). */
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
})
export type ExternalConfig = z.infer<typeof externalRecord>

export class ExternalConfigError extends Error {}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/**
 * Làm sạch cấu hình bot ngoài từ giao diện. Trường không gửi giữ như cũ (`prev`); mức quyền phải
 * đúng loại agent; ACP cần lệnh khởi chạy.
 */
export function cleanExternal(input: unknown, prev?: ExternalConfig): ExternalConfig {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const agent = (v.agent ?? prev?.agent) as ExternalAgent
  if (!EXTERNAL_AGENTS.includes(agent)) throw new ExternalConfigError('Loại bot ngoài không hợp lệ.')
  const sameAgent = prev?.agent === agent
  const permission =
    typeof v.permission === 'string' ? v.permission : sameAgent ? prev!.permission : DEFAULT_PERMISSION[agent]
  if (!EXTERNAL_PERMISSIONS[agent].includes(permission))
    throw new ExternalConfigError('Mức quyền không hợp với loại bot ngoài này.')
  const timeout = typeof v.timeoutMin === 'number' ? v.timeoutMin : (prev?.timeoutMin ?? 45)
  const out: ExternalConfig = {
    agent,
    permission,
    timeoutMin: Math.min(240, Math.max(5, Math.round(timeout))),
    worktree: typeof v.worktree === 'boolean' ? v.worktree : (prev?.worktree ?? true),
    assignable: typeof v.assignable === 'boolean' ? v.assignable : (prev?.assignable ?? true),
  }
  if (agent === 'claude-code') {
    const budget =
      typeof v.budgetUsd === 'number' ? v.budgetUsd : ((sameAgent ? prev?.budgetUsd : undefined) ?? 3)
    out.budgetUsd = Math.min(100, Math.max(0.5, Math.round(budget * 100) / 100))
  }
  const model = v.model === null ? '' : v.model !== undefined ? str(v.model, 80) : (prev?.model ?? '')
  if (model) out.model = model
  if (agent === 'acp') {
    const line =
      v.command !== undefined ? str(v.command, 300) : [prev?.command, ...(prev?.args ?? [])].join(' ')
    const [command, ...args] = line.split(/\s+/).filter(Boolean)
    if (!command)
      throw new ExternalConfigError('Agent ACP cần lệnh khởi chạy, ví dụ: gemini --experimental-acp')
    out.command = command
    if (args.length) out.args = args
  }
  return out
}

/** Cấu hình plugin cho một bot ngoài (một nhà cung cấp riêng trên `ctx.subagents`). */
export function providerConfig(providerName: string, c: ExternalConfig): Record<string, unknown> {
  if (c.agent === 'acp')
    return { providerName, command: c.command, args: c.args ?? [], permission: c.permission }
  const permissionMode = PLUGIN_PERMISSION[c.permission] ?? c.permission
  return { providerName, permissionMode, ...(c.model ? { model: c.model } : {}) }
}

/** Tên nhà cung cấp của bot ngoài trên `ctx.subagents`. */
export const providerOf = (botId: string) => `aris-${botId}`
