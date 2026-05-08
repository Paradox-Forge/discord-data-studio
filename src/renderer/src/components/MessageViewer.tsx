import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { discordApi } from '../services/discordApi'
import { formatDate } from '../lib/utils'
import { FileIcon, ImageIcon, User, Loader2 } from 'lucide-react'



const MessageViewer: React.FC = () => {
  const { selectedChannelId, token, messages, setMessages, addMessages, isLoading, setLoading, isArchiveView } = useStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [hasMore, setHasMore] = useState(true)

  const fetchMessages = useCallback(async (before?: string) => {
    if (!token || !selectedChannelId) return
    setLoading(true)
    try {
      const fetched = await discordApi.getMessages(token, selectedChannelId, before)
      if (fetched.length < 50) setHasMore(false)
      
      if (before) {
        addMessages(fetched)
      } else {
        setMessages(fetched)
        setHasMore(true)
      }
    } catch (err) {
      console.error('Failed to fetch messages', err)
    } finally {
      setLoading(false)
    }
  }, [selectedChannelId, token, addMessages, setMessages, setLoading])

  useEffect(() => {
    if (selectedChannelId) {
      fetchMessages()
    }
  }, [selectedChannelId, fetchMessages])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
    // Check if we reached bottom
    if (scrollHeight - scrollTop <= clientHeight + 100 && hasMore && !isLoading) {
      const lastMessageId = messages[messages.length - 1]?.id
      if (lastMessageId) fetchMessages(lastMessageId)
    }
  }

  if (!selectedChannelId && !isArchiveView) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-8 text-center">
        <div className="space-y-4 max-w-sm">
          <div className="flex justify-center">
            <User className="w-12 h-12 opacity-20" />
          </div>
          <p>Select a conversation from the sidebar to view messages</p>
        </div>
      </div>
    )
  }

  return (
    <div 
      className="h-full overflow-y-auto p-6 space-y-6 custom-scrollbar"
      onScroll={handleScroll}
      ref={scrollRef}
    >
      {messages.map((msg, idx) => (
        <div key={msg.id} className="flex gap-4 group animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex-shrink-0">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
              {msg.author.avatar ? (
                <img 
                  src={`https://cdn.discordapp.com/avatars/${msg.author.id}/${msg.author.avatar}.png`} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-sm hover:underline cursor-pointer">
                {msg.author.username}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {formatDate(msg.timestamp)}
              </span>
            </div>
            <p className="text-sm leading-relaxed break-words whitespace-pre-wrap mt-0.5">
              {msg.content}
            </p>
            
            {msg.attachments.length > 0 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {msg.attachments.map((att: any) => {
                  const isImage = att.content_type?.startsWith('image/')
                  return (
                    <div 
                      key={att.id} 
                      className="border border-border rounded-lg bg-secondary/30 p-2 group/att relative overflow-hidden"
                    >
                      {isImage ? (
                        <div className="aspect-video relative rounded overflow-hidden">
                          <img src={att.proxy_url} className="w-full h-full object-contain" alt="" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 p-1">
                          <FileIcon className="w-4 h-4 text-primary" />
                          <span className="text-xs truncate">{att.filename}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 opacity-0 group-hover/att:opacity-100 transition-opacity">
                        <button className="p-1 bg-black/50 rounded-md text-white hover:bg-black/80">
                          <ImageIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ))}
      
      {isLoading && (
        <div className="flex justify-center p-4">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}
      
      {!hasMore && messages.length > 0 && (
        <div className="text-center text-xs text-muted-foreground py-8 border-t border-border mt-8">
          Reached the beginning of the conversation
        </div>
      )}
    </div>
  )
}

export default MessageViewer
