import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import log from 'electron-log'

import fs from 'fs'
import path from 'path'
import axios from 'axios'

// Custom Modules
import { configManager } from './modules/configManager'
import { TrayManager } from './modules/trayManager'
import { discordWatcher } from './modules/discordWatcher'
import { userTracker } from './modules/userTracker'

let mainWindow: BrowserWindow
let trayManager: TrayManager

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#ffffff',
      height: 35
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Initialize Tray
  trayManager = new TrayManager(mainWindow)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.discordatastudio.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('get-all-logs', async () => {
    console.log('Main: Scanning archives for deleted messages...')
    const archivesPath = path.join(app.getPath('userData'), 'archives')
    if (!fs.existsSync(archivesPath)) return []

    const allMessages: any[] = []
    const scanDir = (dir: string) => {
      const items = fs.readdirSync(dir)
      for (const item of items) {
        const fullPath = path.join(dir, item)
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath)
        } else if (item.endsWith('.json')) {
          try {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
            if (Array.isArray(data)) {
              allMessages.push(...data)
            }
          } catch (e) {
            console.error('Error reading log:', fullPath)
          }
        }
      }
    }

    scanDir(archivesPath)
    return allMessages
  })

  ipcMain.handle('get-config', () => configManager.getConfig())
  
  ipcMain.handle('update-config', (_, newConfig) => {
    configManager.saveConfig(newConfig)
    return true
  })

  ipcMain.handle('start-watcher', (_, token) => {
    console.log('IPC: start-watcher received')
    
    // Save token to config for later use
    configManager.saveConfig({ discordToken: token })
    
    const config = configManager.getConfig()
    
    // Start message watcher if enabled
    if (config.trackDeletedMessages) {
      discordWatcher.start(token)
    }
    
    // Start user tracker
    userTracker.start(token)
    
    // Notify user that watcher is active
    dialog.showMessageBox({
      type: 'info',
      title: 'Watcher Active',
      message: 'Discord Real-time Watcher has started. All deletions will be captured while the app is open.',
      buttons: ['OK']
    })
    
    return true
  })

  ipcMain.handle('add-tracked-user', async (_, user) => {
    const config = configManager.getConfig()
    const trackedUsers = config.trackedUsers || []
    
    // Check if user already exists
    if (trackedUsers.find(u => u.userId === user.userId)) {
      return { success: false, error: 'User already tracked' }
    }
    
    trackedUsers.push(user)
    configManager.saveConfig({ trackedUsers })
    
    // Immediately fetch and cache the user's current state
    log.info(`[Main] New user added, fetching initial state for ${user.username}`)
    const token = config.discordToken
    if (token) {
      const userInfo = await userTracker.fetchUserInfo(user.userId, token)
      if (userInfo) {
        // Manually set the cache so next check will compare against this
        userTracker['userCache'].set(user.userId, userInfo)
        log.info(`[Main] Initial state cached for ${user.username}`)
      }
    }
    
    return { success: true }
  })

  ipcMain.handle('remove-tracked-user', (_, userId) => {
    const config = configManager.getConfig()
    const trackedUsers = (config.trackedUsers || []).filter(u => u.userId !== userId)
    configManager.saveConfig({ trackedUsers })
    return { success: true }
  })

  ipcMain.handle('get-user-change-logs', () => {
    return userTracker.getAllLogs()
  })

  ipcMain.handle('fetch-user-info', async (_, { userId, token }) => {
    log.info(`IPC: fetch-user-info called for userId: ${userId}`)
    
    if (!token) {
      log.error('fetch-user-info: No token provided')
      return null
    }
    
    return await userTracker.fetchUserInfo(userId, token)
  })

  ipcMain.handle('force-check-users', async () => {
    log.info('[Main] Force check requested')
    const config = configManager.getConfig()
    const token = config.discordToken
    
    if (!token) {
      log.error('[Main] No token available for force check')
      return { success: false, error: 'No token' }
    }
    
    // Temporarily set token if not set
    if (!userTracker['token']) {
      userTracker['token'] = token
    }
    
    // Force check all users
    await userTracker['checkAllUsers']()
    
    return { success: true }
  })

  ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Folder to Save Attachments'
    })
    if (canceled) return null
    return filePaths[0]
  })

  ipcMain.handle('download-attachments', async (_, { channelId, attachments, outputPath }: { channelId: string, attachments: any[], outputPath?: string }) => {
    try {
      const baseDir = outputPath || path.join(app.getPath('downloads'), 'DiscordDataStudio')
      const imgDir = path.join(baseDir, 'images')
      
      if (!fs.existsSync(imgDir)) {
        fs.mkdirSync(imgDir, { recursive: true })
      }

      const results = []
      for (const att of attachments) {
        try {
          const filePath = path.join(imgDir, att.saveName || att.filename)
          const response = await axios({
            url: att.url,
            method: 'GET',
            responseType: 'stream'
          })

          const writer = fs.createWriteStream(filePath)
          response.data.pipe(writer)

          await new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve())
            writer.on('error', (err) => reject(err))
          })
          results.push({ filename: att.filename, success: true })
        } catch (err) {
          console.error(`Failed to download ${att.filename}`, err)
          results.push({ filename: att.filename, success: false })
        }
      }

      return { success: true, results }
    } catch (err) {
      console.error('Download error:', err)
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle('save-archive', async (_, { filename, data }) => {
    const { filePath } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
      return true
    }
    return false
  })

  ipcMain.handle('load-archive', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })

    if (filePaths.length > 0) {
      const content = fs.readFileSync(filePaths[0], 'utf-8')
      return JSON.parse(content)
    }
    return null
  })

  ipcMain.handle('toggle-devtools', () => {
    console.log('Main: Toggle DevTools requested')
    const win = BrowserWindow.getFocusedWindow() || mainWindow
    if (win) {
      win.webContents.toggleDevTools()
    }
    return true
  })

  ipcMain.handle('sync-channel-cache', async (_, channelId) => {
    await discordWatcher.fetchChannelHistory(channelId)
    return true
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Check if tray is disabled, then quit
    if (!configManager.getConfig().isTrayEnabled) {
      app.quit()
    }
  }
})
