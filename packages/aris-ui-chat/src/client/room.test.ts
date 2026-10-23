import { describe, expect, it } from 'vitest'
import { noteKey, textParts, type RoomEntry } from './room-data.js'

const entry = (o: Partial<RoomEntry>): RoomEntry => ({
  bot: 'b-1',
  handle: 'dev',
  name: 'Dev',
  at: '2026-10-24T03:16:00Z',
  kind: 'skip',
  text: '',
  ...o,
})

describe('phòng nhóm trong khung chat', () => {
  it('tin của bot: đậm và @tên được làm nổi', () => {
    expect(textParts('50 triệu: **30 sản xuất**. @lam có vượt không?')).toEqual([
      { kind: 'text', text: '50 triệu: ' },
      { kind: 'bold', text: '30 sản xuất' },
      { kind: 'text', text: '. ' },
      { kind: 'mention', text: '@lam' },
      { kind: 'text', text: ' có vượt không?' },
    ])
  })
  it('bot không nói: ghi chú theo lý do', () => {
    expect(noteKey(entry({ kind: 'pass' }))).toBe('room.pass')
    expect(noteKey(entry({ reason: 'not-member' }))).toBe('room.notMember')
    expect(noteKey(entry({ kind: 'stopped', reason: 'user-stopped' }))).toBe('room.userStopped')
    expect(noteKey(entry({ kind: 'error' }))).toBe('room.error')
  })
})
