import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LABEL, callSocket, parseArgs, plist } from './aris.mjs'

describe('lệnh aris', () => {
  it('tách lệnh, cờ và nội dung', () => {
    expect(parseArgs(['ask', 'tóm tắt', 'lịch hôm nay', '--json'])).toEqual({
      cmd: 'ask',
      flags: new Set(['--json']),
      text: 'tóm tắt lịch hôm nay',
    })
    expect(parseArgs([]).cmd).toBe('help')
  })

  it('LaunchAgent: chạy profile aris không mở trình duyệt, tự chạy lại, PATH có ffmpeg, thoát ký tự XML', () => {
    const xml = plist({
      node: '/usr/local/bin/node',
      script: '/repo/scripts/dsh.mjs',
      home: '/repo/.dsh-home & co',
      port: 3201,
      logFile: '/Users/a/Library/Logs/aris/daemon.log',
      path: '/opt/homebrew/bin:/usr/bin',
    })
    expect(xml).toContain(`<key>Label</key><string>${LABEL}</string>`)
    expect(xml).toContain(
      '<string>--profile</string>\n    <string>aris</string>\n    <string>--no-open</string>',
    )
    expect(xml).toContain('<key>KeepAlive</key><true/>')
    expect(xml).toContain('<key>ARIS_DAEMON</key><string>1</string>')
    expect(xml).toContain('/repo/.dsh-home &amp; co')
    expect(xml).toContain('/opt/homebrew/bin')
  })

  it('không có daemon thì gọi socket trả null', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aris-cli-'))
    try {
      expect(await callSocket('GET', '/status', undefined, join(dir, 'aris.sock'))).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
