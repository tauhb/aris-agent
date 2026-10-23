import type { Table } from './domain.js'

/** Bảng trong bộ nhớ cho kiểm thử. */
export function memTable<V>(): Table<V> & { map: Map<string, V> } {
  const map = new Map<string, V>()
  return {
    map,
    get: (k) => map.get(k),
    entries: () => map.entries(),
    put: async (k, v) => void map.set(k, structuredClone(v)),
    delete: async (k) => map.delete(k),
  }
}

/** Kho khoá giả. */
export function memCreds(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init))
  return {
    map,
    resolve: async (r: string) => map.get(r),
    set: async (r: string, v: string) => void map.set(r, v),
    unset: async (r: string) => void map.delete(r),
  }
}
