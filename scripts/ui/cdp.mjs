// Điều khiển Chrome không giao diện qua giao thức DevTools, chỉ bằng WebSocket có sẵn
// của Node 22 (không cần Playwright hay Puppeteer). Dùng cho G6 (scripts/ui/doi-chieu.mjs).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const CHROME =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Mở Chrome không giao diện và nối vào cổng DevTools của nó. */
export async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), 'aris-doi-chieu-'))
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ])
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    chrome.stderr.on('data', (d) => {
      buf += d
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) resolve(m[1])
    })
    chrome.on('exit', (code) => reject(new Error(`Chrome thoát (${code}):\n${buf}`)))
  })
  const cdp = await connect(wsUrl)
  return {
    cdp,
    async close() {
      const exited = new Promise((r) => chrome.once('exit', r))
      chrome.kill()
      await Promise.race([exited, sleep(5000)])
      rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    },
  }
}

function connect(url) {
  const ws = new WebSocket(url)
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    } else for (const fn of listeners) fn(msg)
  })
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    })
  const once = (method, sessionId) =>
    new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          listeners.delete(fn)
          resolve(msg.params)
        }
      }
      listeners.add(fn)
    })
  return new Promise((resolve) => ws.addEventListener('open', () => resolve({ send, once })))
}

export async function newPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => cdp.send(method, params, sessionId)
  await send('Page.enable')
  await send('Runtime.enable')
  return {
    async viewport(width, height) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 500,
      })
    },
    async theme(value) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] })
    },
    async goto(url) {
      const loaded = cdp.once('Page.loadEventFired', sessionId)
      await send('Page.navigate', { url })
      await Promise.race([loaded, sleep(15000)])
    },
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'lỗi khi chạy mã')
      return r.result.value
    },
    async shot(file) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(file, Buffer.from(data, 'base64'))
    },
  }
}

/** Đợi tới khi biểu thức đúng, tối đa `ms`. */
export async function until(page, expression, ms = 15000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.eval(expression).catch(() => false)) return true
    await sleep(250)
  }
  return false
}
