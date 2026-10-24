import { describe, expect, it } from 'vitest'
import { cleanExternal, providerConfig, providerOf } from './external.js'

describe('cấu hình bot ngoài', () => {
  it('mặc định theo bản vẽ: hỏi người dùng, 45 phút, 3 USD (Claude Code), worktree, nhận giao việc', () => {
    expect(cleanExternal({ agent: 'claude-code' })).toEqual({
      agent: 'claude-code',
      permission: 'manual',
      timeoutMin: 45,
      worktree: true,
      assignable: true,
      budgetUsd: 3,
    })
    expect(cleanExternal({ agent: 'codex' })).not.toHaveProperty('budgetUsd')
    expect(cleanExternal({ agent: 'codex' }).permission).toBe('ask')
    expect(cleanExternal({ agent: 'claude-code', budgetUsd: 0.1 }).budgetUsd).toBe(0.5)
  })
  it('mức quyền phải đúng loại agent; giới hạn thời gian trong khoảng', () => {
    expect(() => cleanExternal({ agent: 'codex', permission: 'acceptEdits' })).toThrow('Mức quyền')
    expect(() => cleanExternal({ agent: 'acp', command: 'x', permission: 'ask' })).toThrow('Mức quyền')
    expect(() => cleanExternal({ agent: 'hermes' })).toThrow('Loại bot ngoài')
    expect(cleanExternal({ agent: 'codex', timeoutMin: 1000 }).timeoutMin).toBe(240)
    expect(cleanExternal({ agent: 'codex', timeoutMin: 1 }).timeoutMin).toBe(5)
  })
  it('đổi một trường thì giữ các trường khác; đổi loại agent thì mức quyền về mặc định', () => {
    const prev = cleanExternal({ agent: 'claude-code', permission: 'plan', model: 'opus', timeoutMin: 30 })
    expect(cleanExternal({ worktree: false }, prev)).toMatchObject({
      permission: 'plan',
      model: 'opus',
      worktree: false,
    })
    expect(cleanExternal({ model: null }, prev).model).toBeUndefined()
    expect(cleanExternal({ agent: 'codex' }, prev).permission).toBe('ask')
  })
  it('ACP cần lệnh khởi chạy, tách lệnh và tham số', () => {
    expect(() => cleanExternal({ agent: 'acp' })).toThrow('lệnh khởi chạy')
    const c = cleanExternal({ agent: 'acp', command: 'gemini --experimental-acp' })
    expect(c).toMatchObject({ command: 'gemini', args: ['--experimental-acp'], permission: 'reject' })
    expect(providerConfig(providerOf('b-1'), c)).toEqual({
      providerName: 'aris-b-1',
      command: 'gemini',
      args: ['--experimental-acp'],
      permission: 'reject',
    })
  })
  it('plugin dsh (dự phòng) không hỏi người dùng được: mức hỏi lùi về mức không hỏi', () => {
    expect(providerConfig('aris-b-2', cleanExternal({ agent: 'claude-code', model: 'sonnet' }))).toEqual({
      providerName: 'aris-b-2',
      permissionMode: 'dontAsk',
      model: 'sonnet',
    })
    expect(providerConfig('aris-b-3', cleanExternal({ agent: 'codex' })).permissionMode).toBe('never')
    expect(
      providerConfig('aris-b-4', cleanExternal({ agent: 'claude-code', permission: 'acceptEdits' }))
        .permissionMode,
    ).toBe('acceptEdits')
  })
})
