/// <reference types="vite/client" />

interface Window {
  electron: any
  api: {
    selectFolder: () => Promise<string>
    downloadAttachments: (data: { channelId: string, attachments: any[] }) => Promise<any>
    saveArchive: (data: { filename: string, data: any }) => Promise<boolean>
    loadArchive: () => Promise<any>
  }
}
