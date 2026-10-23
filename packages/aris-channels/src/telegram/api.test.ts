import { describe, expect, it } from 'vitest'
import { TelegramApi, TelegramError, type Fetch } from './api.js'

const TOKEN = '123:SECRET-token'

function fakeFetch(responses: unknown[]) {
  const calls: { url: string; body: unknown }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body })
    return new Response(JSON.stringify(responses.shift()), { status: 200 })
  }
  return { f, calls }
}

describe('Bot API', () => {
  it('gửi tin HTML, im lặng, có nút, trả lời vào tin', async () => {
    const { f, calls } = fakeFetch([{ ok: true, result: { message_id: 5 } }])
    const api = new TelegramApi(TOKEN, f, 'https://t')
    await api.sendMessage(7, '<b>x</b>', {
      html: true,
      silent: true,
      replyTo: 3,
      threadId: 9,
      buttons: [[{ text: 'A', callback_data: 'a' }]],
    })
    expect(calls[0]!.url).toBe(`https://t/bot${TOKEN}/sendMessage`)
    expect(calls[0]!.body).toMatchObject({
      chat_id: 7,
      parse_mode: 'HTML',
      disable_notification: true,
      message_thread_id: 9,
      reply_parameters: { message_id: 3 },
      reply_markup: { inline_keyboard: [[{ text: 'A', callback_data: 'a' }]] },
    })
  })

  it('giới hạn tốc độ: chờ rồi thử lại', async () => {
    const { f, calls } = fakeFetch([
      { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0 } },
      { ok: true, result: true },
    ])
    expect(await new TelegramApi(TOKEN, f).call('sendChatAction', {})).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('lời báo lỗi không chứa token', async () => {
    const { f } = fakeFetch([{ ok: false, error_code: 401, description: 'Unauthorized' }])
    const err = await new TelegramApi(TOKEN, f).getMe().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TelegramError)
    expect(String(err)).toBe('Error: Telegram getMe: 401 Unauthorized')
    const broken: Fetch = async () => {
      throw new TypeError(`fetch failed https://api.telegram.org/bot${TOKEN}/getMe`)
    }
    const net = await new TelegramApi(TOKEN, broken).getMe().catch((e: unknown) => e)
    expect(String(net)).not.toContain('SECRET')
  })
})
