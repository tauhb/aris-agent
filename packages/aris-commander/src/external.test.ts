import { describe, expect, it } from 'vitest'
import { cleanExternal } from '@aris/bots'
import { externalBrief, ExternalHost, worktreePlan, type PluginModule } from './external.js'

const mod: PluginModule = { apply: () => undefined }

function host(installed = true) {
  const mounted: { config: Record<string, unknown>; disposed: boolean }[] = []
  const h = new ExternalHost({
    load: async () => (installed ? mod : undefined),
    mount: (_m, config) => {
      const m = { config, disposed: false }
      mounted.push(m)
      return () => void (m.disposed = true)
    },
    warn: () => undefined,
  })
  return { h, mounted }
}

describe('gắn bot ngoài', () => {
  it('mỗi bot một nhà cung cấp riêng; cấu hình không đổi thì không gắn lại', async () => {
    const { h, mounted } = host()
    const khoa = { id: 'b-1', external: cleanExternal({ agent: 'claude-code' }) }
    await h.sync([khoa, { id: 'b-2' }])
    expect(mounted.map((m) => m.config)).toEqual([
      { providerName: 'aris-b-1', permissionMode: 'acceptEdits' },
    ])
    expect(h.state('b-1')).toBe('ready')
    await h.sync([khoa])
    expect(mounted).toHaveLength(1)
  })
  it('đổi mức quyền thì gỡ bản cũ, gắn bản mới; xoá bot thì gỡ', async () => {
    const { h, mounted } = host()
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'claude-code' }) }])
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'claude-code', permission: 'plan' }) }])
    expect(mounted.map((m) => [m.config.permissionMode, m.disposed])).toEqual([
      ['acceptEdits', true],
      ['plan', false],
    ])
    await h.sync([])
    expect(mounted[1]!.disposed).toBe(true)
    expect(h.state('b-1')).toBe('missing')
  })
  it('chưa cài plugin thì báo thiếu, không gắn', async () => {
    const { h, mounted } = host(false)
    await h.sync([{ id: 'b-1', external: cleanExternal({ agent: 'codex' }) }])
    expect(mounted).toHaveLength(0)
    expect(h.state('b-1')).toBe('missing')
  })
})

describe('việc của bot ngoài', () => {
  it('worktree ngoài repo, nhánh theo tên gọi và tiêu đề không dấu', () => {
    expect(worktreePlan('/u/code/shop-api', 'khoa', 'Sửa lỗi đăng nhập Google', 'abcd1234', '/u')).toEqual({
      branch: 'aris/khoa-sua-loi-dang-nhap-google-1234',
      dir: '/u/.aris/worktrees/shop-api/khoa-sua-loi-dang-nhap-google-1234',
    })
  })
  it('lời giao tự đủ: việc, worktree, cách nộp kết quả', () => {
    const t = externalBrief({
      name: 'Khoa',
      task: 'Sửa lỗi văng đăng nhập',
      reason: 'giỏi sửa mã',
      worktree: { branch: 'aris/khoa-x' },
    })
    expect(t).toContain('Sửa lỗi văng đăng nhập')
    expect(t).toContain('nhánh aris/khoa-x')
    expect(t).toContain('không hỏi lại được')
  })
})
