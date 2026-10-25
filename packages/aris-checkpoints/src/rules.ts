/** Luật chụp điểm khôi phục (đặc tả: docs/specs/aris-checkpoints.md). Thuần. */
import { readOnlyBash } from '@aris/skills'
import { resolve, sep } from 'node:path'

/** Tệp lớn hơn chừng này không đưa vào điểm khôi phục. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Thư mục nhiều tệp hơn chừng này thì bỏ qua. */
export const MAX_FILES = 50_000
/** Giữ tối đa chừng này điểm mỗi thư mục và chừng này ngày. */
export const KEEP_PER_DIR = 20
export const KEEP_DAYS = 7
/** Phần khác biệt gửi giao diện tối đa. */
export const DIFF_MAX_BYTES = 200 * 1024

/** Thư mục nặng thường gặp, không chụp (thêm vào `.gitignore` của dự án). */
export const EXCLUDES = [
  'node_modules/',
  '.venv/',
  'venv/',
  '__pycache__/',
  'dist/',
  'build/',
  '.next/',
  '.nuxt/',
  'target/',
  '.cache/',
  '.turbo/',
  '.DS_Store',
]

/** Thư mục quá rộng để chụp: gốc, thư mục nhà, hoặc cha của thư mục nhà. */
export function tooBroad(dir: string, home: string): boolean {
  const d = resolve(dir)
  const h = resolve(home)
  return d === sep || d === h || h.startsWith(d.endsWith(sep) ? d : d + sep)
}

/** Công cụ sắp sửa tệp: `write`, `edit`, lệnh bash không chắc chỉ đọc. */
export function mutates(tool: string, args: unknown): boolean {
  if (tool === 'write' || tool === 'edit') return true
  if (tool !== 'bash') return false
  const command = (args as { command?: unknown } | undefined)?.command
  return typeof command === 'string' && !readOnlyBash(command)
}

/** Chi tiết ngắn của lần sửa cho danh sách điểm: lệnh hay tệp. */
export function detailOf(tool: string, args: unknown): string {
  const a = (args ?? {}) as { command?: unknown; path?: unknown; file_path?: unknown }
  const text =
    tool === 'bash' && typeof a.command === 'string'
      ? a.command
      : typeof a.path === 'string'
        ? a.path
        : typeof a.file_path === 'string'
          ? a.file_path
          : ''
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 120 ? `${one.slice(0, 119)}…` : one
}

export interface PointLike {
  id: string
  dir: string
  at: string
}

/** Điểm cần bỏ: quá `KEEP_DAYS` ngày, hoặc ngoài `KEEP_PER_DIR` điểm mới nhất của thư mục. */
export function toPrune<T extends PointLike>(points: readonly T[], now: Date): T[] {
  const cutoff = now.getTime() - KEEP_DAYS * 86_400_000
  const byDir = new Map<string, T[]>()
  for (const p of points) byDir.set(p.dir, [...(byDir.get(p.dir) ?? []), p])
  const out: T[] = []
  for (const list of byDir.values()) {
    const sorted = [...list].sort((a, b) => b.at.localeCompare(a.at))
    sorted.forEach((p, i) => {
      if (i >= KEEP_PER_DIR || Date.parse(p.at) < cutoff) out.push(p)
    })
  }
  return out
}

/** Phân tích `git diff --name-status` thành danh sách đổi. */
export function parseNameStatus(text: string): { status: string; path: string }[] {
  return text
    .split('\n')
    .map((l) => l.split('\t'))
    .filter((p) => p.length >= 2 && p[0])
    .map((p) => ({ status: p[0]![0]!, path: p.at(-1)! }))
}
