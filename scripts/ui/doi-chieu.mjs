// G6 · Đối chiếu canvas: chụp từng màn của canvas thiết kế và màn tương ứng của app
// thật, sáng và tối, rồi ghép cạnh nhau trong out/doi-chieu/index.html.
//
// Cần:
// - app đang chạy (`pnpm aris`), truyền URL có token mà dsh in ra qua ARIS_APP_URL;
// - runtime của canvas (`artifact-type/dc-runtime.js` của artifact canvas trên
//   claude.ai) đặt ở design/canvas/.runtime/support.js, hoặc trỏ ARIS_CANVAS_RUNTIME;
// - Google Chrome (đổi đường dẫn bằng CHROME_PATH).
//
//   ARIS_APP_URL='http://127.0.0.1:3201/?token=…' node scripts/ui/doi-chieu.mjs [--only 4.1,5.3] [--theme dark]
//
// Không cần gói nào ngoài Node 22: điều khiển Chrome qua giao thức DevTools bằng
// WebSocket có sẵn của Node.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repoRoot } from '../paths.mjs'
import { launchChrome, newPage, sleep, until } from './cdp.mjs'
import { SCREENS } from './screens.mjs'

const CANVAS_DIR = join(repoRoot, 'design/canvas')
const OUT = join(repoRoot, 'out/doi-chieu')
const RUNTIME = process.env.ARIS_CANVAS_RUNTIME ?? join(CANVAS_DIR, '.runtime/support.js')
const APP_URL = process.env.ARIS_APP_URL

function args() {
  const a = process.argv.slice(2)
  const value = (name) => {
    const i = a.indexOf(name)
    return i >= 0 ? a[i + 1] : undefined
  }
  const only = value('--only')?.split(',')
  const theme = value('--theme')
  return { only, themes: theme ? [theme] : ['dark', 'light'] }
}

/** Phục vụ tệp canvas; `support.js` lấy từ runtime. */
function serveCanvas() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json' }
  const server = createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1))
    const file = name === 'support.js' ? RUNTIME : join(CANVAS_DIR, name)
    if (name.includes('..') || !existsSync(file)) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` }),
    ),
  )
}

function boardSize(file) {
  const boards = JSON.parse(readFileSync(join(CANVAS_DIR, 'canvas.json'), 'utf8')).boards
  const b = boards[file]
  return { w: b?.w ?? 1440, h: b?.h ?? 900 }
}

async function shootCanvas(page, base, screen, theme, file) {
  const { w, h } = boardSize(screen.canvas)
  await page.viewport(w, h)
  await page.goto(`${base}/${screen.canvas}`)
  await until(page, `!!document.querySelector('.t-light, .t-dark')`)
  // Màn canvas tự chọn theme theo thuộc tính của nó; ép theme bằng lớp t-light/t-dark.
  await page.eval(
    `document.querySelectorAll('.t-light, .t-dark').forEach((e) => { e.classList.remove('t-light', 't-dark'); e.classList.add('t-${theme}') }); true`,
  )
  await sleep(900)
  await page.shot(file)
}

async function shootApp(page, screen, theme, file) {
  const { w, h } = boardSize(screen.canvas)
  await page.viewport(w, h)
  await page.theme(theme)
  await page.goto(APP_URL)
  if (!(await until(page, `!!document.querySelector('.aris-sb, .aris')`))) {
    await page.shot(file.replace(/\.png$/, '-loi.png'))
    const text = await page.eval('document.body.innerText.slice(0, 300)').catch(() => '')
    throw new Error(`app không tải xong (token sai hoặc app chưa chạy?): ${text}`)
  }
  await sleep(1200)
  const step = screen.app
  if (step.chat) {
    // Chrome mới mở phiên trống và cột phải đóng: mở phiên gần nhất của dự án đầu tiên
    // rồi mở cột phải, như khi anh dùng thật.
    await until(page, `[...document.querySelectorAll('.aris-sb .projects .a-nav')].length > 0`, 8000)
    await page.eval(
      `(() => { const b = document.querySelector('.aris-sb .projects .a-nav'); b?.click(); return !!b })()`,
    )
    await sleep(2000)
    await page.eval(
      `(() => { const b = [...document.querySelectorAll('button[aria-label]')].find((x) => /thanh bên phải/i.test(x.getAttribute('aria-label')) && !/^Thu gọn/i.test(x.getAttribute('aria-label'))); b?.click(); return true })()`,
    )
  } else if (step.go) {
    const [to, params] = step.go
    await page.eval(
      `document.dispatchEvent(new CustomEvent('aris:navigate', { detail: { to: ${JSON.stringify(to)}, params: ${JSON.stringify(params ?? {})} } })); true`,
    )
  }
  await sleep(1500)
  await page.shot(file)
}

function report(rows, themes) {
  const cell = (src, label) =>
    src
      ? `<figure><figcaption>${label}</figcaption><img src="${src}" loading="lazy"></figure>`
      : `<figure class="none"><figcaption>${label}</figcaption><div>Chưa có trong app</div></figure>`
  const body = rows
    .map(
      (r) => `<section id="m${r.id}"><h2>${r.id} · ${r.title}${r.why ? ` <small>(${r.why})</small>` : ''}</h2>
${themes.map((t) => `<div class="pair">${cell(`${r.id}-${t}-canvas.png`, `Canvas · ${t}`)}${cell(r.app ? `${r.id}-${t}-app.png` : null, `App · ${t}`)}</div>`).join('\n')}</section>`,
    )
    .join('\n')
  return `<!doctype html><meta charset="utf-8"><title>Đối chiếu canvas</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;background:#111;color:#eee}h2{font-size:16px;margin:28px 0 8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}figure{margin:0}figcaption{font-size:12px;color:#aaa;margin-bottom:4px}
img{width:100%;border:1px solid #333}.none div{aspect-ratio:16/10;border:1px dashed #555;display:grid;place-items:center;color:#888}</style>
<h1>Đối chiếu canvas ↔ app</h1>${body}`
}

/** Ảnh ghép một màn: canvas trái, app phải, để xem nhanh từng cặp. */
async function shootPair(page, id, theme) {
  const html = join(OUT, `pair-${id}-${theme}.html`)
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:8px}img{max-width:100%;max-height:520px;display:block;justify-self:center}</style><img src="${id}-${theme}-canvas.png"><img src="${existsSync(join(OUT, `${id}-${theme}-app.png`)) ? `${id}-${theme}-app.png` : ''}">`,
  )
  await page.viewport(1600, 520)
  await page.goto(pathToFileURL(html).href)
  await sleep(300)
  await page.shot(join(OUT, `cap-${id}-${theme}.png`))
  rmSync(html)
}

async function main() {
  const { only, themes } = args()
  if (!existsSync(RUNTIME)) {
    console.error(
      `Thiếu runtime canvas: ${RUNTIME}\nTải artifact-type/dc-runtime.js của canvas về đó, hoặc đặt ARIS_CANVAS_RUNTIME.`,
    )
    process.exit(1)
  }
  if (!APP_URL) {
    console.error('Thiếu ARIS_APP_URL: URL có token mà `pnpm aris` in ra.')
    process.exit(1)
  }
  mkdirSync(OUT, { recursive: true })
  const screens = SCREENS.filter((s) => !only || only.includes(s.id))
  const { server, base } = await serveCanvas()
  const browser = await launchChrome()
  try {
    const page = await newPage(browser.cdp)
    for (const s of screens)
      for (const t of themes) {
        process.stdout.write(`${s.id} ${t}: canvas`)
        await shootCanvas(page, base, s, t, join(OUT, `${s.id}-${t}-canvas.png`))
        if (s.app) {
          process.stdout.write(', app')
          await shootApp(page, s, t, join(OUT, `${s.id}-${t}-app.png`))
        }
        await shootPair(page, s.id, t)
        process.stdout.write('\n')
      }
    writeFileSync(
      join(OUT, 'index.html'),
      report(
        SCREENS.filter((s) => screens.includes(s)),
        themes,
      ),
    )
    console.log(`Xong: ${join(OUT, 'index.html')}`)
  } finally {
    await browser.close()
    server.close()
  }
}

await main()
