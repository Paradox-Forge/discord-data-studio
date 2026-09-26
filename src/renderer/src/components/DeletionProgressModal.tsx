import React, { useState, useEffect } from 'react'
import { Trash2, Clock, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react'
import { DiscordMessage } from '@shared/types'

interface DeletionProgressModalProps {
  isOpen: boolean
  messages: DiscordMessage[]
  onClose: () => void
  onComplete: (deletedIds: string[]) => void
  token: string
  channelId: string
}

interface DeletionStatus {
  messageId: string
  content: string
  author: string
  timestamp: string
  status: 'pending' | 'deleting' | 'success' | 'error'
  error?: string
}

const DeletionProgressModal: React.FC<DeletionProgressModalProps> = ({
  isOpen,
  messages,
  onClose,
  onComplete,
  token,
  channelId
}) => {
  const [deletionStatuses, setDeletionStatuses] = useState<DeletionStatus[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [startTime, setStartTime] = useState<number>(0)
  const [elapsedTime, setElapsedTime] = useState<number>(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number>(0)
  const listRef = React.useRef<HTMLDivElement>(null)
  
  // Only show recent messages for performance (last 50)
  const visibleMessages = React.useMemo(() => {
    if (deletionStatuses.length <= 50) return deletionStatuses
    const startIdx = Math.max(0, currentIndex - 25)
    const endIdx = Math.min(deletionStatuses.length, currentIndex + 25)
    return deletionStatuses.slice(startIdx, endIdx)
  }, [deletionStatuses, currentIndex])

  useEffect(() => {
    if (isOpen && messages.length > 0) {
      // Initialize deletion statuses
      const statuses: DeletionStatus[] = messages.map(msg => ({
        messageId: msg.id,
        content: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : ''),
        author: msg.author.username,
        timestamp: msg.timestamp,
        status: 'pending'
      }))
      setDeletionStatuses(statuses)
      setCurrentIndex(0)
      setStartTime(Date.now())
      setElapsedTime(0)
      startDeletion(statuses)
    }
  }, [isOpen, messages])

  // Update elapsed time with better performance
  useEffect(() => {
    if (!isDeleting) return
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedTime(elapsed)
      
      // Calculate estimated time remaining
      if (currentIndex > 0) {
        const avgTimePerMessage = elapsed / currentIndex
        const remaining = (messages.length - currentIndex) * avgTimePerMessage
        setEstimatedTimeRemaining(remaining)
      }
    }, 500) // Update every 500ms instead of 100ms for better performance

    return () => clearInterval(interval)
  }, [isDeleting, startTime, currentIndex, messages.length])

  const startDeletion = async (statuses: DeletionStatus[]) => {
    setIsDeleting(true)
    const deletedIds: string[] = []
    
    for (let i = 0; i < statuses.length; i++) {
      const status = statuses[i]
      
      // Update to deleting
      setDeletionStatuses(prev => prev.map((s, idx) => 
        idx === i ? { ...s, status: 'deleting' as const } : s
      ))
      setCurrentIndex(i)

      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 0))

      try {
        // Delete message
        const response = await fetch(
          `https://discord.com/api/v9/channels/${channelId}/messages/${status.messageId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: token
            }
          }
        )

        if (response.ok) {
          // Success
          setDeletionStatuses(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'success' as const } : s
          ))
          deletedIds.push(status.messageId)
          
          // Wait 350ms between deletions (faster rate) - allow UI updates during wait
          await new Promise(resolve => setTimeout(resolve, 350))
        } else if (response.status === 429) {
          // Rate limited
          let retryAfter = 2000
          try {
            const data = await response.json()
            retryAfter = (data.retry_after || 2) * 1000
          } catch {
            // If parsing fails, use default
          }
          
          setDeletionStatuses(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'pending' as const } : s
          ))
          
          // Allow UI to update during wait
          await new Promise(resolve => setTimeout(resolve, retryAfter))
          
          // Retry
          try {
            const retryResponse = await fetch(
              `https://discord.com/api/v9/channels/${channelId}/messages/${status.messageId}`,
              {
                method: 'DELETE',
                headers: {
                  Authorization: token
                }
              }
            )
            
            if (retryResponse.ok) {
              setDeletionStatuses(prev => prev.map((s, idx) => 
                idx === i ? { ...s, status: 'success' as const } : s
              ))
              deletedIds.push(status.messageId)
            } else {
              setDeletionStatuses(prev => prev.map((s, idx) => 
                idx === i ? { ...s, status: 'error' as const, error: 'Rate limit retry failed' } : s
              ))
            }
          } catch (retryError: any) {
            setDeletionStatuses(prev => prev.map((s, idx) => 
              idx === i ? { ...s, status: 'error' as const, error: retryError.message } : s
            ))
          }
          
          await new Promise(resolve => setTimeout(resolve, 350))
        } else {
          // Other error
          setDeletionStatuses(prev => prev.map((s, idx) => 
            idx === i ? { ...s, status: 'error' as const, error: `HTTP ${response.status}` } : s
          ))
          await new Promise(resolve => setTimeout(resolve, 350))
        }
      } catch (error: any) {
        console.error('Deletion error:', error)
        setDeletionStatuses(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'error' as const, error: error.message || 'Network error' } : s
        ))
        await new Promise(resolve => setTimeout(resolve, 350))
      }

      // Force UI update every 10 messages
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }

    setIsDeleting(false)
    setCurrentIndex(messages.length)
    onComplete(deletedIds)
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`
    }
    return `${seconds}s`
  }

  const successCount = deletionStatuses.filter(s => s.status === 'success').length
  const errorCount = deletionStatuses.filter(s => s.status === 'error').length
  const progress = messages.length > 0 ? (currentIndex / messages.length) * 100 : 0

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/90 backdrop-blur-xl" />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[85vh] bg-card border border-destructive/30 rounded-3xl shadow-[0_0_100px_-20px_rgba(239,68,68,0.5)] flex flex-col overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
        
        {/* Header */}
        <div className="p-6 border-b border-destructive/20 bg-gradient-to-br from-destructive/10 to-destructive/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-destructive/20 rounded-2xl ring-2 ring-destructive/50 shadow-lg shadow-destructive/20">
                {isDeleting ? (
                  <Loader2 className="w-7 h-7 text-destructive animate-spin" />
                ) : (
                  <Trash2 className="w-7 h-7 text-destructive" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight">
                  {isDeleting ? 'Silme İşlemi Devam Ediyor' : 'Silme İşlemi Tamamlandı'}
                </h2>
                <p className="text-sm text-muted-foreground font-medium">
                  {messages.length} mesaj üzerinde işlem yapılıyor
                </p>
              </div>
            </div>
            {!isDeleting && (
              <button 
                onClick={onClose}
                className="p-2 hover:bg-destructive/10 rounded-full transition-all text-muted-foreground hover:text-destructive"
              >
                <X className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-bold text-foreground">İlerleme</span>
              <span className="font-mono font-bold text-destructive">{Math.round(progress)}%</span>
            </div>
            <div className="h-3 w-full bg-secondary rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-destructive to-red-500 transition-all duration-300 shadow-lg shadow-destructive/30"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-background/50 rounded-xl p-3 border border-border/50">
              <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Başarılı</div>
              <div className="text-xl font-black text-green-500">{successCount}</div>
            </div>
            <div className="bg-background/50 rounded-xl p-3 border border-border/50">
              <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Hatalı</div>
              <div className="text-xl font-black text-red-500">{errorCount}</div>
            </div>
            <div className="bg-background/50 rounded-xl p-3 border border-border/50">
              <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Geçen Süre</div>
              <div className="text-xl font-black text-blue-500">{formatTime(elapsedTime)}</div>
            </div>
            <div className="bg-background/50 rounded-xl p-3 border border-border/50">
              <div className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Kalan Süre</div>
              <div className="text-xl font-black text-yellow-500">
                {isDeleting ? formatTime(estimatedTimeRemaining) : '0s'}
              </div>
            </div>
          </div>
        </div>

        {/* Messages List */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar bg-gradient-to-b from-background/50 to-background"
        >
          {currentIndex > 25 && (
            <div className="text-center text-sm text-muted-foreground py-2 italic">
              ... {currentIndex - 25} önceki mesaj gizlendi (performans için)
            </div>
          )}
          {visibleMessages.map((status, idx) => {
            const actualIdx = currentIndex > 25 ? currentIndex - 25 + idx : idx
            return (
              <div 
                key={status.messageId}
                className={`p-4 rounded-xl border transition-all duration-300 ${
                  status.status === 'success' 
                    ? 'bg-green-500/5 border-green-500/30' 
                    : status.status === 'error'
                    ? 'bg-red-500/5 border-red-500/30'
                    : status.status === 'deleting'
                    ? 'bg-destructive/10 border-destructive/50 shadow-lg shadow-destructive/10 scale-105'
                    : 'bg-secondary/20 border-border/50 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm truncate">{status.author}</span>
                      {status.status === 'deleting' && (
                        <span className="text-[9px] bg-destructive/20 text-destructive font-black px-2 py-0.5 rounded-full uppercase tracking-widest animate-pulse">
                          Siliniyor
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate leading-relaxed">
                      {status.content || <span className="italic opacity-50">Boş mesaj</span>}
                    </p>
                    {status.error && (
                      <p className="text-[10px] text-red-500 mt-1 font-semibold">
                        Hata: {status.error}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {status.status === 'success' && (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    )}
                    {status.status === 'error' && (
                      <AlertCircle className="w-5 h-5 text-red-500" />
                    )}
                    {status.status === 'deleting' && (
                      <Loader2 className="w-5 h-5 text-destructive animate-spin" />
                    )}
                    {status.status === 'pending' && (
                      <Clock className="w-5 h-5 text-muted-foreground opacity-30" />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {deletionStatuses.length - currentIndex > 25 && (
            <div className="text-center text-sm text-muted-foreground py-2 italic">
              ... {deletionStatuses.length - currentIndex - 25} mesaj daha var
            </div>
          )}
        </div>

        {/* Footer */}
        {!isDeleting && (
          <div className="p-6 border-t border-border/50 bg-gradient-to-br from-background to-secondary/20 flex justify-between items-center">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Toplam İşlem</span>
              <span className="text-2xl font-black text-foreground">
                {successCount} / {messages.length} başarılı
              </span>
            </div>
            <button 
              onClick={onClose}
              className="px-8 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 shadow-xl shadow-primary/20 transition-all active:scale-95"
            >
              Kapat
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default DeletionProgressModal
