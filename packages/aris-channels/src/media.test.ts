import { describe, expect, it } from 'vitest'
import { ffmpegPath, speakable, textToVoice, toWav16k, transcribe } from './media.js'

describe('âm thanh', () => {
  it('bỏ ký hiệu Markdown khi đọc thành tiếng', () => {
    expect(speakable('**Xong**: xem [link](https://x) và `mã`\n```\na=1\n```')).toBe(
      'Xong: xem link và mã (đoạn mã)',
    )
  })

  it('thiếu bộ nhận dạng thì báo rõ', async () => {
    await expect(transcribe(undefined, new Uint8Array(), new AbortController().signal)).rejects.toThrow(
      'voice-input',
    )
  })

  it.runIf(ffmpegPath() && process.platform === 'darwin')(
    'giọng nói → OGG → WAV 16 kHz đi trọn vòng',
    async () => {
      const ogg = await textToVoice('Xin chào anh')
      expect(new TextDecoder().decode(ogg.slice(0, 4))).toBe('OggS')
      const wav = await toWav16k(ogg)
      expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF')
      // Tần số lấy mẫu nằm ở byte 24–27 của phần đầu WAV.
      expect(new DataView(wav.buffer, wav.byteOffset).getUint32(24, true)).toBe(16000)
    },
    20_000,
  )
})
