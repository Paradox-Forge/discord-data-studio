import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

import fs from 'fs'
import path from 'path'
import axios from 'axios'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
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
}

app.whenReady().then(() => {

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC Handlers
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

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
