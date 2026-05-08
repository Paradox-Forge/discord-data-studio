import { contextBridge, ipcRenderer } from 'electron'

const api = {
  downloadAttachments: (data: { channelId: string, attachments: any[], outputPath?: string }) => ipcRenderer.invoke('download-attachments', data),
  saveArchive: (payload: { filename: string, data: any }) => ipcRenderer.invoke('save-archive', payload),
  loadArchive: () => ipcRenderer.invoke('load-archive'),
  selectDirectory: () => ipcRenderer.invoke('select-directory')
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
