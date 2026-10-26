/**
 * Phụ kiện của linh vật: 22 món vẽ bằng SVG trong hệ toạ độ 0..100, đặt theo số đo của từng dáng
 * (`accessories.generated.ts`). Phụ kiện là một phần của linh vật nên hiện ở mọi nơi có linh vật; mỗi bot lưu
 * mã phụ kiện của mình, không lưu thì dùng phụ kiện mặc định của dáng. Hàm vẽ chuyển từ
 * `docs/plans/phu-kien-linh-vat/acc.py`.
 */
import { ACC_DEFAULT, ACC_GEO, ACC_TINT } from './accessories.generated.js'

/** Số đo của một dáng trong hệ 0..100 (đo bằng ảnh raster, xem `scripts/gen-accessories.mjs`). */
export interface AccGeo {
  /** Khung hai mắt: trái, trên, phải, dưới. */
  readonly eb: readonly [number, number, number, number]
  /** Tâm hai mắt. */
  readonly ex: number
  readonly ey: number
  /** Cỡ hai mắt. */
  readonly eh: number
  readonly ew: number
  /** Mép trái và phải ngang tầm mắt. */
  readonly L: number
  readonly R: number
  /** Mép trái và phải thấp hơn tầm mắt 16 đơn vị. */
  readonly Lb: number
  readonly Rb: number
  /** Đáy thân. */
  readonly bot: number
  /** Chỗ đặt mũ (đã áp bảng chỗ đặt riêng của dáng đỉnh lõm hay nhọn). */
  readonly hx: number
  readonly hy: number
}

/** Mã lưu trong bản ghi bot khi bot không đeo gì (khác với không lưu: dùng mặc định của dáng). */
export const NO_ACCESSORY = 'none'

const INK = '#16171B'
/** Viền mảnh để phụ kiện màu tối không chìm vào nền tối; biến do `@aris/ui-theme` đặt theo giao diện. */
const EDGE = 'var(--acc-edge)'

/** Số một chữ số thập phân, bỏ số không thừa (`12.0` thành `12`). */
const f = (v: number) => v.toFixed(1).replace(/0+$/, '').replace(/\.$/, '')

/** Tâm hai mắt trái và phải. */
const eyes = (g: AccGeo): [[number, number], [number, number]] => {
  const w = g.eb[2] - g.eb[0]
  return [
    [g.eb[0] + w * 0.24, g.ey],
    [g.eb[2] - w * 0.24, g.ey],
  ]
}

// --- Phụ kiện -----------------------------------------------------------------------------------------------

function crown(g: AccGeo, c = '#FFAA00') {
  const x = g.hx
  const y = g.hy + 3
  return `<path d="M${f(x - 14)} ${f(y)}V${f(y - 13)}L${f(x - 7)} ${f(y - 6)}L${f(x)} ${f(y - 16)}L${f(x + 7)} ${f(y - 6)}L${f(x + 14)} ${f(y - 13)}V${f(y)}Z" fill="${c}" stroke-linejoin="round"/>`
}

function cap(g: AccGeo, c = '#1D4ED8') {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 16)} ${f(y)}C${f(x - 16)} ${f(y - 19)} ${f(x + 16)} ${f(y - 19)} ${f(x + 16)} ${f(y)}Z" fill="${c}"/>` +
    `<rect x="${f(x + 6)}" y="${f(y - 4)}" width="22" height="6" rx="3" fill="${c}"/>` +
    `<circle cx="${f(x)}" cy="${f(y - 14)}" r="2.6" fill="${c}"/>`
  )
}

function beret(g: AccGeo, c = '#7C3AED') {
  const x = g.hx
  const y = g.hy + 4
  return (
    `<ellipse cx="${f(x + 2)}" cy="${f(y - 4)}" rx="20" ry="8.5" transform="rotate(-10 ${f(x + 2)} ${f(y - 4)})" fill="${c}"/>` +
    `<path d="M${f(x + 2)} ${f(y - 12)}l2 -5" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/>`
  )
}

function hardhat(g: AccGeo, c = '#FACC15') {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 16)} ${f(y - 2)}C${f(x - 16)} ${f(y - 21)} ${f(x + 16)} ${f(y - 21)} ${f(x + 16)} ${f(y - 2)}Z" fill="${c}"/>` +
    `<rect x="${f(x - 22)}" y="${f(y - 4)}" width="44" height="6.5" rx="3.2" fill="#EAB308"/>` +
    `<path d="M${f(x)} ${f(y - 19)}V${f(y - 5)}" stroke="#EAB308" stroke-width="3"/>`
  )
}

function beanie(g: AccGeo, c = '#2563EB') {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 16)} ${f(y - 2)}C${f(x - 16)} ${f(y - 22)} ${f(x + 16)} ${f(y - 22)} ${f(x + 16)} ${f(y - 2)}Z" fill="${c}"/>` +
    `<rect x="${f(x - 17.5)}" y="${f(y - 6)}" width="35" height="8" rx="4" fill="${c}" style="filter:brightness(.82)"/>` +
    `<circle cx="${f(x)}" cy="${f(y - 21)}" r="5" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`
  )
}

function partyhat(g: AccGeo, c = '#8B5CF6') {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 11)} ${f(y)}L${f(x + 1)} ${f(y - 25)}L${f(x + 12)} ${f(y)}Z" fill="${c}"/>` +
    `<path d="M${f(x - 6)} ${f(y - 11)}L${f(x + 7)} ${f(y - 11)}M${f(x - 8.5)} ${f(y - 5)}L${f(x + 9.5)} ${f(y - 5)}" stroke="#FDE047" stroke-width="2.6" stroke-linecap="round"/>` +
    `<circle cx="${f(x + 1)}" cy="${f(y - 26)}" r="3.6" fill="#FDE047"/>`
  )
}

function chef(g: AccGeo) {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 12)} ${f(y)}V${f(y - 8)}C${f(x - 22)} ${f(y - 10)} ${f(x - 18)} ${f(y - 26)} ${f(x - 8)} ${f(y - 21)}C${f(x - 6)} ${f(y - 30)} ${f(x + 6)} ${f(y - 30)} ${f(x + 8)} ${f(y - 21)}C${f(x + 18)} ${f(y - 26)} ${f(x + 22)} ${f(y - 10)} ${f(x + 12)} ${f(y - 8)}V${f(y)}Z" fill="#fff" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M${f(x - 12)} ${f(y - 4)}H${f(x + 12)}" stroke="${INK}" stroke-width="1.6"/>`
  )
}

function gradcap(g: AccGeo) {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 11)} ${f(y)}V${f(y - 8)}H${f(x + 11)}V${f(y)}Z" fill="${INK}" stroke="${EDGE}" stroke-width="1.2"/>` +
    `<path d="M${f(x - 24)} ${f(y - 11)}L${f(x)} ${f(y - 19)}L${f(x + 24)} ${f(y - 11)}L${f(x)} ${f(y - 3)}Z" fill="${INK}" stroke="${EDGE}" stroke-width="1.2"/>` +
    `<path d="M${f(x)} ${f(y - 11)}L${f(x + 17)} ${f(y - 6)}V${f(y + 6)}" stroke="#FACC15" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    `<circle cx="${f(x + 17)}" cy="${f(y + 7)}" r="2.8" fill="#FACC15"/>`
  )
}

function nightcap(g: AccGeo, c = '#6366F1') {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 15)} ${f(y)}C${f(x - 14)} ${f(y - 18)} ${f(x + 6)} ${f(y - 26)} ${f(x + 26)} ${f(y - 14)}C${f(x + 14)} ${f(y - 14)} ${f(x + 12)} ${f(y - 6)} ${f(x + 15)} ${f(y)}Z" fill="${c}"/>` +
    `<rect x="${f(x - 17)}" y="${f(y - 5)}" width="34" height="7" rx="3.5" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="${f(x + 27)}" cy="${f(y - 13)}" r="4.5" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`
  )
}

function nursecap(g: AccGeo) {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 15)} ${f(y)}L${f(x - 12)} ${f(y - 14)}H${f(x + 12)}L${f(x + 15)} ${f(y)}Z" fill="#fff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>` +
    `<path d="M${f(x)} ${f(y - 11)}V${f(y - 3)}M${f(x - 4)} ${f(y - 7)}H${f(x + 4)}" stroke="#E11D48" stroke-width="3" stroke-linecap="round"/>`
  )
}

function sunhat(g: AccGeo) {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x - 13)} ${f(y - 2)}C${f(x - 13)} ${f(y - 19)} ${f(x + 13)} ${f(y - 19)} ${f(x + 13)} ${f(y - 2)}Z" fill="#F2C879"/>` +
    `<ellipse cx="${f(x)}" cy="${f(y - 2)}" rx="27" ry="5.5" fill="#E9B95E"/>` +
    `<rect x="${f(x - 13)}" y="${f(y - 8)}" width="26" height="4.5" fill="#E11D48"/>`
  )
}

function sprout(g: AccGeo) {
  const x = g.hx
  const y = g.hy + 3
  return (
    `<path d="M${f(x)} ${f(y)}V${f(y - 14)}" stroke="#15803D" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M${f(x)} ${f(y - 12)}C${f(x - 4)} ${f(y - 22)} ${f(x - 16)} ${f(y - 22)} ${f(x - 17)} ${f(y - 15)}C${f(x - 12)} ${f(y - 9)} ${f(x - 3)} ${f(y - 9)} ${f(x)} ${f(y - 12)}Z" fill="#22C55E"/>` +
    `<path d="M${f(x)} ${f(y - 12)}C${f(x + 4)} ${f(y - 24)} ${f(x + 15)} ${f(y - 25)} ${f(x + 17)} ${f(y - 18)}C${f(x + 13)} ${f(y - 11)} ${f(x + 4)} ${f(y - 10)} ${f(x)} ${f(y - 12)}Z" fill="#4ADE80"/>`
  )
}

function hairbow(g: AccGeo, c = '#F43F5E') {
  const x = g.hx + 9
  const y = g.hy + 4
  return (
    `<path d="M${f(x)} ${f(y - 6)}L${f(x - 13)} ${f(y - 14)}L${f(x - 13)} ${f(y + 2)}Z M${f(x)} ${f(y - 6)}L${f(x + 13)} ${f(y - 14)}L${f(x + 13)} ${f(y + 2)}Z" fill="${c}" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<circle cx="${f(x)}" cy="${f(y - 6)}" r="4" fill="${c}" style="filter:brightness(.85)"/>`
  )
}

function headset(g: AccGeo, mic = false) {
  const { ey, L, R } = g
  const top = g.hy
  let s =
    `<path d="M${f(L + 3)} ${f(ey)}C${f(L + 3)} ${f(top - 14)} ${f(R - 3)} ${f(top - 14)} ${f(R - 3)} ${f(ey)}" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" style="paint-order:stroke"/>` +
    `<rect x="${f(L - 3)}" y="${f(ey - 9)}" width="10" height="18" rx="4.5" fill="${INK}" stroke="${EDGE}" stroke-width="1.2"/>` +
    `<rect x="${f(R - 7)}" y="${f(ey - 9)}" width="10" height="18" rx="4.5" fill="${INK}" stroke="${EDGE}" stroke-width="1.2"/>`
  if (mic)
    s +=
      `<path d="M${f(L + 3)} ${f(ey + 7)}C${f(L + 6)} ${f(ey + 18)} ${f(g.ex - 16)} ${f(ey + 20)} ${f(g.ex - 9)} ${f(ey + 17)}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="${f(g.ex - 8)}" cy="${f(ey + 17)}" r="3.4" fill="${INK}"/>`
  return s
}

function glasses(g: AccGeo) {
  const [[lx, ly], [rx, ry]] = eyes(g)
  const r = Math.max(9.5, Math.min(11, g.eh * 0.52))
  return (
    `<g fill="none" stroke="${INK}" stroke-width="3.2"><circle cx="${f(lx)}" cy="${f(ly)}" r="${f(r)}"/><circle cx="${f(rx)}" cy="${f(ry)}" r="${f(r)}"/>` +
    `<path d="M${f(lx + r)} ${f(ly - 1)}Q${f((lx + rx) / 2)} ${f(ly - 5)} ${f(rx - r)} ${f(ry - 1)}"/></g>`
  )
}

function halfglasses(g: AccGeo) {
  const [[lx, ly], [rx]] = eyes(g)
  const r = 8
  const y = ly + 3
  const c = '#B45309'
  return (
    `<g fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"><path d="M${f(lx - r)} ${f(y)}H${f(lx + r)}A${r} ${r} 0 0 1 ${f(lx - r)} ${f(y)}Z"/>` +
    `<path d="M${f(rx - r)} ${f(y)}H${f(rx + r)}A${r} ${r} 0 0 1 ${f(rx - r)} ${f(y)}Z"/><path d="M${f(lx + r)} ${f(y)}H${f(rx - r)}"/></g>`
  )
}

function necktie(g: AccGeo, c = '#1E3A8A') {
  const x = g.ex
  const y = g.eb[3] + 3
  const end = Math.min(g.bot - 3, y + 32)
  return (
    `<path d="M${f(x - 6)} ${f(y)}H${f(x + 6)}L${f(x + 4)} ${f(y + 7)}H${f(x - 4)}Z" fill="${c}"/>` +
    `<path d="M${f(x - 4)} ${f(y + 7)}H${f(x + 4)}L${f(x + 8.5)} ${f(end - 8)}L${f(x)} ${f(end)}L${f(x - 8.5)} ${f(end - 8)}Z" fill="${c}"/>` +
    `<path d="M${f(x - 4)} ${f(y + 14)}L${f(x + 5)} ${f(y + 10)}M${f(x - 5.5)} ${f(y + 22)}L${f(x + 6)} ${f(y + 17)}" stroke="#FDE047" stroke-width="2.2"/>`
  )
}

function bowtie(g: AccGeo, c = '#E11D48') {
  const x = g.ex
  const y = Math.min(g.eb[3] + 9, g.bot - 10)
  return (
    `<path d="M${f(x)} ${f(y)}L${f(x - 12)} ${f(y - 7)}V${f(y + 7)}Z M${f(x)} ${f(y)}L${f(x + 12)} ${f(y - 7)}V${f(y + 7)}Z" fill="${c}" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<rect x="${f(x - 3.5)}" y="${f(y - 4)}" width="7" height="8" rx="2.5" fill="${c}" style="filter:brightness(.8)"/>`
  )
}

function calculator(g: AccGeo) {
  const x = Math.min(g.Rb - 8, 80)
  const y = Math.min(g.ey + 12, g.bot - 24)
  let keys = ''
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      keys += `<rect x="${f(x + 3.5 + i * 5)}" y="${f(y + 12 + j * 5)}" width="3.4" height="3.4" rx="1" fill="#C9CED6"/>`
  return (
    `<g transform="rotate(8 ${f(x + 9)} ${f(y + 14)})"><rect x="${f(x)}" y="${f(y)}" width="19" height="28" rx="3.5" fill="#2A2D35" stroke="${EDGE}" stroke-width="1.2"/>` +
    `<rect x="${f(x + 3)}" y="${f(y + 3)}" width="13" height="6.5" rx="1.5" fill="#9BE3B5"/>${keys}</g>`
  )
}

function pencil(g: AccGeo) {
  const x = Math.min(g.R - 4, g.eb[2] + 14)
  const y = g.eb[1] - 4
  return (
    `<g transform="rotate(-38 ${f(x)} ${f(y)})"><rect x="${f(x - 3.5)}" y="${f(y - 14)}" width="7" height="26" fill="#FACC15"/>` +
    `<rect x="${f(x - 3.5)}" y="${f(y - 19)}" width="7" height="5" rx="1.5" fill="#F472B6"/>` +
    `<path d="M${f(x - 3.5)} ${f(y + 12)}L${f(x)} ${f(y + 19)}L${f(x + 3.5)} ${f(y + 12)}Z" fill="#F2D3A8"/><path d="M${f(x - 1.2)} ${f(y + 16.5)}L${f(x)} ${f(y + 19)}L${f(x + 1.2)} ${f(y + 16.5)}Z" fill="${INK}"/></g>`
  )
}

function badge(g: AccGeo) {
  const x = Math.max(g.Lb + 11, g.ex - g.ew * 0.55 - 6)
  const y = Math.min(g.ey + 18, g.bot - 14)
  return (
    `<path d="M${f(x)} ${f(y - 9)}L${f(x + 8)} ${f(y - 6)}V${f(y + 1)}C${f(x + 8)} ${f(y + 6)} ${f(x + 4)} ${f(y + 9)} ${f(x)} ${f(y + 11)}C${f(x - 4)} ${f(y + 9)} ${f(x - 8)} ${f(y + 6)} ${f(x - 8)} ${f(y + 1)}V${f(y - 6)}Z" fill="#FACC15" stroke="#B45309" stroke-width="1.6"/>` +
    `<path d="M${f(x)} ${f(y - 4)}l1.8 3.6 4 .5-2.9 2.7.8 4-3.7-2-3.7 2 .8-4-2.9-2.7 4-.5Z" fill="#B45309"/>`
  )
}

/** Một phụ kiện: tên gốc tiếng Việt (giao diện dịch qua khoá `acc.<mã>` trong text của trang) và hàm vẽ. */
interface Accessory {
  id: string
  name: string
  draw: (g: AccGeo, tint?: string) => string
}

const LIST: readonly Accessory[] = [
  { id: 'vuong-mien', name: 'Vương miện', draw: crown },
  { id: 'kinh', name: 'Kính tròn', draw: glasses },
  { id: 'kinh-doc', name: 'Kính đọc sách', draw: halfglasses },
  { id: 'tai-nghe', name: 'Tai nghe', draw: (g) => headset(g) },
  { id: 'tai-nghe-mic', name: 'Tai nghe có mic', draw: (g) => headset(g, true) },
  { id: 'mu-luoi-trai', name: 'Mũ lưỡi trai', draw: cap },
  { id: 'mu-noi', name: 'Mũ nồi', draw: beret },
  { id: 'mu-bao-ho', name: 'Mũ bảo hộ', draw: hardhat },
  { id: 'mu-len', name: 'Mũ len', draw: beanie },
  { id: 'mu-tiec', name: 'Mũ tiệc', draw: partyhat },
  { id: 'mu-dau-bep', name: 'Mũ đầu bếp', draw: chef },
  { id: 'mu-tot-nghiep', name: 'Mũ tốt nghiệp', draw: gradcap },
  { id: 'mu-ngu', name: 'Mũ ngủ', draw: nightcap },
  { id: 'mu-y-ta', name: 'Mũ y tá', draw: nursecap },
  { id: 'mu-rong-vanh', name: 'Mũ rộng vành', draw: sunhat },
  { id: 'mam-cay', name: 'Mầm cây', draw: sprout },
  { id: 'no-cai', name: 'Nơ cài tóc', draw: hairbow },
  { id: 'ca-vat', name: 'Cà vạt', draw: necktie },
  { id: 'no-co', name: 'Nơ cổ', draw: bowtie },
  { id: 'may-tinh', name: 'Máy tính bỏ túi', draw: calculator },
  { id: 'but-chi', name: 'Bút chì giắt tai', draw: pencil },
  { id: 'huy-hieu', name: 'Huy hiệu', draw: badge },
]

/** 22 phụ kiện theo thứ tự hiện trong ô chọn. */
// `@__PURE__` để gói chỉ cần THEMES hay MASCOTS (theme, bộ chọn…) không kéo theo cả 22 hàm vẽ phụ kiện.
export const ACCESSORIES: readonly { id: string; name: string }[] = /* @__PURE__ */ LIST.map(
  ({ id, name }) => ({ id, name }),
)

export const isAccessoryId = (id: string): boolean => LIST.some((a) => a.id === id)

/** Phụ kiện mặc định của dáng; dáng lạ thì không có. */
export function defaultAccessory(mascotId: string): string | undefined {
  return ACC_DEFAULT[mascotId]
}

/** Màu riêng của phụ kiện trên dáng này (tránh trùng màu thân), nếu có; không có thì dùng màu mặc định của phụ kiện. */
export function accessoryTint(mascotId: string, accId: string): string | undefined {
  return ACC_TINT[`${mascotId}:${accId}`]
}

/** SVG của một phụ kiện đặt lên dáng (rỗng khi dáng hay phụ kiện lạ). Màu theo bảng riêng của cặp dáng × phụ kiện. */
export function accessorySvg(mascotId: string, accId: string): string {
  const geo = ACC_GEO[mascotId]
  const acc = LIST.find((a) => a.id === accId)
  return geo && acc ? acc.draw(geo, accessoryTint(mascotId, accId)) : ''
}

/**
 * Phụ kiện bot đang đeo: chưa lưu gì (`undefined` hay rỗng) thì lấy mặc định của dáng, `'none'` là không đeo,
 * còn lại là chính mã đã lưu.
 */
export function resolveAccessory(mascotId: string, acc?: string): string | null {
  if (acc === undefined || acc === '') return defaultAccessory(mascotId) ?? null
  return acc === NO_ACCESSORY ? null : acc
}

/** SVG phụ kiện bot đang đeo, hoặc `null` khi không đeo (nơi vẽ dùng khung `0 0 100 100` như cũ). */
export function accessoryOf(mascotId: string, acc?: string): string | null {
  const id = resolveAccessory(mascotId, acc)
  return (id && accessorySvg(mascotId, id)) || null
}

/** Khung nhìn của linh vật: rộng hơn một chút khi có phụ kiện để mũ không bị cắt. */
export const ACCESSORY_VIEWBOX = '-10 -16 120 120'
export const PLAIN_VIEWBOX = '0 0 100 100'
