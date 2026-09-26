import { app, dialog } from 'electron'
import WebSocket from 'ws'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import axios from 'axios'
import log from 'electron-log'
import { configManager } from './configManager'

export interface DiscordMessage {
  id: string
  channel_id: string
  author: {
    id: string
    username: string
  }
  content: string
  timestamp: string
  attachments: any[]
  deleted?: boolean
  updated?: boolean
}

export class DiscordWatcher {
  private ws: WebSocket | null = null
  private token: string | null = null
  private archivesPath: string
  private lastSyncTimes: Map<string, number> = new Map() // Cooldown tracking
  private isRateLimited: boolean = false
  private messageQueue: Map<string, DiscordMessage[]> = new Map() // Batch queue
  private flushInterval: NodeJS.Timeout | null = null

  constructor() {
    this.archivesPath = path.join(app.getPath('userData'), 'archives')
    if (!fs.existsSync(this.archivesPath)) {
      fs.mkdirSync(this.archivesPath, { recursive: true })
    }
    log.info('DiscordWatcher initialized at:', this.archivesPath)
    
    // Flush queue every 5 seconds instead of every message
    this.flushInterval = setInterval(() => {
      this.flushMessageQueue()
    }, 5000)
  }

  // Small helper for random human-like delay
  private async jitterSleep(): Promise<void> {
    const delay = Math.floor(Math.random() * 600) + 400 // 400ms - 1000ms delay
    return new Promise(resolve => setTimeout(resolve, delay))
  }

  public stop(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    // Flush any remaining messages before stopping
    this.flushMessageQueue()
    log.info('DiscordWatcher stopped')
  }

  // Batch write messages to reduce I/O operations
  private async flushMessageQueue(): Promise<void> {
    if (this.messageQueue.size === 0) return

    const flushPromises: Promise<void>[] = []

    for (const [channelId, messages] of this.messageQueue.entries()) {
      if (messages.length === 0) continue

      const flushTask = (async () => {
        try {
          const userId = configManager.getConfig().lastUserId || 'unknown'
          const logPath = this.getLogPath(userId, channelId)
          
          // Read existing logs
          let logs: DiscordMessage[] = []
          if (fs.existsSync(logPath)) {
            try {
              const content = await fsp.readFile(logPath, 'utf-8')
              logs = JSON.parse(content)
            } catch (e) {
              log.error('Failed to read existing logs:', e)
              logs = []
            }
          }

          // Add new messages
          logs.push(...messages)

          // Write async (non-blocking)
          await fsp.writeFile(logPath, JSON.stringify(logs, null, 2))
          log.info(`Flushed ${messages.length} messages for channel ${channelId}`)
        } catch (err) {
          log.error(`Failed to flush messages for channel ${channelId}:`, err)
        }
      })()

      flushPromises.push(flushTask)
    }

    // Wait for all flush operations to complete
    await Promise.all(flushPromises)

    // Clear queue after flushing
    this.messageQueue.clear()
  }

  public start(token: string): void {
    log.info('Starting DiscordWatcher (Safety Mode)...')
    if (this.ws) {
      this.ws.close()
    }
    this.token = token
    this.connect()
  }

  // DETECTIVE MODE with SAFETY LOCKS
  public async fetchChannelHistory(channelId: string): Promise<void> {
    if (!this.token || this.isRateLimited) return
    
    // 1. Check Cooldown (5 minutes)
    const now = Date.now()
    const lastSync = this.lastSyncTimes.get(channelId) || 0
    if (now - lastSync < 5 * 60 * 1000) {
      log.info(`Sync skipped for ${channelId} (Cooldown active)`)
      return
    }

    log.info(`Detective Mode: Safety sync starting for ${channelId}`)
    await this.jitterSleep() // Be human-like
    
    try {
      const userId = configManager.getConfig().lastUserId || 'unknown'
      const logPath = this.getLogPath(userId, channelId)
      
      const response = await axios.get(`https://discord.com/api/v9/channels/${channelId}/messages?limit=50`, {
        headers: { 
          'Authorization': this.token,
          'Content-Type': 'application/json'
        }
      })
      
      this.lastSyncTimes.set(channelId, now) // Update last sync time
      const liveMessages: any[] = response.data
      const liveIds = new Set(liveMessages.map(m => m.id))

      // 2. Load local logs - async
      let localLogs: DiscordMessage[] = []
      if (fs.existsSync(logPath)) {
        try {
          const content = await fsp.readFile(logPath, 'utf-8')
          localLogs = JSON.parse(content)
        } catch (e) {
          localLogs = []
        }
      }

      // 3. COMPARE: If it's in local but NOT in live, it was deleted
      // Only check messages that are within the range of the live messages we fetched
      if (liveMessages.length > 0) {
        const newestLiveId = liveMessages[0].id
        const oldestLiveId = liveMessages[liveMessages.length - 1].id
        
        let changed = false
        localLogs = localLogs.map(localMsg => {
          // If message is between newest and oldest live messages but NOT in liveIds, it's deleted
          if (!localMsg.deleted && 
              localMsg.id <= newestLiveId && 
              localMsg.id >= oldestLiveId && 
              !liveIds.has(localMsg.id)) {
            log.info(`Detective found a deleted message: ${localMsg.id}`)
            changed = true
            return { ...localMsg, deleted: true }
          }
          return localMsg
        })

        // 4. Update local logs with new messages and deletion marks
        for (const liveMsg of liveMessages) {
          if (!localLogs.find(m => m.id === liveMsg.id)) {
            localLogs.push(liveMsg)
            changed = true
            // PROACTIVE: Download attachments for newly discovered messages (async)
            if (liveMsg.attachments && liveMsg.attachments.length > 0) {
              setImmediate(() => {
                this.downloadAttachments(liveMsg)
              })
            }
          }
        }

        if (changed) {
          // Async write - non-blocking
          await fsp.writeFile(logPath, JSON.stringify(localLogs, null, 2))
          log.info(`Channel ${channelId} synced and updated via Detective Mode.`)
        }
      }
    } catch (err: any) {
      log.error(`Detective sync failed for ${channelId}:`, err)
    }
  }

  private connect(): void {
    log.info('Connecting to Discord Gateway...')
    this.ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json')

    this.ws.on('open', () => {
      log.info('WebSocket connection opened.')
      this.identify()
    })

    this.ws.on('message', (data) => {
      try {
        const payload = JSON.parse(data.toString())
        const { op, t, d } = payload

        if (op === 10) { // Hello
          log.info('Gateway Hello received.')
          this.startHeartbeat(d.heartbeat_interval)
        } else if (t === 'READY') {
          log.info(`Gateway READY - Logged in as: ${d.user.username}`)
        } else if (t === 'MESSAGE_CREATE') {
          log.info(`Captured: ${d.author.username} sent a message.`)
          this.handleMessageCreate(d)
        } else if (t === 'MESSAGE_DELETE') {
          log.info(`Deletion: Message ID ${d.id} was deleted.`)
          this.handleMessageDelete(d)
        } else if (t === 'MESSAGE_UPDATE') {
          this.handleMessageUpdate(d)
        }
      } catch (err) {
        log.error('Gateway error:', err)
      }
    })

    this.ws.on('close', (code, reason) => {
      log.warn(`Gateway closed (${code}). Reconnecting...`)
      setTimeout(() => this.connect(), 5000)
    })
  }

  private identify(): void {
    log.info('Identifying as real client...')
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.token,
        capabilities: 16381,
        properties: {
          $os: 'Windows',
          $browser: 'Chrome',
          $device: '',
          $system_locale: 'tr-TR',
          $browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          $browser_version: '120.0.0.0',
          $os_version: '10',
          $release_channel: 'stable',
          $client_build_number: 250000
        },
        presence: { status: 'online', since: 0, activities: [], afk: false },
        compress: false,
        client_state: {
          guild_versions: {},
          highest_last_message_id: '0',
          read_states_version: 0,
          user_guild_settings_version: -1,
          user_settings_version: -1,
          private_channels_version: '0',
          api_code_version: 0
        }
      }
    }))
  }

  private startHeartbeat(interval: number): void {
    setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 1, d: null }))
    }, interval)
  }

  private getLogPath(userId: string, channelId: string): string {
    const now = new Date()
    const monthDir = path.join(this.archivesPath, userId, channelId)
    if (!fs.existsSync(monthDir)) fs.mkdirSync(monthDir, { recursive: true })
    return path.join(monthDir, `${now.getFullYear()}_${now.getMonth() + 1}.json`)
  }

  private handleMessageCreate(msg: DiscordMessage): void {
    const config = configManager.getConfig()
    if (!config.trackDeletedMessages) return // Skip if tracking is disabled
    
    // Add to queue instead of writing immediately
    const channelId = msg.channel_id
    if (!this.messageQueue.has(channelId)) {
      this.messageQueue.set(channelId, [])
    }
    this.messageQueue.get(channelId)!.push(msg)

    // Download attachments in background (non-blocking)
    if (msg.attachments && msg.attachments.length > 0) {
      setImmediate(() => {
        this.downloadAttachments(msg)
      })
    }
  }

  private async handleMessageDelete(data: { id: string, channel_id: string }): Promise<void> {
    const config = configManager.getConfig()
    if (!config.trackDeletedMessages) return // Skip if tracking is disabled
    
    // Use setImmediate to not block the main thread
    setImmediate(async () => {
      const userId = config.lastUserId || 'unknown'
      const channelDir = path.join(this.archivesPath, userId, data.channel_id)
      
      if (!fs.existsSync(channelDir)) return

      try {
        const files = await fsp.readdir(channelDir)
        const jsonFiles = files.filter(f => f.endsWith('.json'))
        
        for (const file of jsonFiles) {
          const fullPath = path.join(channelDir, file)
          const marked = await this.markAsDeleted(fullPath, data.id)
          if (marked) break
        }
      } catch (err) {
        log.error('Error handling message delete:', err)
      }
    })
  }

  private async markAsDeleted(filePath: string, messageId: string): Promise<boolean> {
    try {
      const content = await fsp.readFile(filePath, 'utf-8')
      const logs: DiscordMessage[] = JSON.parse(content)
      const msgIndex = logs.findIndex(m => m.id === messageId)
      
      if (msgIndex !== -1) {
        logs[msgIndex].deleted = true
        await fsp.writeFile(filePath, JSON.stringify(logs, null, 2))
        log.info(`Success: Message ${messageId} marked as deleted in ${filePath}`)
        return true
      }
    } catch (e) { 
      log.error('Error marking message as deleted:', e)
      return false 
    }
    return false
  }

  private async handleMessageUpdate(msg: DiscordMessage): Promise<void> {
    setImmediate(async () => {
      const userId = configManager.getConfig().lastUserId || 'unknown'
      const logPath = this.getLogPath(userId, msg.channel_id)
      
      if (fs.existsSync(logPath)) {
        try {
          const content = await fsp.readFile(logPath, 'utf-8')
          const logs: DiscordMessage[] = JSON.parse(content)
          const msgIndex = logs.findIndex(m => m.id === msg.id)
          
          if (msgIndex !== -1) {
            logs[msgIndex] = { ...logs[msgIndex], ...msg, updated: true }
            await fsp.writeFile(logPath, JSON.stringify(logs, null, 2))
          }
        } catch (e) {
          log.error('Error handling message update:', e)
        }
      }
    })
  }

  private async downloadAttachments(msg: DiscordMessage): Promise<void> {
    const userId = configManager.getConfig().lastUserId || 'unknown'
    const attDir = path.join(this.archivesPath, userId, msg.channel_id, 'attachments')
    if (!fs.existsSync(attDir)) fs.mkdirSync(attDir, { recursive: true })

    for (const att of msg.attachments) {
      try {
        const filePath = path.join(attDir, `${msg.id}_${att.filename}`)
        const response = await axios({ url: att.url, method: 'GET', responseType: 'stream' })
        const writer = fs.createWriteStream(filePath)
        response.data.pipe(writer)
      } catch (err) { }
    }
  }
}

export const discordWatcher = new DiscordWatcher()
