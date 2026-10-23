import type { Table, Tables } from './domain.js'

/** Bảng trong bộ nhớ cho kiểm thử. */
export function memTable<V>(): Table<V> {
  const map = new Map<string, V>()
  return {
    get: (k) => map.get(k),
    entries: () => map.entries(),
    put: async (k, v) => void map.set(k, structuredClone(v)),
    delete: async (k) => map.delete(k),
  }
}

export const memTables = (): Tables => ({ bots: memTable(), departments: memTable(), sessions: memTable() })
