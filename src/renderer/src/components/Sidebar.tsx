import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Search, User, Trash2, Terminal } from 'lucide-react'
import { cn } from '../lib/utils'

const Sidebar: React.FC = () => {
  const { channels, selectedChannelId, setSelectedChannelId, token, addChannel } = useStore()
  const [search, setSearch] = useState('')
  const [manualId, setManualId] = useState('')
  const [targetUserId, setTargetUserId] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const handleAddManual = async () => {
    if (!manualId && !targetUserId) return
    setIsAdding(true)
    try {
      let finalChannelId = manualId

      // If user provided a User ID but no Channel ID, we must find/create the DM
      if (targetUserId && !manualId) {
        const response = await fetch(`https://discord.com/api/v9/users/@me/channels`, {
          method: 'POST',
          headers: { 
            Authorization: token!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ recipient_id: targetUserId })
        })
        if (response.ok) {
          const channel = await response.json()
          finalChannelId = channel.id
          addChannel(channel)
        }
      } else if (manualId) {
        // If Channel ID is provided, try to fetch it directly
        const response = await fetch(`https://discord.com/api/v9/channels/${manualId}`, {
          headers: { Authorization: token! }
        })
        if (response.ok) {
          const channel = await response.json()
          addChannel(channel)
        }
      }

      if (finalChannelId) {
        setSelectedChannelId(finalChannelId)
        setManualId('')
        setTargetUserId('')
      } else {
        alert('Could not identify channel. Check IDs.')
      }
    } catch (err) {
      alert('Failed to index channel')
    } finally {
      setIsAdding(false)
    }
  }

  const filteredChannels = channels.filter(channel => {
    const name = channel.name || channel.recipients?.[0]?.username || 'Unknown'
    return name.toLowerCase().includes(search.toLowerCase())
  })

  return (
    <aside className="w-72 border-r border-border flex flex-col bg-card/30">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between px-2">
          <h1 className="font-bold text-lg">Conversations</h1>
        </div>

        {/* Global Navigation */}
        <button 
          onClick={() => {
            setSelectedChannelId(null)
            useStore.getState().setDeletedModalOpen(true)
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left font-bold text-sm border",
            useStore.getState().isDeletedModalOpen 
              ? "bg-destructive text-destructive-foreground border-destructive/50 shadow-lg shadow-destructive/20" 
              : "bg-secondary/50 border-border hover:border-primary/50"
          )}
        >
          <Trash2 className="w-5 h-5" />
          <span>Deleted Vault</span>
          {useStore.getState().isDeletedModalOpen && <div className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />}
        </button>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search DMs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-secondary/50 border border-border rounded-md text-sm focus:ring-1 focus:ring-primary outline-none"
          />
        </div>

        <div className="flex flex-col gap-2 p-1 bg-primary/5 rounded-lg border border-primary/20">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-tighter text-primary">Stealth Channel Indexer</span>
          </div>
          <div className="flex flex-col gap-1.5 px-1 pb-1">
            <input
              type="text"
              placeholder="Target User ID (Optional)"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full px-2.5 py-1 bg-background border border-border rounded-md text-[10px] outline-none focus:ring-1 focus:ring-primary transition-all"
            />
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Target Channel ID"
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                className="flex-1 px-2.5 py-1 bg-background border border-border rounded-md text-[10px] outline-none focus:ring-1 focus:ring-primary transition-all"
              />
              <button 
                onClick={handleAddManual}
                disabled={isAdding || (!manualId && !targetUserId)}
                className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-[10px] font-black uppercase tracking-widest disabled:opacity-50 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/20"
              >
                {isAdding ? '...' : 'Fetch'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {filteredChannels.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No conversations found
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredChannels.map(channel => {
              const recipient = channel.recipients?.[0]
              const name = recipient?.username || 'Group DM'
              const avatar = recipient ? `https://cdn.discordapp.com/avatars/${recipient.id}/${recipient.avatar}.png` : null
              const isSelected = selectedChannelId === channel.id

              return (
                <button
                  key={channel.id}
                  onClick={() => {
                    setSelectedChannelId(channel.id)
                    window.api.syncChannelCache(channel.id)
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-left group",
                    isSelected ? "bg-primary text-primary-foreground shadow-lg" : "hover:bg-secondary/80"
                  )}
                >
                  <div className="relative shrink-0">
                    {avatar && recipient.avatar ? (
                      <img src={avatar} className="w-10 h-10 rounded-full" alt="" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-6 h-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{name}</p>
                    <p className={cn(
                      "text-xs truncate",
                      isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
                    )}>
                      {channel.id}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-border mt-auto">
        <button 
          onClick={() => window.api.toggleDevTools()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-all text-xs font-mono border border-dashed border-border hover:border-primary/50"
        >
          <Terminal className="w-4 h-4" />
          <span>Open DevTools</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
