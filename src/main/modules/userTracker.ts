import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import WebSocket from 'ws'
import log from 'electron-log'
import { configManager } from './configManager'
import { TrackedUser, UserChangeLog, DiscordUserFull } from '@shared/types'

export class UserTracker {
  private token: string | null = null
  private logsPath: string
  private intervalId: NodeJS.Timeout | null = null
  public userCache: Map<string, DiscordUserFull> = new Map() // Made public for initial caching
  private presenceCache: Map<string, string> = new Map() // Store user presence/status
  private readonly POLL_INTERVAL = 60000 // 60 seconds
  private ws: WebSocket | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private lastSequence: number | null = null

  constructor() {
    this.logsPath = path.join(app.getPath('userData'), 'user_tracking')
    if (!fs.existsSync(this.logsPath)) {
      fs.mkdirSync(this.logsPath, { recursive: true })
    }
    log.info('UserTracker initialized at:', this.logsPath)
  }

  public start(token: string): void {
    log.info('Starting UserTracker...')
    this.token = token
    
    // Try to connect to Discord Gateway for presence updates (optional)
    try {
      this.connectGateway()
    } catch (err: any) {
      log.error('[UserTracker] Failed to start Gateway connection:', err.message)
      log.warn('[UserTracker] Continuing without presence tracking...')
    }
    
    // Initial fetch for all tracked users
    this.checkAllUsers()
    
    // Start polling
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
    this.intervalId = setInterval(() => {
      this.checkAllUsers()
    }, this.POLL_INTERVAL)
    
    log.info(`UserTracker started with ${this.POLL_INTERVAL}ms interval`)
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.ws) {
      try {
        this.ws.close()
      } catch (e) {
        // Ignore
      }
      this.ws = null
    }
    log.info('UserTracker stopped')
  }

  private connectGateway(): void {
    if (!this.token) {
      log.warn('[UserTracker] No token available, skipping Gateway connection')
      return
    }

    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.close()
      } catch (e) {
        // Ignore
      }
      this.ws = null
    }

    try {
      log.info('[UserTracker] Connecting to Discord Gateway for presence tracking...')
      this.ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json')

      this.ws.on('open', () => {
        log.info('[UserTracker] Gateway connection opened')
        this.identifyGateway()
      })

      this.ws.on('message', (data) => {
        try {
          const payload = JSON.parse(data.toString())
          this.handleGatewayMessage(payload)
        } catch (err) {
          log.error('[UserTracker] Gateway message parse error:', err)
        }
      })

      this.ws.on('close', (code, reason) => {
        log.warn(`[UserTracker] Gateway closed (${code}: ${reason}). Will reconnect in 5s...`)
        this.ws = null
        // Only reconnect if we still have a token
        if (this.token) {
          setTimeout(() => this.connectGateway(), 5000)
        }
      })

      this.ws.on('error', (err: any) => {
        log.error('[UserTracker] Gateway error:', err.message || err)
        // Don't crash, just log the error
      })
    } catch (err: any) {
      log.error('[UserTracker] Failed to create WebSocket:', err.message || err)
      // Retry after delay
      if (this.token) {
        setTimeout(() => this.connectGateway(), 5000)
      }
    }
  }

  private identifyGateway(): void {
    if (!this.ws || !this.token) {
      log.warn('[UserTracker] Cannot identify: no WebSocket or token')
      return
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      log.warn('[UserTracker] Cannot identify: WebSocket not open')
      return
    }

    try {
      log.info('[UserTracker] Identifying to Gateway...')
      this.ws.send(JSON.stringify({
        op: 2,
        d: {
          token: this.token,
          properties: {
            $os: 'windows',
            $browser: 'chrome',
            $device: 'desktop'
          },
          intents: 513 // GUILDS (1) + GUILD_PRESENCES (512)
        }
      }))
    } catch (err: any) {
      log.error('[UserTracker] Failed to send identify:', err.message || err)
    }
  }

  private handleGatewayMessage(payload: any): void {
    const { op, t, d, s } = payload

    if (op === 10) {
      // Hello - start heartbeat
      log.info('[UserTracker] Gateway Hello received')
      const heartbeatInterval = d.heartbeat_interval
      
      // Clear any existing heartbeat interval
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval)
      }
      
      this.heartbeatInterval = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ op: 1, d: this.lastSequence }))
            log.debug('[UserTracker] Heartbeat sent')
          } catch (err: any) {
            log.error('[UserTracker] Failed to send heartbeat:', err.message)
          }
        }
      }, heartbeatInterval)
    } else if (op === 11) {
      // Heartbeat ACK
      log.debug('[UserTracker] Heartbeat ACK received')
    } else if (t === 'READY') {
      log.info('[UserTracker] Gateway READY - presence tracking active')
      log.info(`[UserTracker] Connected as: ${d.user?.username}`)
    } else if (t === 'PRESENCE_UPDATE') {
      this.handlePresenceUpdate(d)
    }
    
    // Store sequence number for heartbeat
    if (s) {
      this.lastSequence = s
    }
  }

  private handlePresenceUpdate(data: any): void {
    const userId = data.user?.id
    if (!userId) return

    // Check if this user is being tracked
    const config = configManager.getConfig()
    const trackedUser = (config.trackedUsers || []).find(u => u.userId === userId)
    
    if (!trackedUser || !trackedUser.trackingOptions.status) return

    const newStatus = data.status // online, idle, dnd, offline
    const oldStatus = this.presenceCache.get(userId)

    log.info(`[UserTracker] Presence update for ${userId}: ${oldStatus} → ${newStatus}`)

    if (oldStatus && oldStatus !== newStatus) {
      // Status changed!
      log.info(`[UserTracker] ✅ STATUS CHANGED: ${oldStatus} → ${newStatus}`)
      
      const timestamp = Date.now()
      const change: UserChangeLog = {
        id: `${userId}_${timestamp}_status`,
        userId: userId,
        username: trackedUser.username,
        globalName: null,
        avatar: trackedUser.avatar,
        changeType: 'status',
        oldValue: this.getStatusLabel(oldStatus),
        newValue: this.getStatusLabel(newStatus),
        timestamp
      }

      this.saveChanges([change])
      log.info(`[UserTracker] 🎉 Logged status change for user ${userId}`)
    }

    // Update cache
    this.presenceCache.set(userId, newStatus)
  }

  private getStatusLabel(status: string): string {
    switch (status) {
      case 'online': return '🟢 Çevrimiçi'
      case 'idle': return '🟡 Boşta'
      case 'dnd': return '🔴 Rahatsız Etmeyin'
      case 'offline': return '⚫ Çevrimdışı'
      default: return status
    }
  }

  private async checkAllUsers(): Promise<void> {
    const config = configManager.getConfig()
    const trackedUsers = config.trackedUsers || []

    log.info(`[UserTracker] Checking ${trackedUsers.length} tracked users...`)

    for (const trackedUser of trackedUsers) {
      await this.checkUser(trackedUser)
      // Small delay between requests to avoid rate limiting
      await this.sleep(1000)
    }
    
    log.info(`[UserTracker] Finished checking all users`)
  }

  private async checkUser(trackedUser: TrackedUser): Promise<void> {
    if (!this.token) return

    try {
      log.info(`[UserTracker] Checking user: ${trackedUser.username} (${trackedUser.userId})`)
      
      // Try profile endpoint first
      let currentData: DiscordUserFull | null = null
      
      try {
        const profileResponse = await axios.get<any>(
          `https://discord.com/api/v9/users/${trackedUser.userId}/profile`,
          {
            headers: {
              Authorization: this.token,
              'Content-Type': 'application/json'
            }
          }
        )
        
        if (profileResponse.data && profileResponse.data.user) {
          currentData = {
            id: profileResponse.data.user.id,
            username: profileResponse.data.user.username,
            avatar: profileResponse.data.user.avatar,
            discriminator: profileResponse.data.user.discriminator || '0',
            public_flags: profileResponse.data.user.public_flags || 0,
            global_name: profileResponse.data.user.global_name || null,
            banner: profileResponse.data.user.banner || null,
            accent_color: profileResponse.data.user.accent_color || null,
            bio: profileResponse.data.user.bio || ''
          }
          log.info(`[UserTracker] Fetched via profile: ${currentData.username}`)
        }
      } catch (profileErr) {
        log.warn(`[UserTracker] Profile endpoint failed for ${trackedUser.userId}, trying DM method...`)
        // Profile failed, try DM method
        const dmResponse = await axios.post<any>(
          `https://discord.com/api/v9/users/@me/channels`,
          { recipient_id: trackedUser.userId },
          {
            headers: {
              Authorization: this.token,
              'Content-Type': 'application/json'
            }
          }
        )
        
        if (dmResponse.data && dmResponse.data.recipients && dmResponse.data.recipients.length > 0) {
          const user = dmResponse.data.recipients[0]
          currentData = {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            discriminator: user.discriminator || '0',
            public_flags: user.public_flags || 0,
            global_name: user.global_name || null,
            banner: user.banner || null,
            accent_color: user.accent_color || null,
            bio: user.bio || ''
          }
          log.info(`[UserTracker] Fetched via DM: ${currentData.username}`)
        }
      }

      if (!currentData) {
        log.warn(`[UserTracker] Could not fetch current data for user ${trackedUser.userId}`)
        return
      }

      const cachedData = this.userCache.get(trackedUser.userId)

      if (cachedData) {
        log.info(`[UserTracker] Comparing cached data with current data for ${trackedUser.username}`)
        // Compare and log changes
        this.compareAndLog(trackedUser, cachedData, currentData)
      } else {
        log.info(`[UserTracker] First time caching user ${trackedUser.username} - no comparison yet`)
      }

      // Update cache
      this.userCache.set(trackedUser.userId, currentData)
      log.info(`[UserTracker] Cache updated for ${trackedUser.username}`)
    } catch (err: any) {
      log.error(`[UserTracker] Failed to check user ${trackedUser.userId}:`, err.message)
    }
  }

  private compareAndLog(
    trackedUser: TrackedUser,
    oldData: DiscordUserFull,
    newData: DiscordUserFull
  ): void {
    const changes: UserChangeLog[] = []
    const timestamp = Date.now()

    log.info(`[UserTracker] Comparing data for ${trackedUser.username}:`)
    log.info(`[UserTracker] Old: username=${oldData.username}, global_name=${oldData.global_name}, avatar=${oldData.avatar}, banner=${oldData.banner}`)
    log.info(`[UserTracker] New: username=${newData.username}, global_name=${newData.global_name}, avatar=${newData.avatar}, banner=${newData.banner}`)

    // Check username
    if (trackedUser.trackingOptions.username && oldData.username !== newData.username) {
      log.info(`[UserTracker] ✅ USERNAME CHANGED: ${oldData.username} → ${newData.username}`)
      changes.push({
        id: `${trackedUser.userId}_${timestamp}_username`,
        userId: trackedUser.userId,
        username: newData.username,
        globalName: newData.global_name || null,
        avatar: newData.avatar,
        changeType: 'username',
        oldValue: oldData.username,
        newValue: newData.username,
        timestamp
      })
    }

    // Check global_name
    if (trackedUser.trackingOptions.globalName && oldData.global_name !== newData.global_name) {
      log.info(`[UserTracker] ✅ GLOBAL NAME CHANGED: ${oldData.global_name} → ${newData.global_name}`)
      changes.push({
        id: `${trackedUser.userId}_${timestamp}_globalName`,
        userId: trackedUser.userId,
        username: newData.username,
        globalName: newData.global_name || null,
        avatar: newData.avatar,
        changeType: 'globalName',
        oldValue: oldData.global_name || null,
        newValue: newData.global_name || null,
        timestamp
      })
    }

    // Check avatar
    if (trackedUser.trackingOptions.avatar && oldData.avatar !== newData.avatar) {
      const oldAvatarUrl = oldData.avatar
        ? `https://cdn.discordapp.com/avatars/${trackedUser.userId}/${oldData.avatar}.png`
        : null
      const newAvatarUrl = newData.avatar
        ? `https://cdn.discordapp.com/avatars/${trackedUser.userId}/${newData.avatar}.png`
        : null

      log.info(`[UserTracker] ✅ AVATAR CHANGED: ${oldData.avatar} → ${newData.avatar}`)
      changes.push({
        id: `${trackedUser.userId}_${timestamp}_avatar`,
        userId: trackedUser.userId,
        username: newData.username,
        globalName: newData.global_name || null,
        avatar: newData.avatar,
        changeType: 'avatar',
        oldValue: oldAvatarUrl,
        newValue: newAvatarUrl,
        timestamp
      })
    }

    // Check banner
    if (trackedUser.trackingOptions.banner && oldData.banner !== newData.banner) {
      const oldBannerUrl = oldData.banner
        ? `https://cdn.discordapp.com/banners/${trackedUser.userId}/${oldData.banner}.png?size=600`
        : null
      const newBannerUrl = newData.banner
        ? `https://cdn.discordapp.com/banners/${trackedUser.userId}/${newData.banner}.png?size=600`
        : null

      log.info(`[UserTracker] ✅ BANNER CHANGED: ${oldData.banner} → ${newData.banner}`)
      changes.push({
        id: `${trackedUser.userId}_${timestamp}_banner`,
        userId: trackedUser.userId,
        username: newData.username,
        globalName: newData.global_name || null,
        avatar: newData.avatar,
        changeType: 'banner',
        oldValue: oldBannerUrl,
        newValue: newBannerUrl,
        timestamp
      })
    }

    // Save changes to log file
    if (changes.length > 0) {
      this.saveChanges(changes)
      log.info(`[UserTracker] 🎉 Logged ${changes.length} changes for user ${trackedUser.userId}`)
    } else {
      log.info(`[UserTracker] No changes detected for ${trackedUser.username}`)
    }
  }

  private saveChanges(changes: UserChangeLog[]): void {
    const logFile = path.join(this.logsPath, 'user_changes.json')
    let existingLogs: UserChangeLog[] = []

    if (fs.existsSync(logFile)) {
      try {
        existingLogs = JSON.parse(fs.readFileSync(logFile, 'utf-8'))
      } catch (e) {
        existingLogs = []
      }
    }

    existingLogs.push(...changes)
    fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2))
  }

  public getAllLogs(): UserChangeLog[] {
    const logFile = path.join(this.logsPath, 'user_changes.json')
    if (fs.existsSync(logFile)) {
      try {
        return JSON.parse(fs.readFileSync(logFile, 'utf-8'))
      } catch (e) {
        return []
      }
    }
    return []
  }

  public async fetchUserInfo(userId: string, token?: string): Promise<DiscordUserFull | null> {
    const authToken = token || this.token
    if (!authToken) {
      log.error('fetchUserInfo: No token available')
      return null
    }

    try {
      log.info(`[UserTracker] Fetching user info for: ${userId}`)
      log.info(`[UserTracker] Using token: ${authToken.substring(0, 20)}...`)
      
      // Method 1: Try to get user profile (works for friends and mutual servers)
      try {
        const profileResponse = await axios.get<any>(
          `https://discord.com/api/v9/users/${userId}/profile`,
          {
            headers: {
              Authorization: authToken,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        )
        
        if (profileResponse.data && profileResponse.data.user) {
          log.info(`[UserTracker] Successfully fetched user via profile: ${profileResponse.data.user.username}`)
          return {
            id: profileResponse.data.user.id,
            username: profileResponse.data.user.username,
            avatar: profileResponse.data.user.avatar,
            discriminator: profileResponse.data.user.discriminator || '0',
            public_flags: profileResponse.data.user.public_flags || 0,
            global_name: profileResponse.data.user.global_name || null,
            banner: profileResponse.data.user.banner || null,
            accent_color: profileResponse.data.user.accent_color || null,
            bio: profileResponse.data.user.bio || ''
          }
        }
      } catch (profileErr: any) {
        log.warn(`[UserTracker] Profile endpoint failed, trying DM method...`)
      }
      
      // Method 2: Create/Open DM channel to get user info
      log.info(`[UserTracker] Attempting to open DM channel with user ${userId}`)
      const dmResponse = await axios.post<any>(
        `https://discord.com/api/v9/users/@me/channels`,
        {
          recipient_id: userId
        },
        {
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      )
      
      if (dmResponse.data && dmResponse.data.recipients && dmResponse.data.recipients.length > 0) {
        const user = dmResponse.data.recipients[0]
        log.info(`[UserTracker] Successfully fetched user via DM: ${user.username}`)
        return {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          discriminator: user.discriminator || '0',
          public_flags: user.public_flags || 0,
          global_name: user.global_name || null,
          banner: user.banner || null,
          accent_color: user.accent_color || null,
          bio: user.bio || ''
        }
      }
      
      log.error(`[UserTracker] Could not fetch user info for ${userId}`)
      return null
      
    } catch (err: any) {
      if (err.response) {
        log.error(`[UserTracker] Failed to fetch user ${userId}:`)
        log.error(`[UserTracker] Status: ${err.response.status} - ${err.response.statusText}`)
        log.error(`[UserTracker] Response data:`, JSON.stringify(err.response.data, null, 2))
        
        // Provide more specific error messages
        if (err.response.status === 403) {
          log.error(`[UserTracker] Access forbidden - user may have blocked you or privacy settings prevent access`)
        } else if (err.response.status === 404) {
          log.error(`[UserTracker] User not found - ID may be incorrect`)
        } else if (err.response.status === 401) {
          log.error(`[UserTracker] Unauthorized - token may be invalid`)
        }
      } else if (err.request) {
        log.error(`[UserTracker] No response received for user ${userId}`)
      } else {
        log.error(`[UserTracker] Error setting up request for user ${userId}:`, err.message)
      }
      return null
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export const userTracker = new UserTracker()
