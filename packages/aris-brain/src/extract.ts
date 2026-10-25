/**
 * Trích chữ của nguồn (giai đoạn 5, đợt 2a: chữ, `.md`, `.txt`, link web; PDF, Word, ảnh, ghi âm ở đợt 2b).
 * Không gọi model. Trang web đổi sang chữ bằng `textutil` có sẵn của macOS.
 */
import { execFile } from 'node:child_process'
import { extname } from 'node:path'

/** Trang web lớn hơn chừng này thì cắt. */
const PAGE_MAX_BYTES = 3 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000

export const TEXT_EXT = new Set(['.md', '.markdown', '.txt'])

/** Loại tệp đọc được ngay ở đợt này. */
export const readable = (path: string) => TEXT_EXT.has(extname(path).toLowerCase())

/** Link hợp lệ để tải (http, https; không tải địa chỉ trong máy). */
export function safeUrl(raw: string): URL | undefined {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[::1\]|0\.0\.0\.0)/i.test(u.hostname)) return undefined
    return u
  } catch {
    return undefined
  }
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))

/** Tiêu đề trang (`og:title` hay `<title>`). */
export function htmlTitle(html: string): string | undefined {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  const t = og ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const v = t ? decode(t).replace(/\s+/g, ' ').trim() : ''
  return v || undefined
}

/** Bỏ phần không phải nội dung (script, style, thanh điều hướng) trước khi đổi sang chữ. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
}

/** Đổi HTML sang chữ thường bằng `textutil` (macOS); không có thì bỏ thẻ thô. */
export function htmlToText(html: string): Promise<string> {
  const clean = stripHtml(html)
  const fallback = () =>
    decode(clean.replace(/<(br|p|div|li|h\d|tr)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '))
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*/g, '\n\n')
      .trim()
  if (process.platform !== 'darwin') return Promise.resolve(fallback())
  return new Promise((ok) => {
    const child = execFile(
      '/usr/bin/textutil',
      [
        '-stdin',
        '-stdout',
        '-format',
        'html',
        '-convert',
        'txt',
        '-inputencoding',
        'UTF-8',
        '-encoding',
        'UTF-8',
      ],
      { maxBuffer: 16 * 1024 * 1024, timeout: 20_000 },
      (err, stdout) => ok(err ? fallback() : stdout.replace(/\n{3,}/g, '\n\n').trim()),
    )
    child.stdin?.end(clean)
  })
}

/** Tải một trang web: tiêu đề và chữ. */
export async function fetchPage(url: URL, signal?: AbortSignal): Promise<{ title: string; text: string }> {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (aris; brain ingest)',
      accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
    },
    signal: signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!r.ok) throw new Error(`trang trả về ${r.status}`)
  const type = r.headers.get('content-type') ?? ''
  const buf = Buffer.from(await r.arrayBuffer())
  const raw = buf.subarray(0, PAGE_MAX_BYTES).toString('utf8')
  if (/text\/plain|markdown/i.test(type)) return { title: url.hostname, text: raw.trim() }
  if (!/html/i.test(type)) throw new Error(`chưa đọc được loại nội dung ${type || 'không rõ'}`)
  return { title: htmlTitle(raw) ?? url.hostname, text: await htmlToText(raw) }
}

/** Nội dung tệp nguồn dạng chữ cho Thủ thư (bỏ nhãn đầu trang của aris). */
export function sourceText(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, '').trim()
}

/** Tệp `.md` nguồn aris tạo cho chữ hay link người dùng gửi. */
export function sourceFile(o: {
  title: string
  text: string
  url?: string | undefined
  from: string
  at: Date
}): string {
  const head = [
    '---',
    'loai: ' + (o.url ? 'link' : 'ghi-chu'),
    `tieu-de: ${JSON.stringify(o.title)}`,
    ...(o.url ? [`url: ${o.url}`] : []),
    `tu: ${o.from}`,
    `luc: ${o.at.toISOString()}`,
    '---',
    '',
  ]
  return `${head.join('\n')}# ${o.title}\n\n${o.url ? `Nguồn: ${o.url}\n\n` : ''}${o.text.trim()}\n`
}
