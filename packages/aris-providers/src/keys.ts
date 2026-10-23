/**
 * Vòng khoá: nhiều khoá cho một provider. Khoá `i` lưu ở `<ref>_ARIS_<i>` trong kho khoá của dsh;
 * đổi khoá là ghi giá trị khoá kế tiếp vào `<ref>`, tên provider đang đọc. Adapter của dsh đọc
 * khoá ở mỗi lần gọi nên lần thử lại dùng khoá mới ngay. Giá trị khoá không rời máy chủ.
 */
import { createHash } from 'node:crypto'
import type { PoolRecord, SlotRecord, Table } from './domain.js'

export interface CredentialsPort {
  resolve(ref: string): Promise<string | undefined>
  set(ref: string, value: string): Promise<void>
  unset(ref: string): Promise<void>
}

/** Tên khoá hợp lệ của dsh: định danh shell POSIX. */
export const REF = /^[A-Za-z_][A-Za-z0-9_]*$/
export const MAX_KEYS = 8

const slotRef = (ref: string, i: number) => `${ref}_ARIS_${i}`
export const fingerprint = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 4)

/** Những gì trang 6.2 thấy về một vòng khoá (không có giá trị khoá). */
export interface PoolInfo {
  provider: string
  ref: string
  active: number
  keys: (SlotRecord & { slot: number })[]
}

export class KeyPools {
  constructor(
    private table: Table<PoolRecord>,
    private creds: CredentialsPort,
    private now: () => number = Date.now,
  ) {}

  info(provider: string): PoolInfo | undefined {
    const p = this.table.get(provider)
    if (!p) return undefined
    return {
      provider,
      ref: p.ref,
      active: p.active,
      keys: p.slots.map((s, i) => ({ ...s, slot: i + 1 })),
    }
  }

  all(): PoolInfo[] {
    return [...this.table.entries()].map(([k]) => this.info(k)!)
  }

  size(provider: string): number {
    return this.table.get(provider)?.slots.length ?? 0
  }

  /** Thêm một khoá. Khoá provider đang đọc (nếu có) thành khoá 1 của vòng. */
  async add(provider: string, ref: string, value: string): Promise<PoolInfo> {
    if (!REF.test(ref)) throw new Error(`tên khoá không hợp lệ: ${ref}`)
    const v = value.trim()
    if (!v) throw new Error('khoá rỗng')
    let p = this.table.get(provider)
    if (p && p.ref !== ref) throw new Error(`provider ${provider} đang dùng khoá ${p.ref}`)
    if (!p) {
      const current = await this.creds.resolve(ref)
      p = { provider, ref, slots: [], active: 1 }
      if (current) {
        await this.creds.set(slotRef(ref, 1), current)
        p.slots.push({ fp: fingerprint(current), addedAt: this.now() })
      }
    }
    const fp = fingerprint(v)
    if (p.slots.some((s) => s.fp === fp)) throw new Error('khoá này đã có trong vòng')
    if (p.slots.length >= MAX_KEYS) throw new Error(`tối đa ${MAX_KEYS} khoá`)
    await this.creds.set(slotRef(ref, p.slots.length + 1), v)
    p.slots.push({ fp, addedAt: this.now() })
    // Provider chưa có khoá nào: khoá vừa thêm là khoá đang dùng.
    if (p.slots.length === 1) await this.creds.set(ref, v)
    await this.table.put(provider, p)
    return this.info(provider)!
  }

  /** Bỏ một khoá (không bỏ được khoá đang dùng). Còn một khoá thì thôi vòng, khoá vẫn ở `<ref>`. */
  async remove(provider: string, slot: number): Promise<PoolInfo | undefined> {
    const p = this.table.get(provider)
    if (!p || slot < 1 || slot > p.slots.length) throw new Error('không có khoá này')
    if (slot === p.active) throw new Error('đang dùng khoá này; đổi sang khoá khác trước')
    // Dồn các khoá sau lên một chỗ.
    for (let i = slot; i < p.slots.length; i++) {
      const next = await this.creds.resolve(slotRef(p.ref, i + 1))
      if (next) await this.creds.set(slotRef(p.ref, i), next)
    }
    await this.creds.unset(slotRef(p.ref, p.slots.length))
    p.slots.splice(slot - 1, 1)
    if (p.active > slot) p.active--
    if (p.slots.length <= 1) {
      if (p.slots.length === 1) await this.creds.unset(slotRef(p.ref, 1))
      await this.table.delete(provider)
      return undefined
    }
    await this.table.put(provider, p)
    return this.info(provider)
  }

  /**
   * Đổi sang khoá kế tiếp chưa thử trong lần gọi này. Trả số khoá mới, hoặc undefined khi
   * không còn khoá nào để đổi. `tried` được cập nhật (gồm cả khoá vừa lỗi).
   */
  async rotate(provider: string, tried: Set<number>, error: string): Promise<number | undefined> {
    const p = this.table.get(provider)
    if (!p || p.slots.length < 2) return undefined
    const current = await this.creds.resolve(p.ref)
    // Anh gõ khoá mới vào ô khoá của provider: giữ nó làm khoá đang dùng của vòng.
    if (current && fingerprint(current) !== p.slots[p.active - 1]!.fp) {
      await this.creds.set(slotRef(p.ref, p.active), current)
      p.slots[p.active - 1]!.fp = fingerprint(current)
    }
    tried.add(p.active)
    p.slots[p.active - 1] = { ...p.slots[p.active - 1]!, failedAt: this.now(), error }
    let next: number | undefined
    for (let k = 1; k < p.slots.length; k++) {
      const i = ((p.active - 1 + k) % p.slots.length) + 1
      if (!tried.has(i)) {
        next = i
        break
      }
    }
    if (next === undefined) {
      await this.table.put(provider, p)
      return undefined
    }
    const value = await this.creds.resolve(slotRef(p.ref, next))
    if (!value) {
      tried.add(next)
      await this.table.put(provider, p)
      return this.rotate(provider, tried, error)
    }
    await this.creds.set(p.ref, value)
    p.active = next
    await this.table.put(provider, p)
    return next
  }
}
