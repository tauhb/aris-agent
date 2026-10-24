/** Phần Bot API của Telegram mà aris dùng (https://core.telegram.org/bots/api). */

export interface TgUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TgChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  is_forum?: boolean
}

export interface TgEntity {
  type: string
  offset: number
  length: number
  user?: TgUser
}

export interface TgFile {
  file_id: string
  file_unique_id: string
  file_size?: number
}

export interface TgPhotoSize extends TgFile {
  width: number
  height: number
}

export interface TgDocument extends TgFile {
  file_name?: string
  mime_type?: string
}

export interface TgVoice extends TgFile {
  duration: number
  mime_type?: string
}

export interface TgMessage {
  message_id: number
  message_thread_id?: number
  is_topic_message?: boolean
  from?: TgUser
  chat: TgChat
  date: number
  text?: string
  caption?: string
  entities?: TgEntity[]
  caption_entities?: TgEntity[]
  reply_to_message?: TgMessage
  photo?: TgPhotoSize[]
  document?: TgDocument
  voice?: TgVoice
  audio?: TgDocument & { duration?: number }
  video_note?: TgVoice
}

export interface TgCallbackQuery {
  id: string
  from: TgUser
  message?: TgMessage
  data?: string
}

export interface TgChatMemberUpdated {
  chat: TgChat
  from: TgUser
  new_chat_member: { status: string; user: TgUser }
  old_chat_member: { status: string; user: TgUser }
}

export interface TgUpdate {
  update_id: number
  message?: TgMessage
  edited_message?: TgMessage
  callback_query?: TgCallbackQuery
  my_chat_member?: TgChatMemberUpdated
}

export interface TgBotInfo extends TgUser {
  can_join_groups?: boolean
  can_read_all_group_messages?: boolean
}

export type InlineButton = { text: string; callback_data: string } | { text: string; url: string }
