/** Lời chào aris dùng cho tool `aris_hello`, tách riêng để kiểm thử không cần dsh. */
export function buildGreeting(template: string, name: string): string {
  const who = name.trim() || 'bạn'
  return template.replaceAll('{name}', who)
}

/** Đoạn system prompt mà plugin mẫu đóng góp. */
export function sectionText(toolName: string): string {
  return `Plugin aris-hello đang hoạt động. Khi người dùng chào aris, hãy gọi tool \`${toolName}\` với tên của họ.`
}
