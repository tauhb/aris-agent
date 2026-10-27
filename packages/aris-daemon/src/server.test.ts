import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { close, listen, type DaemonPort } from './server.js'

function call(socketPath: string, method: string, path: string, body?: unknown) {
  return new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
    const req = request(
      { socketPath, method, path, headers: { 'content-type': 'application/json' } },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (b: Buffer) => chunks.push(b))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>,
          }),
        )
      },
    )
    req.on('error', reject)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0)) await f()
})

async function start(port: Partial<DaemonPort> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'aris-sock-'))
  const path = join(dir, 'aris.sock')
  let stopped = false
  const full: DaemonPort = {
    status: () => ({ pid: 1, web: 'http://127.0.0.1:3201' }),
    loginUrl: () => 'http://127.0.0.1:3201/?token=x',
    send: async (t) => `gửi: ${t}`,
    ask: async (t) => ({ sessionId: 's1', text: `đáp: ${t}`, reason: 'completed' }),
    stop: () => void (stopped = true),
    ...port,
  }
  const server = await listen(path, full)
  cleanup.push(async () => {
    await close(server, path)
    await rm(dir, { recursive: true, force: true })
  })
  return { path, stopped: () => stopped }
}

describe('socket cục bộ', () => {
  it('chỉ chủ tệp mở được (0600)', async () => {
    const { path } = await start()
    expect((await stat(path)).mode & 0o777).toBe(0o600)
  })

  it('trạng thái, đăng nhập, gửi, giao việc', async () => {
    const { path } = await start()
    expect(await call(path, 'GET', '/status')).toEqual({
      status: 200,
      body: { pid: 1, web: 'http://127.0.0.1:3201' },
    })
    expect((await call(path, 'POST', '/login')).body.url).toContain('token=')
    expect((await call(path, 'POST', '/send', { text: 'chào' })).body).toEqual({ result: 'gửi: chào' })
    expect((await call(path, 'POST', '/ask', { text: 'tóm tắt lịch' })).body).toEqual({
      sessionId: 's1',
      text: 'đáp: tóm tắt lịch',
      reason: 'completed',
    })
    expect((await call(path, 'POST', '/ask', { text: '  ' })).status).toBe(400)
    expect((await call(path, 'POST', '/nope')).status).toBe(404)
  })

  it('không chiếm socket của bản đang chạy, chiếm lại socket của bản đã văng', async () => {
    const { path } = await start()
    await expect(listen(path, {} as DaemonPort)).rejects.toThrow('đã có bản aris khác')
    expect((await call(path, 'GET', '/status')).status).toBe(200)

    const dir = await mkdtemp(join(tmpdir(), 'aris-sock-'))
    const stale = join(dir, 'aris.sock')
    await writeFile(stale, '')
    const server = await listen(stale, { status: () => ({ ok: true }) } as unknown as DaemonPort)
    cleanup.push(async () => {
      await close(server, stale)
      await rm(dir, { recursive: true, force: true })
    })
    expect((await call(stale, 'GET', '/status')).body).toEqual({ ok: true })
  })

  it('lỗi của máy chủ thành lời báo, dừng thì gọi stop', async () => {
    const s = await start({
      ask: async () => {
        throw new Error('model lỗi')
      },
    })
    expect(await call(s.path, 'POST', '/ask', { text: 'x' })).toEqual({
      status: 500,
      body: { error: 'model lỗi' },
    })
    expect((await call(s.path, 'POST', '/stop')).body).toEqual({ stopping: true })
    await new Promise((r) => setTimeout(r, 150))
    expect(s.stopped()).toBe(true)
  })

  it('aris computer doctor: trả báo cáo của gói điều khiển máy; gói chưa bật thì 404', async () => {
    const on = await start({ computerDoctor: async () => ({ text: '✓ Lõi cua-driver' }) })
    expect(await call(on.path, 'POST', '/computer-doctor')).toEqual({
      status: 200,
      body: { text: '✓ Lõi cua-driver' },
    })
    const off = await start()
    expect((await call(off.path, 'POST', '/computer-doctor')).status).toBe(404)
  })
})
