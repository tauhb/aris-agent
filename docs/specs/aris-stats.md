# @aris/stats — thống kê, nhật ký, phát lại phiên (giai đoạn 7, đợt 7c)

Bản vẽ 6.5 `ThongKe.dc.html` ("Thống kê và nhật ký") và 6.5b `PhatLai.dc.html` ("Phát lại phiên"). Phạm vi chốt 26/10:
màn 6.5 dùng số thật, phát lại từng bước, đo token theo phiên và theo bước. Không làm otel (để tới khi lên server).

## Ghi số liệu

`@aris/providers` có thêm hai hàm ở dịch vụ `arisSpend`:

- `onCall(fn)`: gọi `fn({ session?, parent?, provider, model, usage, usd, at, scope })` mỗi lần gọi model, ở cùng chỗ
  ghi vào sổ chi phí (`ledger.record`). Gồm cả lần gọi ngoài phiên của vòng học nền (`charge`, không có `session`) và chi
  phí ảnh, video (`usage` bằng 0, `model` là model ảnh hay video, có `session` khi bot làm trong phiên). `onCost` của
  Commander giữ nguyên.
- `priceOf(provider, model)`: giá một model (USD cho mỗi 1 triệu token), để tính tiền tiết kiệm nhờ cache và tiền một
  bước khi phiên chưa có bản ghi.

`inputTokens` của dsh là phần chưa qua cache (các số token rời nhau: đầu vào thực = `inputTokens` + `cacheReadTokens` +
`cacheWriteTokens`; `TokenUsage` của `dsh-llm`). Mọi chỗ trong gói này tính theo đó.

### Phân loại lúc ghi

Phân loại làm ngay lúc ghi (các tập trong bộ nhớ của routine, ACP… mất khi khởi động lại), qua các dịch vụ của aris như
`isBackground` của `@aris/guard`. Thứ tự ưu tiên:

| Điều kiện | `kind` | `source` |
| --- | --- | --- |
| `arisRoutine.isRoutine(sid)` | `routine` | `schedule` |
| `arisBrain.isLibrarian(sid)` hay `arisSkills.isEval(sid)` | `learning` | `background` |
| `arisAcp.isGuest(sid)` | `delegated` | `app` |
| `arisBots.store.tagOf(sid).via === 'dispatch'` (việc lớn Commander giao cho phòng ban) | `delegated` | `commander` |
| `via === 'team'` hay phiên có `parentSession` | `delegated` | `bot` |
| `arisChannels.isChannelSession(sid)` (phiên của cuộc trò chuyện Telegram) | `chat` | `telegram` |
| còn lại | `chat` | `web` |

Lần gọi không có phiên: scope có `reflect` hay `profile` (vòng học hồ sơ, ký ức) là `learning`/`background`, còn lại `chat`/`web`.
Phân loại mới không kéo một phiên đã là việc nền về `chat` (tag đến chậm). Bản ghi cũ lưu giá trị tiếng Việt (`giao`, `hoc`, `lich`, `nen`) được quy đổi khi đọc; khoá bản ghi gom chạy nền vẫn dùng `nen`.

`by` (cột "do X giao") là tên bot của phiên cha với `source: giao`, và tên bot của phiên Commander đã giao việc lớn
(`arisJobs.list()`) với `source: commander`.

Nhận ra phiên Telegram bằng `arisChannels.isChannelSession(sid)` (dịch vụ có sẵn của `@aris/channels`, cũng đang dùng ở
`@aris/bots` cho "nơi học"): phiên là hay từng là phiên của một cuộc trò chuyện Telegram.

### Bảng của domain `aris_stats` (per-record)

| Bảng | Khoá | Bản ghi | Giữ |
| --- | --- | --- | --- |
| `calls` | `<lúc>-<ngẫu nhiên>` | `at`, `day`, `session?`, `bot?`, `kind`, `source`, `provider`, `model`, `input`, `output`, `cacheRead`, `cacheWrite`, `usd` | 30 ngày |
| `sessions` | `<ngày>-<mã phiên đã thay ký tự lạ bằng ->` | `day`, `session`, `bot`, `kind`, `source`, `by?`, `firstAt`, `lastAt`, `calls`, `input`, `output`, `cacheRead`, `cacheWrite`, `usd`, `saveUsd`, `fullInUsd`, `asked` | 90 ngày |
| `events` | `<lúc>-<ngẫu nhiên>` | `at`, `session`, `type` (`approval` hay `question`; bản ghi cũ `duyet`, `hoi` được quy đổi khi đọc), `tool?`, `callId?`, `what?`, `decision?`, `waitedMs?` | 30 ngày |

- `sessions` là tổng theo (ngày, phiên), nguồn của biểu đồ, thẻ số và nhật ký (đọc `sessions` thôi, không quét `calls`).
  Các lần gọi ngoài phiên gom vào bản ghi `session: ''` của ngày đó (khoá `<ngày>-~nen`), vào biểu đồ và cache, không vào
  nhật ký hay tỉ lệ việc xong. `saveUsd` và `fullInUsd` là tiền tiết kiệm nhờ cache và tiền đầu vào nếu không có cache,
  tính theo giá lúc ghi; model chưa có giá thì cộng 0.
- `asked` thành `true` khi phiên, trong ngày đó, có `approval/request` hay gọi công cụ `ask_user_question`. Row
  `aris-stats` nạp trước `aris-guard`, nên hook duyệt của hàng rào bọc ngoài: việc hàng rào tự cho (chế độ tự cho việc
  rủi ro thấp) trả kết quả trước khi tới hook này, không bị tính là có hỏi.
- Ghi tuần tự qua một hàng đợi trong gói để hai lần gọi sát nhau không dẫm lên tổng của nhau.
- Dọn mỗi 12 giờ (và lúc khởi động).

### Hook duyệt và hỏi

- `approval/request` (prepend): `@aris/stats` xếp sau `@aris/guard` trong `cordis.patch.yml` nên đứng ngoài hàng rào.
  Đánh dấu `asked` ngay lúc xin, `await next()`, rồi ghi sự kiện `approval` kèm kết quả (`allowed-once`, `rejected`,
  `cancelled`, `unavailable`) và thời gian chờ. Không đổi kết quả; `next()` ném lỗi thì ghi `cancelled` rồi ném tiếp.
- `tools/pre-execute` (prepend): nhớ mô tả lời gọi theo `callId` (1 giờ) để gắn nhãn cho sự kiện duyệt; công cụ
  `ask_user_question` ghi sự kiện `question` và đặt `asked`. Luôn `return next()`.
- Bị chặn: `@aris/guard` đã ghi bảng `blocked` (giữ 7 ngày). Dịch vụ `arisGuard` có thêm `blocked(sessionId)` trả các bản
  ghi của phiên, cũ trước. Không ghi trùng.

### Skill

`arisSkills.skillEvents(sinceMs)` trả `{ enabled, rolledBack }`: số skill có `activatedAt` (lần bật đầu) từ mốc đó và số
bản `by: 'restore'` (khôi phục bản cũ, tức rollback) có `at` từ mốc đó. Store đã có sẵn các mốc thời gian này nên tính
được cả những lần xảy ra trước đợt 7c, không cần thêm trường.

## API `/api/aris/stats` (GET)

### `?range=today|7d|30d` (mặc định 7d)

```
{ range, total, days: [{ day, chat, giao, routine, hoc }], cache: { pct, savePct },
  autonomous: { done, total }, skills: { enabled, rolledBack }, log: [...] }
```

- `days`: USD mỗi ngày theo bốn loại, đủ số ngày (hôm nay một, 7, 30; ngày trống là 0), cũ trước.
- `cache.pct` = cacheRead / (input + cacheRead + cacheWrite) theo phần trăm, `null` khi chưa có token.
  `cache.savePct` = tiền tiết kiệm / tiền đầu vào nếu không có cache, chỉ tính model có giá; `null` khi không có.
- `autonomous.total`: số bản ghi (ngày, phiên) có ít nhất một lần gọi; `done`: số bản ghi trong đó `asked` là `false`.
- `log`: mỗi phiên một dòng gộp các ngày trong khoảng, `lastAt` giảm dần, tối đa 100 dòng:
  `{ session, bot, botName, mascot, title, by, source, kind, firstAt, lastAt, usd, tokens, running }`. `tokens` là đầu
  vào (kể cả cache) cộng đầu ra. `title` lấy từ tiêu đề dsh (`sessionQuery.readTitleSnapshots`, nhớ 5 phút, bỏ tiền tố
  `[Phòng nhóm · …]`), rỗng thì màn hiện "Phiên chưa đặt tên". `running` từ `arisBots.live.runningSessions()`.

### `?replay=<sid>`

```
{ session, bot, botName, mascot, title, by, kind, source, firstAt, lastAt, usd, tokens, running, steps: [...] }
```

Log phiên đọc qua API của dsh, không giải nén tệp: `sessionQuery.observeSession(SessionId(sid), { projectionMode: 'none' })`
(cùng cách `@aris/commander`, `@aris/projects` đọc bảng việc), lấy `obs.events` rồi `dispose`. Mỗi sự kiện có `type`,
`time` (ms), `data`; dùng `user/message`, `assistant/message` (kèm `usage`), `tool/call`, `tool/result`, `step/start`,
`approval/asked`, `approval/decided`. Phiên không đọc được (đã xoá) thì 404 `{ error }`.

Phần tổng của đầu trang lấy từ `sessions` (cộng các ngày); phiên có trước khi có thống kê thì tính từ chính các bước.

Dựng bước là hàm thuần `buildSteps(entries, calls, events, blocked, opts)` trong `policy.ts`:

- `type`: `user`, `assistant`, `thinking`, `tool`, `approval`, `question`, `blocked`. Tin người dùng chỉ là ngữ cảnh chèn vào cho
  model (có `source.form`, hay các loại `runtime-context`, `tool-registry`…) thì bỏ. Mỗi tin trợ lý tách suy nghĩ
  (`reasoning`) và chữ (`text`) thành hai bước.
- Lời gọi công cụ ghép với kết quả theo `callId` thành một bước `tool`; `ms` là thời gian chạy; kết quả báo lỗi đặt
  `error: true`. `ask_user_question` là bước `question`, `ms` là thời gian chờ trả lời.
- Token và tiền: token lấy từ `usage` của chính tin trợ lý (đúng cho cả phiên cũ), gắn vào bước đầu tiên sinh ra từ lần
  gọi model đó (suy nghĩ, trả lời, hay công cụ đầu tiên nếu tin chỉ có lời gọi công cụ), nên tổng các bước bằng tổng
  phiên. `input` của bước đã gồm phần cache (`cacheRead` là phần trong đó). Tiền ghép với bảng `calls` của phiên theo
  thứ tự, cùng số token, bỏ qua khoản không có token (ảnh, video); không ghép được thì tính theo `priceOf`; không có giá
  thì để trống.
- `approval`: lấy từ log phiên (`approval/asked`, `approval/decided`) hợp với bảng `events` theo `callId` (hay công cụ và
  thời gian cách nhau tối đa 2 giây). Bước đứng ngay trước bước công cụ của nó, `ms` là thời gian chờ, `out` là mã kết
  quả. Bản ghi `events` không có trong log vẫn thành bước, xếp theo thời gian.
- `blocked`: bản ghi chặn của hàng rào đánh dấu bước công cụ trùng tên, gần thời điểm chặn nhất (`outLabel: rule`, `out` là
  lý do); không có bước trùng thì thêm bước riêng theo thời gian. Bản ghi chặn chỉ giữ 7 ngày, phiên cũ hơn chỉ còn bước
  công cụ có lỗi.
- Nhãn đi theo mã để màn dịch: `inLabel` là `message`, `content`, `args` (tham số, JSON thụt đầu dòng), `command`,
  `question`; `outLabel` là `result`, `error`, `decision`, `rule`, `answer`.
- `body` và `out` cắt ở 4.000 ký tự, kèm `bodyFull`, `outFull` (`false` khi bị cắt). `?replay=<sid>&step=<n>&full=1` trả
  đủ một bước (tối đa 400.000 ký tự); `step` sai là 400, không có bước đó là 404.

## Màn

- **6.5 `Stats.tsx`**: ba nút Hôm nay, 7 ngày, 30 ngày; làm mới mỗi 30 giây. Cột chồng cao theo ngày cao nhất (khung 170
  px), 30 ngày thì cột hẹp và nhãn ngày thưa (mỗi 5 ngày tính lùi từ hôm nay). Ba thẻ số: trúng prompt cache, việc xong
  không cần người dùng, skill mới bật. Bảng nhật ký với chấm "đang chạy" và nút Phát lại mở
  `nav.go('settings', { section: 'stats', replay: sid })`.
- **6.5b `Replay.tsx`**: hiện thay nội dung Stats khi có `params.replay`, vẫn trong khung Cài đặt. Thanh đầu, thanh phát
  (về đầu, lùi, phát hay dừng, tới, về cuối, 1×, 2×, 4× ứng với 1,2 giây, 0,6 giây, 0,3 giây mỗi bước, dòng thời gian
  các ô màu; phím ← → và cách), cột "Các bước" tự cuộn tới dòng đang chọn, thẻ chi tiết với "Xem đủ". Phiên đang chạy
  thì hỏi lại mỗi 3 giây và thêm bước ở cuối.
- Chữ ở `settings/text.ts` (khoá `stats.*`, `sx.*`, `rp.*`, cả hai ngôn ngữ), CSS ở `styles.ts` (tiền tố `ap-sx`,
  `ap-rp`).

## Giới hạn đã biết

- Số liệu chỉ có từ lúc `@aris/stats` chạy; biểu đồ các ngày trước trống. Phát lại thì dùng được cho mọi phiên có log.
- Loại việc của lần gọi cũ không sửa lại được; phiên đổi loại sau đó (tag đến chậm) chỉ đổi từ lần gọi sau.
- Phiên đang chạy mỗi lần hỏi lại đọc cả log; phiên rất dài (hàng nghìn bước) tải nặng hơn.
- Không có otel (để tới khi lên server).
