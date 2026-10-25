/**
 * Dây nối giữa `aris-acp` và daemon: dòng bắt tay đầu tiên, rồi JSON-RPC của ACP từng dòng một. Luồng có "nghe
 * lén" để daemon biết tên ứng dụng, mã phiên vừa tạo và kết quả xin quyền.
 */
import type { Socket } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Socket nội bộ của daemon (quyền 0600, trong `~/.aris`). */
export const socketPath = (home = homedir()) => join(home, '.aris', 'acp.sock')

export interface Hello {
  aris: 'acp'
  v: 1
  bot: string
  cwd: string
  /** Tên tiến trình gọi `aris-acp` (Buzz Desktop, Zed…), khi đọc được. */
  parent?: string | undefined
}

export function parseHello(line: string): Hello | undefined {
  try {
    const v = JSON.parse(line) as Partial<Hello>
    if (v.aris !== 'acp' || v.v !== 1 || typeof v.bot !== 'string' || typeof v.cwd !== 'string')
      return undefined
    return {
      aris: 'acp',
      v: 1,
      bot: v.bot.trim(),
      cwd: v.cwd,
      parent: typeof v.parent === 'string' ? v.parent.slice(0, 80) : undefined,
    }
  } catch {
    return undefined
  }
}

export type Message = Record<string, unknown> & { id?: unknown; method?: unknown }

/**
 * Luồng ACP trên socket: `readable` là tin ứng dụng gửi (đã đọc JSON), `writable` là tin aris gửi đi; `tap.out`
 * trả promise thì tin chờ nó xong mới gửi.
 * `rest`: phần byte đã đọc sau dòng bắt tay.
 */
export function socketStream(
  sock: Socket,
  rest: string,
  tap: { in(m: Message): void; out(m: Message): void | Promise<void> },
): { readable: ReadableStream<Message>; writable: WritableStream<Message> } {
  let buf = rest
  const readable = new ReadableStream<Message>({
    start(controller) {
      const flush = () => {
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!line) continue
          try {
            const m = JSON.parse(line) as Message
            tap.in(m)
            controller.enqueue(m)
          } catch {
            // Dòng không phải JSON: bỏ.
          }
        }
      }
      flush()
      sock.on('data', (d: Buffer) => {
        buf += d.toString('utf8')
        flush()
      })
      const end = () => {
        try {
          controller.close()
        } catch {
          // Đã đóng.
        }
      }
      sock.on('end', end)
      sock.on('close', end)
      sock.on('error', end)
    },
  })
  const writable = new WritableStream<Message>({
    async write(m) {
      // Nghe chiều đi có thể giữ tin lại (gắn bot, công cụ cho phiên mới) trước khi ứng dụng nhận.
      await tap.out(m)
      if (!sock.destroyed) sock.write(`${JSON.stringify(m)}\n`)
    },
    close() {
      sock.end()
    },
  })
  return { readable, writable }
}
