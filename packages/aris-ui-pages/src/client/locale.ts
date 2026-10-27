/** Từ điển các trang aris (namespace `aris.pages`), gộp từ từng khu; tiếng Trung lùi về tiếng Anh. */
import type { PageText } from './page.js'
import { AUTO_TEXT } from './auto/text.js'
import { BRAIN_TEXT } from './brain/text.js'
import { COMPUTER_TEXT } from './computer/text.js'
import { MIND_TEXT } from './mind/text.js'
import { OFFICE_TEXT } from './office/text.js'
import { SETTINGS_TEXT } from './settings/text.js'
import { TEAM_TEXT } from './team/text.js'
import { text } from './page.js'

export const NS = 'aris.pages'

export const TEXTS: readonly PageText[] = [
  SETTINGS_TEXT,
  MIND_TEXT,
  TEAM_TEXT,
  AUTO_TEXT,
  BRAIN_TEXT,
  OFFICE_TEXT,
  COMPUTER_TEXT,
  // Nhãn mục thanh bên của các trang có mục riêng.
  text(
    {
      'nav.office': 'Office',
      'nav.brain': 'Brain',
      'nav.routine': 'Routines',
      'nav.learn': 'Learning',
    },
    {
      'nav.office': 'Văn phòng',
      'nav.brain': 'Brain',
      'nav.routine': 'Routine',
      'nav.learn': 'Tự học',
    },
  ),
]

export const EN: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.en))
export const VI: Record<string, string> = Object.assign({}, ...TEXTS.map((x) => x.vi))
