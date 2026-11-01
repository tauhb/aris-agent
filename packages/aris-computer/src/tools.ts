import {
  defineTool,
  type ParameterPropertySpec,
  type ParameterSchemaSpec,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools'

/**
 * Mô tả các công cụ điều khiển máy cho bot (tên tiếng Việt như các công cụ khác của aris). Lời dặn chung: ưu tiên bấm
 * theo mã phần tử lấy từ man_hinh_xem / man_hinh_tim; chỉ dùng toạ độ khi không có cách khác; toạ độ là điểm ảnh của
 * ảnh chụp cửa sổ gần nhất.
 */

export interface ToolSpec {
  name: string
  description: string
  parameters: ParameterSchemaSpec
}

const WIN: ParameterPropertySpec = {
  type: 'string',
  description: 'Cửa sổ dạng pid:mã_cửa_sổ, lấy từ man_hinh_xem. Bỏ trống là cửa sổ vừa làm.',
}
const POINT = (what: string): ParameterPropertySpec => ({
  type: 'object',
  required: true,
  description: `${what}: { x, y } theo điểm ảnh của ảnh chụp cửa sổ gần nhất.`,
  additionalProperties: false,
  properties: {
    x: { type: 'number', required: true, description: 'Toạ độ ngang trên ảnh chụp.' },
    y: { type: 'number', required: true, description: 'Toạ độ dọc trên ảnh chụp.' },
  },
})

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'man_hinh_xem',
    description:
      'Chụp một cửa sổ trên máy Mac của người dùng: trả danh sách cửa sổ đang mở, các phần tử bấm được (mã trong ngoặc vuông, vai, nhãn, tâm @x,y) và ảnh chụp nếu model đọc được ảnh. Gọi trước mỗi thao tác vì màn hình đổi sau mỗi lần bấm, gõ.',
    parameters: {
      ung_dung: {
        type: 'string',
        description:
          'Tên ứng dụng (ví dụ Notes, Finder) hay bundle id. Bỏ trống là cửa sổ vừa làm hay ứng dụng đang ở trước.',
      },
      cua_so: WIN,
    },
  },
  {
    name: 'man_hinh_tim',
    description:
      'Đọc cây phần tử (Trợ năng) của một cửa sổ, không chụp ảnh, rẻ hơn man_hinh_xem. Có tu_khoa thì chỉ trả phần tử khớp (nhãn, vai, giá trị). Dùng để lấy mã phần tử trước khi bấm.',
    parameters: {
      tu_khoa: {
        type: 'string',
        description: 'Chữ cần tìm trong nhãn hay giá trị, ví dụ "Lưu", "Ghi chú mới".',
      },
      ung_dung: { type: 'string', description: 'Tên ứng dụng hay bundle id.' },
      cua_so: WIN,
    },
  },
  {
    name: 'man_hinh_bam',
    description:
      'Bấm một phần tử. Ưu tiên phan_tu (mã từ man_hinh_xem / man_hinh_tim); chỉ dùng x, y khi phần tử không có mã (ứng dụng tự vẽ). Mã phần tử cũ sau mỗi lần chụp lại cửa sổ.',
    parameters: {
      phan_tu: { type: 'string', description: 'Mã phần tử, ví dụ "s3:12".' },
      x: { type: 'number', description: 'Toạ độ ngang trên ảnh chụp (khi không có mã).' },
      y: { type: 'number', description: 'Toạ độ dọc trên ảnh chụp (khi không có mã).' },
      nut: { type: 'string', enum: ['trai', 'phai'], description: 'Nút chuột, mặc định trai.' },
      so_lan: { type: 'number', description: '1 (mặc định), 2 là bấm đúp, 3 là bấm ba lần (chọn cả dòng).' },
      cua_so: WIN,
    },
  },
  {
    name: 'man_hinh_go',
    description:
      'Gõ chữ vào cửa sổ. Có phan_tu thì bấm vào ô đó trước để đặt con trỏ. Không gõ được vào ô mật khẩu (bị chặn): việc đăng nhập để người dùng tự làm.',
    parameters: {
      chu: { type: 'string', required: true, description: 'Chữ cần gõ; xuống dòng bằng \\n.' },
      phan_tu: { type: 'string', description: 'Mã ô nhập cần gõ vào.' },
      cua_so: WIN,
    },
  },
  {
    name: 'man_hinh_phim',
    description:
      'Bấm phím hay phím tắt, ví dụ "cmd+n", "cmd+shift+s", "enter", "esc", "tab". Phím khoá máy, đăng xuất, tắt máy, buộc thoát bị chặn.',
    parameters: { phim: { type: 'string', required: true, description: 'Phím tắt.' }, cua_so: WIN },
  },
  {
    name: 'man_hinh_cuon',
    description: 'Cuộn trong cửa sổ.',
    parameters: {
      huong: {
        type: 'string',
        required: true,
        enum: ['len', 'xuong', 'trai', 'phai'],
        description: 'Hướng cuộn.',
      },
      so_buoc: { type: 'number', description: 'Số bước, mặc định 3 (tối đa 20).' },
      x: { type: 'number', description: 'Cuộn tại điểm này trên ảnh chụp (bỏ trống là vùng đang chọn).' },
      y: { type: 'number', description: 'Toạ độ dọc của điểm cuộn.' },
      cua_so: WIN,
    },
  },
  {
    name: 'man_hinh_keo',
    description:
      'Kéo từ một điểm tới điểm khác trong cùng cửa sổ (ví dụ kéo thanh trượt, kéo tệp vào thư mục). Kéo vào Thùng rác bị chặn.',
    parameters: { tu: POINT('Điểm bắt đầu'), den: POINT('Điểm thả'), cua_so: WIN },
  },
  {
    name: 'ung_dung_mo',
    description:
      'Mở một ứng dụng trên máy Mac của người dùng (ở nền, không đưa lên trước). Cài đặt hệ thống, Keychain, trình quản lý mật khẩu, Terminal, trình cài đặt bị chặn.',
    parameters: {
      ten: {
        type: 'string',
        required: true,
        description: 'Tên ứng dụng (Notes, Calendar, Finder…) hay bundle id.',
      },
    },
  },
]

/** Lời dặn thêm vào cuối kết quả khi model không đọc được ảnh. */
export const NO_IMAGE_NOTE =
  '(Model của phiên này không đọc được ảnh: chỉ dựa vào danh sách phần tử; bấm theo mã phần tử.)'

/** Giá trị công cụ trả: chữ cho bot, và (khi model đọc được ảnh) tham chiếu ảnh đã lưu ở kho đính kèm. */
export interface ToolValue {
  text: string
  image?: Record<string, unknown> | undefined
}

const OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: { type: 'string', required: true },
    image: { type: 'json' },
  },
} as const

/** Dựng các công cụ từ `TOOL_SPECS`; `run` làm việc thật (lõi, duyệt, ảnh). */
export function makeTools(
  run: (tool: string, args: unknown, exec: ToolRunContext) => Promise<ToolValue>,
): ToolDefinition[] {
  return TOOL_SPECS.map((spec) =>
    defineTool({
      name: spec.name,
      description: spec.description,
      parameters: spec.parameters,
      output: {
        schema: OUTPUT,
        render: (_a, v) => [
          { type: 'text', text: v.text },
          ...(v.image ? [{ type: 'image', attachment: v.image } as never] : []),
        ],
      },
      execute: async (args, exec) => {
        const v = await run(spec.name, args, exec)
        return v.image ? { text: v.text, image: v.image as never } : { text: v.text }
      },
    }),
  )
}
