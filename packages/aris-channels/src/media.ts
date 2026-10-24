/**
 * Âm thanh cho kênh: ghi âm → chữ (ffmpeg đổi sang WAV 16 kHz mono rồi nhờ bộ nhận dạng của
 * dsh `ctx.speechToText`), và chữ → giọng nói (`say` của macOS rồi ffmpeg đổi sang OGG Opus,
 * dạng bong bóng ghi âm của Telegram).
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** dsh có thể chạy với PATH tối giản: tìm ffmpeg ở các chỗ cài phổ biến. */
export function ffmpegPath(): string | undefined {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'])
    if (existsSync(p)) return p
  return undefined
}

function run(cmd: string, args: string[], input?: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], ...(signal ? { signal } : {}) })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (b: Buffer) => out.push(b))
    child.stderr.on('data', (b: Buffer) => err.push(b))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve(new Uint8Array(Buffer.concat(out)))
        : reject(
            new Error(
              `${cmd.split('/').pop()} thoát mã ${code}: ${Buffer.concat(err).toString().slice(0, 200)}`,
            ),
          ),
    )
    child.stdin.end(input ? Buffer.from(input) : undefined)
  })
}

/** Ghi âm bất kỳ (OGG Opus của Telegram…) → WAV 16 kHz mono PCM16, dạng bộ nhận dạng của dsh cần. */
export async function toWav16k(audio: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
  const ffmpeg = ffmpegPath()
  if (!ffmpeg) throw new Error('chưa cài ffmpeg (brew install ffmpeg)')
  return run(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      'pipe:0',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      '-f',
      'wav',
      'pipe:1',
    ],
    audio,
    signal,
  )
}

/** Dịch vụ nhận dạng giọng nói của dsh (bộ voice-input), dạng tối thiểu aris dùng. */
export interface SpeechToText {
  resolve(request: { audio: Uint8Array; language?: string }): unknown
  transcribe(spec: never, signal: AbortSignal): Promise<{ text: string }>
}

/** Bộ nhận giọng nói của dsh chưa tải mô hình (cần chuẩn bị một lần trên web). */
export const sttNotReady = (e: unknown) =>
  /prepare|not prepared|not ready/i.test(e instanceof Error ? e.message : String(e))

export async function transcribe(
  stt: SpeechToText | undefined,
  audio: Uint8Array,
  signal: AbortSignal,
): Promise<string> {
  if (!stt) throw new Error('profile chưa bật nhận dạng giọng nói (voice-input bundle)')
  const wav = await toWav16k(audio, signal)
  const spec = stt.resolve({ audio: wav })
  const out = await stt.transcribe(spec as never, signal)
  return out.text.trim()
}

/** Bỏ ký hiệu Markdown để đọc thành tiếng cho tự nhiên. */
export function speakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' (đoạn mã) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_~#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

/** Chữ → bong bóng ghi âm OGG Opus (chỉ macOS: dùng `say`, giọng Linh cho tiếng Việt). */
export async function textToVoice(text: string, voice = 'Linh'): Promise<Uint8Array> {
  const ffmpeg = ffmpegPath()
  if (!ffmpeg) throw new Error('chưa cài ffmpeg')
  if (process.platform !== 'darwin') throw new Error('giọng nói trả lời hiện chỉ chạy trên macOS')
  const dir = await mkdtemp(join(tmpdir(), 'aris-voice-'))
  try {
    const aiff = join(dir, 'out.aiff')
    await run('/usr/bin/say', ['-v', voice, '-o', aiff, speakable(text)])
    await run(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      aiff,
      '-c:a',
      'libopus',
      '-b:a',
      '32k',
      '-ac',
      '1',
      '-f',
      'ogg',
      join(dir, 'out.ogg'),
    ])
    return new Uint8Array(await readFile(join(dir, 'out.ogg')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
