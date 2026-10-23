import { describe, expect, it } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { probe, probeInputError, type Stream } from './probe.js'

const clock = () => {
  let t = 0
  return () => (t += 100)
}

const streamOf = (...chunks: StreamChunk[]): Stream =>
  async function* () {
    yield* chunks
  }

describe('probe', () => {
  it('có chữ đầu là kết nối tốt, đo thời gian tới chữ đầu', async () => {
    const r = await probe(
      streamOf({ type: 'text-delta', index: 0, text: 'p' }),
      'deepseek',
      'deepseek-chat',
      clock(),
    )
    expect(r).toEqual({ ok: true, ms: 100 })
  })

  it('kết thúc bằng lỗi thì trả lời lỗi của nhà cung cấp', async () => {
    const r = await probe(
      streamOf({
        type: 'finish',
        reason: { kind: 'error', failure: { message: '401 sai khoá', code: 'auth' } },
      }),
      'openai',
      'gpt-x',
      clock(),
    )
    expect(r).toMatchObject({ ok: false, error: '401 sai khoá' })
  })

  it('luồng ném lỗi cũng thành kết quả lỗi chứ không vỡ', async () => {
    const broken: Stream = () => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('mất mạng')) }),
    })
    expect(await probe(broken, 'a', 'b', clock())).toMatchObject({ ok: false, error: 'mất mạng' })
  })

  it('kiểm đầu vào', () => {
    expect(probeInputError('deepseek', 'deepseek-chat')).toBeUndefined()
    expect(probeInputError('', 'm')).toBe('provider không hợp lệ')
    expect(probeInputError('a', 'x y')).toBe('model không hợp lệ')
  })
})
