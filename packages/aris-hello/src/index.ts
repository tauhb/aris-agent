/**
 * Plugin mẫu của aris. Nó chứng minh ba đường mở rộng dsh mà mọi package aris
 * sẽ dùng: một đoạn system prompt, một tool, và một bản ghi riêng trong log
 * phiên (`plugin:aris/hello`). Gỡ plugin thì cả ba biến mất cùng `ctx`.
 * @module @aris/hello
 */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { buildGreeting, sectionText } from './greeting.js'

export { buildGreeting, sectionText }

/** Tên bản ghi trong log phiên. */
export const HELLO_RECORD = 'plugin:aris/hello'

/** Nội dung bản ghi mỗi lần tool chạy. */
export interface HelloRecord {
  name: string
  greeting: string
}

declare module '@deepseek-ai/dsh-session' {
  interface PluginRecordMap {
    'plugin:aris/hello': HelloRecord
  }
}

export const name = 'aris-hello'
export const inject = ['systemPrompt', 'tools']

/** Cấu hình của plugin. */
export interface Config {
  /** Mẫu lời chào; `{name}` được thay bằng tên người dùng. */
  greeting?: string
  /** Tên tool đăng ký với dsh. */
  toolName?: string
}

export const Config: z<Config> = z.object({
  greeting: z.string().default('Xin chào {name}, aris đây!'),
  toolName: z.string().default('aris_hello'),
})

/** Thứ tự đoạn prompt: sau persona (0), trước chính sách plan (500). */
export const SECTION_ORDER = 50

export function apply(ctx: Context, config: Config): void {
  const toolName = config.toolName ?? 'aris_hello'
  const template = config.greeting ?? 'Xin chào {name}, aris đây!'

  ctx.effect(
    () => ctx.systemPrompt.section({ name: 'aris:hello', order: SECTION_ORDER, text: sectionText(toolName) }),
    'aris-hello.section()',
  )

  ctx.tools.register(
    defineTool({
      name: toolName,
      description: 'Chào người dùng bằng tên của họ. Dùng để kiểm tra aris đã được nạp.',
      parameters: {
        name: { type: 'string', required: true, description: 'Tên người cần chào' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args, exec) {
        const greeting = buildGreeting(template, args.name)
        const session = exec.agent?.session
        if (session) appendPluginRecord(session, HELLO_RECORD, { name: args.name, greeting })
        return greeting
      },
    }),
  )
}
