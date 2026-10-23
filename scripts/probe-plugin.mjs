// Plugin dò dùng trong kiểm tra khởi động: ghi một dòng JSON cho biết tool và
// đoạn prompt của aris đã được nạp vào dsh hay chưa. Ghi ra tệp $DSH_HOME/probe.out
// vì profile ACP giữ riêng stdout/stderr cho giao thức. Không dùng trong sản phẩm.
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'aris-probe'
export const inject = ['systemPrompt', 'tools']

export function apply(ctx) {
  ctx.effect(() => {
    const timer = setTimeout(async () => {
      // Đợi dsh nạp xong các row khác rồi mới kiểm tra.
      const assembly = await ctx.systemPrompt.assemble()
      const result = {
        tool: Boolean(ctx.tools.get('aris_hello')),
        section: assembly.sections.some((s) => s.name === 'aris:hello'),
      }
      const line = 'ARIS_PROBE ' + JSON.stringify(result)
      appendFileSync(join(process.env.DSH_HOME ?? '.', 'probe.out'), line + '\n')
      console.error(line)
    }, 500)
    return () => clearTimeout(timer)
  })
}
