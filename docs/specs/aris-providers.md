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

## Để sau trong giai đoạn 1

- **Thứ tự dự phòng giữa các nhà cung cấp** khi một bên lỗi hoặc hết hạn mức. dsh chỉ thử lại trong cùng nhà cung cấp (`dsh-llm-retry`), nên aris cần lớp chuyển nhà cung cấp riêng.
- **Xoay vòng nhiều khoá** của cùng một nhà cung cấp.
- **Giá từng model** và chi phí theo ngày (gắn với dòng "0,42 / 5 USD" ở chân thanh bên).
