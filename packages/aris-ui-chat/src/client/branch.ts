/**
 * Đọc một lần gọi công cụ `subagent` của dsh thành một nhánh "dòng việc": bot nào
 * nhận, việc gì, đang ở bước nào. Thuần, không phụ thuộc React.
 */
import { MASCOTS, type BotStatus } from '@aris/ui-kit'
import { currentTeam } from '@aris/ui-kit/react'
import type { ChatKey } from './locale.js'

/** Lần gọi ở ba pha mà dsh truyền cho toolview (`tool.call.toolview`). */
export type SubagentCall =
  | { phase: 'preparing'; block: { callId: string } }
  | { phase: 'start'; block: { callId: string; argsRaw: string } }
  | {
      phase: 'result'
      block: {
        callId: string
        call: { argsRaw: string } | null
        content: readonly { type: string; text?: string }[]
        isError: boolean
        error?: { code?: string; message?: string } | undefined
      }
    }

export interface SubagentArgs {
  description?: string | undefined
  agentPreset?: string | undefined
}

/** Tham số của lần gọi (mô tả việc, mẫu bot), nếu đã đọc được. */
export function subagentArgs(call: SubagentCall): SubagentArgs {
  const raw =
    call.phase === 'start'
      ? call.block.argsRaw
      : call.phase === 'result'
        ? call.block.call?.argsRaw
        : undefined
  if (!raw) return {}
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    return {
      description: typeof v.description === 'string' ? v.description : undefined,
      agentPreset: typeof v.agent_preset === 'string' ? v.agent_preset : undefined,
    }
  } catch {
    return {}
  }
}

/** Mã phiên của bot con trong kết quả ("started subagent <id>" hoặc JSON có `subagentId`). */
export function subagentId(call: SubagentCall): string | undefined {
  if (call.phase !== 'result' || call.block.isError) return undefined
  for (const part of call.block.content) {
    const text = part.text ?? JSON.stringify(part)
    const m = text.match(/started subagent (\S+)/) ?? text.match(/"subagentId"\s*:\s*"([^"]+)"/)
    if (m) return m[1]
  }
  return undefined
}

function hash(text: string): number {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

/**
 * Bot cho nhánh: bot trong đội có tên gọi (hoặc mã) trùng tên bot con; không thì một linh vật
 * chưa dùng, chọn ổn định theo `key` để cùng một bot con luôn cùng màu.
 */
export function branchBot(
  agentPreset: string | undefined,
  key: string,
): { mascot: string; name: string | undefined } {
  const team = currentTeam()
  const members = [team.commander, ...team.members]
  const member = agentPreset
    ? members.find((m) => m.handle === agentPreset || m.id === agentPreset)
    : undefined
  if (member) return { mascot: member.mascot ?? member.id, name: member.name }
  const free = MASCOTS.filter((m) => !m.inUse)
  return { mascot: free[hash(agentPreset ?? key) % free.length]!.id, name: agentPreset }
}

export interface BranchStepModel {
  status: BotStatus
  key: ChatKey
  params?: Record<string, unknown>
}

/** Các bước hiện trong nhánh theo pha của lần gọi và trạng thái phiên bot con. */
export function branchSteps(call: SubagentCall, child: { running: boolean } | undefined): BranchStepModel[] {
  if (call.phase !== 'result') return [{ status: 'working', key: 'branch.preparing' }]
  const { isError, error, content } = call.block
  if (error?.code === 'interrupted') return [{ status: 'idle', key: 'branch.stopped' }]
  if (isError) {
    const text = content.find((c) => c.text)?.text ?? error?.message ?? ''
    return [{ status: 'failed', key: 'branch.failed', params: { error: text.split('\n')[0] } }]
  }
  const received: BranchStepModel = { status: 'done', key: 'branch.received' }
  if (child === undefined) return [received]
  return [
    received,
    child.running ? { status: 'working', key: 'branch.running' } : { status: 'done', key: 'branch.done' },
  ]
}
