/**
 * Phần dùng chung của các mục Provider và khoá, Model, Tìm theo nghĩa: namespace model mặc định, đọc cấu hình
 * dsh theo namespace, và danh bạ provider (tên, model đang phục vụ) cho trang không cần cả danh bạ đầy đủ.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { ConfigFormLike, ModelGroup, ModelSettings, ProviderEntry } from '../page.js'

/** Namespace model mặc định của phiên mới. */
export const DEFAULT_NS = 'agent-default-model'

export const pairKey = (provider: string, model: string) => `${provider}\u0000${model}`
export const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)

export function useForm(form: ConfigFormLike | undefined) {
  return useSyncExternalStore(
    (fn) => form?.subscribe(fn) ?? (() => {}),
    () => form?.getSnapshot(),
  )
}

/** Giá trị các namespace cấu hình, vẽ lại khi một namespace đổi. */
export function useNamespaces(models: ModelSettings | undefined, namespaces: readonly string[]) {
  const [version, setVersion] = useState(0)
  const key = namespaces.join('|')
  useEffect(() => {
    if (!models) return
    const offs = namespaces.map((ns) => models.form(ns).subscribe(() => setVersion((v) => v + 1)))
    return () => offs.forEach((off) => off())
  }, [models, key]) // `key` đại diện cho danh sách namespace
  return useCallback(
    (ns: string) => (models && ns ? models.form(ns).getSnapshot().value : undefined),
    [models, version], // `version` tăng khi một namespace đổi, buộc đọc lại
  )
}

/** Model đang phục vụ (`session.modelCatalog`) và danh bạ route của dsh, để lấy tên provider và danh sách chọn. */
export function useCatalog(models: ModelSettings | undefined) {
  const [groups, setGroups] = useState<readonly ModelGroup[]>([])
  const [entries, setEntries] = useState<readonly ProviderEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!models) return
    let live = true
    models
      .catalog()
      .then((g) => live && (setGroups(g), setError(null)))
      .catch((e: Error) => live && setError(e.message))
    void models.providers().then((res) => live && res.ok && setEntries(res.value))
    return () => {
      live = false
    }
  }, [models])
  return { groups, entries, error }
}
