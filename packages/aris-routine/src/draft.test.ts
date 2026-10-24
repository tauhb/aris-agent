import { describe, expect, it } from 'vitest'
import { draftPrompt, parseDraft, preview, wallClock } from './draft.js'

const bots = [
  { id: 'aris', name: 'Aris', handle: 'aris', role: 'Chỉ huy' },
  { id: 'mai', name: 'Mai', handle: 'mai', role: 'Thư ký' },
]

describe('tạo routine bằng lời', () => {
  it('lời nhắc có giờ hiện tại và danh sách bot', () => {
    expect(wallClock(new Date('2026-10-25T01:00:00Z'))).toBe('Chủ nhật, 25/10/2026 08:00')
    const p = draftPrompt('8h sáng thứ 2–6 Mai tóm tắt email', new Date('2026-10-25T01:00:00Z'), bots)
    expect(p).toContain('mai · Mai · Thư ký')
    expect(p).toContain('Chủ nhật, 25/10/2026 08:00')
  })

  it('đọc bản nháp: tên bot đổi về mã, mặc định chỉ đọc và gửi Telegram', () => {
    const d = parseDraft(
      '```json\n{"title":"Tóm tắt email sáng","bot":"Mai","cron":"0 8 * * 1-5","task":"Tóm tắt email chưa đọc","clear":true}\n```',
      bots,
    )
    expect(d).toMatchObject({
      bot: 'mai',
      cron: '0 8 * * 1-5',
      deliver: 'telegram',
      perms: 'read',
      catchupHours: 3,
      mode: 'agent',
      clear: true,
    })
    expect(d?.command).toBeUndefined()
  })

  it('bot lạ, lịch sai thì chưa rõ kèm lý do; script cần đúng câu lệnh', () => {
    const d = parseDraft('{"bot":"lam","cron":"8h sáng","task":"x","clear":true}', bots)
    expect(d?.clear).toBe(false)
    expect(d?.bot).toBe('aris')
    expect(d?.question).toContain('Không có bot "lam"')
    expect(d?.question).toContain('Lịch chưa đọc được')
    expect(
      parseDraft('{"bot":"aris","cron":"0 17 * * *","mode":"script","command":"","task":""}', bots)?.mode,
    ).toBe('agent')
    const s = parseDraft(
      '{"bot":"aris","cron":"0 17 * * *","mode":"script","command":"df -h /","task":"","clear":true}',
      bots,
    )
    expect(s).toMatchObject({ mode: 'script', command: 'df -h /', clear: true })
    expect(parseDraft('không có JSON', bots)).toBeUndefined()
  })

  it('xem trước lịch: chữ và 3 lần tới', () => {
    expect(preview('0 8 * * 1-5', 'Asia/Ho_Chi_Minh', new Date('2026-10-24T02:00:00Z'))).toEqual({
      when: 'Thứ 2–6, 08:00',
      next: ['2026-10-26T01:00:00.000Z', '2026-10-27T01:00:00.000Z', '2026-10-28T01:00:00.000Z'],
    })
  })
})
