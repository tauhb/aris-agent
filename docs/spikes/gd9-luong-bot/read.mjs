/* global process, console, Buffer */
// Mã đo của spike GĐ9.4 (docs/spikes/gd9-luong-bot.md): chỉ đọc số token, thời gian, chi phí.
import { execFileSync } from 'node:child_process'
export function readLog(path) {
  let txt
  try {
    txt = execFileSync('zstd', ['-dc', '-q', path], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8')
  } catch (e) {
    // Phiên đang ghi dở: dùng phần đã giải nén được.
    txt = (e.stdout ?? Buffer.alloc(0)).toString('utf8')
  }
  return txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return { type: '?' } } })
}
if (process.argv[2]) {
  const recs = readLog(process.argv[2])
  const kinds = {}
  for (const r of recs) kinds[r.type] = (kinds[r.type] ?? 0) + 1
  console.log(recs.length, kinds)
  const u = recs.find((r) => JSON.stringify(r).includes('"usage"'))
  const shape = (o, d = 0) => d > 4 || !o || typeof o !== 'object' ? typeof o : Array.isArray(o) ? `[${o.length}] ${shape(o[0], d + 1)}` : '{' + Object.entries(o).slice(0, 16).map(([k, v]) => `${k}: ${k==='usage'?JSON.stringify(v):shape(v, d + 1)}`).join(', ') + '}'
  console.log(u?.type, shape(u))
}
