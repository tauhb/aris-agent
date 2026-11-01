import { describe, expect, it } from 'vitest'
import type { BotData } from '@aris/ui-kit/react'
import { profileGroups, soulSummary } from './profile-model.js'

const bot = (extra: Partial<BotData> = {}): BotData =>
  ({
    id: 'mai',
    kind: 'member',
    handle: 'mai',
    name: 'Mai',
    role: 'Thư ký',
    description: 'Lo lịch và email',
    soul: '# Mai\n\n- Trả lời ngắn gọn\n- Luôn hỏi trước khi gửi email',
    mascot: 'mai',
    createdAt: '2026-11-01T00:00:00Z',
    ...extra,
  }) as BotData

describe('hồ sơ bot ở khung phải', () => {
  it('tóm lời dặn thành một dòng, bỏ dấu markdown, cắt bằng dấu ba chấm', () => {
    expect(soulSummary('# Mai\n\n- Trả lời ngắn')).toBe('Mai Trả lời ngắn')
    expect(soulSummary('a'.repeat(60), 10)).toBe('aaaaaaaaa…')
  })

  it('Aris có nhóm Điều phối, bot thường thì không', () => {
    const extra = { routinesOn: 2, model: 'gpt-5' }
    const keys = (b: BotData) => profileGroups(b, 'details', extra).map((g) => g.key)
    expect(keys(bot({ kind: 'commander', id: 'aris' }))).toContain('lead')
    expect(keys(bot())).not.toContain('lead')
    const model = profileGroups(bot(), 'details', extra)[0]!.rows[0]!
    expect(model).toMatchObject({ value: 'gpt-5', target: { kind: 'bot', tab: 'model' } })
  })

  it('cài đặt bot: bản lời dặn và cách hỏi trước khi làm việc nguy hiểm', () => {
    const groups = profileGroups(
      bot({ soulMeta: { version: 4, at: '' }, perms: { danger: 'deny' } }),
      'settings',
      {
        routinesOn: 0,
      },
    )
    const rows = groups.flatMap((g) => g.rows)
    expect(rows.find((r) => r.key === 'soul')?.value).toBe('v4')
    expect(rows.find((r) => r.key === 'danger')?.value).toBe('pf.deny')
  })
})
