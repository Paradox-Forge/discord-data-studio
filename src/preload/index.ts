import { contextBridge, ipcRenderer } from 'electron'

  const api = {
  downloadAttachments: (data: { channelId: string, attachments: any[], outputPath?: string }) => ipcRenderer.invoke('download-attachments', data),
  saveArchive: (payload: { filename: string, data: any }) => ipcRenderer.invoke('save-archive', payload),
  loadArchive: () => ipcRenderer.invoke('load-archive'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  toggleDevTools: () => ipcRenderer.invoke('toggle-devtools'),
  startWatcher: (token: string) => ipcRenderer.invoke('start-watcher', token),
  getAllLogs: () => ipcRenderer.invoke('get-all-logs'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('update-config', config),
  syncChannelCache: (channelId: string) => ipcRenderer.invoke('sync-channel-cache', channelId),
  // User Tracking
  addTrackedUser: (user: any) => ipcRenderer.invoke('add-tracked-user', user),
  removeTrackedUser: (userId: string) => ipcRenderer.invoke('remove-tracked-user', userId),
  getUserChangeLogs: () => ipcRenderer.invoke('get-user-change-logs'),
  fetchUserInfo: (userId: string, token: string) => ipcRenderer.invoke('fetch-user-info', { userId, token }),
  forceCheckUsers: () => ipcRenderer.invoke('force-check-users')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
