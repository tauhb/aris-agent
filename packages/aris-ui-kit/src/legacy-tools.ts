/**
 * Tên cũ (tiếng Việt) của các công cụ aris, đổi sang tiếng Anh ở bản đổi tên định danh. Log phiên cũ còn ghi tên cũ
 * và tham số cũ: giao diện đọc lịch sử thì nhận cả hai để phiên cũ vẫn hiện đúng. Không đăng ký lại tên cũ cho model.
 */
export const LEGACY_TOOL_NAMES: Readonly<Record<string, string>> = {
  giao_viec: 'assign_task',
  giao_phong: 'assign_department',
  chuyen_giao: 'hand_off',
  moi_noi: 'start_room_round',
  tao_the: 'create_cards',
  tao_routine: 'create_routine',
  bat_routine: 'set_routine_enabled',
  tao_anh: 'generate_image',
  tao_video: 'generate_video',
  xung_ho: 'save_address_style',
  luu_skill: 'save_skill',
  man_hinh_xem: 'screen_view',
  man_hinh_tim: 'screen_find',
  man_hinh_bam: 'screen_click',
  man_hinh_keo: 'screen_drag',
  man_hinh_cuon: 'screen_scroll',
  man_hinh_go: 'screen_type',
  man_hinh_phim: 'screen_key',
  ung_dung_mo: 'open_app',
}

/** Tên công cụ hiện hành: tên cũ quy về tên mới, tên khác giữ nguyên. */
export const currentToolName = (tool: string): string => LEGACY_TOOL_NAMES[tool] ?? tool

/** Tên mới cùng các tên cũ của một công cụ (để đăng ký khung vẽ cho cả lời gọi trong log cũ). */
export const toolNamesOf = (tool: string): string[] => [
  tool,
  ...Object.entries(LEGACY_TOOL_NAMES)
    .filter(([, now]) => now === tool)
    .map(([old]) => old),
]

/** Đọc trường tham số theo tên mới, không có thì theo tên cũ (lời gọi trong log cũ). */
export function argOf(args: Readonly<Record<string, unknown>>, key: string, legacy: string): unknown {
  return args[key] !== undefined ? args[key] : args[legacy]
}
