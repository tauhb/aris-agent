import { describe, expect, it } from 'vitest'
import { SEND_MAX_CHARS, sendTitle, sessionSend, type SendAgent, type SendDeps } from './session-send.js'

function setup(opts: { status?: string; stopped?: boolean; missing?: boolean; trackThrows?: boolean } = {}) {
  const calls: string[] = []
  const tracked: string[] = []
  const agent: SendAgent = {
    status: opts.status ?? 'idle',
    steer: (m) => void calls.push(`steer:${String(m)}`),
    followup: (m) => void calls.push(`followup:${String(m)}`),
  }
  const opened: string[] = []
  const deps: SendDeps = {
    stopped: () => opts.stopped ?? false,
    agentOf: async (s) => {
      opened.push(s)
      return opts.missing ? undefined : agent
    },
    message: (t) => `msg(${t})`,
    track: (s, title) => {
      if (opts.trackThrows) throw new Error('hỏng')
      tracked.push(`${s}:${title}`)
    },
  }
  return { deps, calls, opened, tracked }
}

describe('session-send', () => {
  it('bot đang chạy và chọn chèn: chen vào lượt đang chạy', async () => {
    const { deps, calls } = setup({ status: 'running' })
    const r = await sessionSend(deps, { session: 's1', text: '  Thêm số liệu tháng 9  ', mode: 'steer' })
    expect(r).toEqual({ status: 200, body: { ok: true, mode: 'steer', running: true } })
    expect(calls).toEqual(['steer:msg(Thêm số liệu tháng 9)'])
  })

  it('bot đang chạy và chọn xếp sau: xếp hàng làm tiếp', async () => {
    const { deps, calls } = setup({ status: 'running' })
    const r = await sessionSend(deps, { session: 's1', text: 'Làm sau', mode: 'queue' })
    expect(r.body).toEqual({ ok: true, mode: 'followup', running: true })
    expect(calls).toEqual(['followup:msg(Làm sau)'])
  })

  it('phiên rảnh: chạy luôn bằng followup dù chọn chèn; mặc định là chèn', async () => {
    const { deps, calls } = setup({ status: 'idle' })
    expect((await sessionSend(deps, { session: 's1', text: 'Chào', mode: 'steer' })).body).toEqual({
      ok: true,
      mode: 'followup',
      running: false,
    })
    await sessionSend(deps, { session: 's1', text: 'Chào lại' })
    expect(calls).toEqual(['followup:msg(Chào)', 'followup:msg(Chào lại)'])
    const busy = setup({ status: 'running' })
    await sessionSend(busy.deps, { session: 's1', text: 'Không nói chế độ' })
    expect(busy.calls).toEqual(['steer:msg(Không nói chế độ)'])
  })

  it('từ chối tin trống, quá dài, mã phiên sai, chế độ lạ; không mở phiên khi dữ liệu sai', async () => {
    const { deps, calls, opened } = setup()
    const bad = async (body: Record<string, unknown>) => (await sessionSend(deps, body)).status
    expect(await bad({ session: 's1', text: '   ' })).toBe(400)
    expect(await bad({ session: 's1', text: 'a'.repeat(SEND_MAX_CHARS + 1) })).toBe(400)
    expect(await bad({ session: 'a/b', text: 'x' })).toBe(400)
    expect(await bad({ session: '', text: 'x' })).toBe(400)
    expect(await bad({ text: 'x' })).toBe(400)
    expect(await bad({ session: 's1', text: 'x', mode: 'interrupt' })).toBe(400)
    expect(await bad({ session: 's1', text: 'a'.repeat(SEND_MAX_CHARS) })).toBe(200)
    expect(opened).toEqual(['s1'])
    expect(calls).toHaveLength(1)
  })

  it('dừng khẩn cấp thì 423 và không gửi', async () => {
    const { deps, calls, opened } = setup({ stopped: true })
    const r = await sessionSend(deps, { session: 's1', text: 'x' })
    expect(r.status).toBe(423)
    expect(calls).toEqual([])
    expect(opened).toEqual([])
  })

  it('không mở được phiên (mã sai, mã lần chạy của bot ngoài) thì 404', async () => {
    const { deps, calls } = setup({ missing: true })
    const r = await sessionSend(deps, { session: 'run-1', text: 'x' })
    expect(r).toEqual({ status: 404, body: { error: 'Không mở được phiên này.' } })
    expect(calls).toEqual([])
    const boom: SendDeps = {
      ...deps,
      agentOf: async () => {
        throw new Error('hỏng')
      },
    }
    expect((await sessionSend(boom, { session: 's1', text: 'x' })).status).toBe(404)
  })
})

describe('ghi vào "Vừa làm gì"', () => {
  it('phiên rảnh: ghi nhận việc với tên là dòng đầu của câu gửi, trước khi chạy', async () => {
    const { deps, calls, tracked } = setup({ status: 'idle' })
    await sessionSend(deps, { session: 's1', text: '  Viết bài Facebook\nchi tiết thêm ở dưới ' })
    expect(tracked).toEqual(['s1:Viết bài Facebook'])
    expect(calls).toEqual(['followup:msg(Viết bài Facebook\nchi tiết thêm ở dưới)'])
  })

  it('chèn hay xếp sau lúc bot đang chạy: không tạo dòng mới', async () => {
    const { deps, tracked } = setup({ status: 'running' })
    await sessionSend(deps, { session: 's1', text: 'Thêm số liệu', mode: 'steer' })
    await sessionSend(deps, { session: 's1', text: 'Làm sau', mode: 'queue' })
    expect(tracked).toEqual([])
  })

  it('tin bị từ chối thì không ghi; ghi lỗi không làm hỏng việc gửi', async () => {
    const bad = setup({ status: 'idle' })
    await sessionSend(bad.deps, { session: 's1', text: '   ' })
    expect(bad.tracked).toEqual([])
    const boom = setup({ status: 'idle', trackThrows: true })
    expect((await sessionSend(boom.deps, { session: 's1', text: 'x' })).status).toBe(200)
    expect(boom.calls).toHaveLength(1)
  })

  it('sendTitle cắt ở 80 ký tự', () => {
    expect([...sendTitle('a'.repeat(200))]).toHaveLength(80)
    expect(sendTitle('a'.repeat(200)).endsWith('…')).toBe(true)
    expect(sendTitle('\n  \n')).toBe('')
  })
})
