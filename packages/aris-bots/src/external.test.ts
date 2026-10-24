import { describe, expect, it } from 'vitest'
import { cleanExternal, providerConfig, providerOf } from './external.js'

describe('cấu hình bot ngoài', () => {
  it('mặc định theo bản vẽ: Claude Code cho sửa tệp, 45 phút, worktree, nhận giao việc', () => {
    expect(cleanExternal({ agent: 'claude-code' })).toEqual({
      agent: 'claude-code',
      permission: 'acceptEdits',
      timeoutMin: 45,
      worktree: true,
      assignable: true,
    })
    expect(cleanExternal({ agent: 'codex' }).permission).toBe('never')
  })
  it('mức quyền phải đúng loại agent; giới hạn thời gian trong khoảng', () => {
    expect(() => cleanExternal({ agent: 'codex', permission: 'acceptEdits' })).toThrow('Mức quyền')
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
    expect(cleanExternal({ agent: 'codex' }, prev).permission).toBe('never')
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
  it('cấu hình plugin Claude Code, Codex: mức quyền và model', () => {
    expect(providerConfig('aris-b-2', cleanExternal({ agent: 'claude-code', model: 'sonnet' }))).toEqual({
      providerName: 'aris-b-2',
      permissionMode: 'acceptEdits',
      model: 'sonnet',
    })
  })
})
