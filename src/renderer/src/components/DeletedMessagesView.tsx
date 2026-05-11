import React, { useEffect, useState } from 'react'
import { Trash2, User, Clock, Hash, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../lib/utils'

interface DeletedMessage {
  id: string
  content: string
  timestamp: string
  author: {
    username: string
    id: string
  }
  channel_id: string
  deleted?: boolean
  updated?: boolean
}

const DeletedMessagesView: React.FC = () => {
  const [messages, setMessages] = useState<DeletedMessage[]>([])
  const [loading, setLoading] = useState(true)

  const loadDeletedMessages = async () => {
    setLoading(true)
    try {
      const allLogs = await (window as any).electron.ipcRenderer.invoke('get-all-logs')
      // Sadece silinmiş olarak işaretlenenleri filtrele
      const deleted = allLogs
        .filter((msg: any) => msg.deleted)
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setMessages(deleted)
    } catch (err) {
      console.error('Failed to load deleted messages:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDeletedMessages()
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground animate-pulse font-medium">Scanning archives for deleted content...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-background/50">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Trash2 className="w-8 h-8 text-destructive" />
            Deleted Messages Vault
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time captured content that was removed from Discord.</p>
        </div>
        <button 
          onClick={loadDeletedMessages}
          className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-semibold transition-all"
        >
          Refresh Vault
        </button>
      </div>

      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 opacity-50">
          <AlertCircle className="w-16 h-16 mb-4" />
          <p className="text-xl font-bold">No deleted messages found yet</p>
          <p className="text-sm">The watcher must be active and messages must be deleted to appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className="group glass p-5 rounded-2xl border border-white/5 hover:border-destructive/30 transition-all hover:shadow-2xl hover:shadow-destructive/5 relative overflow-hidden"
            >
              {/* Background Accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
              
              <div className="flex items-start justify-between relative z-10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20">
                    <User className="w-6 h-6 text-destructive" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg text-foreground">{msg.author.username}</span>
                      <span className="text-[10px] bg-destructive/20 text-destructive font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-destructive/30">
                        Deleted
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {format(new Date(msg.timestamp), 'MMM d, yyyy HH:mm:ss')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Hash className="w-3.5 h-3.5" />
                        ID: {msg.channel_id}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-4 bg-background/40 rounded-xl border border-white/5 text-foreground leading-relaxed whitespace-pre-wrap font-medium">
                {msg.content || <span className="italic text-muted-foreground opacity-50">Empty content or attachment only</span>}
              </div>

              {/* ID Badge */}
              <div className="mt-3 flex justify-end">
                <code className="text-[10px] text-muted-foreground opacity-30 group-hover:opacity-100 transition-opacity">MSG_ID: {msg.id}</code>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DeletedMessagesView
