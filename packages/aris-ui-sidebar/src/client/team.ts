/**
 * Đội hình hiển thị ở thanh bên. Giai đoạn 0 chưa có dịch vụ đội bot (giai đoạn 2),
 * nên đây là đội mẫu theo canvas; `aris-bots` sẽ thay bằng dữ liệu thật.
 */
import type { BotStatus } from '@aris/ui-kit'

export interface TeamMember {
  id: string
  name: string
  /** Dòng phụ: việc đang làm hoặc vai. */
  note: string
  status: BotStatus
}

export interface TeamGroup {
  label: string
  members: TeamMember[]
}

export const COMMANDER: TeamMember = {
  id: 'aris',
  name: 'Aris',
  note: 'Chỉ huy · điều phối 2 việc',
  status: 'working',
}

export const DEMO_TEAM: TeamGroup[] = [
  {
    label: 'Nghiên cứu',
    members: [{ id: 'lam', name: 'Lâm', note: 'đang đọc 12/20 nguồn', status: 'working' }],
  },
  {
    label: 'Vận hành',
    members: [
      { id: 'mai', name: 'Mai', note: 'đợi anh cho gửi thư', status: 'waiting' },
      { id: 'tin', name: 'Tín', note: 'kiểm số dư lúc 5 giờ chiều', status: 'idle' },
    ],
  },
  {
    label: 'Sáng tạo · Kỹ thuật',
    members: [
      { id: 'ha', name: 'Hạ', note: 'xong bài sáng nay', status: 'done' },
      { id: 'dev', name: 'Dev', note: 'rảnh', status: 'idle' },
    ],
  },
]

/** Số việc đang chờ anh duyệt (mẫu; giai đoạn 3 lấy từ hộp duyệt). */
export const DEMO_PENDING_APPROVALS = 3

/** Chi phí model hôm nay so với ngân sách, đơn vị USD (mẫu; giai đoạn 5 lấy từ sổ chi phí). */
export const DEMO_COST = { spent: 0.42, budget: 5 }
