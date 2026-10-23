/** Vị trí linh vật trong ô đội hình: Commander ở giữa, các bot xếp đều trên một vòng. */
export interface Seat {
  id: string
  /** Toạ độ tâm theo phần trăm khung (0–100). */
  x: number
  y: number
  size: number
}

export function formation(commander: string, members: readonly string[], radius = 34): Seat[] {
  const seats: Seat[] = [{ id: commander, x: 50, y: 50, size: 46 }]
  members.forEach((id, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(members.length, 1)
    seats.push({
      id,
      x: Math.round((50 + radius * Math.cos(angle)) * 10) / 10,
      y: Math.round((50 + radius * Math.sin(angle)) * 10) / 10,
      size: 32,
    })
  })
  return seats
}
