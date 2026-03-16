import { create } from 'zustand';
import { ProviderInfo, ChatMessage, PeerRole } from '../network/PeerProtocol';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
  displayName: string;
  gender: 'male' | 'female' | 'other' | 'prefer-not-to-say';
  dateOfBirth: string; // YYYY-MM-DD format
}

export interface ChatHistory {
  id: string;
  name: string;
  timestamp: number;
  messages: ChatMessage[];
}

interface AppState {
  // Identity
  peerId: string;
  role: PeerRole | null;

  // User profile
  userProfile: UserProfile | null;
  onboardingCompleted: boolean;

  // Connection
  connected: boolean;

  // Provider mode
  providerModeEnabled: boolean;
  modelLoaded: boolean;
  modelLoading: boolean;
  modelLoadProgress: number;
  modelError: string | null;
  jobsServed: number;

  // Model download
  modelDownloaded: boolean;
  modelDownloading: boolean;
  modelDownloadProgress: number;
  modelFilename: string | null;
  modelPath: string | null;

  // User mode
  providers: ProviderInfo[];
  selectedProvider: ProviderInfo | null;
  messages: ChatMessage[];
  isGenerating: boolean;
  currentRequestId: string | null;

  // Chat history
  chatHistory: ChatHistory[];
  currentChatId: string | null;

  // Local inference mode (provider using own device)
  localInferenceMode: boolean;

  // Actions
  setPeerId: (id: string) => void;
  setRole: (role: PeerRole) => void;
  setConnected: (v: boolean) => void;
  setUserProfile: (profile: UserProfile) => void;
  setOnboardingCompleted: (v: boolean) => void;
  loadUserProfile: () => Promise<void>;
  setProviderModeEnabled: (v: boolean) => Promise<void>;
  loadProviderModeEnabled: () => Promise<void>;
  setModelLoaded: (v: boolean) => void;
  setModelLoading: (v: boolean) => void;
  setModelLoadProgress: (v: number) => void;
  setModelError: (e: string | null) => void;
  incrementJobsServed: () => void;
  setModelDownloaded: (v: boolean) => void;
  setModelDownloading: (v: boolean) => void;
  setModelDownloadProgress: (v: number) => void;
  setModelFilename: (filename: string | null) => void;
  setModelPath: (path: string | null) => void;
  setProviders: (providers: ProviderInfo[]) => void;
  setSelectedProvider: (p: ProviderInfo | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendStreamToken: (requestId: string, token: string) => void;
  finaliseMessage: (requestId: string, tokensGenerated: number, durationMs: number) => void;
  setGenerating: (v: boolean) => void;
  setCurrentRequestId: (id: string | null) => void;
  setLocalInferenceMode: (v: boolean) => void;
  clearMessages: () => void;
  saveCurrentChat: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  loadChatHistory: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  startNewChat: () => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  peerId: '',
  role: null,
  connected: false,
  userProfile: null,
  onboardingCompleted: false,
  providerModeEnabled: false,
  modelLoaded: false,
  modelLoading: false,
  modelLoadProgress: 0,
  modelError: null,
  jobsServed: 0,
  modelDownloaded: false,
  modelDownloading: false,
  modelDownloadProgress: 0,
  modelFilename: null,
  modelPath: null,
  providers: [],
  selectedProvider: null,
  messages: [],
  isGenerating: false,
  currentRequestId: null,
  chatHistory: [],
  currentChatId: null,
  localInferenceMode: false,

  setPeerId: (id) => set({ peerId: id }),
  setRole: (role) => set({ role }),
  setConnected: (v) => set({ connected: v }),

  setUserProfile: async (profile) => {
    set({ userProfile: profile, onboardingCompleted: true });
    try {
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
      await AsyncStorage.setItem('onboardingCompleted', 'true');
    } catch (e) {
      console.error('[AppStore] Failed to save user profile:', e);
    }
  },

  setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),

  loadUserProfile: async () => {
    try {
      const [profileJson, onboardingValue] = await Promise.all([
        AsyncStorage.getItem('userProfile'),
        AsyncStorage.getItem('onboardingCompleted'),
      ]);

      if (profileJson) {
        const profile = JSON.parse(profileJson);
        set({ userProfile: profile });
      }

      if (onboardingValue === 'true') {
        set({ onboardingCompleted: true });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load user profile:', e);
    }
  },

  setProviderModeEnabled: async (v) => {
    set({ providerModeEnabled: v });
    try {
      await AsyncStorage.setItem('providerModeEnabled', v ? 'true' : 'false');
    } catch (e) {
      console.error('[AppStore] Failed to save provider mode state:', e);
    }
  },

  loadProviderModeEnabled: async () => {
    try {
      const value = await AsyncStorage.getItem('providerModeEnabled');
      if (value !== null) {
        set({ providerModeEnabled: value === 'true' });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load provider mode state:', e);
    }
  },

  setModelLoaded: (v) => set({ modelLoaded: v }),
  setModelLoading: (v) => set({ modelLoading: v }),
  setModelLoadProgress: (v) => set({ modelLoadProgress: v }),
  setModelError: (e) => set({ modelError: e }),
  incrementJobsServed: () => set((s) => ({ jobsServed: s.jobsServed + 1 })),
  setModelDownloaded: (v) => set({ modelDownloaded: v }),
  setModelDownloading: (v) => set({ modelDownloading: v }),
  setModelDownloadProgress: (v) => set({ modelDownloadProgress: v }),
  setModelFilename: (filename) => set({ modelFilename: filename }),
  setModelPath: (path) => set({ modelPath: path }),
  setLocalInferenceMode: (v) => set({ localInferenceMode: v }),

  setProviders: (providers) => set({ providers }),
  setSelectedProvider: (p) => set({ selectedProvider: p }),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  setMessages: (messages) => set({ messages }),

  // Append a streaming token to the last assistant message matching requestId
  appendStreamToken: (requestId, token) =>
    set((s) => {
      const messages = [...s.messages];
      const idx = messages.findIndex(
        (m) => m.role === 'assistant' && m.id === requestId,
      );
      if (idx === -1) {
        // First token — create the message
        messages.push({
          id: requestId,
          role: 'assistant',
          content: token,
          timestamp: Date.now(),
          streaming: true,
        });
      } else {
        messages[idx] = {
          ...messages[idx],
          content: messages[idx].content + token,
        };
      }
      return { messages };
    }),

  finaliseMessage: (requestId, tokensGenerated, durationMs) =>
    set((s) => {
      const messages = s.messages.map((m) =>
        m.id === requestId
          ? { ...m, streaming: false, tokensGenerated, durationMs }
          : m,
      );
      return { messages, isGenerating: false, currentRequestId: null };
    }),

  setGenerating: (v) => set({ isGenerating: v }),
  setCurrentRequestId: (id) => set({ currentRequestId: id }),
  clearMessages: () => set({ messages: [] }),

  // Save current chat to history
  saveCurrentChat: async () => {
    const { messages, currentChatId, chatHistory } = get();

    if (messages.length === 0) return;

    // Generate chat name from first user message (max 50 chars)
    const firstUserMessage = messages.find(m => m.role === 'user');
    const chatName = firstUserMessage
      ? firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '')
      : 'New Chat';

    const chat: ChatHistory = {
      id: currentChatId || `chat_${Date.now()}`,
      name: chatName,
      timestamp: Date.now(),
      messages: [...messages],
    };

    // Update or add chat to history
    const existingIndex = chatHistory.findIndex(c => c.id === chat.id);
    let updatedHistory: ChatHistory[];

    if (existingIndex >= 0) {
      updatedHistory = [...chatHistory];
      updatedHistory[existingIndex] = chat;
    } else {
      updatedHistory = [chat, ...chatHistory];
    }

    set({ chatHistory: updatedHistory, currentChatId: chat.id });

    try {
      await AsyncStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('[AppStore] Failed to save chat history:', e);
    }
  },

  // Load a specific chat
  loadChat: async (chatId) => {
    const { chatHistory } = get();
    const chat = chatHistory.find(c => c.id === chatId);

    if (chat) {
      set({
        messages: [...chat.messages],
        currentChatId: chat.id,
        isGenerating: false,
        currentRequestId: null,
      });
    }
  },

  // Load chat history from AsyncStorage
  loadChatHistory: async () => {
    try {
      const historyJson = await AsyncStorage.getItem('chatHistory');
      if (historyJson) {
        const history = JSON.parse(historyJson);
        set({ chatHistory: history });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load chat history:', e);
    }
  },

  // Delete a chat from history
  deleteChat: async (chatId) => {
    const { chatHistory, currentChatId } = get();
    const updatedHistory = chatHistory.filter(c => c.id !== chatId);

    set({ chatHistory: updatedHistory });

    // If we deleted the current chat, clear messages
    if (currentChatId === chatId) {
      set({ messages: [], currentChatId: null });
    }

    try {
      await AsyncStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('[AppStore] Failed to delete chat:', e);
    }
  },

  // Start a new chat
  startNewChat: () => {
    set({
      messages: [],
      currentChatId: null,
      isGenerating: false,
      currentRequestId: null,
    });
  },

  reset: () =>
    set({
      role: null,
      connected: false,
      providers: [],
      selectedProvider: null,
      messages: [],
      isGenerating: false,
      currentRequestId: null,
      currentChatId: null,
    }),
}));