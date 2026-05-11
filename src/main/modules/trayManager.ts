import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron'
import path from 'path'
import { configManager } from './configManager'

export class TrayManager {
  private tray: Tray | null = null
  private mainWindow: BrowserWindow

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow
    this.initTray()
  }

  private initTray(): void {
    // Icon path - using a fallback if icon doesn't exist
    const iconPath = path.join(app.getAppPath(), 'public/icon.ico')
    let icon = nativeImage.createEmpty()
    
    try {
      icon = nativeImage.createFromPath(iconPath)
    } catch (e) {
      console.error('Tray icon not found')
    }

    this.tray = new Tray(icon)
    this.tray.setToolTip('Discord Data Studio')

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Uygulamayı Aç',
        click: (): void => {
          this.mainWindow.show()
        }
      },
      { type: 'separator' },
      {
        label: 'Çıkış',
        click: (): void => {
          app.quit()
        }
      }
    ])

    this.tray.setContextMenu(contextMenu)

    this.tray.on('double-click', () => {
      this.mainWindow.show()
    })

    // Handle window close event to minimize to tray
    this.mainWindow.on('close', (event) => {
      const { isTrayEnabled } = configManager.getConfig()
      if (isTrayEnabled && !(app as any).isQuitting) {
        event.preventDefault()
        this.mainWindow.hide()
      }
    })

    app.on('before-quit', () => {
      ;(app as any).isQuitting = true
    })
  }
}
