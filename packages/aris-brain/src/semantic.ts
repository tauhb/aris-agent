/**
 * Tìm theo nghĩa (giai đoạn 5, đợt 5a): cắt trang thành đoạn theo mục, kho vector SQLite cạnh chỉ mục từ khoá
 * (`~/.aris/brain/vectors.sqlite`), tìm bằng cosine trên mọi vector (bộ não vài nghìn đoạn thì đủ nhanh, không cần
 * thư viện), gộp với kết quả từ khoá theo thứ hạng (reciprocal rank fusion). Mỗi đoạn có mã băm chữ: trang sửa thì
 * chỉ đoạn đổi phải nhúng lại; đổi model thì mọi đoạn thành "chưa nhúng".
 */
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

export type ChunkKind = 'page' | 'memory'

export interface Chunk {
  ord: number
  text: string
  hash: string
}

/** Mục tiêu và trần độ dài một đoạn (ký tự). */
const TARGET = 1200
const MAX = 1800
const MIN = 200

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

/** Cắt thân trang theo tiêu đề mục; mục dài cắt theo đoạn văn, mục ngắn gộp với mục kế. */
export function chunksOf(body: string): Chunk[] {
  const sections: string[] = []
  let cur: string[] = []
  for (const line of body.split('\n')) {
    if (/^#{1,6}\s/.test(line) && cur.join('\n').trim()) {
      sections.push(cur.join('\n').trim())
      cur = []
    }
    cur.push(line)
  }
  if (cur.join('\n').trim()) sections.push(cur.join('\n').trim())

  const pieces: string[] = []
  for (const s of sections) {
    if (s.length <= MAX) {
      pieces.push(s)
      continue
    }
    let buf = ''
    for (const para of s.split(/\n{2,}/)) {
      if (buf && buf.length + para.length + 2 > TARGET) {
        pieces.push(buf)
        buf = ''
      }
      // Đoạn văn quá dài: cắt cứng.
      for (let i = 0; i < para.length; i += MAX) {
        const part = para.slice(i, i + MAX)
        if (buf && buf.length + part.length + 2 > MAX) {
          pieces.push(buf)
          buf = ''
        }
        buf = buf ? `${buf}\n\n${part}` : part
      }
    }
    if (buf) pieces.push(buf)
  }

  const merged: string[] = []
  for (const p of pieces) {
    const last = merged.at(-1)
    if (last !== undefined && (last.length < MIN || p.length < MIN) && last.length + p.length + 2 <= TARGET)
      merged[merged.length - 1] = `${last}\n\n${p}`
    else merged.push(p)
  }
  return merged
    .map((t) => t.trim())
    .filter((t) => t.replace(/[#\s*_>-]/g, '').length > 0)
    .map((text, ord) => ({ ord, text, hash: hashOf(text) }))
}

export interface VecHit {
  src: string
  kind: ChunkKind
  ord: number
  text: string
  score: number
}

interface Row {
  id: string
  src: string
  kind: string
  ord: number
  title: string
  text: string
  hash: string
  model: string | null
  vec: Uint8Array | null
}

const toVec = (b: Uint8Array) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
const toBlob = (v: Float32Array) => new Uint8Array(v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength))

export class VectorStore {
  private db: DatabaseSync
  /** Vector đã nạp vào bộ nhớ theo model (nạp lại khi có ghi). */
  private cache:
    | {
        model: string
        rows: { id: string; src: string; kind: ChunkKind; ord: number; text: string; v: Float32Array }[]
      }
    | undefined

  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY, src TEXT NOT NULL, kind TEXT NOT NULL, ord INTEGER NOT NULL, title TEXT NOT NULL,
        text TEXT NOT NULL, hash TEXT NOT NULL, model TEXT, vec BLOB
      );
      CREATE INDEX IF NOT EXISTS chunks_src ON chunks(src);
    `)
  }

  close(): void {
    this.db.close()
  }

  /** Đặt lại các đoạn của một nguồn: đoạn cùng mã băm giữ vector cũ, đoạn mới chờ nhúng, đoạn thừa bỏ đi. */
  sync(src: string, kind: ChunkKind, title: string, chunks: readonly Chunk[]): number {
    const old = new Map(
      (this.db.prepare('SELECT * FROM chunks WHERE src = ?').all(src) as unknown as Row[]).map((r) => [
        r.ord,
        r,
      ]),
    )
    let changed = 0
    const up = this.db.prepare(
      `INSERT INTO chunks (id, src, kind, ord, title, text, hash, model, vec) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, text = excluded.text, hash = excluded.hash,
         model = NULL, vec = NULL`,
    )
    for (const c of chunks) {
      const o = old.get(c.ord)
      if (o && o.hash === c.hash) {
        if (o.title !== title) this.db.prepare('UPDATE chunks SET title = ? WHERE id = ?').run(title, o.id)
        continue
      }
      up.run(`${src}#${c.ord}`, src, kind, c.ord, title, c.text, c.hash)
      changed++
    }
    const extra = this.db.prepare('DELETE FROM chunks WHERE src = ? AND ord >= ?').run(src, chunks.length)
    if (changed || Number(extra.changes)) this.cache = undefined
    return changed
  }

  remove(src: string): void {
    const r = this.db.prepare('DELETE FROM chunks WHERE src = ?').run(src)
    if (Number(r.changes)) this.cache = undefined
  }

  /** Bỏ mọi nguồn loại `kind` không còn trong danh sách. */
  keepOnly(kind: ChunkKind, srcs: ReadonlySet<string>): number {
    let n = 0
    for (const r of this.db.prepare('SELECT DISTINCT src FROM chunks WHERE kind = ?').all(kind) as {
      src: string
    }[])
      if (!srcs.has(r.src)) {
        this.remove(r.src)
        n++
      }
    return n
  }

  /** Đoạn chưa có vector của `model` (mới, đã sửa, hay nhúng bằng model khác). */
  pending(model: string, limit: number, allow: (src: string, kind: ChunkKind) => boolean = () => true) {
    const rows = this.db
      .prepare(
        'SELECT id, src, kind, title, text FROM chunks WHERE model IS NULL OR model != ? ORDER BY kind, src, ord',
      )
      .all(model) as unknown as Pick<Row, 'id' | 'src' | 'kind' | 'title' | 'text'>[]
    return rows.filter((r) => allow(r.src, r.kind as ChunkKind)).slice(0, limit)
  }

  setVectors(model: string, items: readonly { id: string; v: Float32Array }[]): void {
    const st = this.db.prepare('UPDATE chunks SET model = ?, vec = ? WHERE id = ?')
    for (const it of items) st.run(model, toBlob(it.v), it.id)
    if (items.length) this.cache = undefined
  }

  /** Đếm theo loại nguồn: tổng đoạn và đoạn đã nhúng bằng `model`. */
  counts(model: string, allow: (src: string, kind: ChunkKind) => boolean = () => true) {
    const rows = this.db.prepare('SELECT src, kind, model FROM chunks').all() as unknown as Pick<
      Row,
      'src' | 'kind' | 'model'
    >[]
    let total = 0
    let done = 0
    for (const r of rows) {
      if (!allow(r.src, r.kind as ChunkKind)) continue
      total++
      if (r.model === model) done++
    }
    return { total, done }
  }

  /** Bỏ mọi vector (nhúng lại từ đầu). */
  clearVectors(): void {
    this.db.exec('UPDATE chunks SET model = NULL, vec = NULL')
    this.cache = undefined
  }

  private loaded(model: string) {
    if (this.cache?.model !== model) {
      const rows = this.db
        .prepare('SELECT id, src, kind, ord, text, vec FROM chunks WHERE model = ? AND vec IS NOT NULL')
        .all(model) as unknown as Row[]
      this.cache = {
        model,
        rows: rows.map((r) => ({
          id: r.id,
          src: r.src,
          kind: r.kind as ChunkKind,
          ord: r.ord,
          text: r.text,
          v: toVec(r.vec!),
        })),
      }
    }
    return this.cache.rows
  }

  /** Các đoạn gần câu hỏi nhất (vector đã chuẩn hoá nên tích vô hướng là cosine). */
  search(
    model: string,
    q: Float32Array,
    allow: (src: string, kind: ChunkKind) => boolean,
    limit = 40,
  ): VecHit[] {
    const out: VecHit[] = []
    for (const r of this.loaded(model)) {
      if (r.v.length !== q.length || !allow(r.src, r.kind)) continue
      let s = 0
      for (let i = 0; i < q.length; i++) s += q[i]! * r.v[i]!
      out.push({ src: r.src, kind: r.kind, ord: r.ord, text: r.text, score: s })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}

/** Mỗi nguồn lấy đoạn khớp nhất; bỏ đoạn quá xa câu hỏi. */
export function bestBySource(hits: readonly VecHit[], floor = 0.45): VecHit[] {
  const best = new Map<string, VecHit>()
  for (const h of hits) {
    if (h.score < floor) continue
    const b = best.get(h.src)
    if (!b || h.score > b.score) best.set(h.src, h)
  }
  return [...best.values()].sort((a, b) => b.score - a.score)
}

export type Via = 'tu-khoa' | 'nghia' | 'ca-hai'

/** Gộp hai danh sách đã xếp hạng (reciprocal rank fusion, k = 60); ghi mỗi mục đến từ đâu. */
export function fuse(keyword: readonly string[], semantic: readonly string[], limit: number, k = 60) {
  const score = new Map<string, number>()
  const via = new Map<string, Via>()
  keyword.forEach((id, i) => {
    score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1))
    via.set(id, 'tu-khoa')
  })
  semantic.forEach((id, i) => {
    score.set(id, (score.get(id) ?? 0) + 1 / (k + i + 1))
    via.set(id, via.has(id) ? 'ca-hai' : 'nghia')
  })
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => ({ id, via: via.get(id)! }))
}

/** Đoạn trích ngắn từ đoạn khớp theo nghĩa. */
export function excerpt(text: string, n = 220): string {
  const flat = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > n ? `${flat.slice(0, n - 1).trimEnd()}…` : flat
}
