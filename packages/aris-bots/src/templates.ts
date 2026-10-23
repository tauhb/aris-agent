/** Đội mẫu đi kèm aris: `templates/*.json` của gói này (xem docs/specs/aris-bots.md). */
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Template } from './store.js'

const DIR = fileURLToPath(new URL('../templates/', import.meta.url))

export async function loadTemplates(dir = DIR): Promise<Template[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(dir + f, 'utf8')) as Template))
}
