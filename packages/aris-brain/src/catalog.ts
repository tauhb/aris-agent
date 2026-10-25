/**
 * Chỉ mục của bộ não (SQLite có sẵn trong Node, để ngoài kho ở `~/.aris/brain/`): mỗi tệp một dòng, liên
 * kết `[[...]]` để tính liên kết ngược, bảng tìm toàn văn trên chữ đã bỏ dấu. Mất thì dựng lại từ tệp.
 */
import { DatabaseSync } from 'node:sqlite'
import { ftsQuery, listOf, parsePage, searchText, snippetOf } from './page.js'
import { pageName, placeOf, type Layer, type Space } from './vault.js'

export interface Entry {
  /** Đường dẫn tương đối trong kho, dấu `/`. */
  path: string
  name: string
  space?: Space | undefined
  layer: Layer
  dept?: string | undefined
  group?: string | undefined
  /** Nhãn `loai`. */
  kind?: string | undefined
  title: string
  tags: string[]
  /** Nhãn `trang-thai`. */
  status?: string | undefined
  /** Phòng ban ghi ở nhãn `phong-ban` (nguồn và trang Chung dính nhiều phòng). */
  depts: string[]
  /** Tệp không phải Markdown (PDF, ảnh, âm thanh…): không có chữ. */
  binary: boolean
  size: number
  mtime: number
}

export interface Hit {
  entry: Entry
  snippet: string
}

interface Row {
  path: string
  name: string
  space: string | null
  layer: string
  dept: string | null
  grp: string | null
  kind: string | null
  title: string
  tags: string
  status: string | null
  depts: string
  binary: number
  size: number
  mtime: number
  body?: string
}

const toEntry = (r: Row): Entry => ({
  path: r.path,
  name: r.name,
  space: (r.space ?? undefined) as Space | undefined,
  layer: r.layer as Layer,
  dept: r.dept ?? undefined,
  group: r.grp ?? undefined,
  kind: r.kind ?? undefined,
  title: r.title,
  tags: JSON.parse(r.tags) as string[],
  status: r.status ?? undefined,
  depts: JSON.parse(r.depts) as string[],
  binary: r.binary === 1,
  size: r.size,
  mtime: r.mtime,
})

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Dòng chỉ mục của một tệp (thuần, để thử). */
export function entryOf(path: string, text: string | undefined, stat: { size: number; mtime: number }) {
  const place = placeOf(path)
  const name = pageName(path)
  const binary = text === undefined
  const p = binary ? undefined : parsePage(text, name)
  const entry: Entry = {
    path,
    name,
    space: place.space,
    layer: place.layer,
    dept: place.dept,
    group: place.group,
    kind: str(p?.meta.loai),
    title: p?.title ?? path.split('/').pop() ?? path,
    tags: listOf(p?.meta.the),
    status: str(p?.meta['trang-thai']),
    depts: listOf(p?.meta['phong-ban']),
    binary,
    size: stat.size,
    mtime: stat.mtime,
  }
  return { entry, body: p?.body ?? '', links: p?.links ?? [] }
}

export class Catalog {
  private db: DatabaseSync

  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file)
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS pages (
        path TEXT PRIMARY KEY, name TEXT NOT NULL, space TEXT, layer TEXT NOT NULL, dept TEXT, grp TEXT,
        kind TEXT, title TEXT NOT NULL, tags TEXT NOT NULL, status TEXT, depts TEXT NOT NULL,
        binary INTEGER NOT NULL, size INTEGER NOT NULL, mtime REAL NOT NULL, body TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS pages_name ON pages(name);
      CREATE TABLE IF NOT EXISTS links (src TEXT NOT NULL, dst TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS links_dst ON links(dst);
      CREATE INDEX IF NOT EXISTS links_src ON links(src);
      CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
        path UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2'
      );
    `)
  }

  close(): void {
    this.db.close()
  }

  /** Ghi (hay ghi lại) một tệp. `text` không có là tệp nhị phân. */
  put(path: string, text: string | undefined, stat: { size: number; mtime: number }): Entry {
    const { entry: e, body, links } = entryOf(path, text, stat)
    this.remove(path)
    this.db
      .prepare(
        `INSERT INTO pages (path, name, space, layer, dept, grp, kind, title, tags, status, depts, binary, size, mtime, body)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        e.path,
        e.name,
        e.space ?? null,
        e.layer,
        e.dept ?? null,
        e.group ?? null,
        e.kind ?? null,
        e.title,
        JSON.stringify(e.tags),
        e.status ?? null,
        JSON.stringify(e.depts),
        e.binary ? 1 : 0,
        e.size,
        e.mtime,
        body,
      )
    const link = this.db.prepare('INSERT INTO links (src, dst) VALUES (?, ?)')
    for (const dst of links) link.run(path, dst)
    if (!e.binary)
      this.db
        .prepare('INSERT INTO fts (path, title, body) VALUES (?, ?, ?)')
        .run(path, searchText(`${e.title} ${e.name} ${e.tags.join(' ')}`), searchText(body))
    return e
  }

  remove(path: string): void {
    this.db.prepare('DELETE FROM pages WHERE path = ?').run(path)
    this.db.prepare('DELETE FROM links WHERE src = ?').run(path)
    this.db.prepare('DELETE FROM fts WHERE path = ?').run(path)
  }

  /** Bỏ mọi dòng không còn trong danh sách (sau khi quét lại kho). */
  keepOnly(paths: ReadonlySet<string>): number {
    let n = 0
    for (const e of this.all())
      if (!paths.has(e.path)) {
        this.remove(e.path)
        n++
      }
    return n
  }

  get(path: string): (Entry & { body: string }) | undefined {
    const r = this.db.prepare('SELECT * FROM pages WHERE path = ?').get(path) as Row | undefined
    return r ? { ...toEntry(r), body: r.body ?? '' } : undefined
  }

  all(): Entry[] {
    return (this.db.prepare('SELECT * FROM pages ORDER BY path').all() as unknown as Row[]).map(toEntry)
  }

  /** Trang theo tên trong một không gian (tên tệp không trùng trong không gian). */
  byName(space: Space | undefined, name: string): Entry | undefined {
    const rows = this.db.prepare('SELECT * FROM pages WHERE name = ?').all(name) as unknown as Row[]
    const list = rows.map(toEntry).filter((e) => /\.md$/i.test(e.path))
    return list.find((e) => e.space === space) ?? list[0]
  }

  /** Các trang trỏ tới `name`. */
  backlinks(name: string): Entry[] {
    const rows = this.db
      .prepare('SELECT p.* FROM links l JOIN pages p ON p.path = l.src WHERE l.dst = ? GROUP BY p.path')
      .all(name) as unknown as Row[]
    return rows.map(toEntry)
  }

  /** Tìm từ khoá; `allow` lọc theo quyền đọc. Tiêu đề nặng gấp 5 lần thân trang. */
  /**
   * Tìm theo từ khoá chính: trang có đủ mọi từ; không trang nào có đủ thì tìm nới (trang khớp một phần, xếp
   * theo mức khớp), để câu hỏi tự nhiên vẫn ra kết quả.
   */
  search(query: string, allow: (e: Entry) => boolean, limit = 8): Hit[] {
    const out: Hit[] = []
    const seen = new Set<string>()
    for (const mode of ['all', 'any'] as const) {
      const q = ftsQuery(query, mode)
      if (!q || out.length) break
      let rows: Row[]
      try {
        rows = this.db
          .prepare(
            `SELECT p.* FROM fts JOIN pages p ON p.path = fts.path
             WHERE fts MATCH ? ORDER BY bm25(fts, 0, 5.0, 1.0) LIMIT 200`,
          )
          .all(q) as unknown as Row[]
      } catch {
        continue
      }
      for (const r of rows) {
        if (seen.has(r.path)) continue
        const e = toEntry(r)
        if (!allow(e)) continue
        seen.add(r.path)
        out.push({ entry: e, snippet: snippetOf(r.body ?? '', query) })
        if (out.length >= limit) break
      }
    }
    return out
  }
}
