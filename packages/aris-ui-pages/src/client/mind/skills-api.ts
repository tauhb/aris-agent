/** Gọi `POST /api/aris/skills` (giao diện kho skill); lỗi thì ném câu lỗi của máy chủ. */
export async function skillsPost<R = Record<string, unknown>>(body: Record<string, unknown>): Promise<R> {
  const res = await fetch(new URL('api/aris/skills', document.baseURI), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const out = (await res.json().catch(() => ({}))) as R & { error?: string }
  if (!res.ok) throw new Error(out.error ?? `HTTP ${res.status}`)
  return out
}
