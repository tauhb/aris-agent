import { describe, expect, it } from 'vitest'
import {
  ApprovalCenter,
  callInput,
  toolAlias,
  type ApprovalEvent,
  type CentralApproval,
} from './approvals.js'

const item = (id: string, parentSession: string, at: string): CentralApproval => ({
  id,
  source: 'member',
  run: `member:s-${id}`,
  bot: 'b-1',
  name: 'Minh',
  parentSession,
  kind: 'run',
  target: 'ls',
  at,
})

describe('duyệt tập trung', () => {
  it('giữ yêu cầu đang chờ, lọc theo phiên giao việc, báo người nghe', () => {
    const c = new ApprovalCenter()
    const seen: ApprovalEvent['type'][] = []
    const off = c.on((e) => seen.push(e.type))
    c.open(item('a', 'p1', '2026-10-24T10:02:00Z'))
    c.open(item('b', 'p2', '2026-10-24T10:01:00Z'))
    expect(c.list().map((i) => i.id)).toEqual(['b', 'a'])
    expect(c.list('p1').map((i) => i.id)).toEqual(['a'])
    c.close('a', true, 'telegram')
    c.close('a', true, 'user')
    expect(c.list().map((i) => i.id)).toEqual(['b'])
    expect(seen).toEqual(['opened', 'opened', 'closed'])
    off()
    c.close('b', false, 'timeout')
    expect(seen).toHaveLength(3)
  })

  it('đọc tham số lần gọi và tên công cụ của dsh', () => {
    expect(callInput('{"command":"ls ~/Desktop"}')).toEqual({ command: 'ls ~/Desktop' })
    expect(callInput('ls')).toEqual({ command: 'ls' })
    expect(toolAlias('bash')).toBe('Bash')
    expect(toolAlias('str_replace_editor')).toBe('Edit')
    expect(toolAlias('khac')).toBe('khac')
  })
})
