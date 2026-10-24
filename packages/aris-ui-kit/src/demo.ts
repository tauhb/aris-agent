/**
 * Dữ liệu mẫu theo canvas, dùng chung cho thanh bên và cột phải. Chưa có dịch vụ
 * đội bot (giai đoạn 2), hộp duyệt (giai đoạn 3), sổ chi phí (giai đoạn 1); mỗi
 * hằng `DEMO_*` được gỡ khi phần dữ liệu thật tương ứng có mặt.
 */
import type { BotStatus } from './status.js'

export interface TeamMember {
  id: string
  name: string
  /** Mã linh vật; bỏ trống thì dùng mã bot (đội mẫu cũ). */
  mascot?: string | undefined
  /** Tên gọi `@handle`. */
  handle?: string | undefined
  /** Vai trong đội, hiện khi rê chuột trên sơ đồ đội. */
  role: string
  /** Dòng phụ: việc đang làm. */
  note: string
  status: BotStatus
}

/** Phòng ban (quyết định 12): nhóm bền của Đội hình, có trưởng nhóm. */
export interface TeamGroup {
  id: string
  label: string
  /** Mã bot trưởng nhóm. */
  lead: string
  members: TeamMember[]
}

export const COMMANDER: TeamMember = {
  id: 'aris',
  name: 'Aris',
  role: 'Chỉ huy',
  note: 'Chỉ huy · điều phối 2 việc',
  status: 'working',
}

export const DEMO_TEAM: TeamGroup[] = [
  {
    id: 'research',
    label: 'Nghiên cứu',
    lead: 'lam',
    members: [
      { id: 'lam', name: 'Lâm', role: 'Nghiên cứu', note: 'đang đọc 12/20 nguồn', status: 'working' },
    ],
  },
  {
    id: 'ops',
    label: 'Vận hành',
    lead: 'mai',
    members: [
      { id: 'mai', name: 'Mai', role: 'Thư ký', note: 'đợi anh cho gửi thư', status: 'waiting' },
      { id: 'tin', name: 'Tín', role: 'Tài chính', note: 'kiểm số dư lúc 5 giờ chiều', status: 'idle' },
    ],
  },
  {
    id: 'creative',
    label: 'Sáng tạo · Kỹ thuật',
    lead: 'ha',
    members: [
      { id: 'ha', name: 'Hạ', role: 'Nội dung', note: 'xong bài sáng nay', status: 'done' },
      { id: 'dev', name: 'Dev', role: 'Lập trình', note: 'rảnh', status: 'idle' },
    ],
  },
]

/** Việc gần đây của đội cho cột phải "Đội bot lúc này" (mẫu; giai đoạn 2 lấy từ dịch vụ đội bot). */
export const DEMO_ACTIVITY: readonly { id: string; status: BotStatus; text: string; when: string }[] = [
  { id: 'lam', status: 'working', text: 'đọc nguồn thứ 12', when: 'vừa xong' },
  { id: 'mai', status: 'waiting', text: 'soạn xong thư, đợi anh', when: '3 phút' },
  { id: 'ha', status: 'done', text: 'học thêm 1 skill · lên cấp 2', when: '1 giờ' },
]
