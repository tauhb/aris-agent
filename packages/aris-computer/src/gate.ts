/**
 * Quyết định trước khi chạy một công cụ điều khiển máy (hook `tools/pre-execute`): bot chưa bật thì từ chối; chặn cứng
 * thì từ chối; chế độ "trong phạm vi" thì trong phạm vi cho làm, ngoài phạm vi từ chối (không hỏi); chế độ "hỏi từng
 * bước" thì thao tác thay đổi luôn hỏi, xem màn hình chỉ hỏi lần đầu mỗi phiên.
 */
import { boundedVerdict, hardVerdict, TOOL_ACTION, type ComputerSettings } from './policy.js'
import type { ComputerRuntime, Inspected } from './runtime.js'
import { ComputerError } from './types.js'

export type GateDecision =
  | { kind: 'allow'; inspected?: Inspected | undefined }
  | { kind: 'deny'; reason: string; what: string }
  | { kind: 'ask'; reason: string; inspected: Inspected }

export async function decide(o: {
  settings: ComputerSettings | undefined
  bot: string
  runtime: ComputerRuntime
  sessionId: string
  tool: string
  args: unknown
  /** Phiên đã được duyệt xem màn hình (chế độ hỏi từng bước). */
  viewed: Set<string>
}): Promise<GateDecision> {
  const s = o.settings
  if (!s?.on)
    return {
      kind: 'deny',
      what: 'điều khiển máy đang tắt',
      reason: `Bot ${o.bot} chưa được bật điều khiển máy (Hồ sơ bot › Quyền › Điều khiển máy). Đừng tìm cách khác; báo người dùng nếu việc này cần điều khiển máy.`,
    }
  if (!TOOL_ACTION[o.tool]) return { kind: 'allow' }
  let inspected: Inspected
  try {
    inspected = await o.runtime.inspect(o.sessionId, o.tool, o.args)
  } catch (e) {
    // Thiếu lõi, tham số sai, mã phần tử cũ: báo thẳng cho bot sửa, không hỏi người dùng.
    const msg = e instanceof Error ? e.message : String(e)
    return { kind: 'deny', what: e instanceof ComputerError ? e.code : 'lỗi', reason: msg }
  }
  const hard = hardVerdict(inspected)
  if (hard) return { kind: 'deny', ...hard }
  if (s.mode === 'bounded') {
    const v = boundedVerdict(s, inspected)
    return v ? { kind: 'deny', ...v } : { kind: 'allow', inspected }
  }
  if (inspected.action === 'xem') {
    if (o.viewed.has(o.sessionId)) return { kind: 'allow', inspected }
    return { kind: 'ask', reason: `${o.bot} muốn xem màn hình: ${inspected.describe}`, inspected }
  }
  return { kind: 'ask', reason: `${o.bot} muốn điều khiển máy: ${inspected.describe}`, inspected }
}
