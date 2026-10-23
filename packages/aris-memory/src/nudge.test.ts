import { describe, expect, it } from 'vitest'
import { emptyTurn, nudgeReason } from './nudge.js'
import { dedupe, overlap, parseCandidates, transcriptText } from './reflect.js'

const turn = (patch: Partial<ReturnType<typeof emptyTurn>>) => ({ ...emptyTurn(5), ...patch })

describe('tự nhắc lưu', () => {
  it('nhắc khi chủ nhân nói điều cần nhớ mà bot chưa lưu', () => {
    expect(nudgeReason(turn({ userText: ['Lần sau gửi báo cáo trước 9 giờ nhé'] }), undefined)).toBe('cue')
    expect(nudgeReason(turn({ userText: ['Sai rồi, không phải thế'] }), undefined)).toBe('cue')
    expect(nudgeReason(turn({ userText: ['Anh thích bản ngắn'] }), undefined)).toBe('cue')
  })
  it('không nhắc khi đã lưu, khi lời bình thường, hoặc vừa nhắc', () => {
    expect(nudgeReason(turn({ userText: ['nhớ là họp thứ 5'], memoryWrites: 1 }), undefined)).toBeUndefined()
    expect(nudgeReason(turn({ userText: ['Tóm tắt giúp email này'] }), undefined)).toBeUndefined()
    expect(nudgeReason(turn({ userText: ['nhớ là họp thứ 5'] }), 4)).toBeUndefined()
    expect(nudgeReason(turn({ userText: ['nhớ là họp thứ 5'] }), 2)).toBe('cue')
  })
  it('nhắc rút bài học sau lượt dài', () => {
    expect(nudgeReason(turn({ toolCalls: 9 }), undefined)).toBe('long')
    expect(nudgeReason(turn({ toolCalls: 3 }), undefined)).toBeUndefined()
  })
})

describe('lưu trước khi nén', () => {
  it('ghép đoạn hội thoại, giữ phần cuối khi quá dài', () => {
    const t = transcriptText([
      { seq: 1, role: 'user', text: 'xin chào' },
      { seq: 2, role: 'assistant', text: 'chào anh' },
    ])
    expect(t).toBe('Chủ nhân: xin chào\n\nBot: chào anh')
    expect(transcriptText([{ seq: 1, role: 'user', text: 'x'.repeat(100) }], 20)).toHaveLength(21)
  })
  it('đọc mảng JSON trong câu trả lời, bỏ phần tử sai', () => {
    const raw =
      'Đây:\n```json\n[{"text":"Anh làm việc buổi sáng","book":"owner","kind":"preference"},{"text":""},{"x":1},{"text":"Repo ở GitHub","book":"lạ","kind":"lạ"}]\n```'
    expect(parseCandidates(raw)).toEqual([
      { text: 'Anh làm việc buổi sáng', book: 'owner', kind: 'preference' },
      { text: 'Repo ở GitHub', book: 'owner', kind: 'fact' },
    ])
    expect(parseCandidates('không có gì')).toEqual([])
    expect(parseCandidates('[{bad json')).toEqual([])
  })
  it('bỏ ký ức gần trùng', () => {
    expect(overlap('Anh thích báo cáo dạng bảng', 'anh thich bao cao dang bang')).toBe(1)
    const kept = dedupe(
      [
        { text: 'Chủ nhân thích báo cáo dạng bảng', book: 'owner', kind: 'preference' },
        { text: 'Khoá học AI ra mắt tháng 12', book: 'notes', kind: 'project' },
        { text: 'Khoá học AI ra mắt vào tháng 12', book: 'notes', kind: 'project' },
      ],
      ['Chủ nhân thích báo cáo dạng bảng, có cột nguồn'],
    )
    expect(kept.map((k) => k.text)).toEqual(['Khoá học AI ra mắt tháng 12'])
  })
})
