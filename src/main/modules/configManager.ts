import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface AppConfig {
  isTrayEnabled: boolean
  isLoggingEnabled: boolean
  discordToken?: string
  lastUserId?: string
}

const defaultConfig: AppConfig = {
  isTrayEnabled: true,
  isLoggingEnabled: true
}

export class ConfigManager {
  private configPath: string
  private config: AppConfig

  constructor() {
    const userDataPath = app.getPath('userData')
    this.configPath = path.join(userDataPath, 'config.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8')
        return { ...defaultConfig, ...JSON.parse(data) }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
    return defaultConfig
  }

  public saveConfig(newConfig: Partial<AppConfig>): void {
    this.config = { ...this.config, ...newConfig }
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  public getConfig(): AppConfig {
    return this.config
  }
}

export const configManager = new ConfigManager()
