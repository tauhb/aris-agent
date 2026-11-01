# GĐ9.1 · Khung giao diện mới kiểu OpenMausBot

> **Cho người làm (Sonnet):** làm trực tiếp trong phiên chính, không dùng subagent (luật ở [gd9-chung.md](gd9-chung.md)). Làm lần lượt từng việc, đánh dấu `- [x]` khi xong. Gặp **Điểm dừng** thì dừng và hỏi người dùng.

**Mục tiêu:** người dùng mở aris là thấy giao diện mới theo bản vẽ đã duyệt:
- thanh bên là danh bạ bot nhóm theo phòng;
- bấm bot là vào chat của bot;
- đầu chat có viên tên bot, bấm vào mở hồ sơ ở khung phải;
- có chuông Hoạt động, menu ảnh đại diện, nút Kết nối ứng dụng.

Tất cả chạy **trên dữ liệu hiện có**, chưa đổi máy chủ.

**Kiến trúc:**
- Không viết lại khung của dsh. Thay phần trình bày trong các slot aris đang chiếm: `sidebar`, `conversation.header.leading` / `.actions` / `.utilities`, tab khung phải `sidebar.right.*`, `shell.overlay`.
- Mọi thứ mới nằm sau công tắc **Giao diện mới (GĐ9)**. Tắt công tắc thì aris hiện y như trước.
- "Luồng" của bot tạm thời là phiên mở gần nhất của bot đó: `openBotSession(id)` với Aris là `latestCommanderSession`. Luồng thật làm ở 9.6.

**Công nghệ:** React trong các gói `@aris/ui-*`, chạy trong web của dsh `0.2.1-rc.2`, build bằng `scripts/build-client.mjs`. Test bằng vitest, môi trường node: không có jsdom, kiểm thành phần bằng `renderToStaticMarkup`.

**Đặc tả và bản vẽ:**
- Canvas https://claude.ai/artifact/3FvLeEg2hVpfGEoFpX4PwP, bản sao ở `design/gd9/`. Màn liên quan: V1, V5, V8, V9, V10, V11, V12, V14.
- Màu, cỡ chữ và kiểu dáng lấy từ `design/gd9/gd9.css`.

## Ràng buộc chung

- Chữ: Inter (xem Điểm dừng 1); cỡ chữ chat 14,5 px; dòng phụ 13 px; tiêu đề nhóm 12,5 px, chữ thường.
- Bảng màu tối: `--win #000`, `--pane #0e0e0e`, `--card #191919`, `--pill #232323`, `--bub #1c1c1c`, `--ubub #343434`, `--line #262626`, `--ink #f2f2f2`, `--ink2 #a3a3a3`, `--ink3 #7a7a7a`, `--acc #3b8bff`, `--warn #ff9f1a`, `--err #ff5c6c`.
- Bảng màu sáng: `--win #f1f1f1`, `--pane #fff`, `--card #f5f5f5`, `--pill #ededed`, `--bub #f2f2f2`, `--ubub #e3e3e3`, `--line #e6e6e6`, `--ink #111`, `--ink2 #5e5e5e`, `--ink3 #7d7d7d`, `--acc #0b62c4`, `--warn #9a5b00`, `--err #c02b3a`.
- Thanh bên rộng 280 px. Mỗi dòng bot cao tối thiểu 60 px, linh vật 40 px.
- Khung chat có `max-width: 660px`. Khung phải rộng 340 px.
- Nút dạng viên bo tròn 999 px, chữ `white-space: nowrap`. Nút chính có nền `--ink`, chữ `--inv`.
- Linh vật luôn giữ màu riêng: `getMascot(id)?.color`.
- Chấm trạng thái: đang làm = `--acc`, cần {you} = `--warn`, lỗi = `--err`. Dòng việc gần nhất có cùng màu với chấm.
- Không viết cứng "anh"/"chị": dùng `{you}`. Đủ tiếng Anh và tiếng Việt cho mọi chữ mới.
- Mọi markup nằm dưới gốc `.aris`. Biến CSS mới đặt tên `--g9-*` để không đụng `--a-*` cũ.

## Điểm dừng 1 (trước khi viết mã)

Hỏi người dùng hai việc:

1. **Phông Inter.** Hai cách:
   - (a) thêm gói `@fontsource-variable/inter` (phiên bản ghim chính xác, giấy phép OFL-1.1), app tự chứa phông, chạy không cần mạng;
   - (b) nạp từ Google Fonts, cần mạng, lộ địa chỉ IP người dùng cho Google.

   Đề xuất (a). Theo luật chung, cài gói mới phải được người dùng đồng ý.
2. **Dự án** (workspaces) đang ở thanh bên cũ, bản vẽ chưa có chỗ. Đề xuất đưa vào menu ảnh đại diện, dòng "Dự án", mở trang dự án như cũ.

## Bản đồ tệp

| Tệp | Việc |
|---|---|
| `packages/aris-ui-kit/src/react/ui-v2.ts` (mới) | Đọc và ghi công tắc Giao diện mới, hook `useUiV2()` |
| `packages/aris-ui-kit/src/tokens.ts` | Thêm `G9_THEMES`, `G9_FONTS` |
| `packages/aris-ui-kit/src/react/roster-v2.ts` (mới) + test | Mô hình danh bạ: nhóm, chấm, dòng việc |
| `packages/aris-ui-kit/src/react/activity-v2.ts` (mới) + test | Mô hình bảng Hoạt động |
| `packages/aris-ui-kit/src/react/index.ts` | Xuất các mô-đun mới |
| `packages/aris-ui-theme/src/client/tokens.ts`, `index.tsx`, `overrides.ts` | Áp màu, phông và kiểu thẻ duyệt và câu hỏi khi bật v2 |
| `packages/aris-ui-sidebar/src/client/SidebarV2.tsx` (mới), `stylesV2.ts` (mới), `index.tsx`, `locale.ts` | Thanh bên mới |
| `packages/aris-ui-chat-header/src/client/HeaderV2.tsx` (mới), `index.tsx`, `locale.ts` | Viên tên bot, viên model, nút máy |
| `packages/aris-ui-team-pane/src/client/ProfileV2.tsx` (mới), `index.tsx`, `locale.ts` | Khung phải: hồ sơ, cài đặt bot, máy |
| `packages/aris-ui-pages/src/client/activity/Activity.tsx` (mới), `index.tsx`, `text.ts` | Bảng Hoạt động (chuông), mở trên `shell.overlay` |
| `packages/aris-ui-pages/src/client/settings/SettingsPage.tsx` + `settings/Appearance.tsx` (mới) | Mục "Giao diện" có công tắc |
| `packages/aris-ui-pages/src/client/team/Search.tsx` | Kiểu khung tìm nổi của V14 khi bật v2 |
| `docs/specs/aris-ui.md` (mới) | Đặc tả giao diện v2 |

---

### Việc 1: Công tắc Giao diện mới

**Tệp:**
- Tạo `packages/aris-ui-kit/src/react/ui-v2.ts`, `packages/aris-ui-kit/src/react/ui-v2.test.ts`
- Sửa `packages/aris-ui-kit/src/react/index.ts`
- Tạo `packages/aris-ui-pages/src/client/settings/Appearance.tsx`
- Sửa `packages/aris-ui-pages/src/client/settings/SettingsPage.tsx` (thêm mục `appearance` vào danh sách mục, cạnh mục `provider`), `settings/text.ts`

**Giao diện:**
- Tạo ra: `isUiV2(storage?: Pick<Storage,'getItem'>): boolean`, `setUiV2(on: boolean, storage?): void`, `useUiV2(): boolean`, sự kiện `aris:ui-v2` trên `window` khi đổi.

- [ ] **Bước 1: Viết test hỏng**

```ts
// packages/aris-ui-kit/src/react/ui-v2.test.ts
import { describe, expect, it } from 'vitest'
import { UI_V2_KEY, isUiV2, setUiV2 } from './ui-v2.js'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('công tắc giao diện mới', () => {
  it('mặc định tắt khi chưa đặt', () => {
    expect(isUiV2(mem())).toBe(false)
  })
  it('bật rồi đọc lại', () => {
    const s = mem()
    setUiV2(true, s)
    expect(s.getItem(UI_V2_KEY)).toBe('1')
    expect(isUiV2(s)).toBe(true)
  })
  it('kho lỗi thì coi như tắt', () => {
    expect(isUiV2({ getItem: () => { throw new Error('x') } })).toBe(false)
  })
})
```

- [ ] **Bước 2: Chạy test, thấy hỏng**

Chạy: `npx vitest run packages/aris-ui-kit/src/react/ui-v2.test.ts`
Mong đợi: FAIL, không tìm thấy `./ui-v2.js`.

- [ ] **Bước 3: Viết mã**

```ts
// packages/aris-ui-kit/src/react/ui-v2.ts
import { useEffect, useState } from 'react'

/** Khoá lưu công tắc "Giao diện mới (GĐ9)" trên trình duyệt. */
export const UI_V2_KEY = 'aris.ui.v2'
const EVENT = 'aris:ui-v2'

type Get = Pick<Storage, 'getItem'>
type Set = Pick<Storage, 'setItem'>

const local = (): (Get & Set) | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage)

/** Giao diện mới có đang bật không; kho hỏng hay chưa đặt thì coi như tắt. */
export function isUiV2(storage: Get | undefined = local()): boolean {
  try {
    return storage?.getItem(UI_V2_KEY) === '1'
  } catch {
    return false
  }
}

/** Bật hay tắt giao diện mới, báo cho mọi gói đang vẽ. */
export function setUiV2(on: boolean, storage: Set | undefined = local()): void {
  try {
    storage?.setItem(UI_V2_KEY, on ? '1' : '0')
  } catch {
    return
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** Hook: vẽ lại khi người dùng đổi công tắc. */
export function useUiV2(): boolean {
  const [on, setOn] = useState(isUiV2)
  useEffect(() => {
    const f = () => setOn(isUiV2())
    window.addEventListener(EVENT, f)
    return () => window.removeEventListener(EVENT, f)
  }, [])
  return on
}
```

Thêm vào `packages/aris-ui-kit/src/react/index.ts`: `export { UI_V2_KEY, isUiV2, setUiV2, useUiV2 } from './ui-v2.js'`.

- [ ] **Bước 4: Mục "Giao diện" trong Cài đặt**

- `Appearance.tsx` hiện một dòng: tên "Giao diện mới (GĐ9)", mô tả một câu, công tắc.
- Dùng thành phần công tắc có sẵn trong `@aris/ui-kit/react` (`controls.tsx`, cùng loại công tắc trang `settings/Guard.tsx` đang dùng).
- Bấm công tắc thì gọi `setUiV2(!on)` rồi `location.reload()`, vì các gói đọc công tắc lúc nạp.
- Chữ đặt vào `settings/text.ts`, đủ hai thứ tiếng.

- [ ] **Bước 5: Chạy test, thấy qua; build**

Chạy: `npx vitest run packages/aris-ui-kit/src/react/ui-v2.test.ts && pnpm build`
Mong đợi: PASS, build không lỗi.

- [ ] **Bước 6: Commit** `git commit -m "GĐ9.1: công tắc Giao diện mới"`

---

### Việc 2: Màu và phông của giao diện mới

**Tệp:**
- Sửa `packages/aris-ui-kit/src/tokens.ts`, `packages/aris-ui-theme/src/client/tokens.ts`, `tokens.test.ts`, `index.tsx`
- `package.json` của `aris-ui-theme` nếu người dùng chọn (a) ở Điểm dừng 1

**Giao diện:**
- Tạo ra: `G9_THEMES: { light: Record<G9Key,string>; dark: Record<G9Key,string> }` với các khoá `win`, `pane`, `card`, `card2`, `pill`, `pill2`, `bub`, `ubub`, `line`, `ink`, `ink2`, `ink3`, `inv`, `acc`, `acc2`, `warn`, `err`.
- Tạo ra: `G9_FONT = '"Inter", system-ui, -apple-system, sans-serif'`.
- Tạo ra: `g9Vars(theme: 'light'|'dark'): string`, trả chuỗi `--g9-<khoá>:<giá trị>;…`.

- [ ] **Bước 1: Viết test hỏng**: thêm vào trong khối `describe('theme aris')` của `packages/aris-ui-theme/src/client/tokens.test.ts`. Tệp này nhập `@aris/ui-kit` qua `lib/`, nên phải `pnpm build` gói ui-kit trước mỗi lần chạy test.

```ts
import { G9_THEMES, g9Vars } from '@aris/ui-kit'

it('bảng màu GĐ9 đủ khoá cho cả hai nền và đúng màu nền chính', () => {
  expect(Object.keys(G9_THEMES.dark).sort()).toEqual(Object.keys(G9_THEMES.light).sort())
  expect(G9_THEMES.dark.win).toBe('#000')
  expect(G9_THEMES.light.pane).toBe('#ffffff')
  expect(g9Vars('dark')).toContain('--g9-acc:#3b8bff;')
})
```

- [ ] **Bước 2: Chạy, thấy hỏng** (`npx vitest run packages/aris-ui-theme`).

- [ ] **Bước 3: Viết mã**

Trong `packages/aris-ui-kit/src/tokens.ts`, thêm sau `THEMES` (giá trị chép đúng từ `design/gd9/gd9.css`, khối `.t-dark` và `.t-light`):

```ts
export const G9_THEMES = {
  dark: { win: '#000', pane: '#0e0e0e', card: '#191919', card2: '#1f1f1f', pill: '#232323', pill2: '#2c2c2c', bub: '#1c1c1c', ubub: '#343434', line: '#262626', ink: '#f2f2f2', ink2: '#a3a3a3', ink3: '#7a7a7a', inv: '#000', acc: '#3b8bff', acc2: '#7fb4ff', warn: '#ff9f1a', err: '#ff5c6c' },
  light: { win: '#f1f1f1', pane: '#ffffff', card: '#f5f5f5', card2: '#ffffff', pill: '#ededed', pill2: '#e4e4e4', bub: '#f2f2f2', ubub: '#e3e3e3', line: '#e6e6e6', ink: '#111111', ink2: '#5e5e5e', ink3: '#7d7d7d', inv: '#fff', acc: '#0b62c4', acc2: '#0b5cb8', warn: '#9a5b00', err: '#c02b3a' },
} as const
export type G9Key = keyof (typeof G9_THEMES)['dark']
export const G9_FONT = '"Inter", system-ui, -apple-system, sans-serif'
/** Biến CSS của giao diện GĐ9 cho một nền. */
export const g9Vars = (theme: 'light' | 'dark'): string =>
  Object.entries(G9_THEMES[theme]).map(([k, v]) => `--g9-${k}:${v};`).join('')
```

Trong `packages/aris-ui-theme/src/client/index.tsx`, khi `isUiV2()`:
- chèn một `<style data-plugin="@aris/ui-theme-v2">` có `.aris{${g9Vars('light')}font-family:${G9_FONT}}` và `body[data-ds-dark-theme] .aris{${g9Vars('dark')}}`;
- gọi `ctx.theme.overrideTokens` cho nền app và phông chữ chính của dsh (khoá `--dsh-font-family-text-default` và các khoá nền đang có trong `ARIS_TOKENS`), lấy giá trị từ `G9_THEMES`.

Nếu chọn (a): `import '@fontsource-variable/inter'` ở đầu `index.tsx`. Kiểm `scripts/build-client.mjs` gom được CSS và tệp phông: nếu esbuild chưa có loader cho `.woff2` thì thêm `loader: { '.woff2': 'dataurl' }` chỉ cho gói theme.

- [ ] **Bước 4: Chạy test, build, xem tay**

Chạy: `npx vitest run packages/aris-ui-theme && pnpm build`. Bật công tắc rồi xem trang có nền `#000` và chữ Inter.

- [ ] **Bước 5: Commit** `git commit -m "GĐ9.1: màu và phông giao diện mới"`

---

### Việc 3: Mô hình danh bạ (nhóm theo phòng, chấm, dòng việc)

**Tệp:** tạo `packages/aris-ui-kit/src/react/roster-v2.ts`, `roster-v2.test.ts`; sửa `react/index.ts`.

**Giao diện:**
- Dùng: `TeamView`, `TeamLive`, `BotLive`, `ActivityItem` (`react/team.ts`), `PendingApproval` (`react/external.ts`), `getMascot` (`mascots.ts`).
- Tạo ra: `rosterV2(view: TeamView, live: TeamLive | null, approvals: readonly PendingApproval[]): RosterV2`.

```ts
export type RowDot = 'run' | 'need' | 'err' | null
export interface RosterRow {
  id: string
  name: string
  mascot: string
  accessory?: string
  color: string
  dot: RowDot
  /** Dòng việc gần nhất; rỗng khi cần {you} (thành phần tự viết câu "Cần {you} duyệt N việc"). */
  line: string
  needs: number
}
export interface RosterGroup { id: string; label: string; rows: RosterRow[] }
export interface RosterV2 { pinned: RosterRow; groups: RosterGroup[] }
```

Luật:
- `pinned` là Aris (`view.commander`).
- Mỗi phòng trong `view.groups` (giữ thứ tự) thành một nhóm. Nhóm "không phòng" (`id: ''`) đứng cuối; nhóm rỗng bỏ đi.
- Chấm:
  - `need` khi có phê duyệt chờ cho bot đó (`approvals.filter(a => a.bot === id)`) hoặc trạng thái `waiting`;
  - không thì `err` khi trạng thái `failed`;
  - không thì `run` khi trạng thái `working`;
  - còn lại `null`.
- Dòng việc:
  - `need`: chuỗi rỗng, `needs` là số phê duyệt chờ (ít nhất 1);
  - `run` và `err`: `live.status[id].task` nếu có, không thì `task` của mục hoạt động gần nhất;
  - còn lại: `task` của mục hoạt động gần nhất của bot (`live.activity` sắp mới nhất trước), không có thì vai (`role`).
- Màu: `getMascot(mascot)?.color ?? '#8A8F98'`.

- [ ] **Bước 1: Viết test hỏng**

```ts
// packages/aris-ui-kit/src/react/roster-v2.test.ts
import { describe, expect, it } from 'vitest'
import { rosterV2 } from './roster-v2.js'
import type { PendingApproval } from './external.js'
import { teamView, type TeamLive, type TeamSnapshot } from './team.js'

const bot = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: id === 'aris' ? 'commander' : 'member', handle: id, name: id.toUpperCase(), role: 'Vai ' + id,
  description: '', soul: '', mascot: 'flame', createdAt: '2026-11-01T00:00:00Z', ...extra,
})
const snap = {
  bots: [bot('aris'), bot('mai', { department: 'kd' }), bot('ha', { department: 'kd' }), bot('lam', { department: 'nd' }), bot('dev')],
  departments: [{ id: 'kd', name: 'Kinh doanh' }, { id: 'nd', name: 'Nội dung' }, { id: 'vh', name: 'Vận hành' }],
  templates: [],
} as unknown as TeamSnapshot
const live: TeamLive = {
  status: {
    lam: { status: 'working', task: 'Viết bài 2 trên 3', since: 1, running: 1 },
    dev: { status: 'failed', since: 1, running: 0 },
  },
  activity: [
    { bot: 'ha', kind: 'done', task: 'Đã lọc 214 khách', at: 5 },
    { bot: 'ha', kind: 'done', task: 'Cũ hơn', at: 1 },
    { bot: 'dev', kind: 'failed', task: 'Lỗi đăng nhập GitHub', at: 4 },
  ],
}
const appr = [{ bot: 'mai', run: 'r1', name: 'x' }, { bot: 'mai', run: 'r2', name: 'y' }] as unknown as PendingApproval[]

describe('danh bạ GĐ9', () => {
  const r = rosterV2(teamView(snap, 'Khác', live), live, appr)
  it('Aris ghim đầu, phòng theo thứ tự, phòng rỗng bỏ, bot không phòng ở cuối', () => {
    expect(r.pinned.id).toBe('aris')
    expect(r.groups.map((g) => g.label)).toEqual(['Kinh doanh', 'Nội dung', 'Khác'])
  })
  it('chấm và dòng việc', () => {
    const row = (id: string) => r.groups.flatMap((g) => g.rows).find((x) => x.id === id)!
    expect(row('mai')).toMatchObject({ dot: 'need', needs: 2, line: '' })
    expect(row('lam')).toMatchObject({ dot: 'run', line: 'Viết bài 2 trên 3' })
    expect(row('dev')).toMatchObject({ dot: 'err', line: 'Lỗi đăng nhập GitHub' })
    expect(row('ha')).toMatchObject({ dot: null, line: 'Đã lọc 214 khách' })
  })
})
```

Nếu `teamView` không bỏ phòng rỗng thì `rosterV2` bỏ. Kiểm lại tên trường `DepartmentData` và `TeamSnapshot` trong `team.ts` rồi sửa dữ liệu thử cho khớp, không đổi ý của test.

- [ ] **Bước 2: Chạy, thấy hỏng.**

- [ ] **Bước 3: Viết mã**

```ts
// packages/aris-ui-kit/src/react/roster-v2.ts
import { getMascot } from '../mascots.js'
import type { PendingApproval } from './external.js'
import type { TeamLive, TeamMember, TeamView } from './team.js'

/* RowDot, RosterRow, RosterGroup, RosterV2 như phần Giao diện ở trên */

const FALLBACK_COLOR = '#8A8F98'

/** Danh bạ của thanh bên GĐ9: Aris ghim đầu, rồi bot theo phòng ban. */
export function rosterV2(view: TeamView, live: TeamLive | null, approvals: readonly PendingApproval[]): RosterV2 {
  const latest = new Map<string, string>()
  for (const a of [...(live?.activity ?? [])].sort((x, y) => y.at - x.at))
    if (a.task && !latest.has(a.bot)) latest.set(a.bot, a.task)
  const row = (m: TeamMember): RosterRow => {
    const l = live?.status[m.id]
    const needs = approvals.filter((a) => a.bot === m.id).length
    const dot: RowDot =
      needs > 0 || l?.status === 'waiting' ? 'need' : l?.status === 'failed' ? 'err' : l?.status === 'working' ? 'run' : null
    const last = latest.get(m.id)
    const line = dot === 'need' ? '' : dot ? (l?.task ?? last ?? m.role) : (last ?? m.role)
    return {
      id: m.id,
      name: m.name,
      mascot: m.mascot,
      accessory: m.accessory,
      color: getMascot(m.mascot)?.color ?? FALLBACK_COLOR,
      dot,
      line,
      needs: dot === 'need' ? Math.max(needs, 1) : 0,
    }
  }
  return {
    pinned: row(view.commander),
    groups: view.groups.filter((g) => g.members.length > 0).map((g) => ({ id: g.id, label: g.label, rows: g.members.map(row) })),
  }
}
```

Xuất ở `react/index.ts`.

- [ ] **Bước 4: Chạy test, thấy qua.**
- [ ] **Bước 5: Commit** `git commit -m "GĐ9.1: mô hình danh bạ theo phòng"`

---

### Việc 4: Thanh bên mới (V1)

**Tệp:** tạo `packages/aris-ui-sidebar/src/client/SidebarV2.tsx`, `stylesV2.ts`, `SidebarV2.test.tsx`; sửa `index.tsx`, `locale.ts`.

**Giao diện:**
- Dùng: `rosterV2`, `useTeam`, `useTeamLive`, `usePendingApprovals('all')`, `openBotSession`, `latestCommanderSession`, `arisNavigate`, `Mascot`, `useUiV2` (từ `@aris/ui-kit/react`).
- Tạo ra:
  - thành phần `SidebarV2({ t, nav })`;
  - sự kiện `aris:activity-open` trên `window`: chuông phát, Việc 7 nghe;
  - sự kiện `aris:search-open` trên `window`: kính lúp phát, Việc 9 nghe.

Bố cục theo V1 (`design/gd9/V01KhungDanhBa.dc.html`):

1. **Hàng trên**, căn phải: kính lúp, chuông, dấu cộng. Mỗi nút 32 px có `aria-label`.
   - Chuông có số phê duyệt chờ: hình tròn `--g9-ink`, chữ `--g9-inv`, 10 px.
   - Dấu cộng mở menu nhỏ: "Bot mới" gọi `arisNavigate('new-bot')`, hoặc đúng tên trang tạo bot đang có trong `routes.ts`; "Phòng ban mới" mở trang Phòng ban.
2. **Aris ghim đầu**, rồi từng nhóm phòng.
   - Tiêu đề nhóm 12,5 px màu `--g9-ink3`, chữ thường, mũi tên gập mở.
   - Trạng thái gập lưu ở `localStorage` khoá `aris.ui.v2.collapsed` (mảng mã phòng), bọc `try/catch`.
3. **Dòng bot:**
   - `<button class="g9-row">` gồm `<Mascot id size={40} accessory>`, tên 14,5 px đậm vừa, dòng việc 13 px cắt bằng "…";
   - chấm 8 px ở mép phải theo `dot`;
   - màu dòng việc theo chấm: `need` → `--g9-warn` với chữ `t('needs', {n})` là "Cần {you} duyệt {n} việc"; `run` → `--g9-acc2`; `err` → `--g9-err`;
   - dòng đang mở có nền `--g9-card`.
4. **Bấm dòng:** Aris → `latestCommanderSession` (giống `SidebarRoot.tsx:410-416`) rồi mở phiên; bot khác → `openBotSession(id)` rồi chọn phiên bằng đúng cách `SidebarRoot` đang làm khi bấm một bot.
5. **Đáy:**
   - nút ảnh đại diện 36 px (chữ cái đầu của tên chủ) mở menu: tên và chi phí hôm nay, Bộ não, Tự học (số đề xuất từ `useInboxCount`), Thống kê, Văn phòng 3D, Dự án (theo Điểm dừng 1), Cài đặt;
   - mỗi mục gọi `arisNavigate` tới trang đang có, lấy mã trang ở `packages/aris-ui-pages/src/client/routes.ts`;
   - nút viên "Kết nối ứng dụng" kèm 3 ô logo chữ trắng nền `--g9-ink`, mở Cài đặt › Kết nối.

Trong `index.tsx`, thành phần đăng ký ở slot `sidebar` chọn `useUiV2() ? <SidebarV2/> : <SidebarRoot/>`. Giữ nguyên việc khai báo các slot con.

- [ ] **Bước 1: Viết test hỏng**: vẽ `SidebarV2Body` (phần thuần, nhận `roster`, `t`, `current`, `collapsed`) bằng `renderToStaticMarkup`, kiểm:
  - có tiêu đề "Kinh doanh";
  - có class `g9-dot-need` ở dòng Mai;
  - dòng đang mở có `aria-current="true"`;
  - nhóm đã gập không có dòng bot.

  Theo khuôn `packages/aris-ui-pages/src/client/office/panels.test.tsx`.
- [ ] **Bước 2: Chạy, thấy hỏng.**
- [ ] **Bước 3: Viết `SidebarV2Body` và `SidebarV2`** (phần nối dữ liệu và sự kiện), CSS ở `stylesV2.ts` chép kích thước từ `design/gd9/gd9.css` (`.side`, `.tiles`, `.tile`, `.tb`, `.grph`, `.bd`, `.foot`, `.av`, `.apps`, `.menu`, `.mi`), đổi `var(--x)` thành `var(--g9-x)`.
- [ ] **Bước 4: Chữ** vào `locale.ts`, đủ EN và VI. `locale.test.ts` phải qua.
- [ ] **Bước 5:** `npx vitest run packages/aris-ui-sidebar && pnpm build`. Bật công tắc, xem tay, chụp ảnh tối và sáng.
- [ ] **Bước 6: Commit** `git commit -m "GĐ9.1: thanh bên danh bạ theo phòng"`

---

### Việc 5: Đầu chat mới (V5)

**Tệp:** tạo `packages/aris-ui-chat-header/src/client/HeaderV2.tsx`, `HeaderV2.test.tsx`; sửa `index.tsx`, `locale.ts`.

**Giao diện:**
- Dùng: `useSessionBot(sessionId)`, `Mascot`, `useUiV2`, `ctx.sidebarRight.openTab` (dsh), và tab `aris-profile` của Việc 6.
- Tạo ra: hằng `PROFILE_TAB = 'aris-profile'` xuất từ `@aris/ui-kit/react`, dùng chung với Việc 6.

Khi bật v2:
- `conversation.header.leading`: viên tên bot ở giữa (linh vật 22 px + tên, nền `--g9-pill`, cao 36 px). Bấm vào gọi `ctx.sidebarRight.openTab(PROFILE_TAB, { params: { bot: bot.id, view: 'details' } })`.
- `conversation.session.header.actions`: viên model (tên model hiệu lực của bot, lấy như `Header.tsx` đang lấy) và nút màn hình. Nút màn hình mở cùng tab với `view: 'computer'`.
- Ẩn `SessionSwitcher` và `NewSessionButton`.
- Trong `MoreMenu`: giữ "Mở hồ sơ", thêm "Chủ đề mới" gọi `openBotSession(bot.id, true)`.

- [ ] **Bước 1: Test hỏng:**
  - vẽ `NamePill` với bot Mai, kiểm có tên và `aria-label` "Mở hồ sơ của Mai";
  - kiểm `HeaderActionsV2` không có nút phiên mới.
- [ ] **Bước 2: Chạy, hỏng.** **Bước 3: Viết mã.** **Bước 4: Chạy qua, build, xem tay.**
- [ ] **Bước 5: Commit** `git commit -m "GĐ9.1: đầu chat viên tên bot"`

---

### Việc 6: Khung phải hồ sơ bot (V10, V11, V12)

**Tệp:** tạo `packages/aris-ui-team-pane/src/client/ProfileV2.tsx`, `profile-model.ts`, `profile-model.test.ts`; sửa `index.tsx`, `locale.ts`.

**Giao diện:**
- Dùng:
  - API có sẵn: `GET api/aris/bots?profile=<id>` (giống `team/BotPerms.tsx:124-140`), `api/aris/routines?bot=` (`BotRoutine.tsx:67`), `api/aris/skills`, `api/aris/computer` (`computer/api.ts:77`);
  - `arisNavigate('bot', { id, tab })` để mở trình sửa đầy đủ đang có.
- Tạo ra:
  - đăng ký loại tab `PROFILE_TAB` trong sổ tab của khung phải (`ctx.sidebarRight` → `register(definition)`, xem `tab-registry.d.ts:75,164` trong gói `dsh-client-ui-sidebar-right`);
  - nội dung tab vẽ ở slot `sidebar.right.pane.tab` theo mã định nghĩa.

Bố cục theo V10 (Aris), V11 (Cài đặt bot), V12 (Máy):

- **Trên cùng, phải:** chia sẻ (ẩn ở 9.1), bánh răng (chuyển sang view `settings`), đóng.
- **Đầu:** linh vật 76 px, tên 17 px, ba tab viên "Chi tiết / Thư viện / Máy".
- **Chi tiết:**
  - nhóm dòng: Model (giá trị), Chủ đề mới (`openBotSession(id, true)`), Routine (số đang bật, bấm mở trang routine của bot);
  - với Aris thêm nhóm "Điều phối", ở 9.1 chỉ đọc: Quản đội = "Có", Ai hợp việc gì → mở trang Commander cũ.
- **Thư viện:** Điều nó nhớ (mở trang ký ức của bot), Skill (số, mở tab skill của trang bot), Thư mục làm việc.
- **Máy:** ảnh màn hình mới nhất nếu có (dùng `PreviewShot` hoặc ảnh từ `api/aris/computer`), nút viên "Cầm lái" chỉ khi phiên đang dùng máy, dòng "Bot làm việc ở đâu" (bật hay tắt điều khiển máy) → mở tab quyền của trang bot.
- **Cài đặt** (bánh răng):
  - "‹ Chi tiết", tiêu đề "Cài đặt bot";
  - nhóm dòng: Lời dặn (một dòng tóm, "Bản N ›" từ `soulMeta.version`) → trình sửa lời dặn đang có; Mô tả cho đồng đội; Trước khi bot gửi tin cho khách (viên Hỏi {you} trước / Cứ làm, chỉ đọc ở 9.1, lấy từ `perms`); Ứng dụng được dùng; Kênh; Model dự phòng; Ẩn khỏi thanh bên (để 9.2).

Mỗi dòng là một `<button>` có mũi tên và mở trình sửa đầy đủ đang có. 9.1 **không** viết lại các trình sửa.

`profile-model.ts` chứa các hàm thuần để test:
- `profileRows(bot: BotData, extra: { routinesOn: number; skills: number; memory: number })`: trả danh sách dòng `{ key, label, value }` cho từng view;
- `soulSummary(soul: string, max = 48): string`: một dòng, cắt bằng "…".

- [ ] **Bước 1: Test hỏng** cho `soulSummary` (cắt đúng, bỏ xuống dòng) và `profileRows` (Aris có nhóm Điều phối, bot thường không).
- [ ] **Bước 2–4:** viết mã, chạy qua, build. Xem tay: bấm viên tên bot mở đúng khung, ba tab đổi được, bánh răng vào Cài đặt.
- [ ] **Bước 5: Commit** `git commit -m "GĐ9.1: hồ sơ bot ở khung phải"`

---

### Việc 7: Chuông Hoạt động (V8, V9)

**Tệp:**
- Tạo `packages/aris-ui-kit/src/react/activity-v2.ts`, `activity-v2.test.ts`
- Tạo `packages/aris-ui-pages/src/client/activity/Activity.tsx`
- Sửa `packages/aris-ui-pages/src/client/index.tsx` (đăng ký `shell.overlay`), `text.ts`

**Giao diện:**
- Tạo ra: `activityV2(approvals: readonly PendingApproval[], live: TeamLive | null, nameOf: (id: string) => string, now: number): { need: Item[]; running: Item[]; done: Item[] }`.
- `Item = { key: string; bot: string; title: string; sub: string; at: number; session?: string }`.

Luật:
- `need`: mỗi phê duyệt một mục, `title` = `reason ?? name`, `sub` = tên bot. Thêm các bot ở trạng thái `waiting` chưa có phê duyệt nào, `title` = `task`.
- `running`: bot ở trạng thái `working`, `title` = `task` (thiếu thì "Đang làm"), `sub` = tên bot, `session` = `sessions?.[0]`.
- `done`: mục hoạt động `done` hay `failed` trong ngày (`at` ≥ đầu ngày theo giờ máy), mới nhất trước, tối đa 20.

Bảng nổi theo V8 và V9:
- rộng 380 px, bám mép phải thanh bên, bo 14 px;
- đầu bảng: tiêu đề "Hoạt động", nút đóng;
- dưới đầu bảng là một nút chọn đoạn 3 phần: "Cần {you} · N", "Đang chạy · N", "Routine";
- tab Routine dùng lại dữ liệu và hàng của `auto/Routine.tsx`, gọn lại thành tên, bot, giờ chạy;
- bấm một mục: mở phiên của bot (`openBotSession` hay `session`) và đóng bảng.

Mở bảng khi có sự kiện `aris:activity-open` (Việc 4); đóng bằng nút đóng hay phím Esc.

- [ ] **Bước 1: Test hỏng** cho `activityV2`: hai phê duyệt của Mai thành 2 mục `need`, Lâm `working` thành 1 mục `running`, mục `done` của hôm qua bị bỏ.
- [ ] **Bước 2–4:** viết mã, chạy qua, build, xem tay.
- [ ] **Bước 5: Commit** `git commit -m "GĐ9.1: chuông Hoạt động"`

---

### Việc 8: Kiểu thẻ duyệt và thẻ câu hỏi trong chat

**Tệp:** sửa `packages/aris-ui-theme/src/client/overrides.ts`, `packages/aris-ui-chat/src/client/External.tsx` (`ApprovalDock`).

Khi bật v2, chỉ thêm CSS dưới `body.aris-v2` (thêm class này lên `body` ở `ui-theme/index.tsx` khi `isUiV2()`):

- **Thẻ duyệt của dsh** (`dsh-client-ui-approval`):
  - viền `inset 0 0 0 1px` màu `--g9-warn` 35%, bo 18 px, nền `--g9-bub`;
  - nhãn nhỏ "Cần {you} duyệt" màu `--g9-warn` phía trên tiêu đề, đặt bằng chữ của aris trong slot nếu dsh cho, không thì bằng `::before` dùng biến CSS chứa chuỗi đã dịch;
  - nút "Cho phép một lần" là nút chính dạng viên; "Từ chối" là viên `--g9-pill`.
- **Thẻ câu hỏi của dsh** (`dsh-client-ui-user-questions`): mỗi lựa chọn thành nút viên (`.chip`), xếp thành dòng có xuống hàng.
- **`ApprovalDock`:** thêm dòng lý do (`reason`) đầy đủ và tên bot. Khi bật v2, nếu là phê duyệt điều khiển máy thì hiện thêm ảnh xem trước bằng `PreviewShot`, theo đúng cách `computer/ChatScreen.tsx:20` đang làm.

- [ ] **Bước 1:** sửa CSS, build, gửi một tin thử nhờ bot làm việc cần duyệt, chụp ảnh thẻ tối và sáng, so với V3, V4, V9.
- [ ] **Bước 2: Commit** `git commit -m "GĐ9.1: kiểu thẻ duyệt và câu hỏi"`

Thẻ duyệt đủ chi tiết cho việc tạo bot và sửa lời dặn (V3, V4) làm ở 9.2.

---

### Việc 9: Tìm kiếm nổi (V14)

**Tệp:** sửa `packages/aris-ui-pages/src/client/team/Search.tsx`, `index.tsx`.

- Khi bật v2, kính lúp ở thanh bên phát `aris:search-open`.
- ui-pages mở một hộp nổi rộng 620 px trên lớp nền mờ: ô tìm, ba tab viên "Tất cả / Tin nhắn / Bot", danh sách kết quả.
- Dùng đúng hàm tìm `Search.tsx` đang gọi. Không thêm API.
- Bấm kết quả thì mở phiên tương ứng. Phím Esc đóng.

- [ ] **Bước 1:** tách phần lấy kết quả của `Search.tsx` thành hàm dùng chung, rồi vẽ hộp nổi.
- [ ] **Bước 2:** build, thử tìm một từ có thật, chụp ảnh.
- [ ] **Bước 3: Commit** `git commit -m "GĐ9.1: tìm kiếm nổi"`

---

### Việc 10: Đặc tả, kiểm tra, nghiệm thu

- [ ] **Bước 1:** viết `docs/specs/aris-ui.md`:
  - công tắc;
  - bản đồ slot đã dùng;
  - mô hình danh bạ và Hoạt động;
  - các chỗ còn dùng trình sửa cũ.
- [ ] **Bước 2:** chạy đủ phần "Kiểm tra" của `gd8-chung.md` và `gd9-chung.md`.
- [ ] **Bước 3:** chụp web thật bật v2, tối và sáng, các màn V1, V5, V8, V9, V10, V11, V12, V14, đặt cạnh bản vẽ. Tắt công tắc, chụp một ảnh chứng minh giao diện cũ còn nguyên.
- [ ] **Bước 4:** ghi nghiệm thu vào `docs/ke-hoach-trien-khai.md` (mục giai đoạn 9). Ghi đúng việc đã thử và những chỗ còn dùng trình sửa cũ.
- [ ] **Bước 5:** **Điểm dừng 2**: gửi ảnh cho người dùng, hỏi có bật v2 làm mặc định không. Có thì đổi `isUiV2` mặc định là bật (chưa đặt thì coi như bật), sửa test cho khớp, commit.

## Ngoài phạm vi 9.1

- Aris tạo và sửa bot bằng lời, lời chào lần đầu, viên tên bot trong tin nhắn: 9.2.
- Hai công tắc skill và kết nối: 9.3.
- Luồng thật (bảng `threads`), một cửa gửi tin, sang trang: 9.6.
- Thẻ việc chạy nền và bot nhờ bot trong chat: 9.5, 9.8.
- Máy riêng (Docker): 9.9.
- Phòng ban kiểu công ty, nhân sự: 9.10.
- Điện thoại, nhóm bot: sau 9.11.
