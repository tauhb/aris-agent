# aris-agent

Autonomous personal agent built on the DeepSeek Harness runtime (independent implementation; Hermes Agent is studied for design, no code copied or imported).

## Chạy thử

Cần Node 22.19+ và pnpm 10.

```bash
pnpm install
pnpm build
pnpm aris:setup
```

`aris:setup` tạo ba profile `aris` (web), `aris-acp`, `aris-headless` trong `.dsh-home/` của repo. Sau đó:

| Lệnh | Làm gì |
|---|---|
| `pnpm aris` | Mở Web UI của aris |
| `pnpm aris:ask "…"` | Hỏi một câu rồi thoát (cần `DEEPSEEK_API_KEY`) |
| `pnpm aris:acp` | Phục vụ ACP qua stdio cho IDE, Buzz Desktop |
| `pnpm aris:spike` | Bắt tay ACP và kiểm tra plugin aris đã nạp |
| `pnpm check` | Build, lint, định dạng, test, chặn Hermes, quét giấy phép |

## Tài liệu

- [Phân tích kiến trúc](docs/phan-tich-kien-truc.md)
- [Tính năng](docs/tinh-nang-aris.md)
- [Kế hoạch triển khai](docs/ke-hoach-trien-khai.md) · [Kết quả giai đoạn 0](docs/spikes/giai-doan-0.md)
- [Thiết kế giao diện](design/README.md)
