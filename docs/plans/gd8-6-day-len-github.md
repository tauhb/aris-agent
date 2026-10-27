# GĐ8.6 · Đẩy cả dự án aris lên GitHub (repo private)

Plan này chỉ để duyệt. **Chưa chạy lệnh nào ra ngoài.** Đẩy mã lên GitHub là việc khó rút lại (mã và lịch sử có thể bị lưu đệm), nên mỗi bước đẩy đều chờ anh nói "đẩy".

## 1. Hiện trạng đã kiểm (27/10/2026)

| Mục | Kết quả |
| --- | --- |
| Remote | **Chưa có** remote nào. |
| Nhánh | Toàn bộ công việc nằm ở `claude/fervent-bose-b47879` (225 commit trước `main`, `main` không có gì mới hơn). Còn `claude/sharp-jang-c8073d` (trùng `main`) và `aris/kiet-doc-readme-md-tom-tat-3-gach-adf9` (nhánh phụ của bot Kiệt). |
| Worktree | 4 cái, hai cái ngoài thư mục dự án (`~/.aris/worktrees/...`). Chúng không đẩy lên, chỉ nhánh được đẩy. |
| Tài khoản gh | Đã đăng nhập `tauhb` (giao thức https, quyền `repo`, `workflow`). Đủ để tạo repo private. |
| Bí mật | Quét 300 commit gần nhất tìm khóa kiểu `sk-`, `gho_`, `ghp_`, `AKIA`, khối private key: **không thấy**. Không có tệp `.env`, `.pem`, `.key` được theo dõi. Chỉ có `tokens.ts` là mã token thiết kế (màu), không phải khóa. |
| Dung lượng | 724 tệp, tệp lớn nhất 716 KB (`pnpm-lock.yaml`). Không có ảnh nhị phân, video hay zip. Thoải mái. |
| `.gitignore` | Đã loại `node_modules/`, `lib/`, `dist/`, `out/`, `.dsh-home/`, `design/canvas/.runtime/`. |
| Giấy phép | Chưa có `LICENSE` (repo private nên không bắt buộc). `pnpm check:licenses` chỉ kiểm giấy phép phụ thuộc, vẫn qua. |
| Tác giả commit | Cả 227 commit mang email `hoangbatau10x@gmail.com`. Trên GitHub, commit chỉ gắn vào tài khoản `tauhb` nếu email này đã thêm vào tài khoản đó (không thì vẫn đẩy được, chỉ là avatar không khớp). |
| Dữ liệu người dùng | Bảng, khóa kết nối MCP, token Lark, phiên chat nằm ở `~/.aris/` và thư mục dsh, **ngoài repo**, nên không lên theo. |

## 2. Quyết định cần anh chọn (em đề xuất sẵn)

1. **Tên repo**: đề xuất `tauhb/aris-agent`, private.
2. **Nhánh mặc định**: đề xuất đưa `main` lên bằng đúng nội dung nhánh hiện tại (`main` chỉ đang đứng sau, không có commit riêng, nên tua nhanh `main` đến `claude/fervent-bose-b47879` an toàn, không mất gì). Sau đó GitHub có `main` làm nhánh mặc định, các nhánh `claude/...` không cần đẩy.
3. **Nhánh phụ của bot Kiệt** (`aris/kiet-...`): đề xuất **không đẩy**, trừ khi anh muốn giữ.
4. **Lịch sử**: đề xuất đẩy nguyên lịch sử 227 commit (đã quét sạch bí mật). Nếu anh muốn gọn, có thể đẩy một commit duy nhất, nhưng mất mốc từng giai đoạn nên em không khuyên.

## 3. Các bước (mỗi bước ghi rõ có chạm ra ngoài hay không)

**Bước 1 · Soát lần cuối (cục bộ, không ra ngoài)**
- `git status` sạch (hiện đã commit hết, kể cả `6e2981e`).
- Quét sâu hơn toàn bộ lịch sử bằng công cụ chuyên dụng: nếu máy có `gitleaks` hoặc `trufflehog` thì chạy cả hai; không có thì dùng `git log -p --all` kèm mẫu regex rộng hơn (`api[_-]?key`, `secret`, `password`, `token`, `Authorization`, địa chỉ email lạ, đường dẫn `/Users/...` chứa thông tin riêng). Kết quả đưa anh xem trước khi qua bước 3.
- Mở các tệp có khả năng nhạy cảm để xác nhận chỉ là mã mẫu: `scripts/`, các `*.test.ts` nói về khóa/token (dùng giá trị giả), `docs/` (có nhắc email, tên người, ID Lark thật không).
- Chạy `pnpm check` đầy đủ, ra xanh mới đẩy.

**Bước 2 · Chuẩn bị tệp cho người vào repo (cục bộ)**
- `README.md` đã có; thêm đoạn "Chạy thử" nếu thiếu (cài `pnpm`, `pnpm install`, `pnpm build`, `node scripts/aris.mjs`), và ghi rõ repo private, dự án cá nhân.
- Thêm `.github/workflows/ci.yml` (tùy chọn, hỏi anh): chạy `pnpm install --frozen-lockfile && pnpm check` trên mỗi lần đẩy. Dùng Node đúng phiên bản trong `package.json` (`engines`), cache pnpm. Quyền `workflow` của token đã có.
- Không thêm `LICENSE` (anh giữ toàn quyền). Hỏi anh nếu muốn khác.

**Bước 3 · Tạo repo private (ra ngoài, cần anh nói "đẩy")**
```bash
gh repo create tauhb/aris-agent --private --description "aris: đội bot AI cá nhân trên DeepSeek Harness" --source . --remote origin
```
Sau lệnh, kiểm `gh repo view tauhb/aris-agent --json visibility` phải ra `PRIVATE`. Nếu không phải PRIVATE thì dừng ngay, không đẩy.

**Bước 4 · Đẩy mã (ra ngoài)**
```bash
git push origin claude/fervent-bose-b47879:main
git branch --set-upstream-to=origin/main claude/fervent-bose-b47879
```
- Chỉ đẩy một nhánh, không dùng `--all`, không dùng `--force`.
- Cùng lúc cập nhật `main` cục bộ: `git branch -f main claude/fervent-bose-b47879` (an toàn, `main` không có commit riêng) để cục bộ và GitHub khớp.

**Bước 5 · Cài đặt repo (ra ngoài, cần anh đồng ý từng mục)**
- Nhánh mặc định `main`.
- Bật bảo vệ cơ bản: cấm force-push và xóa `main`. Bật cảnh báo bí mật (`secret scanning`) và `push protection` nếu gói của tài khoản cho phép đối với repo private.
- Không mời cộng tác viên, không bật Pages, không bật Issues/Wiki trừ khi anh muốn.

**Bước 6 · Kiểm sau khi đẩy**
- `gh repo view` đúng private; `git ls-remote origin` chỉ có `main`.
- Clone sạch sang thư mục tạm trong scratchpad, `pnpm install --frozen-lockfile && pnpm build && pnpm test` để chắc repo tự đứng được, không phụ thuộc tệp nằm ngoài.
- Báo anh đường link và kết quả.

## 4. Làm về sau (không nằm trong lần đẩy này)

- Sao lưu cấu hình người dùng (`~/.aris/`) **không** đưa lên GitHub: nó chứa bảng dữ liệu và khóa kết nối. Việc sao lưu là mục "setup backup" anh để sau.
- Chuyển khóa MCP từ bảng aris sang Keychain (đã ghi nhận ở GĐ8.1 phần B).
- Nếu sau này đổi sang repo công khai: cần quét bí mật lại toàn bộ, thêm `LICENSE`, gỡ mọi tên, email, ID Lark thật khỏi `docs/` và bản vẽ.

## 5. Điểm dừng

Em dừng ở cuối Bước 2 và hỏi anh trước Bước 3. Anh chỉ cần trả lời: tên repo, nhánh phụ của Kiệt có đẩy không, có thêm CI không. Đẩy lên chỉ khi anh nói rõ "đẩy".
