import { describe, expect, it } from 'vitest'
import type { JobRecord } from './domain.js'
import { findDepartment, jobBrief, jobContext, jobReport, textOf } from './jobs.js'

const job: JobRecord = {
  id: 'job-1',
  department: 'tang-truong',
  lead: 'b-tho',
  title: 'So sánh 2 đối thủ',
  task: 'Nghiên cứu 2 đối thủ rồi viết bài so sánh.',
  parentSession: 's-aris',
  session: 's-lead',
  status: 'running',
  createdAt: '',
}
const tho = { id: 'b-tho', handle: 'tho', name: 'Thơ', role: 'Nội dung' }
const minh = { id: 'b-minh', handle: 'minh', name: 'Minh', role: 'Nghiên cứu' }

describe('việc lớn của phòng ban', () => {
  it('tìm phòng theo mã hoặc tên không dấu, bỏ chữ Phòng', () => {
    const list = [
      { id: 'tang-truong', name: 'Tăng trưởng' },
      { id: 'ky-thuat', name: 'Kỹ thuật' },
    ]
    expect(findDepartment(list, 'Phòng Tăng Trưởng')?.id).toBe('tang-truong')
    expect(findDepartment(list, 'ky thuat')?.id).toBe('ky-thuat')
    expect(findDepartment(list, 'ky-thuat')?.id).toBe('ky-thuat')
    expect(findDepartment(list, 'Bán hàng')).toBeUndefined()
  })

  it('lời giao cho trưởng nhóm: việc, thành viên phòng, cách chia và nộp', () => {
    const t = jobBrief(job, tho, 'Tăng trưởng', [minh])
    expect(t).toContain('Bạn (@tho) là trưởng nhóm')
    expect(t).toContain('«So sánh 2 đối thủ»')
    expect(t).toContain('@minh (Minh, Nghiên cứu)')
    expect(t).toContain('chỉ thành viên phòng')
    expect(jobBrief(job, tho, 'Tăng trưởng', [])).toContain('tự làm')
    expect(jobContext(job, 'Tăng trưởng', [minh])).toContain('Chỉ giao việc cho thành viên phòng: @minh')
  })

  it('báo cáo về Aris: kết quả của trưởng nhóm, hoặc báo vấp', () => {
    expect(jobReport({ ...job, status: 'done', result: 'Kết quả A' }, 'Tăng trưởng')).toContain(
      'Phòng Tăng trưởng nộp kết quả việc lớn job-1',
    )
    expect(jobReport({ ...job, status: 'done', result: 'Kết quả A' }, 'Tăng trưởng')).toContain('Kết quả A')
    expect(jobReport({ ...job, status: 'failed' }, 'Tăng trưởng')).toContain('bị vấp')
  })

  it('chữ của tin nhắn: chỉ phần chữ', () => {
    expect(
      textOf({
        content: [
          { type: 'reasoning', text: 'nghĩ' },
          { type: 'text', text: 'A' },
          { type: 'text', text: 'B' },
        ],
      }),
    ).toBe('A\nB')
    expect(textOf({ content: 'C' })).toBe('C')
    expect(textOf(undefined)).toBe('')
  })
})
