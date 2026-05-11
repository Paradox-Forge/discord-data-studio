import React, { useState, useEffect } from 'react'
import { useStore } from './store/useStore'
import { discordApi } from './services/discordApi'
import Sidebar from './components/Sidebar'
import MessageViewer from './components/MessageViewer'
import DeletedMessagesModal from './components/DeletedMessagesModal'
import FilterPanel from './components/FilterPanel'
import { AlertTriangle, Lock, LogOut } from 'lucide-react'
import { cn } from './lib/utils'

const App: React.FC = () => {
  const { token, setToken, setChannels, setError, error, reset, isArchiveView, selectedChannelId } = useStore()
  const [inputToken, setInputToken] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const handleLogin = async () => {
    if (!inputToken) return
    setIsVerifying(true)
    setError(null)
    try {
      const user = await discordApi.getUserMe(inputToken)
      console.log('Login successful:', user.username)
      
      const { setToken, setChannels, setCurrentUserId } = useStore.getState()
      setToken(inputToken)
      setCurrentUserId(user.id)
      const channels = await discordApi.getChannels(inputToken)
      setChannels(channels)
      
      // Save user ID to config so watcher knows where to save logs
      await window.api.updateConfig({ lastUserId: user.id })
      
      // Start Watcher
      console.log('Starting Discord Watcher...')
      window.api.startWatcher(inputToken)
    } catch (err: any) {
      setError(err.response?.status === 401 ? 'Invalid Discord Token' : 'Failed to connect to Discord')
    } finally {
      setIsVerifying(false)
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4 animate-in fade-in duration-700 relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" />
        
        <div className="w-full max-w-md space-y-8 glass p-10 rounded-[2rem] border border-white/10 shadow-2xl relative z-10 animate-float">
          <div className="text-center space-y-3">
            <div className="flex justify-center">
              <div className="p-4 bg-primary/20 rounded-2xl ring-1 ring-primary/50">
                <Lock className="w-10 h-10 text-primary" />
              </div>
            </div>
            <h1 className="text-4xl font-black tracking-tighter gradient-text">Discord Manager</h1>
            <p className="text-muted-foreground text-sm font-medium">Professional Message Studio</p>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Account Risk Warning</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Using a self-bot or manual token authentication is against Discord's Terms of Service. 
                Use this tool responsibly. We do not store your token permanently.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Discord Token</label>
              <input
                type="password"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="mfa.xxxxx..."
                className="w-full px-4 py-2 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>

            {error && <p className="text-destructive text-xs text-center">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={isVerifying || !inputToken}
              className="w-full py-2 bg-primary text-primary-foreground rounded-md font-semibold hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {isVerifying ? 'Verifying...' : 'Access My Data'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden animate-in fade-in duration-500">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <main className="flex-1 flex flex-col border-r border-border min-w-0">
        <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold truncate">Messages</h2>
            {isArchiveView && (
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] font-bold rounded border border-purple-500/20 uppercase tracking-widest">
                Archive Mode
              </span>
            )}
            {!isArchiveView && selectedChannelId && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded border border-primary/20 uppercase tracking-widest flex items-center gap-1">
                <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                Live Index
              </span>
            )}
          </div>
          <button 
            onClick={reset}
            className="p-2 hover:bg-secondary rounded-full transition-colors text-muted-foreground hover:text-foreground"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </header>
        <div className="flex-1 overflow-hidden">
          <MessageViewer />
        </div>
      </main>

      {/* Right Panel - Filters & Actions */}
      <FilterPanel />

      {/* Modals */}
      <DeletedMessagesModal />
    </div>
  )
}

export default App
