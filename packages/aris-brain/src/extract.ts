/**
 * Trích chữ của nguồn (giai đoạn 5, đợt 2a: chữ, `.md`, `.txt`, link web; PDF, Word, ảnh, ghi âm ở đợt 2b).
 * Không gọi model. Trang web đổi sang chữ bằng `textutil` có sẵn của macOS.
 */
import { execFile } from 'node:child_process'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { extname } from 'node:path'

/** Trang web lớn hơn chừng này thì cắt. */
const PAGE_MAX_BYTES = 3 * 1024 * 1024
const FETCH_TIMEOUT_MS = 20_000
/** Theo chuyển hướng bằng tay, tối đa bấy nhiêu bước; mỗi bước kiểm lại địa chỉ (đợt 7f, S7). */
const MAX_REDIRECTS = 5

export const TEXT_EXT = new Set(['.md', '.markdown', '.txt'])

/** Loại tệp đọc được ngay ở đợt này. */
export const readable = (path: string) => TEXT_EXT.has(extname(path).toLowerCase())

// --- Chống tải địa chỉ trong máy hay mạng nội bộ (SSRF, đợt 7f, S7) --------------------------------------

/** IPv4 dạng 4 byte; undefined khi không phải. */
function ipv4Bytes(s: string): number[] | undefined {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s)
  if (!m) return undefined
  const b = m.slice(1).map(Number)
  return b.every((n) => n <= 255) ? b : undefined
}

/** IPv6 dạng 16 byte (hiểu `::`, đuôi IPv4 `::ffff:1.2.3.4`, vùng `%en0`); undefined khi không phải. */
function ipv6Bytes(raw: string): number[] | undefined {
  let s = raw.toLowerCase().split('%')[0]!
  const tail4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s)
  if (tail4) {
    const b = ipv4Bytes(tail4[1]!)
    if (!b) return undefined
    s = `${s.slice(0, -tail4[1]!.length)}${((b[0]! << 8) | b[1]!).toString(16)}:${((b[2]! << 8) | b[3]!).toString(16)}`
  }
  const halves = s.split('::')
  if (halves.length > 2) return undefined
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = 8 - head.length - rest.length
  if (halves.length === 1 ? head.length !== 8 : fill < 0) return undefined
  const groups = halves.length === 1 ? head : [...head, ...Array<string>(fill).fill('0'), ...rest]
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return undefined
  return groups.flatMap((g) => [parseInt(g, 16) >> 8, parseInt(g, 16) & 255])
}

/** IPv4 công khai: không phải 0/8, 10/8, 100.64/10 (CGNAT), 127/8, 169.254/16, 172.16/12, 192.168/16, 224+. */
function publicV4([a, b, c]: number[]): boolean {
  if (a === 0 || a === 10 || a === 127 || a! >= 224) return false
  if (a === 100 && b! >= 64 && b! <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b! >= 16 && b! <= 31) return false
  if (a === 192 && (b === 168 || (b === 0 && c === 0))) return false
  if (a === 198 && (b === 18 || b === 19)) return false
  return true
}

/**
 * Địa chỉ IP công khai (được tải). Chặn: loopback, riêng (10/8, 172.16/12, 192.168/16), link-local, CGNAT
 * 100.64/10, 0.0.0.0/8, multicast; IPv6 `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`; dạng IPv4 nhúng trong IPv6
 * (`::ffff:x`, `64:ff9b::x`, `2002:`) thì xét địa chỉ IPv4 bên trong. Không phải địa chỉ IP: false.
 */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) return publicV4(ipv4Bytes(ip)!)
  if (kind !== 6) return false
  const b = ipv6Bytes(ip)
  if (!b) return false
  const zeros = (from: number, to: number) => b.slice(from, to).every((x) => x === 0)
  if (zeros(0, 10) && b[10] === 255 && b[11] === 255) return publicV4(b.slice(12)) // IPv4-mapped
  if (zeros(0, 12)) return false // `::`, `::1`, IPv4-compatible
  if (b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zeros(4, 12))
    return publicV4(b.slice(12)) // NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return publicV4(b.slice(2, 6)) // 6to4
  if ((b[0]! & 0xfe) === 0xfc) return false // fc00::/7
  if (b[0] === 0xfe && (b[1]! & 0xc0) >= 0x80) return false // fe80::/10 và fec0::/10
  if (b[0] === 0xff) return false // multicast
  return true
}

/** Link hợp lệ để tải (http, https; không tải địa chỉ trong máy). Tên miền còn phải qua `assertPublicHost`. */
export function safeUrl(raw: string): URL | undefined {
  try {
    const u = new URL(raw.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined
    const host = u.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
      .toLowerCase()
    if (isIP(host)) return isPublicIp(host) ? u : undefined
    if (host === 'localhost' || /\.(localhost|local|internal|lan|home\.arpa)$/.test(host)) return undefined
    return u
  } catch {
    return undefined
  }
}

/** Phân giải tên miền ra mọi địa chỉ (IPv4 và IPv6). */
export type Resolver = (host: string) => Promise<string[]>
const systemResolver: Resolver = async (host) => (await dnsLookup(host, { all: true })).map((a) => a.address)

/** Tên miền phải trỏ toàn về địa chỉ công khai: một địa chỉ trong máy hay nội bộ là từ chối. */
export async function assertPublicHost(u: URL, resolver: Resolver = systemResolver): Promise<void> {
  const host = u.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host)) {
    if (!isPublicIp(host)) throw new Error('địa chỉ trong máy hay mạng nội bộ')
    return
  }
  const addrs = await resolver(host)
  if (!addrs.length || addrs.some((a) => !isPublicIp(a)))
    throw new Error('tên miền trỏ về địa chỉ trong máy hay mạng nội bộ')
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

export interface FetchDeps {
  fetch?: typeof fetch
  resolver?: Resolver
}

/**
 * Tải một trang web: tiêu đề và chữ. Mỗi bước (kể cả bước chuyển hướng) kiểm lại địa chỉ đích; chuyển hướng theo
 * bằng tay, tối đa `MAX_REDIRECTS` bước, nên một trang công khai không đẩy được sang dịch vụ trong máy.
 */
export async function fetchPage(
  url: URL,
  signal?: AbortSignal,
  deps: FetchDeps = {},
): Promise<{ title: string; text: string }> {
  const doFetch = deps.fetch ?? fetch
  const sig = signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS)
  let cur = url
  let r: Response | undefined
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(cur, deps.resolver)
    r = await doFetch(cur, {
      redirect: 'manual',
      headers: {
        'user-agent': 'Mozilla/5.0 (aris; brain ingest)',
        accept: 'text/html,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: sig,
    })
    const to = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null
    if (!to) break
    const next = safeUrl(new URL(to, cur).href)
    if (!next) throw new Error('trang chuyển hướng tới địa chỉ không an toàn')
    if (hop === MAX_REDIRECTS) throw new Error('trang chuyển hướng quá nhiều lần')
    cur = next
  }
  if (!r) throw new Error('không tải được trang')
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
