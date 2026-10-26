/**
 * Quyết định ở cửa vào cho Lark (thuần, không gọi mạng), cùng luật như Telegram: người lạ nhắn riêng thì im lặng
 * và báo chủ nhân; trong nhóm bot chỉ trả lời khi được @ nhắc, nhóm phải được cho phép, người gửi phải đã ghép đôi
 * (hoặc nhóm cho mọi thành viên hỏi đáp); nhóm lạ vẫn trả lời khi được @ đích danh nếu bật chế độ khách.
 */
import type { Decision, GroupRule, Role } from '../access.js'
import { parseLarkCommand, type ParsedMessage } from './content.js'
import type { LarkInbound } from './types.js'

export interface LarkAccessState {
  roleOf(openId: string): Role | undefined
  groupRule(chatId: string): GroupRule | undefined
  /** Nhóm lạ vẫn trả lời khi được @ đích danh. */
  guestMode: boolean
}

export function decideLark(ev: LarkInbound, parsed: ParsedMessage, state: LarkAccessState): Decision {
  if (ev.senderType !== 'user' || !ev.senderOpenId)
    return { kind: 'ignore', reason: 'bot hoặc không rõ người gửi' }
  const command = parseLarkCommand(parsed.text)
  const role = state.roleOf(ev.senderOpenId)
  const text = parsed.text

  if (ev.chatType === 'p2p') {
    if (!role) return { kind: 'stranger' }
    return { kind: 'accept', trust: role, text, command }
  }
  if (ev.chatType !== 'group') return { kind: 'ignore', reason: 'loại cuộc trò chuyện chưa hỗ trợ' }

  if (!parsed.mentionedBot) return { kind: 'ignore', reason: 'không gọi bot này' }
  const rule = state.groupRule(ev.chatId)
  if (!rule?.allowed) {
    if (state.guestMode) return { kind: 'accept', trust: 'guest', text, command }
    return { kind: 'unknown-group' }
  }
  if (role) return { kind: 'accept', trust: role, text, command }
  if (rule.who === 'everyone') return { kind: 'accept', trust: 'member', text, command }
  return { kind: 'ignore', reason: 'người gửi chưa được phép trong nhóm' }
}
