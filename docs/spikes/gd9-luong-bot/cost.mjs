/* global process, console */
// Mã đo của spike GĐ9.4 (docs/spikes/gd9-luong-bot.md): chỉ đọc số token, thời gian, chi phí.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readLog } from './read.mjs'
const home = process.argv[2]
// 1) Suy giá từ bảng calls (bình phương tối thiểu 3 biến, mỗi model).
const calls = readdirSync(join(home, 'storages/aris_stats/calls')).map((f) => JSON.parse(readFileSync(join(home, 'storages/aris_stats/calls', f), 'utf8')).record)
const fit = (rows) => {
  const X = rows.map((c) => [c.input, c.cacheRead, c.output]), y = rows.map((c) => c.usd)
  const A = [[0,0,0],[0,0,0],[0,0,0]], b = [0,0,0]
  X.forEach((x, k) => { for (let i = 0; i < 3; i++) { b[i] += x[i] * y[k]; for (let j = 0; j < 3; j++) A[i][j] += x[i] * x[j] } })
  // giải 3x3
  const M = A.map((r, i) => [...r, b[i]])
  for (let i = 0; i < 3; i++) { let p = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c] } }
  return M.map((r, i) => (r[3] / r[i]) * 1e6)
}
const flash = calls.filter((c) => c.model === 'deepseek-flash')
const [pIn, pCache, pOut] = fit(flash)
console.log('giá suy ra deepseek-flash (USD / 1 triệu token): input', pIn.toFixed(3), 'cacheRead', pCache.toFixed(4), 'output', pOut.toFixed(3))
// 2) Mọi bước trong nhật ký phiên.
const files = execFileSync('find', [join(home, 'sessions'), '-name', 'session.v4.jsonl.zstd']).toString().trim().split('\n')
const B = [0, 20e3, 40e3, 60e3, 80e3, 100e3, 120e3, 150e3, 200e3, 1e9]
const agg = B.slice(0, -1).map(() => ({ n: 0, ctx: 0, hit: 0, inp: 0, out: 0 }))
const models = {}
let steps = 0, maxCtx = 0
for (const f of files) {
  for (const r of readLog(f)) {
    if (r.type !== 'assistant/message' || !r.data?.usage) continue
    const u = r.data.usage, m = r.data.message?.source?.model ?? '?'
    models[m] = (models[m] ?? 0) + 1
    const ctx = u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens
    maxCtx = Math.max(maxCtx, ctx); steps++
    const a = agg[B.findIndex((x, i) => ctx >= x && ctx < B[i + 1])]
    a.n++; a.ctx += ctx; a.hit += u.cacheReadTokens; a.inp += u.inputTokens; a.out += u.outputTokens
  }
}
console.log('phiên', files.length, 'bước', steps, 'ngữ cảnh lớn nhất', Math.round(maxCtx / 1000) + 'k', 'model', models)
console.log('khoảng ngữ cảnh | số bước | TB ngữ cảnh | cache% | TB output | USD/bước (giá flash) | USD/bước nếu cache trượt')
agg.forEach((a, i) => { if (!a.n) return
  const usd = (a.inp * pIn + a.hit * pCache + a.out * pOut) / 1e6 / a.n
  const miss = ((a.inp + a.hit) * pIn + a.out * pOut) / 1e6 / a.n
  console.log(`${B[i]/1000}-${B[i+1] >= 1e9 ? '…' : B[i+1]/1000}k | ${a.n} | ${Math.round(a.ctx/a.n/1000)}k | ${Math.round(a.hit/a.ctx*100)}% | ${Math.round(a.out/a.n)} | ${usd.toFixed(4)} | ${miss.toFixed(4)}`) })
