import { describe, expect, it } from 'vitest'
import { decide, emptyTurn, reasonsOf, type TurnLog } from './signals.js'

const turn = (n: number, over: Partial<TurnLog> = {}): TurnLog => ({
  ...emptyTurn(n),
  assistant: [
    'Đây là bản báo cáo doanh thu tuần, đủ các cột theo yêu cầu và ghi chú nguồn số liệu. '.repeat(3),
  ],
  ...over,
})

describe('tín hiệu đáng học', () => {
  it('nhận sửa sai, dặn nhớ, khen, việc dài, lỗi rồi tìm ra cách', () => {
    expect(reasonsOf(turn(1, { user: ['Sai rồi, báo cáo phải có cột so tuần trước'] }))).toEqual([
      'corrected',
    ])
    expect(reasonsOf(turn(1, { user: ['Lần sau gửi bản PDF nhé'] }))).toEqual(['remember'])
    expect(reasonsOf(turn(1, { user: ['Lần sau gửi bản PDF nhé'], memoryWrites: 1 }))).toEqual([])
    expect(reasonsOf(turn(1, { user: ['Tốt lắm, đúng ý anh'] }))).toEqual(['praised'])
    const tools = Array.from({ length: 8 }, (_, i) => ({ name: `t${i}`, ok: true, brief: '' }))
    expect(reasonsOf(turn(1, { tools }))).toEqual(['long'])
    expect(
      reasonsOf(
        turn(1, {
          tools: [
            { name: 'bash', ok: false, brief: 'npm test' },
            { name: 'read', ok: true, brief: '' },
            { name: 'bash', ok: true, brief: 'pnpm test' },
          ],
        }),
      ),
    ).toEqual(['recovered'])
    expect(reasonsOf(turn(1, { user: ['Tóm tắt giúp email này'] }))).toEqual([])
  })

  it('cách lần học: sửa sai học ngay, dấu hiệu khác cách ít nhất 2 lượt, lượt ngắn bỏ qua', () => {
    const praised = turn(3, { user: ['Chuẩn rồi'] })
    expect(decide([praised], 1)).toEqual([])
    expect(decide([praised], 2)).toEqual(['praised'])
    expect(decide([praised], undefined)).toEqual(['praised'])
    expect(decide([turn(3, { user: ['Không phải thế'] })], 0)).toEqual(['corrected'])
    expect(decide([{ ...emptyTurn(1), user: ['Sai rồi'], assistant: ['Dạ'] }], undefined)).toEqual([])
  })

  it('lưới an toàn: 12 lượt liền không học và đủ dài', () => {
    const plain = Array.from({ length: 12 }, (_, i) => turn(i + 1, { user: ['Viết tiếp đoạn sau'] }))
    expect(decide(plain.slice(0, 11), 11)).toEqual([])
    expect(decide(plain, 12)).toEqual(['safety'])
  })
})
