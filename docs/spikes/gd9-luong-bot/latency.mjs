/* global process, console, performance */
// Mã đo của spike GĐ9.4 (docs/spikes/gd9-luong-bot.md): chỉ đọc số token, thời gian, chi phí.
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { statSync } from 'node:fs'
import { readLog } from './read.mjs'
const home = process.argv[2]
const files = execFileSync('find', [join(home, 'sessions'), '-name', 'session.v4.jsonl.zstd']).toString().trim().split('\n')
const B = [0, 40e3, 80e3, 120e3, 1e9]
const lat = B.slice(0, -1).map(() => [])
const sizes = []
for (const f of files) {
  const t0 = performance.now()
  const recs = readLog(f)
  const ms = performance.now() - t0
  sizes.push({ zst: statSync(f).size, recs: recs.length, ms })
  const start = new Map()
  for (const r of recs) {
    if (r.type === 'step/start') start.set(`${r.data?.turn}:${r.data?.step}`, r.time)
    if (r.type === 'assistant/message' && r.data?.usage) {
      const s = start.get(`${r.data.turn}:${r.data.step}`)
      if (!s) continue
      const u = r.data.usage, ctx = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens
      lat[B.findIndex((x, i) => ctx >= x && ctx < B[i + 1])].push(r.time - s)
    }
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const p90 = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length * 0.9)] : 0 }
lat.forEach((a, i) => console.log(`${B[i]/1000}-${B[i+1]>=1e9?'…':B[i+1]/1000}k: ${a.length} bước, trung vị ${(med(a)/1000).toFixed(1)}s, p90 ${(p90(a)/1000).toFixed(1)}s`))
sizes.sort((a, b) => b.recs - a.recs)
console.log('nhật ký lớn nhất (bản ghi, KB nén, ms giải nén+đọc):', sizes.slice(0, 5).map((s) => `${s.recs}/${Math.round(s.zst/1024)}/${Math.round(s.ms)}`).join(' · '))
console.log('trung vị số bản ghi mỗi phiên:', med(sizes.map((s) => s.recs)))
