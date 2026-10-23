/** Từ điển các trang aris (namespace `aris.pages`), gộp từ từng khu; tiếng Trung lùi về tiếng Anh. */
import type { PageText } from './page.js'
import { MIND_TEXT } from './mind/text.js'
import { SETTINGS_TEXT } from './settings/text.js'

export const NS = 'aris.pages'

export const TEXTS: readonly PageText[] = [SETTINGS_TEXT, MIND_TEXT]

export const EN: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.en))
export const VI: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.vi))
