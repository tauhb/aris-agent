# Plan 8.5 · Danh mục connector cho Aris và các bot

Đọc trước `docs/plans/gd8-chung.md`. **Làm sau plan 8.1**, vì cần "kết nối dùng chung" của 8.1 (phần B) để một connector cấu hình một lần là cả đội dùng được.

## Hiện trạng

- Kết nối MCP theo bot nằm trong `packages/aris-bots/src/mcp.ts`. Có 4 mẫu: `github` (HTTP, header token), `lark` (stdio, `npx @larksuiteoapi/lark-mcp`), `notion`, `browser` (Playwright MCP); và `custom` để tự thêm. Khoá đi qua `secrets` (biến môi trường hay header).
- **Chưa có đăng nhập OAuth.** Phần lớn connector chính thức dạng "hosted" mới (Notion, Atlassian, HubSpot, Google Workspace, Slack, Canva…) cần OAuth.
- Gói `@modelcontextprotocol/client@2.2.0` (đã có trong `node_modules` qua dsh) có `authProvider` (`OAuthClientProvider`). Cần kiểm tra `@deepseek-ai/dsh-mcp-client` có cho truyền `authProvider` không.

## Danh sách đề xuất (Opus tra ngày 26/10)

Chọn theo các công cụ người dùng đang dùng (thấy trong phiên làm việc) và các connector chính thức phổ biến. Cột "Tình trạng" là kết quả tra từ các bài tổng hợp năm 2026, chưa kiểm trực tiếp. **Sonnet phải kiểm lại từng connector trên trang tài liệu của chính hãng trước khi làm.**

| Nhóm | Connector | Dạng | Đăng nhập | Tình trạng |
|---|---|---|---|---|
| Đã có | GitHub, Lark, Notion (cục bộ), Trình duyệt | có mẫu | token / app | chạy được |
| Công việc | **Google Workspace** (Gmail, Lịch, Drive, Chat) | hosted | OAuth | chính thức, preview, có ghi |
| Công việc | **Notion** (`mcp.notion.com/mcp`) | hosted | OAuth | chính thức; Notion ưu tiên bản hosted |
| Công việc | **Slack** | hosted | OAuth | chính thức |
| Công việc | **Atlassian** (Jira, Confluence; `mcp.atlassian.com/v2/mcp`) | hosted | OAuth | chính thức |
| Công việc | Asana, Linear, ClickUp, Monday | hosted | OAuth | kiểm lại từng cái |
| Bán hàng / CRM | **HighLevel (GHL)** | hosted | token | người dùng đang dùng; kiểm tài liệu |
| Bán hàng / CRM | **HubSpot** (`mcp.hubspot.com`) | hosted | OAuth | chính thức, GA 13/4/2026, có ghi |
| Nội dung | **Canva** | hosted | OAuth | chính thức |
| Nội dung | **Figma** | hosted | OAuth | chính thức (design-to-code) |
| Nội dung | **HeyGen** (`mcp.heygen.com/mcp/v1/`) | hosted | OAuth / token | người dùng đang dùng trong Codex |
| Quảng cáo | **Meta Ads** | hosted | OAuth | chính thức, beta từ 29/4/2026, ghi xong thì để tạm dừng; tuỳ tài khoản |
| Quảng cáo | **Google Ads** | tự chạy | OAuth + developer token | chính thức, chỉ đọc |
| Quảng cáo | TikTok Ads | hosted | OAuth | tin chưa thống nhất, tuỳ tài khoản |
| Phân tích | Klaviyo, Ahrefs, Similarweb, Supermetrics, Amplitude | hosted | OAuth / token | có trong bộ plugin người dùng; kiểm từng cái |
| Thương mại | Shopify (mỗi cửa hàng có MCP), Stripe | hosted | token / OAuth | kiểm lại |
| Tự động hoá | n8n (nút MCP Server Trigger), Zapier MCP | hosted / tự chạy | token | kiểm lại |
| Nội bộ | **Rainmaker** (MCP của công ty người dùng) | hosted | token | người dùng có sẵn; hỏi địa chỉ |
| Việt Nam | KiotViet, Haravan, Sapo, MISA | chưa thấy MCP chính thức | API key | dùng "Connector API" ở mục 4 |

Nguồn đã tra:
- [mcpservers.org · danh sách remote MCP](https://mcpservers.org/remote-mcp-servers)
- [blog.mcpservers.org · best MCP servers 2026](https://blog.mcpservers.org/posts/best-mcp-servers-2026)
- [openhelm.ai · best remote MCP servers 2026](https://www.openhelm.ai/blog/best-remote-mcp-servers-2026)
- [digitalapplied.com · Meta, Google, TikTok ra MCP quảng cáo](https://www.digitalapplied.com/blog/official-ads-mcp-servers-meta-google-tiktok-2026-playbook)
- [markifact.com · tình hình MCP quảng cáo 2026](https://www.markifact.com/blog/state-of-advertising-mcps)

## Điểm dừng 1 · Chốt danh sách làm trước

- Sonnet kiểm từng dòng in đậm trong bảng: địa chỉ, cách đăng nhập, có ghi được không, giấy phép (nếu tự chạy). Rồi đưa bảng đã kiểm cho người dùng.
- Người dùng chọn **đợt 1, khoảng 6–8 connector**. Gợi ý: Google Workspace, Notion, HighLevel, HubSpot, Canva, Meta Ads, HeyGen, Slack.
- Những connector còn lại vẫn nằm trong danh mục, đánh dấu "chưa kiểm".

## 1. Đăng nhập OAuth cho MCP hosted

- Làm theo đặc tả uỷ quyền của MCP: tìm metadata của máy chủ uỷ quyền, đăng ký client động nếu máy chủ hỗ trợ, PKCE, refresh token.
- **Trang gọi về (callback):** `/api/aris/mcp/oauth/callback` trên web aris, cùng cổng với dsh, có kiểm tham số `state`. Nếu máy chủ không cho địa chỉ `127.0.0.1` thì báo rõ cho người dùng.
- **Token** (access, refresh, thông tin client) lưu trong **Keychain** với tên `MCP_<mã kết nối>_OAUTH`. Không ghi vào bảng, không gửi lên giao diện.
- **Cách truyền token:** nếu `dsh-mcp-client` nhận `authProvider` thì dùng `OAuthClientProvider` của SDK. Không thì aris tự làm mới token và truyền qua header `Authorization`. Ghi rõ đã chọn cách nào.
- Token hết hạn mà làm mới không được: kết nối chuyển sang trạng thái "Cần đăng nhập lại" và báo chủ.
- **Test:** PKCE, `state`, làm mới token, hết hạn. Dùng máy chủ uỷ quyền giả.

## 2. Danh mục connector (`aris-bots/src/catalog.ts`)

- Mỗi mục gồm:
  - `id`, `name`, `category`, `vendor`, `official: boolean`, `status: 'verified' | 'unverified'`;
  - `transport`, `url` hay `command` + `args` (phiên bản ghim chính xác);
  - `auth: 'oauth' | 'token' | 'none'`, `keys` (tên khoá cần nhập);
  - `docs` (đường dẫn tài liệu chính hãng);
  - `writes: boolean`, `defaultAsk` (mặc định `write`);
  - `notes` (một câu lưu ý, ví dụ "Meta Ads: ghi xong để tạm dừng").
- `MCP_PRESETS` cũ chuyển thành các mục trong danh mục, giữ tương thích dữ liệu cũ.
- Connector chạy cục bộ bằng `npx` phải ghim phiên bản. Lần đầu tải gói thì **hỏi người dùng** (như đã làm với Playwright MCP).

## 3. Giao diện (vẽ trước, chờ duyệt)

Vẽ khung `DanhMucConnector.dc.html` trên trang `g2` hoặc `g6`:
- **Cài đặt › Tích hợp › "＋ Kết nối"** mở danh mục dạng lưới:
  - ô tìm, tab nhóm (Công việc, Bán hàng, Nội dung, Quảng cáo, Phân tích, Thương mại, Tự động hoá, Nội bộ, Khác);
  - mỗi thẻ có logo chữ (không dùng logo thương hiệu thật), tên, một dòng mô tả, pill "Chính thức" / "Chưa kiểm", và pill "Có ghi" nếu connector ghi được.
- **Bấm một thẻ:**
  - với OAuth: nút **"Đăng nhập <hãng>"** mở cửa sổ đăng nhập, xong thì quay lại;
  - với token: các ô khoá, `type=password`;
  - sau đó chọn phạm vi (Cả đội, phòng, bot, theo 8.1 B), mức hỏi (mặc định "hỏi trước khi ghi"), rồi nút **Kiểm tra**, hiện số công cụ.
- **Danh sách kết nối của đội** có trạng thái: chạy được, cần đăng nhập lại, lỗi.
- Hồ sơ bot hiện các connector dùng được.

**Điểm dừng 2:** chờ người dùng duyệt bản vẽ.

## 4. Connector API (cho dịch vụ không có MCP)

- Một mẫu "API của dịch vụ khác", cho KiotViet, Haravan, Sapo, MISA…: người dùng nhập địa chỉ gốc, kiểu xác thực (header hay query) và khoá. Tuỳ chọn dán thêm đặc tả OpenAPI (URL hoặc tệp).
- **Có đặc tả OpenAPI:** aris tự tạo công cụ cho từng thao tác (tối đa 40 thao tác; nhiều hơn thì cho người dùng chọn). Thao tác GET là chỉ đọc; POST, PUT, PATCH, DELETE thì hỏi trước.
- **Không có đặc tả:** chỉ có một công cụ `api_goi` với phương thức, đường dẫn tương đối và thân bài. Mọi lệnh gọi không phải GET đều hỏi.
- Chạy trong tiến trình aris, như một máy chủ MCP nội bộ, để dùng chung lớp kết nối, phạm vi và hỏi duyệt.
- **Điểm dừng 3:** việc này lớn. Hỏi người dùng có làm trong đợt này không, hay để sau. → 27/10: người dùng chọn **để sau**.

## 5. Thử thật

- Với từng connector của đợt 1: người dùng tự đăng nhập, rồi bấm Kiểm tra.
- Mỗi connector thử một câu chỉ đọc với một bot, ví dụ: "liệt kê 3 email mới nhất", "đọc trang Notion X", "lấy 5 liên hệ mới trên HighLevel".
- Thử một thao tác ghi để thấy hỏi duyệt, rồi **từ chối**.
- Báo chi phí.

## Test bắt buộc

- Danh mục: mọi mục hợp lệ; dữ liệu cũ của `MCP_PRESETS` vẫn đọc được.
- OAuth: xem mục 1.
- Phạm vi: dùng chung với test của 8.1 B.
- Connector API: phân tích OpenAPI, giới hạn 40 thao tác, phân loại đọc và ghi, chèn khoá vào header hay query.
- Cập nhật `docs/specs/aris-bots.md`.
