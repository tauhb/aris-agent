# Plan đợt 7c · Quan sát (GĐ7) — để Sonnet làm

Người viết plan: Opus. Người làm: subagent Sonnet 5.5 effort cao. Opus soát diff, chạy thử thật và commit.

Bản vẽ (nguồn sự thật cho giao diện):
- `design/canvas/ThongKe.dc.html`: 6.5 Thống kê và nhật ký.
- `design/canvas/PhatLai.dc.html`: 6.5b Phát lại phiên.

Mở bằng trình duyệt ở http://127.0.0.1:4317/ThongKe.dc.html và http://127.0.0.1:4317/PhatLai.dc.html. Hoặc đọc HTML: phần `<script>` cuối tệp chứa dữ liệu mẫu và chữ hiển thị.

Phạm vi đã chốt:
1. Màn 6.5 dùng số thật.
2. Phát lại phiên từng bước.
3. Đo token theo phiên và theo bước.
4. Không làm otel (để tới khi lên server).

## Luật bắt buộc

- Không sao chép mã Hermes Agent.
- Không đọc, in hay commit `.dsh-home/.credentials.yaml`.
- Không in token đăng nhập; log daemon `~/Library/Logs/aris/daemon.log` có token, đọc thì lọc bằng `sed 's/token=[^ &"]*/token=***/g'`.
- Không commit, không push. Opus commit sau khi soát.
- Không cài gói mạng. Chỉ được chạy `pnpm install --offline` để nối gói workspace.
- Chú thích mã và chữ trên giao diện viết tiếng Việt có dấu, theo giọng các gói `@aris/*` hiện có. Xem `packages/aris-guard/src/index.ts` và `packages/aris-backup/src/index.ts` làm mẫu: chú thích đầu tệp, `name`, `inject`, `apply`, domain, route `/api/aris/...`.
- Chữ giao diện không viết cứng "anh", "chị", "Chủ nhân". Dùng `{you}`; hàm `t()` tự điền.
- Mọi chữ giao diện đặt trong `packages/aris-ui-pages/src/client/settings/text.ts`, đủ cả hai khối, tiếng Anh (khối đầu) và tiếng Việt. `locale.test.ts` kiểm hai khối khớp khoá.
- Class CSS mới dùng tiền tố `ap-sx` (stats) và `ap-rp` (replay). Grep `styles.ts` trước khi đặt tên để khỏi trùng; đã từng trùng `ap-gbar`.
- Gói mới cần làm đủ các bước sau, thiếu bước nào thì daemon không nạp được gói:
  - thêm vào lệnh `build` trong `package.json` gốc, đặt sau các gói nó phụ thuộc;
  - thêm vào `packages/aris-bundle/package.json` ở mục dependencies;
  - chèn row vào `packages/aris-bundle/cordis.patch.yml`;
  - chạy lại `pnpm install --offline`.

## A. Ghi số liệu: gói mới `@aris/stats` (`packages/aris-stats`)

Làm theo khung của `packages/aris-backup`: `package.json`, `tsconfig.json`, `src/index.ts`, `src/domain.ts`, `src/policy.ts` (hàm thuần), `src/stats.test.ts`.

### A1. Nguồn dữ liệu từ `@aris/providers`

- Trong `packages/aris-providers/src/index.ts` có `costListeners` và `onCost(fn)`: Commander dùng, đừng đổi chữ ký.
- Thêm vào dịch vụ `arisSpend` hàm `onCall(fn)`, trả hàm huỷ. Gọi `fn` mỗi lần gọi model với `{ session?: string; provider; model; usage: Usage; usd: number; at: number; scope: string[] }`, ở cùng chỗ đang gọi `ledger.record(...)` trong phiên.
- Lần gọi ngoài phiên (`charge(...)` của vòng học nền) cũng gọi `onCall`, nhưng không có `session`.
- Chi phí ảnh, video (`addUsd`) cũng gọi `onCall`, kèm `session` nếu có, `usage` bằng 0 và `model` là tên model ảnh hay video. Tìm chỗ gọi `addUsd` trong `aris-providers` để biết có session hay không.
- Thêm `priceOf(provider, model)` (hay hàm tính `costOf`) nếu UI phát lại cần tính tiền mỗi bước. Cách đơn giản hơn ở mục A3 không cần hàm này.

### A2. Phân loại việc lúc ghi (không phân loại lúc đọc, vì các tập trong bộ nhớ mất khi khởi động lại)

`kind` có bốn giá trị, khớp bốn màu của biểu đồ:
- `chat`: còn lại.
- `giao` (việc được giao):
  - phiên có `header.parentSession`;
  - `arisBots.store.tagOf(sid)?.via` là `team` hay `dispatch`;
  - phiên khách ACP (`arisAcp.isGuest(sid)`);
  - việc của Commander. Xem `aris-commander` để biết cách nhận ra, nếu tag chưa đủ.
- `routine`: `arisRoutine.isRoutine(sid)`.
- `hoc` (vòng học và kiểm thử):
  - `arisBrain.isLibrarian(sid)`;
  - `arisSkills.isEval(sid)`;
  - lần gọi không có session mà `scope` chứa `reflect` hay phạm vi của vòng học. Xem các chỗ gọi `charge(`.

Cách lấy dịch vụ: `ctx.get('arisBots')` và tương tự. `packages/aris-guard/src/index.ts`, hàm `isBackground`, là mẫu đúng.

`source` (cột Nguồn của nhật ký) nhận một trong các giá trị:
- `web`;
- `telegram`: phiên do kênh tạo. Xem `packages/aris-channels`; nếu chưa có thì thêm dịch vụ `isChannelSession(sid)`;
- `lich` (routine);
- `commander`;
- `app` (ACP);
- `nen` (Thủ thư, vòng học, kiểm thử);
- `giao` (bot khác giao, có `parentSession`).

### A3. Bảng của domain `aris_stats` (per-record, như `aris_guard`)

- `calls`, khoá là id ngẫu nhiên. Bản ghi: `{ at, day, session?, bot?, kind, source, provider, model, input, output, cacheRead, cacheWrite, usd }`. Giữ 30 ngày.
- `sessions`, khoá `${day}-${sid}` (sid đã thay ký tự lạ bằng `-`). Bản ghi:
  - `{ day, session, bot, kind, source, by?, title?, firstAt, lastAt, calls, input, output, cacheRead, usd, asked: boolean }`;
  - `by` là tên bot giao việc, nếu có;
  - `asked` thành `true` khi phiên đó trong ngày đó có `approval/request` hay gọi công cụ `ask_user_question`.

  Giữ 90 ngày.
- `events`, khoá ngẫu nhiên: duyệt, bị chặn, hỏi người dùng, dùng cho phát lại. Bản ghi `{ at, session, type: 'duyet' | 'hoi', tool?, decision?, waitedMs? }`. Giữ 30 ngày.
  - Duyệt: thêm `ctx.on('approval/request', ...)`, prepend **sau** hàng rào. Ghi lúc bắt đầu, `await next()` rồi ghi kết quả và thời gian chờ. Không đổi kết quả.
  - Hỏi: `tools/pre-execute` với tên `ask_user_question`.
  - Bị chặn: `aris_guard` đã ghi bảng `blocked` (có session, tool, what, at). Thêm vào dịch vụ `arisGuard` hàm `blocked(sessionId)` trả các bản ghi của phiên đó; không ghi trùng.

Dọn bản ghi cũ mỗi 12 giờ, như `aris-backup`.

### A4. Skill

Đọc `packages/aris-skills` để đếm số skill mới được bật và số bị rollback trong khoảng thời gian chọn. Nếu store chưa có mốc thời gian, thêm `enabledAt`, `rolledBackAt` vào bản ghi tại chỗ bật và chỗ rollback, rồi tính từ nay về sau. Ghi rõ điều này trong spec. Thêm hàm `skillEvents(sinceMs)` vào dịch vụ của `aris-skills` cho `@aris/stats` gọi.

### A5. API `/api/aris/stats` (GET; mẫu đăng ký route: `aris-backup`)

`GET ?range=today|7d|30d` trả về:

```
{
  range, total,                        // tổng USD của khoảng
  days: [{ day, chat, giao, routine, hoc }],   // USD mỗi ngày, đủ số ngày (ngày trống = 0)
  cache: { pct, savePct },
  autonomous: { done, total },
  skills: { enabled, rolledBack },
  log: [{ session, bot, title, by, source, firstAt, lastAt, usd, tokens, running }]
}
```

- `cache.pct` là cacheRead chia (input + cacheRead), hoặc theo cách bảng `ledger` của providers tính `input`. Đọc `prices.ts`, `Usage` để biết `inputTokens` đã gồm cache hay chưa, rồi ghi rõ công thức trong chú thích.
- `cache.savePct` là phần trăm tiết kiệm chi phí đầu vào ước tính theo giá cache-read so với giá input. Không có giá thì `null`.
- `autonomous`: `total` là số bản ghi `sessions` có ít nhất một lần gọi trong khoảng; `done` là số bản ghi trong đó có `asked` là `false`.
- `log`: mỗi phiên một dòng (gộp các ngày trong khoảng), xếp theo `lastAt` giảm dần, tối đa 100 dòng.
  - `title` lấy từ tiêu đề phiên của dsh. Xem cách `aris-bots` hay `aris-recall` lấy tiêu đề, qua `sessionController.list` hay store.
  - `running` lấy từ `arisBots.live.runningSessions()`.

`GET ?replay=<sid>` trả về:

```
{
  session, bot, title, by, source, firstAt, lastAt, usd, tokens, running,
  steps: [{ n, at, type, title, model?, input?, output?, cacheRead?, usd?, ms?, inLabel, body, outLabel?, out? }]
}
```

- `type` là một trong `user`, `assistant`, `thinking`, `tool`, `duyet`, `hoi`, `chan`.
- Lấy lịch sử phiên qua API của dsh, **không** đọc tệp `.zstd` trực tiếp:
  - `ctx.sessionQuery.observeSession(SessionId(sid), {...})` (xem `packages/aris-commander/src/index.ts` khoảng dòng 1034, `packages/aris-projects/src/index.ts` dòng 114);
  - các tệp `.d.ts` của `@deepseek-ai/dsh-session-query` và `@deepseek-ai/dsh-session` trong `node_modules/.pnpm`. Tìm cách lấy đủ các mục: tin người dùng, tin trợ lý, suy nghĩ, gọi công cụ, kết quả công cụ.
- Ghép gọi công cụ với kết quả theo `callId` thành một bước `tool`.
- Gắn token và tiền cho các bước của trợ lý theo thứ tự thời gian, từ bảng `calls` của phiên: bước trợ lý thứ i khớp lần gọi thứ i. Thiếu thì để trống.
- Chèn các sự kiện `duyet`, `hoi` (từ `events`) và `chan` (từ `arisGuard.blocked(sid)`) vào đúng chỗ theo thời gian.
- `body` và `out` cắt ở 4.000 ký tự, có cờ `outFull: false`. `GET ?replay=<sid>&step=<n>&full=1` trả đủ một bước, cho nút "Xem đủ".
- Bước người dùng có `inLabel` là "Tin nhắn". Bước công cụ có `inLabel` là "Tham số" (JSON đẹp) và `outLabel` là "Kết quả · …".

Viết hàm dựng bước (`buildSteps(entries, calls, events, blocked)`) thành hàm thuần trong `policy.ts`, có test.

## B. Giao diện

### B1. `packages/aris-ui-pages/src/client/settings/Stats.tsx`

- Bỏ `DEMO_STATS` khỏi `settings/demo.ts`; xem còn chỗ nào dùng không.
- Lấy dữ liệu từ `/api/aris/stats?range=…`. `Segmented` Hôm nay, 7 ngày, 30 ngày; làm mới mỗi 30 giây. Mẫu fetch giống `Guard.tsx` và `Backup.tsx`.
- Biểu đồ cột chồng giữ cách vẽ hiện có trong `Stats.tsx`, đã khớp bản vẽ.
  - Chiều cao cột tỉ lệ với ngày cao nhất; khung 170px.
  - "Hôm nay" chỉ một cột.
  - 30 ngày: 30 cột hẹp, nhãn ngày thưa (mỗi 5 ngày).
  - `aria-label` nêu tổng và ngày cao nhất.
- Ba thẻ số bên phải:
  - Trúng prompt cache: phần trăm; ghi "tiết kiệm ước tính …% chi phí đầu vào" nếu có.
  - Việc hoàn thành không cần `{you}`: phần trăm; ghi "n / tổng việc".
  - Skill mới được bật: số; ghi "n bị rollback".
- Bảng "Nhật ký phiên" gồm các cột Giờ, Bot (linh vật nhỏ, dùng `Bot` trong `../ui.js` như hiện có), Phiên ("· do X giao" màu nhạt), Nguồn, Token (dạng 38,2K), Chi phí (2 số lẻ, dấu phẩy) và nút "Phát lại".
  - Phiên đang chạy có chấm hay chữ "đang chạy".
  - Không có dòng nào thì ghi "Chưa có phiên nào trong khoảng này".
- "Phát lại" mở `nav.go('settings', { section: 'stats', replay: sid })`. Kiểm `PageProps.params` và `SettingsPage.tsx` để biết tham số có tới được mục con không; cần thì sửa cho chuyền `params`.

### B2. Thành phần mới `settings/Replay.tsx` (6.5b)

Hiện khi `params.replay` có giá trị, thay cho nội dung Stats, vẫn trong khung Cài đặt và mục "Thống kê và nhật ký" vẫn sáng. Theo đúng bản vẽ `PhatLai.dc.html`:
- **Thanh đầu:**
  - nút "‹ Nhật ký phiên" về Stats;
  - linh vật bot, tiêu đề;
  - dòng phụ: bot · do X giao · nguồn · giờ bắt đầu–kết thúc · số bước · token · USD;
  - nút "Mở phiên" mở phiên trong chat. Tìm cách các trang khác mở một phiên, ví dụ grep `nav.go(` trong `aris-ui-pages`, `aris-ui-sidebar`.
- **Thanh phát:**
  - nút về đầu, lùi, Phát/Tạm dừng, tới, về cuối;
  - "Bước i / n";
  - tốc độ 1×, 2×, 4× (1 bước mỗi 1,2 s, 0,6 s, 0,3 s);
  - dòng thời gian gồm các ô màu theo loại bước. Bước đã qua đậm, bước sau nhạt (opacity .3), bước đang chọn cao hơn. Bấm ô để nhảy tới bước đó.
  - Phím ← → để lùi, tới; phím cách để phát hay dừng (chỉ khi focus không ở ô nhập).
- **Cột trái "Các bước":**
  - chú giải màu: tin nhắn (`--ap-c1`), gọi công cụ (`--ap-c2`), duyệt (`--ap-c4`), lỗi hay bị chặn (`--a-danger`);
  - mỗi dòng: số, giờ (HH:MM:SS), ô màu, mô tả một dòng (cắt bằng dấu …), token, USD;
  - dòng đang chọn có nền `--a-accentSoft`; tự cuộn tới dòng đang chọn khi phát.
- **Cột phải:**
  - thẻ chi tiết gồm pill loại bước (màu như bản vẽ), tiêu đề, giờ; dòng model · token (vào X (cache Y) · ra Z) · tiền · thời gian; khối "Tham số" hay "Nội dung" (mono, nền `--a-panel2`); khối "Kết quả" kèm nút "Xem đủ" khi bị cắt;
  - thẻ ghi chú: "Phát lại chỉ đọc nhật ký đã ghi, không chạy lại công cụ hay gọi model. Phiên đang chạy thì bước mới hiện thêm ở cuối."
- Phiên đang chạy: hỏi lại mỗi 3 giây, thêm bước mới vào cuối.
- Lỗi (phiên không còn): báo lỗi một dòng kèm nút về.

### B3. Chữ và CSS

- Thêm khoá `sx.*` và `rp.*` vào `text.ts`, cả hai khối. Bỏ các khoá `stats.*` không còn dùng; khoá nào vẫn dùng thì giữ.
- CSS vào `packages/aris-ui-pages/src/client/styles.ts`, dùng biến `--a-*`, `--ap-c1..4` như các màn khác. Hai cột tự xuống dòng khi hẹp: dùng `ap-cols` và `Col` có sẵn.

## C. Kiểm tra (Sonnet tự chạy trước khi báo xong)

1. `pnpm build`: không lỗi.
2. `npx vitest run`: toàn bộ test qua. Viết test cho:
   - phân loại `kind`, `source`;
   - gộp `days`, `cache`, `autonomous`;
   - `buildSteps`: ghép tool call với kết quả, gắn token, chèn duyệt hay bị chặn, cắt nội dung dài.
3. `npx eslint` và `npx prettier --check` trên các tệp đã đụng.
4. Khởi động lại daemon (`node scripts/aris.mjs restart`), đợi 10 giây, xem 30 dòng cuối log (lọc token như trên) để chắc không có lỗi nạp gói.
5. Không cần mở trình duyệt; Opus sẽ thử trên web.

## D. Báo cáo cho Opus

Liệt kê:
- các tệp đã sửa và tạo;
- quyết định đã đưa ra ở các chỗ plan bảo "xem…" (API đọc phiên của dsh là gì, `inputTokens` có gồm cache không, Telegram nhận ra bằng gì, skill có mốc thời gian không);
- việc chưa làm được và lý do;
- kết quả của từng bước ở mục C.

Viết thêm `docs/specs/aris-stats.md` theo kiểu `docs/specs/aris-backup.md`.
