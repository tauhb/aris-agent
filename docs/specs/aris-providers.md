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

- **Nhà cung cấp và khoá** (cột trái): chính trang "Model" của dsh, vẽ ngay trong trang aris qua chỗ cắm `settings.section` (mã `models`). Mục "Model" bị bỏ khỏi nhóm "Hệ thống (DeepSeek Harness)" để không còn hai chỗ.
- **Model theo việc** (cột phải): mỗi việc chọn một model trong danh mục mà dsh đang phục vụ (`session.modelCatalog`). Ghi thẳng vào cấu hình của gói dsh lo việc đó (`configForms`):

| Việc | Hiện trạng |
|---|---|
| Chat với bot (mặc định cho phiên mới) | Chỉnh được: ghi `agent-default-model` (`provider`, `model`), có hiệu lực từ phiên mới. Phiên đang mở đổi bằng viên chọn model hoặc `/model` |
| Tóm tắt khi nén ngữ cảnh, đặt tên phiên | Theo model của phiên. dsh có trường cấu hình (`compaction-basic`, `session-title-llm`) nhưng máy chủ không mở chúng cho trang cài đặt sửa lúc chạy, chỉ sửa được trong `cordis.patch.yml` |
| Rút ký ức khi nén (aris) | Theo model tóm tắt khi nén |
| Commander điều phối, giám khảo mục tiêu, kiểm thử skill | Hiện mờ, có ở GĐ2/GĐ3. Model cho bot con nằm ở namespace `subagent-model-selection` của dsh, dùng khi làm Commander |

## Để sau trong giai đoạn 1

- **Thứ tự dự phòng giữa các nhà cung cấp** khi một bên lỗi hoặc hết hạn mức. dsh chỉ thử lại trong cùng nhà cung cấp (`dsh-llm-retry`), nên aris cần lớp chuyển nhà cung cấp riêng.
- **Xoay vòng nhiều khoá** của cùng một nhà cung cấp.
- **Giá từng model** và chi phí theo ngày (gắn với dòng "0,42 / 5 USD" ở chân thanh bên).
