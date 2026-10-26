import { describe, expect, it } from 'vitest'
import type { LogEntry } from './policy.js'
import { relativeTo, sessionResult } from './result.js'

const assistant = (time: number, content: unknown): LogEntry => ({
  type: 'assistant/message',
  time,
  data: { message: { content }, turn: 1, step: 1 },
})
const call = (time: number, callId: string, name: string, args: unknown): LogEntry => ({
  type: 'tool/call',
  time,
  data: { callId, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) },
})
const result = (time: number, callId: string, isError = false): LogEntry => ({
  type: 'tool/result',
  time,
  data: { message: { toolCallId: callId, isError, content: [{ type: 'text', text: 'ok' }] } },
})
const turnEnd = (time: number, kind: string): LogEntry => ({
  type: 'turn/end',
  time,
  data: { turn: 1, reason: { kind } },
})

describe('sessionResult', () => {
  it('lấy toàn văn câu trả lời cuối có chữ, không cắt', () => {
    const long = 'Kết luận. '.repeat(900)
    const r = sessionResult([
      assistant(10, [{ type: 'text', text: 'Đang đọc tệp…' }]),
      call(11, 'c1', 'read', { file_path: 'a.md' }),
      result(12, 'c1'),
      assistant(20, [{ type: 'text', text: long }]),
      assistant(25, [{ type: 'reasoning', text: 'chỉ suy nghĩ, không có chữ trả lời' }]),
      turnEnd(30, 'completed'),
    ])
    expect(r.text).toBe(long)
    expect(r.text.length).toBeGreaterThan(8000)
    expect(r.at).toBe(20)
    expect(r.status).toBe('done')
  })

  it('tệp: chỉ write và edit, bỏ trùng, bỏ lần gọi báo lỗi, đường dẫn tương đối thư mục làm việc', () => {
    const cwd = '/Users/a/aris/workspace'
    const r = sessionResult(
      [
        call(1, 'c1', 'write', { file_path: `${cwd}/doi-thu.md`, content: 'x' }),
        result(2, 'c1'),
        call(3, 'c2', 'edit', { file_path: `${cwd}/doi-thu.md`, old_string: 'a', new_string: 'b' }),
        result(4, 'c2'),
        call(5, 'c3', 'write', { file_path: `${cwd}/bao-cao/so-sanh.csv`, content: 'x' }),
        result(6, 'c3'),
        call(7, 'c4', 'write', { file_path: `${cwd}/hong.txt`, content: 'x' }),
        result(8, 'c4', true),
        call(9, 'c5', 'read', { file_path: `${cwd}/chi-doc.md` }),
        call(10, 'c6', 'write', { file_path: '/tmp/ngoai.txt', content: 'x' }),
        result(11, 'c6'),
        call(12, 'c7', 'bash', { command: 'echo hi > x.txt' }),
      ],
      { cwd },
    )
    expect(r.files).toEqual([
      { path: 'doi-thu.md', name: 'doi-thu.md' },
      { path: 'bao-cao/so-sanh.csv', name: 'so-sanh.csv' },
      { path: 'ngoai.txt', name: 'ngoai.txt' },
    ])
  })

  it('tham số bị cắt dở vẫn lấy được file_path bằng chữ', () => {
    const r = sessionResult(
      [call(1, 'c1', 'write', '{"file_path": "/x/y/bai.md", "content": "đang viết dở')],
      {
        cwd: '/x/y',
      },
    )
    expect(r.files).toEqual([{ path: 'bai.md', name: 'bai.md' }])
  })

  it('trạng thái: đang chạy và đang chờ thắng log; lượt cuối lỗi là failed', () => {
    const log = [assistant(1, 'xin chào'), turnEnd(2, 'error')]
    expect(sessionResult(log).status).toBe('failed')
    expect(sessionResult(log, { waiting: true }).status).toBe('waiting')
    expect(sessionResult(log, { waiting: true, running: true }).status).toBe('running')
    expect(sessionResult([assistant(1, 'a'), turnEnd(2, 'completed')]).status).toBe('done')
    expect(sessionResult([]).status).toBe('done')
  })

  it('phiên chưa trả lời: chữ trống, mốc thời gian là bản ghi cuối', () => {
    const r = sessionResult([call(5, 'c1', 'read', { file_path: 'a' })])
    expect(r).toMatchObject({ text: '', files: [], at: 5 })
  })
})

describe('relativeTo', () => {
  it('giữ đường dẫn tương đối, rút đường dẫn tuyệt đối theo thư mục làm việc, ngoài thư mục chỉ lấy tên', () => {
    expect(relativeTo('./a/b.md', undefined)).toBe('a/b.md')
    expect(relativeTo('/w/a/b.md', '/w/')).toBe('a/b.md')
    expect(relativeTo('/khac/b.md', '/w')).toBe('b.md')
    expect(relativeTo('/wx/b.md', '/w')).toBe('b.md')
    expect(relativeTo('/khac/b.md', undefined)).toBe('b.md')
  })
})
