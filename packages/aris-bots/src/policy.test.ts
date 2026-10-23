import { describe, expect, it } from 'vitest'
import { cleanPolicy, DEFAULT_POLICY, denyReason, needOf } from './policy.js'

describe('chính sách phòng ban', () => {
  it('công cụ nào cần quyền nào; xem tệp bằng str_replace_editor không cần quyền ghi', () => {
    expect(needOf('web_search', {})).toBe('web')
    expect(needOf('write', {})).toBe('write')
    expect(needOf('str_replace_editor', { command: 'view' })).toBeUndefined()
    expect(needOf('str_replace_editor', { command: 'create' })).toBe('write')
    expect(needOf('bash', {})).toBe('shell')
    expect(needOf('terminal_send', {})).toBe('shell')
    expect(needOf('read', {})).toBeUndefined()
    expect(needOf('send_message', {})).toBeUndefined()
  })

  it('lời từ chối nói rõ phòng và quyền', () => {
    expect(denyReason('shell', 'Tăng trưởng')).toContain(
      'Chính sách phòng Tăng trưởng không cho chạy lệnh terminal',
    )
    expect(denyReason('web', undefined)).toContain('bot chưa xếp phòng')
  })

  it('làm sạch chính sách: giữ trường không gửi, null là bỏ, chặn số lạ', () => {
    const a = cleanPolicy({ shell: true, budgetUsd: 2.004, model: { provider: 'groq', model: 'm' } })
    expect(a).toEqual({
      ...DEFAULT_POLICY,
      shell: true,
      budgetUsd: 2,
      model: { provider: 'groq', model: 'm' },
    })
    const b = cleanPolicy({ web: false }, a)
    expect(b).toMatchObject({
      web: false,
      shell: true,
      budgetUsd: 2,
      model: { provider: 'groq', model: 'm' },
    })
    const c = cleanPolicy({ budgetUsd: null, model: null, onBudget: 'warn' }, a)
    expect(c.budgetUsd).toBeUndefined()
    expect(c.model).toBeUndefined()
    expect(c.onBudget).toBe('warn')
    expect(cleanPolicy({ budgetUsd: -1, shell: 'yes' }).budgetUsd).toBeUndefined()
    expect(cleanPolicy({ budgetUsd: 1e9 }).budgetUsd).toBe(1000)
  })
})
