/**
 * Dữ liệu mẫu theo canvas, dùng chung cho thanh bên và cột phải. Chưa có dịch vụ
 * đội bot (giai đoạn 2), hộp duyệt (giai đoạn 3), sổ chi phí (giai đoạn 1); mỗi
 * hằng `DEMO_*` được gỡ khi phần dữ liệu thật tương ứng có mặt.
 */
import type { BotStatus } from './status.js'

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

/** Việc gần đây của đội cho cột phải "Đội bot lúc này" (mẫu; giai đoạn 2 lấy từ dịch vụ đội bot). */
export const DEMO_ACTIVITY: readonly { id: string; status: BotStatus; text: string; when: string }[] = [
  { id: 'lam', status: 'working', text: 'đọc nguồn thứ 12', when: 'vừa xong' },
  { id: 'mai', status: 'waiting', text: 'soạn xong thư, đợi anh', when: '3 phút' },
  { id: 'ha', status: 'done', text: 'học thêm 1 skill · lên cấp 2', when: '1 giờ' },
]
