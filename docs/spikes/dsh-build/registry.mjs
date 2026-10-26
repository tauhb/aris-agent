// Registry cục bộ: phục vụ các gói dsh vừa pack (tarballs/), còn lại chuyển tiếp tới registry.npmjs.org.
import http from 'node:http'
import { readdirSync, readFileSync, createReadStream, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const D = process.argv[2], PORT = 4873
const TB = join(D, 'tarballs')
const pk = new Map()
for (const f of readdirSync(TB).filter(x => x.endsWith('.tgz'))) {
  const json = JSON.parse(execFileSync('tar', ['-xOf', join(TB, f), 'package/package.json'], { encoding: 'utf8', maxBuffer: 1 << 26 }))
  const buf = readFileSync(join(TB, f))
  pk.set(json.name, { json, file: f, integrity: 'sha512-' + createHash('sha512').update(buf).digest('base64'), shasum: createHash('sha1').update(buf).digest('hex') })
}
console.error('serving', pk.size, 'local packages')
http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/tarballs/')) {
    const p = join(TB, url.slice(10)); res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': statSync(p).size }); return createReadStream(p).pipe(res)
  }
  const name = url.slice(1)
  const e = pk.get(name)
  if (e) {
    const v = e.json.version
    const body = { name, 'dist-tags': { latest: v }, versions: { [v]: { ...e.json, dist: { tarball: `http://127.0.0.1:${PORT}/tarballs/${e.file}`, integrity: e.integrity, shasum: e.shasum } } }, time: { [v]: '2026-10-17T08:36:31.655Z' } }
    res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(body))
  }
  try {
    const r = await fetch('https://registry.npmjs.org' + req.url, { headers: { accept: req.headers.accept ?? '*/*' } })
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' }); res.end(Buffer.from(await r.arrayBuffer()))
  } catch (err) { res.writeHead(502); res.end(String(err)) }
}).listen(PORT, '127.0.0.1')
