/**
 * Gọi Bot API của Telegram. Token chỉ nằm trong URL gọi đi, không bao giờ vào lời báo lỗi
 * hay log. Telegram báo giới hạn tốc độ (429) thì chờ đúng `retry_after` rồi thử lại.
 */
import type { InlineButton, TgBotInfo, TgMessage, TgUpdate } from './types.js'

export class TelegramError extends Error {
  constructor(
    readonly method: string,
    readonly code: number,
    readonly description: string,
    readonly retryAfter?: number,
  ) {
    super(`Telegram ${method}: ${code} ${description}`)
  }
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

export interface SendOptions {
  threadId?: number | undefined
  replyTo?: number | undefined
  html?: boolean | undefined
  silent?: boolean | undefined
  buttons?: InlineButton[][] | undefined
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(signal.reason)), { once: true })
  })

export class TelegramApi {
  constructor(
    private readonly token: string,
    private readonly fetchImpl: Fetch = (url, init) => fetch(url, init),
    private readonly base = 'https://api.telegram.org',
  ) {}

  async call<T>(
    method: string,
    params: Record<string, unknown> = {},
    signal?: AbortSignal,
    form?: FormData,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      let res: Response
      try {
        res = await this.fetchImpl(`${this.base}/bot${this.token}/${method}`, {
          method: 'POST',
          ...(form
            ? { body: form }
            : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) }),
          ...(signal ? { signal } : {}),
        })
      } catch (err) {
        if (signal?.aborted) throw err
        // Lỗi mạng: không lộ URL (có token) trong lời báo.
        throw new TelegramError(method, 0, err instanceof Error ? err.name : 'network error')
      }
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        result?: T
        description?: string
        error_code?: number
        parameters?: { retry_after?: number }
      }
      if (body.ok) return body.result as T
      const retryAfter = body.parameters?.retry_after
      if ((body.error_code ?? res.status) === 429 && retryAfter !== undefined && attempt < 3) {
        await sleep(retryAfter * 1000 + 100, signal)
        continue
      }
      throw new TelegramError(
        method,
        body.error_code ?? res.status,
        body.description ?? res.statusText,
        retryAfter,
      )
    }
  }

  getMe(signal?: AbortSignal) {
    return this.call<TgBotInfo>('getMe', {}, signal)
  }

  getUpdates(offset: number, timeoutSec: number, signal: AbortSignal) {
    return this.call<TgUpdate[]>(
      'getUpdates',
      { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query', 'my_chat_member'] },
      signal,
    )
  }

  sendMessage(chatId: number, text: string, o: SendOptions = {}) {
    return this.call<TgMessage>('sendMessage', {
      chat_id: chatId,
      text,
      ...(o.html ? { parse_mode: 'HTML' } : {}),
      ...(o.threadId ? { message_thread_id: o.threadId } : {}),
      ...(o.replyTo
        ? { reply_parameters: { message_id: o.replyTo, allow_sending_without_reply: true } }
        : {}),
      ...(o.silent ? { disable_notification: true } : {}),
      ...(o.buttons ? { reply_markup: { inline_keyboard: o.buttons } } : {}),
      link_preview_options: { is_disabled: true },
    })
  }

  editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    o: Pick<SendOptions, 'html' | 'buttons'> = {},
  ) {
    return this.call<TgMessage | true>('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(o.html ? { parse_mode: 'HTML' } : {}),
      reply_markup: { inline_keyboard: o.buttons ?? [] },
      link_preview_options: { is_disabled: true },
    })
  }

  deleteMessage(chatId: number, messageId: number) {
    return this.call<true>('deleteMessage', { chat_id: chatId, message_id: messageId })
  }

  /** Thả một cảm xúc (thay cảm xúc cũ của bot); `emoji` rỗng để gỡ. */
  setReaction(chatId: number, messageId: number, emoji: string | null) {
    return this.call<true>('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: emoji ? [{ type: 'emoji', emoji }] : [],
    })
  }

  sendChatAction(chatId: number, action: 'typing' | 'record_voice', threadId?: number) {
    return this.call<true>('sendChatAction', {
      chat_id: chatId,
      action,
      ...(threadId ? { message_thread_id: threadId } : {}),
    })
  }

  answerCallback(id: string, text?: string) {
    return this.call<true>('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) })
  }

  leaveChat(chatId: number) {
    return this.call<true>('leaveChat', { chat_id: chatId })
  }

  setMyCommands(commands: { command: string; description: string }[]) {
    return this.call<true>('setMyCommands', { commands })
  }

  /** Tải một tệp người dùng gửi (Bot API cho tối đa 20 MB). */
  async download(fileId: string, signal?: AbortSignal): Promise<{ data: Uint8Array; path: string }> {
    const file = await this.call<{ file_path?: string; file_size?: number }>(
      'getFile',
      { file_id: fileId },
      signal,
    )
    if (!file.file_path) throw new TelegramError('getFile', 0, 'không có đường tải tệp')
    const res = await this.fetchImpl(`${this.base}/file/bot${this.token}/${file.file_path}`, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    })
    if (!res.ok) throw new TelegramError('download', res.status, res.statusText)
    return { data: new Uint8Array(await res.arrayBuffer()), path: file.file_path }
  }

  /** Gửi ảnh (`sendPhoto`) hay video (`sendVideo`) dạng tệp tải lên. */
  sendMedia(
    chatId: number,
    kind: 'image' | 'video',
    data: Uint8Array,
    mime: string,
    name: string,
    o: Pick<SendOptions, 'threadId'> & { caption?: string } = {},
  ) {
    const form = new FormData()
    form.set('chat_id', String(chatId))
    if (o.threadId) form.set('message_thread_id', String(o.threadId))
    if (o.caption) form.set('caption', o.caption.slice(0, 1000))
    const field = kind === 'image' ? 'photo' : 'video'
    form.set(field, new Blob([Uint8Array.from(data)], { type: mime }), name)
    return this.call<TgMessage>(kind === 'image' ? 'sendPhoto' : 'sendVideo', {}, undefined, form)
  }

  sendVoice(chatId: number, ogg: Uint8Array, o: Pick<SendOptions, 'threadId' | 'replyTo'> = {}) {
    const form = new FormData()
    form.set('chat_id', String(chatId))
    if (o.threadId) form.set('message_thread_id', String(o.threadId))
    if (o.replyTo)
      form.set(
        'reply_parameters',
        JSON.stringify({ message_id: o.replyTo, allow_sending_without_reply: true }),
      )
    form.set('voice', new Blob([Uint8Array.from(ogg)], { type: 'audio/ogg' }), 'voice.ogg')
    return this.call<TgMessage>('sendVoice', {}, undefined, form)
  }
}
