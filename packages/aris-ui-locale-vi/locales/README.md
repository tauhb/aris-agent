# Bản dịch tiếng Việt của Web UI dsh

- `en.snapshot.json`: mọi chuỗi tiếng Anh của dsh đã ghim, sinh bởi `node scripts/ui/extract-strings.mjs packages/aris-ui-locale-vi/locales/en.snapshot.json`. Đừng sửa tay.
- `vi.json`: bản dịch, cùng namespace và khoá với bản tiếng Anh. Phải giữ nguyên mọi biến `{tên}`.
- Kiểm tra độ phủ và chuỗi lỗi thời: `node scripts/ui/locale-coverage.mjs`.

## Thuật ngữ

| Tiếng Anh | Tiếng Việt | Ghi chú |
|---|---|---|
| Session | Phiên | |
| Workspace | Phòng | Nghĩa thư mục thì dùng "thư mục làm việc" |
| Agent | Bot | |
| Agent preset | Mẫu bot | |
| Subagent | Bot con | |
| Tool | Công cụ | Tên tool giữ nguyên |
| Turn / Step | Lượt / Bước | |
| Queue / Steer | Xếp hàng / Chèn vào việc | |
| Approval / Permission | Duyệt / Quyền | |
| Automation task / Schedule | Routine / Lịch | |
| Trajectory | Diễn biến | |
| Plugin, Skill, Model, Token, Prompt cache | giữ nguyên | |
| Settings | Cài đặt | |

Văn phong: nhãn ngắn, viết hoa chữ đầu, không dấu chấm cuối; câu thông báo nói như người với người, không "vui lòng".
