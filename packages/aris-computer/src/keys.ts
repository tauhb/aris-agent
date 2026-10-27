/**
 * Phân tích phím tắt bot gửi (`cmd+shift+s`, `⌘S`, `Ctrl-C`, `enter`) thành tên phím của lõi, và nhận ra tổ hợp nguy
 * hiểm (khoá máy, đăng xuất, tắt máy, buộc thoát). Thuần.
 */
import { ComputerError } from './types.js'

/** Phím bổ trợ theo tên lõi dùng. */
const MODS: Record<string, string> = {
  cmd: 'cmd',
  command: 'cmd',
  '⌘': 'cmd',
  meta: 'cmd',
  super: 'cmd',
  win: 'cmd',
  ctrl: 'ctrl',
  control: 'ctrl',
  '⌃': 'ctrl',
  ctl: 'ctrl',
  alt: 'option',
  opt: 'option',
  option: 'option',
  '⌥': 'option',
  shift: 'shift',
  '⇧': 'shift',
  fn: 'fn',
}

const KEYS: Record<string, string> = {
  enter: 'return',
  return: 'return',
  '↩': 'return',
  esc: 'escape',
  escape: 'escape',
  tab: 'tab',
  space: 'space',
  spacebar: 'space',
  backspace: 'delete',
  delete: 'delete',
  del: 'forwarddelete',
  forwarddelete: 'forwarddelete',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  '↑': 'up',
  '↓': 'down',
  '←': 'left',
  '→': 'right',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  pagedown: 'pagedown',
  power: 'power',
  eject: 'eject',
}

const MOD_ORDER = ['cmd', 'ctrl', 'option', 'shift', 'fn']

export interface Combo {
  mods: string[]
  key: string
}

/** Phím tắt dạng chữ → tổ hợp. Ném `ComputerError` khi không hiểu. */
export function parseCombo(raw: string): Combo {
  const s = raw.trim()
  if (!s) throw new ComputerError('Thiếu phím.', 'bad-input')
  // Ký hiệu macOS dính liền (`⌘⇧S`) tách thành từng phần.
  const spaced = s.replace(/([⌘⌃⌥⇧])/g, '$1+')
  const parts = spaced
    .split(/\s*[+-]\s*|\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  // `cmd+-` (thu nhỏ): dấu trừ là phím.
  if (/[+-]-$/.test(s) || s === '-') parts.push('-')
  const mods = new Set<string>()
  let key: string | undefined
  for (const p of parts) {
    const low = p.toLowerCase()
    if (MODS[low]) {
      mods.add(MODS[low])
      continue
    }
    if (key !== undefined) throw new ComputerError(`Phím "${raw}" có hơn một phím chính.`, 'bad-input')
    if (KEYS[low]) key = KEYS[low]
    else if (/^f([1-9]|1[0-9]|20)$/.test(low)) key = low
    else if ([...p].length === 1) key = low
    else throw new ComputerError(`Không hiểu phím "${p}" trong "${raw}".`, 'bad-input')
  }
  if (key === undefined)
    throw new ComputerError(`"${raw}" chỉ có phím bổ trợ, thiếu phím chính.`, 'bad-input')
  return { mods: MOD_ORDER.filter((m) => mods.has(m)), key }
}

/** Tổ hợp → danh sách phím cho lõi (`['cmd', 'shift', 's']`). */
export const comboKeys = (c: Combo): string[] => [...c.mods, c.key]

export const comboText = (c: Combo): string => comboKeys(c).join('+')

const has = (c: Combo, ...m: string[]) => m.every((x) => c.mods.includes(x)) && c.mods.length === m.length

/** Tổ hợp bị chặn cứng: khoá máy, đăng xuất, tắt máy, khởi động lại, ngủ, buộc thoát ứng dụng. */
export function dangerousCombo(c: Combo): string | undefined {
  if (c.key === 'power' || c.key === 'eject') return 'phím nguồn (khoá, ngủ, tắt máy)'
  if (c.key === 'q' && has(c, 'cmd', 'ctrl')) return 'khoá máy'
  if (c.key === 'q' && (has(c, 'cmd', 'shift') || has(c, 'cmd', 'option', 'shift'))) return 'đăng xuất'
  if (c.key === 'escape' && has(c, 'cmd', 'option')) return 'buộc thoát ứng dụng'
  return undefined
}
