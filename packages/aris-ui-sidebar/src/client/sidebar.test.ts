import { describe, expect, it } from 'vitest'
import { COMMANDER, DEMO_ACTIVITY, DEMO_TEAM, STATUSES, THEMES, getMascot } from '@aris/ui-kit'
import { CSS } from './styles.js'

describe('đội hình ở thanh bên', () => {
  const members = [COMMANDER, ...DEMO_TEAM.flatMap((g) => g.members)]

  it('mỗi bot có linh vật trong thư viện và trạng thái hợp lệ', () => {
    for (const m of members) {
      expect(getMascot(m.id), m.id).toBeDefined()
      expect(STATUSES[m.status], m.id).toBeDefined()
    }
  })

  it('việc gần đây chỉ nhắc tới bot có trong đội', () => {
    for (const a of DEMO_ACTIVITY) expect(members.map((m) => m.id)).toContain(a.id)
  })

  it('đủ 6 bot của đội mẫu, không trùng', () => {
    expect(new Set(members.map((m) => m.id))).toEqual(new Set(['aris', 'lam', 'mai', 'tin', 'ha', 'dev']))
  })
})

describe('CSS thanh bên', () => {
  it('chỉ dùng biến màu mà bộ thành phần khai báo cho cả sáng và tối', () => {
    const used = [...CSS.matchAll(/var\(--a-(\w+)\)/g)].map((m) => m[1]!)
    expect(used.length).toBeGreaterThan(0)
    for (const name of used) expect(Object.keys(THEMES.light), name).toContain(name)
  })
})
