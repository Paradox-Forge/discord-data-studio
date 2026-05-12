import React, { useEffect, useState } from 'react'
import { Trash2, User, Clock, Hash, AlertCircle, X } from 'lucide-react'
import { format } from 'date-fns'
import { useStore } from '../store/useStore'
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
  attachments?: any[]
}

interface ChannelInfo {
  name: string
  type: 'dm' | 'group' | 'guild'
  guildName?: string
  recipientName?: string
}

const DeletedMessagesModal: React.FC = () => {
  const { isDeletedModalOpen, setDeletedModalOpen, channels, token } = useStore()
  const [messages, setMessages] = useState<DeletedMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [channelInfoCache, setChannelInfoCache] = useState<Map<string, ChannelInfo>>(new Map())

  const loadDeletedMessages = async () => {
    setLoading(true)
    try {
      const allLogs = await window.api.getAllLogs()
      const deleted = allLogs
        .filter((msg: any) => msg.deleted)
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setMessages(deleted)
      
      // Load channel info for all unique channel IDs
      const uniqueChannelIds = [...new Set(deleted.map((msg: any) => msg.channel_id))]
      await loadChannelInfo(uniqueChannelIds)
    } catch (err) {
      console.error('Failed to load deleted messages:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadChannelInfo = async (channelIds: string[]) => {
    if (!token) return

    const newCache = new Map(channelInfoCache)

    for (const channelId of channelIds) {
      // Skip if already cached
      if (newCache.has(channelId)) continue

      try {
        // First check if we have this channel in our channels list
        const existingChannel = channels.find(c => c.id === channelId)
        
        if (existingChannel) {
          // We have the channel info
          if (existingChannel.type === 1) {
            // DM
            const recipient = existingChannel.recipients?.[0]
            newCache.set(channelId, {
              name: recipient?.username || 'Unknown User',
              type: 'dm',
              recipientName: recipient?.username
            })
          } else if (existingChannel.type === 3) {
            // Group DM
            const recipientNames = existingChannel.recipients?.map(r => r.username).join(', ') || 'Group'
            newCache.set(channelId, {
              name: existingChannel.name || recipientNames,
              type: 'group',
              recipientName: recipientNames
            })
          } else {
            // Guild channel
            newCache.set(channelId, {
              name: existingChannel.name || 'Unknown Channel',
              type: 'guild',
              guildName: 'Server'
            })
          }
        } else {
          // Try to fetch channel info from API
          const response = await fetch(`https://discord.com/api/v9/channels/${channelId}`, {
            headers: { Authorization: token }
          })

          if (response.ok) {
            const channelData = await response.json()
            
            if (channelData.type === 1) {
              // DM
              const recipient = channelData.recipients?.[0]
              newCache.set(channelId, {
                name: recipient?.username || 'Unknown User',
                type: 'dm',
                recipientName: recipient?.username
              })
            } else if (channelData.type === 3) {
              // Group DM
              const recipientNames = channelData.recipients?.map((r: any) => r.username).join(', ') || 'Group'
              newCache.set(channelId, {
                name: channelData.name || recipientNames,
                type: 'group',
                recipientName: recipientNames
              })
            } else {
              // Guild channel - fetch guild info
              if (channelData.guild_id) {
                try {
                  const guildResponse = await fetch(`https://discord.com/api/v9/guilds/${channelData.guild_id}`, {
                    headers: { Authorization: token }
                  })
                  if (guildResponse.ok) {
                    const guildData = await guildResponse.json()
                    newCache.set(channelId, {
                      name: channelData.name || 'Unknown Channel',
                      type: 'guild',
                      guildName: guildData.name
                    })
                  } else {
                    newCache.set(channelId, {
                      name: channelData.name || 'Unknown Channel',
                      type: 'guild',
                      guildName: 'Server'
                    })
                  }
                } catch {
                  newCache.set(channelId, {
                    name: channelData.name || 'Unknown Channel',
                    type: 'guild',
                    guildName: 'Server'
                  })
                }
              }
            }
          } else {
            // Fallback
            newCache.set(channelId, {
              name: 'Unknown Channel',
              type: 'dm'
            })
          }
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (err) {
        console.error(`Failed to load channel info for ${channelId}:`, err)
        newCache.set(channelId, {
          name: 'Unknown Channel',
          type: 'dm'
        })
      }
    }

    setChannelInfoCache(newCache)
  }

  const getChannelDisplayName = (channelId: string): { primary: string; secondary?: string } => {
    const info = channelInfoCache.get(channelId)
    
    if (!info) {
      return { primary: channelId }
    }

    if (info.type === 'dm') {
      return { 
        primary: info.recipientName || info.name,
        secondary: 'Direct Message'
      }
    } else if (info.type === 'group') {
      return {
        primary: info.name,
        secondary: info.recipientName
      }
    } else {
      return {
        primary: info.name,
        secondary: info.guildName
      }
    }
  }

  useEffect(() => {
    if (isDeletedModalOpen) {
      loadDeletedMessages()
    }
  }, [isDeletedModalOpen])

  if (!isDeletedModalOpen) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 md:p-10 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
        onClick={() => setDeletedModalOpen(false)}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl max-h-[85vh] bg-card border border-white/10 rounded-[2.5rem] shadow-[0_0_100px_-20px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header */}
        <header className="flex items-center justify-between p-8 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-destructive/20 rounded-2xl ring-1 ring-destructive/50 shadow-lg shadow-destructive/20">
              <Trash2 className="w-8 h-8 text-destructive" />
            </div>
            <div>
              <h2 className="text-3xl font-black tracking-tighter">Deleted Vault</h2>
              <p className="text-muted-foreground text-sm font-medium">Real-time captured deleted content</p>
            </div>
          </div>
          <button 
            onClick={() => setDeletedModalOpen(false)}
            className="p-3 hover:bg-white/5 rounded-full transition-all text-muted-foreground hover:text-foreground active:scale-90"
          >
            <X className="w-6 h-6" />
          </button>
        </header>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-muted-foreground font-medium animate-pulse">Accessing secure archives...</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center opacity-30 text-center space-y-4">
              <AlertCircle className="w-16 h-16" />
              <div>
                <p className="text-xl font-bold">The Vault is Empty</p>
                <p className="text-sm max-w-xs">No deleted messages have been captured since the watcher was activated.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              {messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className="group bg-white/2 border border-white/5 p-6 rounded-3xl hover:bg-white/4 hover:border-destructive/30 transition-all hover:translate-x-1"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center">
                        <User className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{msg.author.username}</span>
                          <span className="text-[9px] bg-destructive/10 text-destructive font-black px-2 py-0.5 rounded-full uppercase tracking-widest border border-destructive/20">
                            Captured
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(msg.timestamp), 'MMM d, HH:mm:ss')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="w-3.5 h-3.5" />
                            <div className="flex flex-col">
                              {channelInfoCache.has(msg.channel_id) ? (
                                <>
                                  <span className="font-semibold text-foreground">
                                    {getChannelDisplayName(msg.channel_id).primary}
                                  </span>
                                  {getChannelDisplayName(msg.channel_id).secondary && (
                                    <span className="text-[10px] opacity-60">
                                      {getChannelDisplayName(msg.channel_id).secondary}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[10px] opacity-40 animate-pulse">
                                  Loading channel info...
                                </span>
                              )}
                            </div>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-4 bg-black/20 rounded-2xl border border-white/5 text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap font-medium">
                    {msg.content || <span className="italic opacity-30">No text content</span>}
                  </div>

                  {/* Attachments UI */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {msg.attachments.map((att: any) => {
                        const isImage = att.content_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename)
                        return (
                          <div key={att.id} className="relative group/att rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                            {isImage ? (
                              <img 
                                src={att.url} 
                                alt={att.filename}
                                className="w-full h-48 object-cover hover:scale-105 transition-transform duration-500 cursor-zoom-in"
                                onClick={() => window.open(att.url)}
                              />
                            ) : (
                              <div className="flex items-center gap-3 p-4">
                                <div className="p-2 bg-primary/20 rounded-lg">
                                  <AlertCircle className="w-5 h-5 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-bold truncate">{att.filename}</p>
                                  <p className="text-[10px] text-muted-foreground">{(att.size / 1024).toFixed(1)} KB</p>
                                </div>
                              </div>
                            )}
                            <a 
                              href={att.url} 
                              target="_blank" 
                              rel="noreferrer"
                              className="absolute top-2 right-2 p-2 bg-black/60 backdrop-blur-md rounded-full opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-primary"
                            >
                              <X className="w-4 h-4 rotate-45" />
                            </a>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-6 border-t border-white/5 bg-black/20 text-center">
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-50">
            Secure Local Data Studio • Discord Management Protocol
          </p>
        </footer>
      </div>
    </div>
  )
}

export default DeletedMessagesModal
