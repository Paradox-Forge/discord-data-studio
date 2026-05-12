import React, { useState, useEffect } from 'react'
import { X, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '../lib/utils'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [trackDeletedMessages, setTrackDeletedMessages] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const config = await window.api.getConfig()
      setTrackDeletedMessages(config.trackDeletedMessages ?? true)
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      await window.api.updateConfig({ trackDeletedMessages })
      onClose()
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-card/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <SettingsIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Ayarlar</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
          ) : (
            <>
              {/* Deleted Messages Tracking */}
              <div className="space-y-3">
                <h3 className="font-semibold text-lg">Genel Ayarlar</h3>
                <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-lg border border-border">
                  <div className="space-y-1">
                    <p className="font-medium">Silinen Mesajları İzle</p>
                    <p className="text-sm text-muted-foreground">
                      Kapalı olduğunda silinen mesajlar kaydedilmez
                    </p>
                  </div>
                  <button
                    onClick={() => setTrackDeletedMessages(!trackDeletedMessages)}
                    className={cn(
                      'relative w-14 h-7 rounded-full transition-colors',
                      trackDeletedMessages ? 'bg-primary' : 'bg-muted'
                    )}
                  >
                    <div
                      className={cn(
                        'absolute top-1 w-5 h-5 bg-white rounded-full transition-transform',
                        trackDeletedMessages ? 'translate-x-8' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Info Box */}
              <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Ayarlar değişiklikleri hemen uygulanır. Kullanıcı izleme ayarları için "Kullanıcı İzleme" panelini kullanın.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-card/50">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg font-medium transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-lg font-medium transition-opacity disabled:opacity-50"
          >
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
