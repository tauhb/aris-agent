/**
 * Sang trang (GĐ9.8a, docs/spikes/gd9-luong-bot.md): ngữ cảnh của một phiên vượt trần tuyệt đối thì nhờ dsh nén ngay
 * trong cùng phiên khi bot rảnh (dsh tự nén theo tỷ lệ sức chứa, đặt 70% ở cordis.patch.yml của aris-bundle). Phần
 * thuần ở đây.
 */

/** Trần mặc định: 200 nghìn token. */
export const COMPACT_AT = 200_000

export interface UsageLike {
  inputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** Độ dài ngữ cảnh của một lần gọi model: token vào chưa qua đệm cộng phần đọc và ghi đệm. */
export function contextTokens(u: UsageLike | undefined): number {
  return (u?.inputTokens ?? 0) + (u?.cacheReadTokens ?? 0) + (u?.cacheWriteTokens ?? 0)
}

/** Có nên nén phiên sau lượt vừa xong: lượt xong bình thường và ngữ cảnh lần gọi cuối vượt trần. */
export function shouldCompact(
  last: number | undefined,
  endKind: string | undefined,
  cap = COMPACT_AT,
): boolean {
  return endKind === 'completed' && (last ?? 0) > cap
}
