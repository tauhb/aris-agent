import {
  defineTool,
  type ParameterPropertySpec,
  type ParameterSchemaSpec,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools'

/**
 * Mô tả các công cụ điều khiển máy cho bot (tên, tham số tiếng Anh như các công cụ khác của aris). Lời dặn chung: ưu tiên bấm
 * theo mã phần tử lấy từ screen_view / screen_find; chỉ dùng toạ độ khi không có cách khác; toạ độ là điểm ảnh của
 * ảnh chụp cửa sổ gần nhất.
 */

export interface ToolSpec {
  name: string
  description: string
  parameters: ParameterSchemaSpec
}

const WIN: ParameterPropertySpec = {
  type: 'string',
  description: 'Cửa sổ dạng pid:mã_cửa_sổ, lấy từ screen_view. Bỏ trống là cửa sổ vừa làm.',
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
    name: 'screen_view',
    description:
      'Chụp một cửa sổ trên máy Mac của người dùng: trả danh sách cửa sổ đang mở, các phần tử bấm được (mã trong ngoặc vuông, vai, nhãn, tâm @x,y) và ảnh chụp nếu model đọc được ảnh. Gọi trước mỗi thao tác vì màn hình đổi sau mỗi lần bấm, gõ.',
    parameters: {
      app: {
        type: 'string',
        description:
          'Tên ứng dụng (ví dụ Notes, Finder) hay bundle id. Bỏ trống là cửa sổ vừa làm hay ứng dụng đang ở trước.',
      },
      window: WIN,
    },
  },
  {
    name: 'screen_find',
    description:
      'Đọc cây phần tử (Trợ năng) của một cửa sổ, không chụp ảnh, rẻ hơn screen_view. Có query thì chỉ trả phần tử khớp (nhãn, vai, giá trị). Dùng để lấy mã phần tử trước khi bấm.',
    parameters: {
      query: {
        type: 'string',
        description: 'Chữ cần tìm trong nhãn hay giá trị, ví dụ "Lưu", "Ghi chú mới".',
      },
      app: { type: 'string', description: 'Tên ứng dụng hay bundle id.' },
      window: WIN,
    },
  },
  {
    name: 'screen_click',
    description:
      'Bấm một phần tử. Ưu tiên element (mã từ screen_view / screen_find); chỉ dùng x, y khi phần tử không có mã (ứng dụng tự vẽ). Mã phần tử cũ sau mỗi lần chụp lại cửa sổ.',
    parameters: {
      element: { type: 'string', description: 'Mã phần tử, ví dụ "s3:12".' },
      x: { type: 'number', description: 'Toạ độ ngang trên ảnh chụp (khi không có mã).' },
      y: { type: 'number', description: 'Toạ độ dọc trên ảnh chụp (khi không có mã).' },
      button: { type: 'string', enum: ['left', 'right'], description: 'Nút chuột, mặc định left (trái).' },
      count: { type: 'number', description: '1 (mặc định), 2 là bấm đúp, 3 là bấm ba lần (chọn cả dòng).' },
      window: WIN,
    },
  },
  {
    name: 'screen_type',
    description:
      'Gõ chữ vào cửa sổ. Có element thì bấm vào ô đó trước để đặt con trỏ. Không gõ được vào ô mật khẩu (bị chặn): việc đăng nhập để người dùng tự làm.',
    parameters: {
      text: { type: 'string', required: true, description: 'Chữ cần gõ; xuống dòng bằng \\n.' },
      element: { type: 'string', description: 'Mã ô nhập cần gõ vào.' },
      window: WIN,
    },
  },
  {
    name: 'screen_key',
    description:
      'Bấm phím hay phím tắt, ví dụ "cmd+n", "cmd+shift+s", "enter", "esc", "tab". Phím khoá máy, đăng xuất, tắt máy, buộc thoát bị chặn.',
    parameters: { keys: { type: 'string', required: true, description: 'Phím tắt.' }, window: WIN },
  },
  {
    name: 'screen_scroll',
    description: 'Cuộn trong cửa sổ.',
    parameters: {
      direction: {
        type: 'string',
        required: true,
        enum: ['up', 'down', 'left', 'right'],
        description: 'Hướng cuộn.',
      },
      steps: { type: 'number', description: 'Số bước, mặc định 3 (tối đa 20).' },
      x: { type: 'number', description: 'Cuộn tại điểm này trên ảnh chụp (bỏ trống là vùng đang chọn).' },
      y: { type: 'number', description: 'Toạ độ dọc của điểm cuộn.' },
      window: WIN,
    },
  },
  {
    name: 'screen_drag',
    description:
      'Kéo từ một điểm tới điểm khác trong cùng cửa sổ (ví dụ kéo thanh trượt, kéo tệp vào thư mục). Kéo vào Thùng rác bị chặn.',
    parameters: { from: POINT('Điểm bắt đầu'), to: POINT('Điểm thả'), window: WIN },
  },
  {
    name: 'open_app',
    description:
      'Mở một ứng dụng trên máy Mac của người dùng (ở nền, không đưa lên trước). Cài đặt hệ thống, Keychain, trình quản lý mật khẩu, Terminal, trình cài đặt bị chặn.',
    parameters: {
      name: {
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
