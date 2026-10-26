import { describe, expect, it } from 'vitest'
import type { TeamGroup, TeamMember } from '@aris/ui-kit'
import { countWorking, splitRoster, workLine } from './roster.js'

const m = (id: string, status: TeamMember['status']): TeamMember => ({
  id,
  name: id,
  role: 'vai',
  note: '',
  status,
})
const groups: TeamGroup[] = [
  { id: 'tt', label: 'Tăng trưởng', lead: 'lam', members: [m('lam', 'working'), m('ha', 'working')] },
  { id: 'vh', label: 'Vận hành', lead: 'mai', members: [m('mai', 'waiting'), m('tin', 'idle')] },
  { id: 'kt', label: 'Kỹ thuật', lead: 'dev', members: [m('dev', 'failed')] },
  { id: '', label: 'Chưa vào phòng', lead: '', members: [m('khach', 'done'), m('bot-x', 'working')] },
]

describe('splitRoster', () => {
  it('đang làm và đang đợi vào "Cần chú ý", còn lại vào "Rảnh"', () => {
    const r = splitRoster(groups)
    expect(r.attention.map((a) => a.member.id)).toEqual(['lam', 'ha', 'bot-x', 'mai'])
    expect(r.rest.map((x) => x.id)).toEqual(['tin', 'dev', 'khach'])
  })

  it('bot đang làm đứng trước bot đang đợi, mỗi loại giữ thứ tự phòng ban', () => {
    const r = splitRoster([
      { id: 'a', label: 'A', lead: '', members: [m('w1', 'waiting'), m('k1', 'working')] },
      { id: 'b', label: 'B', lead: '', members: [m('k2', 'working'), m('w2', 'waiting')] },
    ])
    expect(r.attention.map((a) => `${a.member.id}:${a.state}`)).toEqual([
      'k1:working',
      'k2:working',
      'w1:waiting',
      'w2:waiting',
    ])
  })

  it('ghi tên phòng ban; bot chưa vào phòng thì không có', () => {
    const r = splitRoster(groups)
    expect(r.attention.find((a) => a.member.id === 'mai')?.department).toEqual({
      id: 'vh',
      label: 'Vận hành',
    })
    expect(r.attention.find((a) => a.member.id === 'bot-x')?.department).toBeNull()
  })

  it('đội trống thì không có gì', () => {
    expect(splitRoster([])).toEqual({ attention: [], rest: [] })
  })
})

describe('countWorking', () => {
  it('chỉ đếm bot đang làm', () => {
    expect(countWorking(groups)).toBe(3)
    expect(countWorking([])).toBe(0)
  })
})

describe('workLine', () => {
  it('ưu tiên việc được giao, rồi tên phiên, rồi để trống', () => {
    const titles = { s1: '', s2: 'Viết bài Facebook' }
    expect(workLine({ task: ' So 3 đối thủ ', sessions: ['s2'] }, titles)).toBe('So 3 đối thủ')
    expect(workLine({ sessions: ['s1', 's2'] }, titles)).toBe('Viết bài Facebook')
    expect(workLine({ sessions: ['s1'] }, titles)).toBe('')
    expect(workLine(undefined, undefined)).toBe('')
  })
})
