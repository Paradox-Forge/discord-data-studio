import { create } from 'zustand'
import { DiscordChannel, DiscordMessage } from '@shared/types'

interface AppState {
  token: string | null
  channels: DiscordChannel[]
  selectedChannelId: string | null
  messages: DiscordMessage[]
  isLoading: boolean
  isArchiveView: boolean
  view: 'messages' | 'deleted'
  isDeletedModalOpen: boolean
  error: string | null
  currentUserId: string | null
  
  setToken: (token: string | null) => void
  setChannels: (channels: DiscordChannel[]) => void
  addChannel: (channel: DiscordChannel) => void
  setSelectedChannelId: (id: string | null) => void
  setMessages: (messages: DiscordMessage[]) => void
  addMessages: (messages: DiscordMessage[]) => void
  setLoading: (loading: boolean) => void
  setArchiveView: (isArchive: boolean) => void
  setView: (view: 'messages' | 'deleted') => void
  setDeletedModalOpen: (isOpen: boolean) => void
  setError: (error: string | null) => void
  setCurrentUserId: (id: string | null) => void
  reset: () => void
}

export const useStore = create<AppState>((set) => ({
  token: null,
  channels: [],
  selectedChannelId: null,
  messages: [],
  isLoading: false,
  isArchiveView: false,
  view: 'messages',
  isDeletedModalOpen: false,
  error: null,
  currentUserId: null,

  setToken: (token) => set({ token }),
  setChannels: (channels) => set({ channels }),
  addChannel: (channel) => set((state) => ({ 
    channels: state.channels.find(c => c.id === channel.id) ? state.channels : [channel, ...state.channels] 
  })),
  setSelectedChannelId: (id) => set({ selectedChannelId: id, messages: [], isArchiveView: false, view: 'messages' }),
  setMessages: (messages) => set({ messages }),
  addMessages: (newMessages) => set((state) => ({ 
    messages: [...state.messages, ...newMessages] 
  })),
  setLoading: (loading) => set({ isLoading: loading }),
  setArchiveView: (isArchive) => set((state) => ({ 
    isArchiveView: isArchive, 
    selectedChannelId: isArchive ? null : state.selectedChannelId,
    view: 'messages'
  })),
  setView: (view) => set({ view }),
  setDeletedModalOpen: (isOpen) => set({ isDeletedModalOpen: isOpen }),
  setError: (error) => set({ error }),
  setCurrentUserId: (id) => set({ currentUserId: id }),
  reset: () => set({ token: null, channels: [], selectedChannelId: null, messages: [], error: null, isArchiveView: false, view: 'messages', isDeletedModalOpen: false, currentUserId: null })
}))
