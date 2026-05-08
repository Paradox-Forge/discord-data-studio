import axios from 'axios'
import { DiscordChannel, DiscordMessage } from '@shared/types'

const BASE_URL = 'https://discord.com/api/v9'

export const discordApi = {
  getChannels: async (token: string): Promise<DiscordChannel[]> => {
    const response = await axios.get(`${BASE_URL}/users/@me/channels`, {
      headers: { Authorization: token }
    })
    return response.data
  },

  getMessages: async (
    token: string,
    channelId: string,
    before?: string,
    limit: number = 50
  ): Promise<DiscordMessage[]> => {
    const response = await axios.get(`${BASE_URL}/channels/${channelId}/messages`, {
      headers: { Authorization: token },
      params: { before, limit }
    })
    return response.data
  },

  deleteMessage: async (token: string, channelId: string, messageId: string) => {
    return axios.delete(`${BASE_URL}/channels/${channelId}/messages/${messageId}`, {
      headers: { Authorization: token }
    })
  },

  getUserMe: async (token: string) => {
    const response = await axios.get(`${BASE_URL}/users/@me`, {
      headers: { Authorization: token }
    })
    return response.data
  }
}

// Rate limit helper
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const fetchAllMessages = async (
  token: string,
  channelId: string,
  onProgress: (messages: DiscordMessage[]) => void,
  options?: {
    before?: string,
    shouldStop?: () => boolean,
    stopCondition?: (messages: DiscordMessage[]) => boolean
  }
) => {
  let allMessages: DiscordMessage[] = []
  let before: string | undefined = options?.before
  let hasMore = true
  let lastId: string | undefined = before

  while (hasMore) {
    if (options?.shouldStop && options.shouldStop()) {
      break
    }

    try {
      const messages: DiscordMessage[] = await discordApi.getMessages(token, channelId, before, 100)
      if (messages.length === 0) {
        hasMore = false
        break
      }

      allMessages = [...allMessages, ...messages]
      onProgress(messages)
      before = messages[messages.length - 1].id
      lastId = before

      if (options?.stopCondition && options.stopCondition(allMessages)) {
        hasMore = false
        break
      }

      // Respect rate limits
      await sleep(200)
    } catch (err) {
      console.error('Error fetching messages batch', err)
      await sleep(5000) // Wait longer on error
    }
  }
  return { messages: allMessages, lastId }
}

export const bulkDeleteMessages = async (
  token: string,
  channelId: string,
  messageIds: string[],
  onProgress: (count: number) => void
) => {
  let count = 0
  for (const id of messageIds) {
    try {
      await discordApi.deleteMessage(token, channelId, id)
      count++
      onProgress(count)
      // Discord rate limit for deletion is roughly 1-2 per second for user tokens
      await sleep(1500) 
    } catch (error: any) {
      if (error.response?.status === 429) {
        const retryAfter = error.response.data.retry_after * 1000 || 5000
        await sleep(retryAfter)
        // Retry once
        await discordApi.deleteMessage(token, channelId, id)
        count++
        onProgress(count)
      } else {
        console.error(`Failed to delete message ${id}`, error)
      }
    }
  }
}
