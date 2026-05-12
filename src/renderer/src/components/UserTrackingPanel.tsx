import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, User as UserIcon, Eye, Search } from 'lucide-react'
import { TrackedUser, UserChangeLog } from '@shared/types'
import { cn } from '../lib/utils'
import { useStore } from '../store/useStore'

const UserTrackingPanel: React.FC = () => {
  const [trackedUsers, setTrackedUsers] = useState<TrackedUser[]>([])
  const [changeLogs, setChangeLogs] = useState<UserChangeLog[]>([])
  const [isAddingUser, setIsAddingUser] = useState(false)
  const [newUserId, setNewUserId] = useState('')
  const [trackingOptions, setTrackingOptions] = useState({
    username: true,
    globalName: true,
    status: true,
    avatar: true,
    banner: true
  })
  const [isLoading, setIsLoading] = useState(false)
  const [filterUserId, setFilterUserId] = useState<string | null>(null)
  
  // Get token from store
  const token = useStore((state) => state.token)

  useEffect(() => {
    loadData()
    // Refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [])

  const loadData = async () => {
    try {
      const config = await window.api.getConfig()
      setTrackedUsers(config.trackedUsers || [])
      
      const logs = await window.api.getUserChangeLogs()
      setChangeLogs(logs.sort((a, b) => b.timestamp - a.timestamp))
    } catch (err) {
      console.error('Failed to load tracking data:', err)
    }
  }

  const handleAddUser = async () => {
    if (!newUserId.trim()) {
      alert('Lütfen bir kullanıcı ID\'si girin')
      return
    }
    
    if (!token) {
      alert('Token bulunamadı. Lütfen yeniden giriş yapın.')
      return
    }
    
    setIsLoading(true)

    try {
      console.log('Fetching user info for:', newUserId.trim())
      
      // Fetch user info from Discord with token
      const userInfo = await window.api.fetchUserInfo(newUserId.trim(), token)
      
      console.log('User info response:', userInfo)
      
      if (!userInfo) {
        alert(
          '❌ Kullanıcı bilgisi alınamadı.\n\n' +
          'Olası sebepler:\n' +
          '• Kullanıcı ID\'si yanlış olabilir\n' +
          '• Kullanıcı sizi engellemiş olabilir\n' +
          '• Kullanıcının gizlilik ayarları erişimi engelliyor olabilir\n' +
          '• Ortak bir sunucunuz veya arkadaşlığınız olmayabilir\n\n' +
          'Çözüm:\n' +
          '1. ID\'nin doğru olduğundan emin olun (18 haneli sayı)\n' +
          '2. Kullanıcıyla ortak bir sunucuda olduğunuzdan emin olun\n' +
          '3. Farklı bir kullanıcı deneyin\n' +
          '4. F12 ile console\'u açıp detaylı hata mesajını kontrol edin'
        )
        setIsLoading(false)
        return
      }

      const newTrackedUser: TrackedUser = {
        userId: userInfo.id,
        username: userInfo.username,
        avatar: userInfo.avatar,
        trackingOptions: { ...trackingOptions },
        addedAt: Date.now()
      }

      console.log('Adding tracked user:', newTrackedUser)

      const result = await window.api.addTrackedUser(newTrackedUser)
      
      if (result.success) {
        setTrackedUsers([...trackedUsers, newTrackedUser])
        setNewUserId('')
        setIsAddingUser(false)
        setTrackingOptions({
          username: true,
          globalName: true,
          status: true,
          avatar: true,
          banner: true
        })
        alert(`✅ ${userInfo.username} başarıyla izleme listesine eklendi!\n\nKullanıcının değişiklikleri 60 saniyede bir kontrol edilecek.`)
      } else {
        if (result.error === 'User already tracked') {
          alert('⚠️ Bu kullanıcı zaten izleme listesinde!')
        } else {
          alert(`❌ Kullanıcı eklenemedi: ${result.error}`)
        }
      }
    } catch (err: any) {
      console.error('Failed to add user:', err)
      alert(
        `❌ Hata oluştu: ${err.message || 'Bilinmeyen hata'}\n\n` +
        'Lütfen:\n' +
        '• İnternet bağlantınızı kontrol edin\n' +
        '• Discord token\'ınızın geçerli olduğundan emin olun\n' +
        '• F12 ile console\'da detaylı hata mesajını kontrol edin'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('Bu kullanıcıyı izlemeyi durdurmak istediğinize emin misiniz?')) return

    try {
      await window.api.removeTrackedUser(userId)
      setTrackedUsers(trackedUsers.filter(u => u.userId !== userId))
    } catch (err) {
      console.error('Failed to remove user:', err)
    }
  }

  const getChangeTypeColor = (type: string) => {
    switch (type) {
      case 'username': return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
      case 'globalName': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
      case 'status': return 'text-green-400 bg-green-500/10 border-green-500/20'
      case 'avatar': return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
      case 'banner': return 'text-pink-400 bg-pink-500/10 border-pink-500/20'
      default: return 'text-muted-foreground bg-secondary/10 border-border'
    }
  }

  const getChangeTypeLabel = (type: string) => {
    switch (type) {
      case 'username': return 'Kullanıcı Adı'
      case 'globalName': return 'Global İsim'
      case 'status': return 'Durum'
      case 'avatar': return 'Profil Fotoğrafı'
      case 'banner': return 'Banner'
      default: return type
    }
  }

  const filteredLogs = filterUserId
    ? changeLogs.filter(log => log.userId === filterUserId)
    : changeLogs

  return (
    <div className="flex h-full">
      {/* Left Panel - Tracked Users */}
      <div className="w-80 border-r border-border flex flex-col bg-card/30">
        <div className="p-4 border-b border-border space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">İzlenen Kullanıcılar</h3>
            <div className="flex gap-2">
              {import.meta.env.DEV && (
                <button
                  onClick={() => {
                    console.log('Current token:', token?.substring(0, 20) + '...')
                    console.log('Token length:', token?.length)
                  }}
                  className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded hover:bg-yellow-500/30"
                  title="Debug: Check token"
                >
                  🐛
                </button>
              )}
              <button
                onClick={() => setIsAddingUser(!isAddingUser)}
                className="p-2 bg-primary/20 hover:bg-primary/30 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4 text-primary" />
              </button>
            </div>
          </div>

          {isAddingUser && (
            <div className="space-y-3 p-3 bg-secondary/30 rounded-lg border border-border">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Discord Kullanıcı ID'si
                </label>
                <input
                  type="text"
                  placeholder="Örn: 123456789012345678"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">
                    💡 Discord'da kullanıcıya sağ tıklayıp "ID'yi Kopyala" seçeneğini kullanın
                  </p>
                  <p className="text-[10px] text-yellow-400">
                    ⚠️ Sadece arkadaş olduğunuz veya ortak sunucuda olduğunuz kullanıcıları ekleyebilirsiniz
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">İzlenecek Özellikler:</p>
                {Object.entries(trackingOptions).map(([key, value]) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => setTrackingOptions({ ...trackingOptions, [key]: e.target.checked })}
                      className="w-4 h-4 rounded border-border"
                    />
                    <span className="text-sm">{getChangeTypeLabel(key)}</span>
                    {key === 'status' && (
                      <span className="text-[10px] text-yellow-400" title="Gerçek zamanlı - Gateway bağlantısı gerektirir">
                        ⚡
                      </span>
                    )}
                  </label>
                ))}
                <p className="text-[10px] text-muted-foreground mt-2">
                  ⚡ Durum izleme gerçek zamanlıdır (Gateway bağlantısı)
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setIsAddingUser(false)}
                  className="flex-1 px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors"
                >
                  İptal
                </button>
                <button
                  onClick={handleAddUser}
                  disabled={isLoading || !newUserId.trim()}
                  className="flex-1 px-3 py-1.5 bg-primary text-primary-foreground hover:opacity-90 rounded-md text-sm font-medium transition-opacity disabled:opacity-50"
                >
                  {isLoading ? 'Ekleniyor...' : 'Ekle'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          {trackedUsers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Henüz izlenen kullanıcı yok
            </div>
          ) : (
            <div className="space-y-2">
              {trackedUsers.map(user => {
                const avatarUrl = user.avatar
                  ? `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png`
                  : null
                const activeOptions = Object.entries(user.trackingOptions)
                  .filter(([_, v]) => v)
                  .map(([k]) => k)

                return (
                  <div
                    key={user.userId}
                    className={cn(
                      "p-3 rounded-lg border transition-all cursor-pointer",
                      filterUserId === user.userId
                        ? "bg-primary/20 border-primary/50"
                        : "bg-secondary/30 border-border hover:border-primary/30"
                    )}
                    onClick={() => setFilterUserId(filterUserId === user.userId ? null : user.userId)}
                  >
                    <div className="flex items-start gap-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} className="w-10 h-10 rounded-full" alt="" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <UserIcon className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{user.username}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.userId}</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {activeOptions.map(opt => (
                            <span
                              key={opt}
                              className={cn(
                                "px-2 py-0.5 text-[10px] font-medium rounded border",
                                getChangeTypeColor(opt)
                              )}
                            >
                              {getChangeTypeLabel(opt)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveUser(user.userId)
                        }}
                        className="p-1.5 hover:bg-destructive/20 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Change Logs */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-border bg-card/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-lg">Değişiklik Geçmişi</h3>
              {filterUserId && (
                <button
                  onClick={() => setFilterUserId(null)}
                  className="px-2 py-1 bg-primary/20 text-primary text-xs font-medium rounded hover:bg-primary/30 transition-colors"
                >
                  Filtreyi Kaldır
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {window.api.forceCheckUsers && (
                <button
                  onClick={async () => {
                    console.log('Force checking users...')
                    const result = await window.api.forceCheckUsers()
                    console.log('Force check result:', result)
                    if (result.success) {
                      // Wait a bit then reload
                      setTimeout(() => loadData(), 2000)
                      alert('✅ Kullanıcılar kontrol edildi! Değişiklikler varsa 2 saniye içinde görünecek.')
                    } else {
                      alert('❌ Kontrol başarısız: ' + (result.error || 'Bilinmeyen hata'))
                    }
                  }}
                  className="px-3 py-1.5 bg-green-500/20 text-green-400 text-xs font-medium rounded hover:bg-green-500/30 transition-colors border border-green-500/30"
                  title="Şimdi kontrol et (60 saniye bekleme)"
                >
                  🔄 Şimdi Kontrol Et
                </button>
              )}
              <button
                onClick={loadData}
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
                title="Yenile"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
          {!window.api.forceCheckUsers && (
            <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-400">
              ⚠️ Uygulamayı yeniden başlatın: "🔄 Şimdi Kontrol Et" butonu için gerekli
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Henüz değişiklik kaydı yok
            </div>
          ) : (
            <div className="space-y-3 max-w-4xl mx-auto">
              {filteredLogs.map(log => {
                const avatarUrl = log.avatar
                  ? `https://cdn.discordapp.com/avatars/${log.userId}/${log.avatar}.png`
                  : null
                const date = new Date(log.timestamp)

                return (
                  <div
                    key={log.id}
                    className="p-4 bg-card border border-border rounded-lg hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {avatarUrl ? (
                        <img src={avatarUrl} className="w-10 h-10 rounded-full" alt="" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <UserIcon className="w-6 h-6" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{log.username}</p>
                          {log.globalName && (
                            <span className="text-sm text-muted-foreground">({log.globalName})</span>
                          )}
                          <span
                            className={cn(
                              "px-2 py-0.5 text-[10px] font-bold rounded border uppercase",
                              getChangeTypeColor(log.changeType)
                            )}
                          >
                            {getChangeTypeLabel(log.changeType)}
                          </span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-sm">
                          {log.changeType === 'avatar' || log.changeType === 'banner' ? (
                            <div className="flex items-center gap-3">
                              {log.oldValue && (
                                <img src={log.oldValue} className="w-12 h-12 rounded object-cover border border-border" alt="Eski" />
                              )}
                              <span className="text-muted-foreground">→</span>
                              {log.newValue && (
                                <img src={log.newValue} className="w-12 h-12 rounded object-cover border border-border" alt="Yeni" />
                              )}
                            </div>
                          ) : log.changeType === 'status' ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-secondary rounded-lg font-medium">{log.oldValue || 'Bilinmiyor'}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="px-3 py-1 bg-secondary rounded-lg font-medium">{log.newValue || 'Bilinmiyor'}</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-muted-foreground line-through">{log.oldValue || 'Yok'}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="text-foreground font-medium">{log.newValue || 'Yok'}</span>
                            </>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {date.toLocaleDateString('tr-TR')} {date.toLocaleTimeString('tr-TR')}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default UserTrackingPanel
