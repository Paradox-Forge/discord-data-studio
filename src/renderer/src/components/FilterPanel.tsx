import React, { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { Filter, Download, Trash2, FileJson, CheckCircle2, AlertCircle, FolderOpen, Search, X } from 'lucide-react'
import { cn, formatDate } from '../lib/utils'
import { bulkDeleteMessages, fetchAllMessages } from '../services/discordApi'

declare global {
  interface Window {
    scanStopRequested: boolean;
  }
}

const FilterPanel: React.FC = () => {
  const { messages, selectedChannelId, token, setMessages, addMessages, setArchiveView } = useStore()
  const [keyword, setKeyword] = useState('')
  const [onlyAttachments, setOnlyAttachments] = useState(false)
  const [dateAfter, setDateAfter] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [showDownloadPreview, setShowDownloadPreview] = useState(false)
  const [deleteCount, setDeleteCount] = useState('0')
  const [downloadLimit, setDownloadLimit] = useState('10') // Default to 10
  const [downloadSource, setDownloadSource] = useState<'filtered' | 'all'>('filtered')
  const [selectedOutputPath, setSelectedOutputPath] = useState<string | null>(null)
  
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'paused' | 'stopped'>('idle')
  const [lastScanId, setLastScanId] = useState<string | undefined>(undefined)
  const [stopRequest, setStopRequest] = useState(false)

  const filteredMessages = useMemo(() => {
    return messages.filter(msg => {
      try {
        const matchKeyword = keyword ? msg.content.toLowerCase().includes(keyword.toLowerCase()) : true
        const matchAttachment = onlyAttachments ? msg.attachments.length > 0 : true
        const matchDate = dateAfter ? new Date(msg.timestamp).getTime() >= new Date(dateAfter).getTime() : true
        return matchKeyword && matchAttachment && matchDate
      } catch (e) {
        return true
      }
    })
  }, [messages, keyword, onlyAttachments, dateAfter])

  const handleExport = async () => {
    const targets = showResults ? filteredMessages : messages
    if (targets.length === 0) return
    const success = await window.api.saveArchive({
      filename: `discord_export_${selectedChannelId}_${new Date().getTime()}.json`,
      data: targets
    })
    if (success) alert('Export saved successfully!')
  }

  const handleDownloadAttachments = async () => {
    if (!selectedOutputPath) {
      alert('Please select a download folder first!')
      return
    }

    const sourceMessages = downloadSource === 'filtered' ? filteredMessages : messages
    const attachments = sourceMessages.flatMap(m => m.attachments.map(a => {
      const timestamp = new Date(m.timestamp).toISOString().split('T')[0]
      const safeName = `${m.author.username}_${timestamp}_${a.filename}`.replace(/[^a-z0-9._-]/gi, '_')
      return { url: a.url, filename: a.filename, saveName: safeName, proxy_url: a.proxy_url }
    }))

    if (attachments.length === 0) {
      alert('No attachments found in the selected source')
      return
    }

    const limit = parseInt(downloadLimit) || attachments.length
    const targets = attachments.slice(0, limit)
    
    setIsProcessing(true)
    setShowDownloadPreview(false)
    try {
      const result = await window.api.downloadAttachments({
        channelId: selectedChannelId || 'archive',
        attachments: targets,
        outputPath: selectedOutputPath
      })
      if (result.success) alert(`${targets.length} attachments downloaded successfully!`)
    } catch (err) {
      alert('Failed to download attachments')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSelectPath = async () => {
    const path = await window.api.selectDirectory()
    if (path) setSelectedOutputPath(path)
  }

  const handleLoadArchive = async () => {
    try {
      const data = await window.api.loadArchive()
      if (data) {
        setArchiveView(true)
        setMessages(data)
        alert(`Loaded archive with ${data.length} messages`)
      }
    } catch (err) {
      alert('Failed to load archive')
    }
  }

  const handleScanDM = async () => {
    if (!token || !selectedChannelId) return
    setIsProcessing(true)
    setScanStatus('scanning')
    setStopRequest(false)
    setProgress((prev) => (prev === 100 ? 0 : prev))

    try {
      const { messages: fetched, lastId } = await fetchAllMessages(token, selectedChannelId, (batch) => {
        addMessages(batch)
        setProgress((prev) => Math.min(prev + 5, 95))
      }, {
        before: lastScanId,
        shouldStop: () => {
          // Check a ref-like variable or state that we can read during the loop
          // Since state updates are async, we'll check a flag
          return window.scanStopRequested === true
        }
      })
      
      setLastScanId(lastId)
      
      if (window.scanStopRequested) {
        setScanStatus('paused')
        window.scanStopRequested = false
      } else {
        setScanStatus('stopped')
        setProgress(100)
        alert('DM History scanned successfully!')
      }
    } catch (err) {
      alert('Failed to scan DM history')
      setScanStatus('stopped')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStopScan = () => {
    window.scanStopRequested = true
    setScanStatus('paused')
  }

  const handleDelete = async () => {
    const { currentUserId } = useStore.getState()
    if (!token || !selectedChannelId || filteredMessages.length === 0 || !currentUserId) return
    
    // SAFETY: Only target your OWN messages in DMs
    const ownMessages = filteredMessages.filter(m => m.author.id === currentUserId)
    
    if (ownMessages.length === 0) {
      alert('No deletable messages found. (In DMs, you can only delete your own messages)')
      return
    }

    const limit = parseInt(deleteCount) || ownMessages.length
    const targets = ownMessages.slice(0, limit)
    
    const confirmed = confirm(`Found ${ownMessages.length} of your messages. Are you sure you want to delete ${targets.length} of them?`)
    if (!confirmed) return

    setIsProcessing(true)
    setProgress(0)
    try {
      await bulkDeleteMessages(token, selectedChannelId, targets.map(m => m.id), (count) => {
        setProgress(Math.round((count / targets.length) * 100))
      })
      
      // Update local state by removing deleted messages
      const deletedIds = new Set(targets.map(m => m.id))
      setMessages(messages.filter(m => !deletedIds.has(m.id)))
      
      alert(`Successfully deleted ${targets.length} messages!`)
    } catch (err) {
      alert('An error occurred during deletion. Check DevTools for details.')
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  return (
    <aside className="w-80 border-l border-border bg-card/30 flex flex-col">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Filter className="w-4 h-4 text-primary" />
        <h2 className="font-bold">Filters & Actions</h2>
      </div>

      <div className="flex-1 p-4 space-y-6 overflow-y-auto custom-scrollbar">
        {/* Filters */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Keyword Search</label>
            <input
              type="text"
              placeholder="Filter by text..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-md text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date After</label>
            <input
              type="date"
              value={dateAfter}
              onChange={(e) => setDateAfter(e.target.value)}
              className="w-full px-3 py-1.5 bg-secondary/50 border border-border rounded-md text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 cursor-pointer group" onClick={() => setOnlyAttachments(!onlyAttachments)}>
            <div className={cn(
              "w-4 h-4 rounded border flex items-center justify-center transition-colors",
              onlyAttachments ? "bg-primary border-primary" : "border-muted-foreground group-hover:border-primary"
            )}>
              {onlyAttachments && <CheckCircle2 className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm">Only with attachments</span>
          </div>
        </div>

        <div className="pt-4 border-t border-border">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Results</div>
          <p className="text-2xl font-bold">{filteredMessages.length}</p>
          <p className="text-xs text-muted-foreground mb-3">messages matching filters</p>
          
          <button
            onClick={() => setShowResults(true)}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 bg-primary/10 text-primary hover:bg-primary/20 rounded-md text-xs font-semibold transition-colors"
          >
            <Search className="w-3 h-3" />
            View Results in Window
          </button>
        </div>

        <div className="space-y-3 pt-4 border-t border-border">
          {scanStatus === 'scanning' ? (
            <button
              onClick={handleStopScan}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500 hover:text-white border border-yellow-500/20 rounded-md text-sm font-medium transition-all"
            >
              <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-2" />
              Stop Scanning
            </button>
          ) : (
            <button
              onClick={handleScanDM}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-primary/10 text-primary hover:bg-primary border border-primary/20 hover:text-primary-foreground rounded-md text-sm font-medium transition-all disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              {scanStatus === 'paused' ? 'Resume Scanning' : 'Scan Full History'}
            </button>
          )}

          <button
            onClick={handleExport}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FileJson className="w-4 h-4" />
            Export to JSON
          </button>

          <button
            onClick={() => setShowDownloadPreview(true)}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Download Attachments
          </button>

          <button
            onClick={handleLoadArchive}
            disabled={isProcessing}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            <FolderOpen className="w-4 h-4" />
            Load Archive
          </button>

          <div className="pt-2 space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] font-bold text-muted-foreground uppercase flex-1">Delete Limit (0 = all)</label>
              <input
                type="number"
                value={deleteCount}
                onChange={(e) => setDeleteCount(e.target.value)}
                className="w-20 px-2 py-1 bg-secondary/50 border border-border rounded text-xs outline-none"
              />
            </div>
            <button
              onClick={handleDelete}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive/20 rounded-md text-sm font-medium transition-all"
            >
              <Trash2 className="w-4 h-4" />
              {isProcessing ? `Deleting... ${progress}%` : 'Delete Messages'}
            </button>
          </div>
        </div>

        {isProcessing && (
          <div className="space-y-2">
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-center text-muted-foreground animate-pulse">
              Processing... Please do not close the app
            </p>
          </div>
        )}
      </div>

      <div className="p-4 bg-primary/5 border-t border-border mt-auto">
        <div className="flex gap-2 items-start text-primary">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="text-[10px] leading-relaxed">
            Exports are saved as JSON files compatible with this viewer for offline usage.
          </p>
        </div>
      </div>

      {/* Results Modal */}
      {showResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-4xl h-full max-h-[80vh] bg-card border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-primary" />
                <h3 className="font-bold">Search Results ({filteredMessages.length})</h3>
              </div>
              <button 
                onClick={() => setShowResults(false)}
                className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {filteredMessages.map(msg => (
                <div key={msg.id} className="p-3 bg-secondary/20 rounded-lg border border-border/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-xs">{msg.author.username}</span>
                    <span className="text-[10px] text-muted-foreground">{formatDate(msg.timestamp)}</span>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-border bg-secondary/10 flex justify-end gap-3">
              <button 
                onClick={handleExport}
                className="px-4 py-2 bg-secondary text-sm font-medium rounded-md hover:bg-secondary/80"
              >
                Export These
              </button>
              <button 
                onClick={() => setShowResults(false)}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:opacity-90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Preview Modal */}
      {showDownloadPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-4xl h-full max-h-[85vh] bg-card border border-border rounded-2xl flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" />
                <h3 className="font-bold">Download Attachments</h3>
              </div>
              <button 
                onClick={() => setShowDownloadPreview(false)}
                className="p-1 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden flex flex-col p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-bold">1. Select Source</p>
                  <div className="flex p-1 bg-background/50 rounded-lg border border-border">
                    <button 
                      onClick={() => setDownloadSource('filtered')}
                      className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all",
                        downloadSource === 'filtered' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary"
                      )}
                    >
                      Filtered ({filteredMessages.flatMap(m => m.attachments).length})
                    </button>
                    <button 
                      onClick={() => setDownloadSource('all')}
                      className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all",
                        downloadSource === 'all' ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-secondary"
                      )}
                    >
                      All DM ({messages.flatMap(m => m.attachments).length})
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-bold">2. Download Limit</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={downloadLimit}
                      onChange={(e) => setDownloadLimit(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                    />
                    <button 
                      onClick={() => setDownloadLimit('0')}
                      className="px-3 py-1.5 bg-secondary text-[10px] font-bold rounded-lg hover:bg-secondary/80"
                    >
                      ALL
                    </button>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <p className="text-sm font-bold">3. Save Location</p>
                  <button 
                    onClick={handleSelectPath}
                    className={cn(
                      "w-full px-3 py-1.5 border rounded-lg text-[10px] font-bold truncate transition-all",
                      selectedOutputPath ? "bg-primary/10 border-primary text-primary" : "bg-background border-border text-muted-foreground hover:border-primary"
                    )}
                  >
                    {selectedOutputPath ? selectedOutputPath : "Select Folder..."}
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar bg-secondary/10 rounded-xl p-4 border border-border/50">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                  {(downloadSource === 'filtered' ? filteredMessages : messages)
                    .flatMap(m => m.attachments)
                    .slice(0, parseInt(downloadLimit) || undefined)
                    .map((att, idx) => (
                      <div key={idx} className="aspect-square bg-card rounded-lg border border-border overflow-hidden group relative shadow-sm">
                        <img 
                          src={att.proxy_url || att.url} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                          alt="" 
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center">
                          <span className="text-[8px] text-white font-bold truncate w-full">{att.filename}</span>
                          <span className="text-[7px] text-white/70">{(att.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                    ))}
                  
                  {((parseInt(downloadLimit) || 0) > 0 && 
                    (downloadSource === 'filtered' ? filteredMessages : messages).flatMap(m => m.attachments).length > parseInt(downloadLimit)) && (
                    <div className="aspect-square bg-primary/5 rounded-lg border border-dashed border-primary/30 flex items-center justify-center text-[10px] text-primary font-medium text-center p-4">
                      + {(downloadSource === 'filtered' ? filteredMessages : messages).flatMap(m => m.attachments).length - parseInt(downloadLimit)} more items to download
                    </div>
                  )}
                </div>
                
                {(downloadSource === 'filtered' ? filteredMessages : messages).flatMap(m => m.attachments).length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
                    <Download className="w-8 h-8 opacity-20 mb-2" />
                    <p className="text-sm">No attachments found in this source</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-border bg-secondary/10 flex justify-between items-center px-8">
              <div className="flex flex-col">
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Ready to Download</span>
                <span className="text-lg font-black text-primary">
                  {Math.min(
                    parseInt(downloadLimit) || Infinity, 
                    (downloadSource === 'filtered' ? filteredMessages : messages).flatMap(m => m.attachments).length
                  )} Files
                </span>
              </div>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDownloadPreview(false)}
                  className="px-6 py-2.5 bg-secondary text-sm font-bold rounded-xl hover:bg-secondary/80 transition-all active:scale-95"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleDownloadAttachments}
                  disabled={isProcessing || (downloadSource === 'filtered' ? filteredMessages : messages).flatMap(m => m.attachments).length === 0}
                  className="px-10 py-2.5 bg-primary text-primary-foreground text-sm font-black rounded-xl hover:opacity-90 shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  {isProcessing ? 'Processing...' : 'Confirm & Start'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

export default FilterPanel
