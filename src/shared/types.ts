export interface DiscordUser {
  id: string
  username: string
  avatar: string | null
  discriminator: string
  public_flags: number
}

export interface DiscordAttachment {
  id: string
  filename: string
  url: string
  proxy_url: string
  size: number
  content_type?: string
}

export interface DiscordMessage {
  id: string
  content: string
  channel_id: string
  author: DiscordUser
  timestamp: string
  attachments: DiscordAttachment[]
}

export interface DiscordChannel {
  id: string
  type: number
  last_message_id: string | null
  recipients: DiscordUser[]
  name?: string
}

export interface ExportData {
  channelId: string
  messages: DiscordMessage[]
  exportedAt: string
}

// User Tracking Types
export interface TrackedUser {
  userId: string
  username: string
  avatar: string | null
  trackingOptions: {
    username: boolean
    globalName: boolean
    status: boolean
    avatar: boolean
    banner: boolean
  }
  addedAt: number
}

export interface UserChangeLog {
  id: string
  userId: string
  username: string
  globalName: string | null
  avatar: string | null
  changeType: 'username' | 'globalName' | 'status' | 'avatar' | 'banner'
  oldValue: string | null
  newValue: string | null
  timestamp: number
}

export interface DiscordUserFull extends DiscordUser {
  global_name?: string | null
  banner?: string | null
  accent_color?: number | null
  bio?: string
}
