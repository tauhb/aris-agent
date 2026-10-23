# Đặc tả provider và model (giai đoạn 1, bước 2)

## Nguyên tắc: dựng trên lõi của dsh, không làm lõi riêng

dsh đã có đủ phần lõi:

- **`dsh-llm-pi-ai`**: định tuyến tới mọi nhà cung cấp mà thư viện pi-ai biết (Anthropic, OpenAI, Google, OpenRouter, Groq, Mistral, xAI, Ollama…), cộng route tuỳ chỉnh (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages) với `baseURL` và danh sách model riêng.
  - Cấu hình nằm trong tài liệu cài đặt và đổi lúc chạy, không cần khởi động lại.
  - Khoá lưu trong kho bí mật (`credentials`), chỉ ghi không đọc lại.
- **`dsh-llm-deepseek`**: route DeepSeek chính thức.
- **Trang "Model" của dsh**: nhập khoá, thêm nhà cung cấp có sẵn, thêm API tuỳ chỉnh, tự dò danh sách model của endpoint, sửa cửa sổ ngữ cảnh / loại đầu vào / mức suy luận.
- **Viên chọn model trong khung chat và lệnh `/model`**: đổi model cho phiên đang mở, có hiệu lực từ lượt kế tiếp. Đã chạy thật.

Vì vậy aris không viết lại các phần trên. aris gom chúng về **một chỗ** là trang 6.2 và thêm phần riêng của aris.

## Trang 6.2 "Provider và model"

Bố cục theo canvas, mọi số liệu là thật, đọc và ghi thẳng vào dịch vụ của dsh (trang không giữ bản sao):

- **Cột trái, danh bạ nhà cung cấp**: `llm.listProviders` (route đang chạy) nối với `llm.listConfigurableProviders` (route cấu hình được), giống trang Model của dsh. "Đã kết nối" là route đã có hồ sơ hoặc đang chạy, chấm màu cho biết có khoá chưa; "Có sẵn" là phần còn lại (hiện 6, bấm để xem hết). Ô tìm không phân biệt dấu. Route dsh chỉ trả mã thì aris đặt tên quen (`openai` → OpenAI).
- **Giữa, provider đang chọn**:
  - **Khoá API** chỉ ghi (`credentials.set`), không đọc lại. Tên khoá là tên hồ sơ ghi (`apiKeyEnv`) hoặc `<ROUTE>_API_KEY`, đúng quy ước của dsh. Route pi-ai chưa có hồ sơ thì nút là "Kết nối": tạo hồ sơ có `apiKeyEnv` rồi lưu khoá. Khoá lấy từ biến môi trường thì chỉ báo, không sửa.
  - **Base URL** ghi vào hồ sơ (`baseURL`), để trống là dùng endpoint mặc định của route.
  - **Kiểm tra kết nối**: gọi thử một model đang phục vụ qua plugin máy chủ `@aris/providers` (`POST /api/aris/providers/probe`), đo thời gian tới chữ đầu. Không dùng việc dò model của dsh để đo, vì route dsh biết sẵn model thì trả lời mà không gọi mạng. Lỗi được đọc ra lý do dễ hiểu: khoá sai (401), tài khoản chưa có tiền (402, OpenRouter chưa nạp credit thì chỉ model free chạy), model không có hoặc khoá không được dùng (404, danh mục sẵn của dsh có thể cũ hơn nhà cung cấp), giới hạn tốc độ (429), quá thời gian; lời gốc của nhà cung cấp mở xem được. Model chỉ chạy lô (`:batch` của OpenRouter) không có trong ô chọn để thử và để chat.
  - **Bảng model**: model đang phục vụ (`session.modelCatalog`), model tự khai trong hồ sơ, và model vừa "Tải danh sách mới" (`llm.discoverModels`). Model trong danh mục sẵn của provider luôn bật; model tải về thì tích để thêm vào `models` của hồ sơ (route pi-ai). Năng lực: suy luận, đọc ảnh, cửa sổ ngữ cảnh. Cột Giá để sau.
- **Thêm provider tuỳ chỉnh**: tên, mã route, Base URL, kiểu API (tương thích OpenAI Chat Completions, OpenAI Responses, tương thích Anthropic), khoá (không bắt buộc) → "Dò model" → tích model → ghi `llm-pi-ai` `providers.<mã>` rồi lưu khoá.
- Trang nằm trong khung Cài đặt như các mục khác (cột điều hướng Cài đặt | danh bạ | chi tiết). Mục "Model" của dsh bỏ khỏi nhóm "Hệ thống (DeepSeek Harness)"; không còn hộp "Nâng cao" (thêm provider tuỳ chỉnh đã có ở trang này).
- **Cột phải, model theo việc**: mỗi việc của canvas một dòng:

| Việc | Hiện trạng |
|---|---|
| Chat với bot (mặc định cho phiên mới) | Chỉnh được: ghi `agent-default-model` (`provider`, `model`), có hiệu lực từ phiên mới. Phiên đang mở đổi bằng viên chọn model hoặc `/model` |
| Nén ngữ cảnh, đặt tên phiên | Theo model của phiên. dsh có trường cấu hình (`compaction-basic`, `session-title-llm`) nhưng máy chủ không mở chúng cho trang cài đặt sửa lúc chạy, chỉ sửa được trong `cordis.patch.yml` |
| Rút ký ức (aris) | Theo model nén |
| Tóm tắt khi tìm lại, nhúng (tìm ngữ nghĩa) | Bước 3 (`aris-recall`) |
| Commander điều phối | GĐ2. Model cho bot con nằm ở namespace `subagent-model-selection` của dsh |
| Vòng học nền, giám khảo mục tiêu, kiểm thử skill | GĐ3 |

- **Thứ tự dự phòng**: hiện các provider đã kết nối và có khoá, provider mặc định đứng đầu; chưa có tác dụng (xem dưới).

Lưu ý: route DeepSeek chính thức của dsh gọi endpoint tương thích Anthropic (`https://api.deepseek.com/anthropic`).

Trang aris chỉ chờ `slots` và `locale` khi kích hoạt, các dịch vụ khác lấy lúc dùng. Lý do: trang Cài đặt của aris và plugin "Chung" của dsh cùng muốn khai báo chỗ cắm `settings.section`, ai sau bị từ chối; dsh phải chờ kết nối nên aris kích hoạt trước.

## Bước 6: dự phòng, nhiều khoá, giá (giai đoạn 1)

Plugin máy chủ `@aris/providers` thêm ba phần. Dữ liệu ở storage domain `aris_providers` (bảng `chain`, `pools`, `ledger`, `switches`). Khoá vẫn nằm trong kho khoá của dsh.

### Thứ tự dự phòng

- Chuỗi `[{ provider, model }, …]` chỉnh ở trang 6.2 (thêm, bớt, đổi thứ tự). Chuỗi rỗng thì không dự phòng.
- Móc vào hai waterfall của vòng agent, đăng ký `prepend` để đứng ngoài bộ chọn model của dsh (bộ này ghi đè provider/model ở mỗi lần gọi):
  - `agent/request-error`: mỗi lần gọi model lỗi.
  - `agent/request`: mỗi lần gọi, kể cả lần thử lại, trả cấu hình gọi đã đổi provider/model.
- Phân loại lỗi (theo `failure.code` và `status`):

| Lỗi | Việc |
|---|---|
| `AUTH`, `QUOTA`, `ACCOUNT_QUOTA` (401, 402, 403) | Đổi khoá nếu provider còn khoá khác; hết khoá thì chuyển ngay sang mắt xích kế tiếp |
| `RATE_LIMIT` (429) | Đổi khoá nếu còn; hết khoá thì để `dsh-llm-retry` thử lại (tối đa 5 lần, chờ dần tới 10 giây), vẫn hỏng mới chuyển |
| `SERVER`, `TIMEOUT`, `TRANSPORT`, `EMPTY_RESPONSE` | Để `dsh-llm-retry` thử lại trước, vẫn hỏng mới chuyển |
| 404 (model không có), 413 (model không nhận nổi yêu cầu cỡ này, ví dụ Groq miễn phí giới hạn 8.000 token mỗi phút) | Chuyển ngay |
| `CONTEXT_WINDOW_EXCEEDED` (tràn ngữ cảnh; pi-ai cũng gắn nhãn này cho lỗi 413 "quá giới hạn token mỗi phút" của Groq) | Để dsh nén ngữ cảnh trước; không cứu được thì chuyển (model sau có thể có cửa sổ lớn hơn) |
| Còn lại (yêu cầu sai, ảnh quá lớn…) | Không đụng: để dsh xử lý (bỏ bớt ảnh…) |

- Mắt xích kế tiếp: đứng sau model đang lỗi trong chuỗi; model đang lỗi không nằm trong chuỗi thì bắt đầu từ đầu chuỗi. Bỏ qua mắt xích đã lỗi trong lượt này và mắt xích có cửa sổ ngữ cảnh nhỏ hơn số token lần gọi gần nhất của phiên. Hết chuỗi thì lỗi đi tiếp như cũ (lượt kết thúc báo lỗi).
- Chuyển chỉ có hiệu lực **trong lượt đó**. Lượt sau bộ chọn model của dsh đưa về model đã chọn (dsh tự chèn dòng báo đổi model). Phiên không có model chọn thì aris tự trả về model cũ.
- Mỗi lần chuyển: ghi bản ghi `plugin:aris/provider-switch` vào log phiên (từ đâu, sang đâu, mã lỗi), và chèn một dòng thông báo vào phiên ("Đã chuyển sang … vì …"). Dòng này model cũng đọc, để nó biết mình đang chạy model khác.

### Nhiều khoá cho một provider

- Mỗi provider một "vòng khoá": khoá thứ nhất là khoá provider đang đọc (tên trong hồ sơ, ví dụ `OPENROUTER_API_KEY`). Khoá thêm lưu ở `<TÊN>_ARIS_2`, `<TÊN>_ARIS_3`… trong kho khoá của dsh. Khoá thứ nhất được chép sang `<TÊN>_ARIS_1` khi thêm khoá thứ hai.
- Đổi khoá = ghi giá trị của khoá kế tiếp vào tên provider đang đọc. Adapter của dsh đọc khoá ở mỗi lần gọi nên lần thử lại dùng khoá mới ngay.
- Một lần gọi lỗi chỉ đổi qua mỗi khoá một lần. Trang 6.2 hiện số khoá, khoá đang dùng, lần chạm giới hạn gần nhất. Trang không bao giờ đọc ngược giá trị khoá; mỗi khoá hiện bằng "mã nhận diện" 4 ký tự băm từ khoá (không lộ ký tự nào của khoá).

### Giá và chi phí

- Giá lấy từ bảng giá có sẵn của pi-ai (thư viện dsh-llm-pi-ai dùng): USD cho mỗi 1 triệu token vào, ra, đọc từ bộ nhớ đệm, ghi bộ nhớ đệm. Route DeepSeek chính thức (`deepseek-official`) tra theo bảng `deepseek` của pi-ai. Model không có trong bảng thì giá để trống.
- Sổ chi phí: mỗi `assistant/message` có `usage` được tính tiền theo provider/model của chính tin đó, cộng dồn theo ngày (giờ máy), theo provider và model.
- Trang 6.2: cột "Giá" trong bảng model (vào / ra mỗi 1 triệu token), "Chi phí hôm nay · 7 ngày" ở đầu cột phải. Chân thanh bên: "{số} USD hôm nay" thay số mẫu (trần ngân sách là giai đoạn 7).

### Đường máy chủ

`/api/aris/providers/state` (GET): chuỗi dự phòng, vòng khoá của từng provider (không có giá trị khoá), chi phí hôm nay và 7 ngày. `POST` với `op`:

| `op` | Việc |
|---|---|
| `chain` `{ chain }` | Ghi chuỗi dự phòng |
| `key-add` `{ provider, ref, value }` | Thêm khoá vào vòng khoá |
| `key-remove` `{ provider, slot }` | Bỏ một khoá thêm |
| `prices` `{ items: [{ provider, model }] }` | Giá của các model đang hiện |

## Để sau

- Giá cho provider tự thêm (nhập tay).
- Trần ngân sách theo ngày và theo bot (giai đoạn 7, trang 6.4).
