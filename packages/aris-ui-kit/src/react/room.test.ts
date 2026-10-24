import { describe, expect, it } from 'vitest'
import { roomRole, type RoomStatus } from './room.js'

describe('vai của bot trong phòng nhóm', () => {
  const room: RoomStatus = {
    project: true,
    running: true,
    speaking: { handle: 'tin', name: 'Tín', id: 'b-2' },
    spoke: { lam: 'say', dev: 'pass', mai: 'skip' },
    stopped: ['khoa'],
  }
  it('đang nói, đã nói, bỏ lượt, đã dừng; chưa làm gì thì theo trạng thái chung', () => {
    expect(roomRole(room, 'tin')).toBe('speaking')
    expect(roomRole(room, 'lam')).toBe('said')
    expect(roomRole(room, 'dev')).toBe('passed')
    expect(roomRole(room, 'khoa')).toBe('stopped')
    expect(roomRole(room, 'mai')).toBeUndefined()
    expect(roomRole({ project: false }, 'lam')).toBeUndefined()
    expect(roomRole({ ...room, running: false }, 'tin')).toBeUndefined()
  })
})
