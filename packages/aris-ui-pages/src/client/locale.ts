/** Từ điển các trang aris (namespace `aris.pages`), gộp từ từng khu; tiếng Trung lùi về tiếng Anh. */
import type { PageText } from './page.js'
import { MIND_TEXT } from './mind/text.js'
import { SETTINGS_TEXT } from './settings/text.js'
import { TEAM_TEXT } from './team/text.js'
import { text } from './page.js'

export const NS = 'aris.pages'

export const TEXTS: readonly PageText[] = [
  SETTINGS_TEXT,
  MIND_TEXT,
  TEAM_TEXT,
  // Nhãn mục thanh bên của các trang có mục riêng.
  text(
    { 'nav.map': 'Team map', 'nav.brain': 'Second Brain', 'nav.routine': 'Routines', 'nav.kanban': 'Kanban' },
    {
      'nav.map': 'Bản đồ đội',
      'nav.brain': 'Second Brain',
      'nav.routine': 'Routine',
      'nav.kanban': 'Kanban',
    },
  ),
]

export const EN: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.en))
export const VI: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.vi))
