import { describe, expect, it } from 'vitest'
import { runScript, scriptOutcome } from './script.js'

describe('chế độ chỉ chạy script', () => {
  it('chạy lệnh, lấy đầu ra; không mang biến môi trường của daemon', async () => {
    process.env.ARIS_SECRET_TEST = 'bi-mat'
    const r = await runScript('echo xin chao; echo "[$ARIS_SECRET_TEST]"')
    expect(scriptOutcome(r)).toEqual({ ok: true, output: 'xin chao\n[]' })
  })

  it('in rỗng thì không có gì để gửi; mã thoát khác 0 là lỗi; quá giờ thì huỷ', async () => {
    expect(scriptOutcome(await runScript('true'))).toEqual({ ok: true, output: '' })
    const bad = scriptOutcome(await runScript('echo hong >&2; exit 3'))
    expect(bad.ok).toBe(false)
    expect(bad.error).toBe('mã thoát 3: hong')
    const slow = scriptOutcome(await runScript('sleep 5', 200))
    expect(slow).toMatchObject({ ok: false, error: 'lệnh chạy quá 2 phút' })
  })
})
