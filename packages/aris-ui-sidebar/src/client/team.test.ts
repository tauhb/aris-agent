import { describe, expect, it } from 'vitest'
import { STATUSES, getMascot } from '@aris/ui-kit'
import { COMMANDER, DEMO_TEAM } from './team.js'
import { CSS } from './styles.js'

describe('đội hình ở thanh bên', () => {
  const members = [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)]

  it('mỗi bot có linh vật trong thư viện và trạng thái hợp lệ', () => {
    for (const m of members) {
      expect(getMascot(m.id), m.id).toBeDefined()
      expect(STATUSES[m.status], m.id).toBeDefined()
    }
  })

  it('đủ 6 bot của đội mẫu, không trùng', () => {
    expect(new Set(members.map((m) => m.id))).toEqual(new Set(['aris', 'lam', 'mai', 'tin', 'ha', 'dev']))
  })
})

describe('CSS thanh bên', () => {
  it('có biến màu cho cả giao diện sáng và tối của dsh', () => {
    expect(CSS).toContain('.aris-sb{--a-bg:#F6F5F2')
    expect(CSS).toContain('[data-ds-dark-theme] .aris-sb{--a-bg:#0F1013')
  })
})
