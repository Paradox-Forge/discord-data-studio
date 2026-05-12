/// <reference types="vite/client" />

interface Window {
  electron: any
  api: {
    selectFolder: () => Promise<string>
    downloadAttachments: (data: { channelId: string, attachments: any[] }) => Promise<any>
    saveArchive: (data: { filename: string, data: any }) => Promise<boolean>
    loadArchive: () => Promise<any>
    toggleDevTools: () => Promise<boolean>
    startWatcher: (token: string) => Promise<boolean>
    getAllLogs: () => Promise<any[]>
    getConfig: () => Promise<any>
    updateConfig: (config: any) => Promise<boolean>
    syncChannelCache: (channelId: string) => Promise<boolean>
    addTrackedUser: (user: any) => Promise<{ success: boolean; error?: string }>
    removeTrackedUser: (userId: string) => Promise<{ success: boolean }>
    getUserChangeLogs: () => Promise<any[]>
    fetchUserInfo: (userId: string, token: string) => Promise<any>
    forceCheckUsers: () => Promise<{ success: boolean; error?: string }>
  }
}
