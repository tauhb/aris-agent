# Đặc tả Commander giao việc (giai đoạn 2, bước 2)

> Dựng trên [aris-bots.md](aris-bots.md) (bot là dữ liệu của aris gắn vào phiên) và Agent Teams của dsh.

## Công cụ `giao_viec` (chỉ Commander)

- Tham số `viec`: tối đa 4 mục, mỗi mục `bot` (tên gọi), `noi_dung` (đủ ngữ cảnh để bot tự làm), `ly_do` (vì sao chọn bot này), `tieu_de` (tuỳ chọn, tên thẻ trên bảng việc).
- Mỗi bot là **một thành viên trong Team của phiên Commander** (`agentTeams`), tên thành viên = tên gọi của bot, nên `@aris/bots` gắn phiên con với bot (tính cách, ký ức, model riêng).
  - Bot chưa có trong đội: tạo thành viên mới (`spawnTeammate`, `fresh`).
  - Bot đã có: nhắn tiếp (`sendMessage`), bot nhớ việc trước trong cùng cuộc.
- Mỗi việc thành một **thẻ trên bảng việc** của Team, gán cho bot (Kanban). Tham số `the` (tuỳ chọn) giao một thẻ có sẵn thay vì tạo thẻ mới: `task-n` (thẻ đã chia, phải sẵn sàng: thẻ nó chờ đã xong) hoặc `c-n` (thẻ người dùng tạo trên Kanban; giao xong thì thẻ của đội thay chỗ). Thẻ sai hoặc đang chờ thì báo trước, không nhắn bot.
- Công cụ trả ngay; Commander đợi bằng `wait_agent` rồi tổng hợp. Câu trả lời của công cụ có mã phiên của từng bot (giao diện vẽ nhánh).
- Giới hạn: tối đa 4 bot mỗi lần, 6 bot chạy cùng lúc; mỗi bot một việc mỗi lần; không giao cho Commander.

## Công cụ `tao_the` (chỉ Commander, bước 3c)

Chia một việc lớn thành tối đa 12 thẻ trên bảng việc của Team, chưa giao ai. Mỗi thẻ có tiêu đề, nội dung, và `sau`: các thẻ phải xong trước (mã `task-n` có sẵn hoặc tiêu đề một thẻ ghi trước trong cùng lần). Sau đó Commander giao từng thẻ sẵn sàng bằng `giao_viec` với `the`.

## Việc lớn của phòng ban: `giao_phong` (chỉ Commander, bước 3d)

- Tham số: `phong` (tên phòng, có hay không chữ "Phòng" đều được), `tieu_de`, `noi_dung` (đủ ngữ cảnh để trưởng nhóm tự chia). Phòng phải có trưởng nhóm.
- aris mở **một phiên mới cho trưởng nhóm** trong cùng workspace với phiên giao (dự án thì nằm trong dự án), đánh dấu là phiên giao việc, rồi gửi bản giao việc. Bản ghi việc lớn ở kho `aris_commander`, bảng `jobs`: phòng, trưởng nhóm, tiêu đề, việc, phiên giao, phiên trưởng nhóm, trạng thái (`running`, `done`, `failed`), báo cáo.
- Trưởng nhóm có ngữ cảnh riêng (`jobContext`): chia việc bằng `tao_the`, giao bằng `giao_viec` **chỉ cho thành viên phòng mình** (giao người ngoài phòng bị từ chối, nêu rõ lý do), tự làm phần nhỏ, cuối cùng trả một báo cáo gọn. Trưởng nhóm được lập đội (`spawn_teammate`) trong phiên việc lớn; Team của phiên đó là bảng việc riêng của phòng.
- Giới hạn: tối đa 3 việc lớn đang chạy cùng lúc.
- **Chốt việc lớn**: đọc thẳng log phiên trưởng nhóm (không đánh thức phiên). Xong khi trưởng nhóm đã xong ít nhất một lượt, có câu trả lời, và phiên trưởng nhóm cùng mọi phiên thành viên của đội đó đều rảnh; câu trả lời cuối của trưởng nhóm là báo cáo. Lượt lỗi thì việc lớn thành `failed`. Xét lại khi trưởng nhóm xong lượt, khi xem danh sách việc lớn, và 5 giây sau khi aris khởi động, nên aris chạy lại giữa chừng vẫn chốt được.
- Chốt xong, báo cáo được gửi vào phiên giao (xếp hàng), Commander đọc và trả lời người dùng.
- `GET /api/aris/commander?jobs=1`: 30 việc lớn gần nhất kèm tiến độ (thẻ xong / tổng thẻ trên bảng việc của trưởng nhóm). Dịch vụ `arisJobs` (`list`, `forWorkspace`, `progressOf`) cho Kanban của dự án.

## Phòng nhóm của dự án: `moi_noi` (chỉ Aris, phiên chính của dự án, bước 3e)

Phiên chính của dự án là phòng chung (bản vẽ `Phong2.dc.html`); Aris điều phối.

- **Mở cuộc bàn**: người dùng nhắn `@all`, gọi `@tên` một hay vài bot, hoặc bảo cả nhóm bàn. Aris gọi `moi_noi` với `bot` (tên gọi, theo thứ tự nói; bỏ trống là mọi thành viên dự án) và `loi_moi` (cần bàn gì ở vòng này). Mỗi lần gọi là **một vòng**; công cụ đợi hết vòng rồi trả các tin cho Aris.
- **Bot nói lần lượt và nghe được nhau**: mỗi bot là một thành viên trong Team của phiên chính (lần đầu tạo, lần sau nhắn tiếp, nên bot nhớ cả cuộc bàn). Lời mời gửi bot chỉ chứa tin mới trong phòng từ lần trước bot nói (người dùng, Aris, đồng đội). Bot trả lời ngắn, có thể hỏi lại bằng `@tên`; không có ý mới thì trả lời `BỎ LƯỢT` (không tính tin). Câu trả lời cuối của lượt bot (đọc từ sự kiện phiên của bot) là tin trong phòng.
- **Luật của dự án**: tối đa `maxRounds` vòng và `maxMessages` tin của các bot cho mỗi tin của người dùng. Hết vòng hoặc hết tin thì công cụ từ chối mở thêm và bảo Aris tổng hợp. Mỗi bot nói tối đa 4 phút.
- **Bot không được mời nói**: không thuộc dự án, đang làm việc khác, đã bị bảo dừng, hết tin: ghi thành dòng ghi chú có lý do.
- **Điều phối** (ngữ cảnh `aris:project` của phiên chính): vòng sau chỉ mời ai bị hỏi lại hoặc còn ý trái nhau; bàn xong thì Aris gộp ý (nếu `arisSummarizes`); cần người dùng chọn hướng thì hỏi bằng `ask_user_question`; việc sinh ra thì chia thẻ bằng `tao_the`.
- **Lệnh dừng**: tin người dùng "dừng @tên" (khi `stopCommand` bật) bỏ bot đó khỏi các vòng sau tới khi được gọi lại, bot đang nói thì bị dừng; "dừng phòng" và nút **Dừng phòng** dừng cả cuộc bàn (bot đang nói bị dừng, công cụ trả về, Aris tóm tắt ngắn). Chỉ tin người dùng gõ (`source.kind = user`) mới tính; ngữ cảnh chạy dsh ghi vai người dùng thì bỏ qua.
- **Lưu trữ**: bảng `rounds` của kho `aris_commander`, khoá theo mã lần gọi công cụ: vòng, số tin đã dùng, ai đang nói, các tin. Đếm vòng và tin của lượt chỉ trong bộ nhớ; vòng đang chạy lúc aris tắt được ghi là đã dừng.
- **Đường máy chủ**: `GET /api/aris/commander?round=<mã lần gọi>` (một vòng), `GET ?room=<phiên>` (trạng thái phòng), `POST {op: 'room-stop', session}`.
- **Giao diện** (`@aris/ui-chat`): mỗi lần gọi `moi_noi` vẽ thành các tin của bot (linh vật, tên · vai · giờ, chữ đậm, `@tên` nổi màu), ghi chú "bỏ lượt" hay lý do không nói, dấu "đang nghĩ" của bot đang nói. Thanh phòng trên ô nhập (chỉ phiên chính): "Vòng 2/3 · 6/10 tin", ai đang nói, bot đã dừng, nút Dừng phòng khi đang bàn hoặc Gửi cả phòng (chèn `@all`). Cột phải của dự án: bot đang nói hiện "đang nghĩ", bot đã nói, bỏ lượt hay bị dừng trong lượt này hiện đúng như vậy; bot chưa được mời hiện trạng thái chung. Mỗi tin của bot (và dòng bỏ lượt, lý do không nói) được ghi thành bản ghi `plugin:aris/room-say` trong phiên chính ngay khi bot nói xong; khung chat đăng ký kiểu dòng `aris-room-say` ở mức lượt (`groupTree: 'turn'`), nên mỗi bot là một tin riêng, không bị gập vào phần quá trình của Aris khi lượt xong. Lần gọi `moi_noi` chỉ còn dòng "Vòng n/3" và ai đang nói. Mỗi tin của bot nằm trong khung riêng (linh vật, tên đậm, vai trò · giờ). Sau một vòng, khi Aris bắt đầu trả lời, aris ghi bản ghi `plugin:aris/room-lead` đặt ngay trước câu trả lời: khung chat vẽ đầu tin "Aris · Điều phối · giờ", để lời điều phối không nhập vào tin của bot ngay trên. Aris không chép lại lời bot, chỉ kết luận và nêu bước tiếp theo.

## Thẻ tự đánh dấu xong

Khi một thành viên đội kết thúc lượt bình thường (`turn/end` hoàn tất), aris dùng chính agent của thành viên (chủ thẻ, có quyền) đánh dấu xong **thẻ đang làm cũ nhất** nó giữ. Lượt lỗi thì thẻ giữ nguyên. Giả định: mỗi lần giao là một lượt của bot; bot giữ nhiều thẻ thì lần lượt từng thẻ theo thứ tự giao.

## Nhật ký định tuyến

- Bản ghi `plugin:aris/dispatch` trong log phiên Commander: bot, tiêu đề, việc, lý do, phiên của bot, thẻ.
- Kho `aris_commander` (bảng `dispatch`) cho trang 2.5: `GET /api/aris/commander` trả 50 lần giao gần nhất.

## Luật đội

- Chỉ phiên của Commander (phiên chưa gắn bot) dùng được `giao_viec`.
- Bot thường không tự lập đội: `spawn_teammate` bị chặn ở phiên của bot thường (móc `tools/pre-execute`). Bot vẫn nhắn đồng đội được (`send_message`). Trưởng nhóm phòng ban lập Team riêng trong phiên việc lớn (bước 3d).
- Hướng dẫn giao việc (khi nào tự làm, khi nào giao, giao song song hay nối tiếp) là ngữ cảnh động `aris:commander`, chỉ nạp ở phiên của Commander.

## Xếp mức việc: nhỏ, vừa, lớn

Hướng dẫn `aris:commander` bắt Commander xếp việc theo thước đo đếm được, không theo cảm giác:

| | Việc nhỏ | Việc vừa | Việc lớn |
|---|---|---|---|
| Số phần độc lập | 1 | 1 (hoặc vài phần rời, mỗi phần một chuyên môn) | từ 2 trở lên |
| Kỹ năng | Commander tự làm được | đúng chuyên môn một bot | nhiều vai trong cùng một phòng |
| Độ dài | vài bước | một lượt làm việc dài | nhiều lượt, cần tổng hợp |
| Cách làm | tự làm | `giao_viec` (nối tiếp thì `tao_the`) | `giao_phong` |

Luật: lời người dùng là trên hết; đứng giữa hai mức thì chọn mức nhỏ hơn; việc lớn mà không phòng nào đủ chuyên môn thì chia thẻ, giao từng bot; không xếp được thì hỏi lại một câu; khi giao thì nói một câu đã xếp mức nào và vì sao. Để xếp đúng phòng, `<aris-bot>` liệt kê phòng ban kèm việc phòng lo và trưởng nhóm.

Chạy thử thật (24/10): dịch một câu → nhỏ, tự làm; một bài Facebook → vừa, Thơ; chiến dịch ra mắt (nghiên cứu, 5 bài, kịch bản bán) → lớn, phòng Tăng trưởng; tìm hiểu đối thủ rồi viết bài so sánh → vừa, 2 thẻ nối tiếp Minh → Thơ.

## Model của bot

Phiên của bot được giao việc (gắn qua đội) chạy bằng model riêng của bot, nếu có (`@aris/providers` đổi cấu hình gọi ở `agent/request`, trước thứ tự dự phòng). Phiên anh chat thẳng với bot đã chọn model lúc mở nên không bị đè.

## Trạng thái trực tiếp (`@aris/bots`)

Suy từ sự kiện phiên của bot: đang chạy là "đang làm", đang đợi duyệt hoặc câu hỏi là "chờ anh", lượt vừa xong là "xong" hoặc "lỗi" (hiện 30 phút), còn lại "rảnh". Việc gần đây: 30 mục gần nhất (nhận việc, xong, lỗi, chờ anh). Chỉ giữ trong bộ nhớ. `GET /api/aris/bots?live=1`.

## Giao diện

- Trang Phòng ban: thẻ "Việc lớn phòng đang nhận" (tiêu đề, dự án, tiến độ, trạng thái, nút Mở phiên trưởng nhóm).
- Kanban của dự án: việc lớn là một thẻ có nhãn "Phòng X", thanh tiến độ, nằm ở cột Đang làm hoặc Chờ theo trạng thái phiên trưởng nhóm, xong thì sang Xong.
- Thanh bên: trạng thái và việc đang làm của từng bot.
- Sơ đồ 3D, Bản đồ đội: trạng thái thật.
- Cột phải: việc gần đây thật.
- Khung chat: mỗi lần `giao_viec` vẽ các nhánh theo bot (đã nhận → đang làm → xong), bấm để mở phiên của bot.
- Trang Commander (2.5): bot nhận việc, giới hạn, quyết định định tuyến gần đây từ nhật ký.
- Ai đang nói (bản vẽ 1.7, `@aris/ui-chat`, `Speaker.tsx`, `who-data.ts`):
  - Mỗi lượt trả lời có đầu tin: linh vật, tên, nhãn vai ("Điều phối" cho Aris, chức danh cho bot, "bot ngoài · Claude Code" cho bot ngoài) và giờ. Người trả lời là bot của phiên (`useSessionBot`): phiên của Aris là Aris, phiên riêng của bot là bot đó. Đầu tin là một nút sự kiện riêng (`aris-turn-head`, theo `turn/start` và sự kiện trả lời sớm nhất của lượt), ở tầng `input` để đứng trên khối "quá trình" của dsh.
  - Tên thành viên: `@tên gọi` của bot trong đội thành phần tử linh vật và tên, nền theo màu linh vật, bấm mở hồ sơ bot. Trong tin của người dùng dùng quy tắc chữ của dsh (`userText`, thứ tự 20, trước quy tắc tệp 30). Trong câu trả lời của bot, Markdown của dsh không có chỗ cắm cho chữ thường nên aris thay trong DOM sau khi chữ đứng yên (`mentions-dom.ts`); dsh vẽ lại đoạn nào thì aris trả đoạn đó về chữ của React rồi mới thay lại.
  - Kết quả bot gửi về phiên (bot ngoài, trưởng nhóm việc lớn) là tin nguồn `aris-bot` (`relay`: `sessionController.resolveAgent` rồi `agent.followup`), dsh coi là tin đánh thức lượt chứ không phải tin của người dùng. Khung chat vẽ thành thẻ của bot đó (`aris-bot-report`: đầu tin, dòng tình trạng, kết quả có chữ đậm, mã, tên thành viên, "Xem đầy đủ" khi dài) và ẩn dòng đánh thức lượt ngay sau. Không mở được agent thì gửi như tin thường.

## Bot ngoài (bước 4)

Bản vẽ 2.1b (Thêm bot ngoài) và 2.1c (nhánh giao việc), vẽ lại theo bộ chuyển tự viết. Bot ngoài là bot trong đội có cấu hình `external` (`@aris/bots`, `external.ts`): loại agent (`claude-code`, `codex`, `acp`), mức quyền, model, giới hạn phút, trần tiền (Claude Code), worktree, nhận giao việc hay không, lệnh khởi chạy (ACP).

- **Hai đường chạy**: máy có CLI của agent (`claude`, `codex`; `cli.ts` tìm theo PATH rồi các chỗ cài phổ biến vì launchd chạy với PATH tối thiểu) thì aris tự chạy CLI đó (bộ chuyển tự viết, `runtime: 'cli'`). Không có CLI, hoặc agent ACP, thì dùng plugin chính thức của dsh (`runtime: 'plugin'`, dự phòng).
- **Claude Code** (`claude-driver.ts`): `claude -p <lời giao> --output-format stream-json --verbose --permission-mode <mức> --permission-prompt-tool mcp__aris__approve --mcp-config <json> [--model] [--max-budget-usd] [--resume <phiên>]`. Luồng sự kiện thành từng bước (`tool_use` mở bước, `tool_result` đóng bước, đọc/sửa/ghi/chạy lệnh/tìm/web…), `result` cho câu trả lời cuối, chi phí, phiên. Chạm trần tiền thì vấp với lý do "Chạm trần tiền".
- **Codex** (`codex-driver.ts`): `codex app-server`, JSON từng dòng (kiểu sinh từ chính bản đang cài bằng `codex app-server generate-ts`): `initialize` → `thread/start` hoặc `thread/resume` (thư mục, chính sách duyệt, sandbox) → `turn/start`. `item/started`/`item/completed` thành bước (lệnh, mỗi tệp đổi một bước, tìm web, công cụ MCP), `turn/completed` là xong. Không đo chi phí (Codex không báo).
- **Mức quyền** (`EXTERNAL_PERMISSIONS`): Claude Code `manual` (mặc định, hỏi người dùng), `acceptEdits`, `dontAsk`, `auto`, `plan`, `bypassPermissions`; Codex `ask` (mặc định: `untrusted` + `workspace-write`, hỏi người dùng), `approve-for-me` (bộ duyệt tự động của Codex), `never`, `dangerously-bypass-approvals-and-sandbox`; ACP `reject`, `allow`. Đi đường plugin thì `manual` thành `dontAsk`, `ask` thành `never` (plugin chạy không người trông).
- **Hỏi người dùng** (`approval.ts`): `ApprovalHub` mở socket cục bộ `~/.aris/run/ap-<pid>.sock`. Claude Code hỏi qua máy chủ MCP tối thiểu `bin/approve-mcp.mjs` (chuyển `{run, tool_name, input}` vào socket, trả `allow`/`deny`); Codex hỏi bằng yêu cầu `item/commandExecution/requestApproval`, `item/fileChange/requestApproval`, `item/permissions/requestApproval` (và hai kiểu cũ). Yêu cầu chờ nằm trong `pending` của lần chạy, hiện thành thẻ trên nhánh và thanh duyệt trên ô nhập; trả lời ghi vào `answered` (ai bấm). Quá 15 phút không ai trả lời thì từ chối.
- **Ghi trạng thái theo hàng đợi**: bước, yêu cầu quyền, nút Dừng và lúc chốt cùng sửa một bản ghi; `updateRun` xếp các lần sửa của một lần chạy nối đuôi nhau để không mất yêu cầu đang chờ.
- **Làm tiếp**: giao lại cho cùng bot trong cùng phiên thì chạy tiếp phiên cũ của agent (`--resume` / `thread/resume`, `sessionRef`, `resumedFrom`), cùng thư mục hoặc worktree.
- **Giao việc**: `giao_viec` với bot ngoài không đi qua Team. Lời giao tự đủ (bot ngoài không thấy cuộc trò chuyện). Xong, vấp hay dừng thì aris báo về phiên giao bằng một tin "[Bot ngoài · việc <mã>] …" nguồn `aris-bot` (khung chat vẽ thành thẻ của bot, xem Giao diện). Bot ngoài không nhận thẻ Kanban, không vào phòng nhóm; bot tắt "nhận giao việc" thì từ chối. Đường plugin: `ctx.subagents.startActivation` với `delivery: 'parent'`.
- **Thư mục và worktree**: thư mục làm việc là thư mục hiện tại của phiên giao. Bật worktree và thư mục là repo git thì mỗi việc một worktree mới từ HEAD trên nhánh `aris/<tên gọi>-<tiêu đề>-<mã>`, đặt ở `~/.aris/worktrees/<repo>/`. Đường dẫn repo gốc trong nội dung việc đổi thành đường dẫn worktree (`inWorktree`), lời giao nói rõ chỉ đọc ghi trong worktree (sandbox của Codex chặn ghi ra ngoài). Thay đổi để nguyên cho người dùng xem rồi gộp.
- **Biến môi trường**: tiến trình agent không nhận biến tên kết thúc bằng `KEY`, `TOKEN`, `SECRET`, `PASSWORD` hay bắt đầu bằng `DSH_` (`childEnv`); agent dùng đăng nhập riêng của nó.
- **Giới hạn**: quá `timeoutMin` phút thì aris dừng lần chạy. Trần tiền mỗi việc (`budgetUsd`, 0,5–100 USD, mặc định 3) chỉ có ở Claude Code.
- **Lưu trữ**: bảng `externals` của kho `aris_commander`: bot, việc, phiên giao, thư mục, worktree, đường chạy, các bước, yêu cầu chờ và đã trả lời, chi phí, trần tiền, phiên agent, trạng thái (`running`, `done`, `failed`, `stopped` kèm lý do dừng), câu trả lời cuối, lời báo lỗi an toàn. Lần chạy dở lúc aris tắt được ghi là đã dừng. Nhật ký giao thức gọn (tên tin, không nội dung) ở `~/.aris/logs/external-<mã>.log`. Trạng thái trực tiếp của bot (thanh bên) theo `externalStart`/`externalWaiting`/`externalEnd` của `LiveTracker`.
- **Đường máy chủ**: `GET /api/aris/commander?externals=1` (CLI có không và phiên bản, gói plugin đã cài chưa, đã đăng nhập agent chưa), `GET ?external=<mã lần chạy>`, `GET ?approvals=<phiên>`, `POST {op: 'external-stop', run}`, `POST {op: 'external-approve', id, allow}`.
- **Giao diện**: hộp Thêm bot ngoài, tab "Bot ngoài" trong hồ sơ bot (đường chạy, mức quyền theo đường chạy, model, thời gian, trần tiền, worktree), nhánh trong chat: đã nhận (kèm worktree), từng bước (6 bước cuối và "+N bước trước"), thẻ hỏi quyền, chi phí, nút Dừng, xong với kết quả, vấp với lý do, đã dừng. Thanh duyệt trên ô nhập (`conversation.input.dock`) hiện yêu cầu đang chờ dù lượt của Aris đã gập.
- **Chạy ngầm**: bộ cài plugin của dsh gọi `pnpm`; `scripts/dsh.mjs` thêm các chỗ pnpm hay nằm vào PATH của tiến trình dsh (launchd chạy với PATH tối thiểu).

## Để sau

- `chuyen_giao` (bot nhận việc trả lời thẳng chủ nhân): bước 5, cùng kênh riêng của bot.
- Duyệt ngay trên nhánh cho bot trong đội: giai đoạn 3 (Hộp duyệt). Bot ngoài đã có (bước 4).
- Trần ngân sách mỗi việc: giai đoạn 7.
