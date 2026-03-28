import { create } from 'zustand';
import { ProviderInfo, ChatMessage, PeerRole } from '../network/PeerProtocol';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COORDINATOR_URL } from '../config';
import type { NodeSettings } from '../services/NodeSettingsService';
import type { NodeStats } from '../services/NodeStatsService';

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
  starred?: boolean;
}

// Provider Mode Stats (LLM serving) - Local tracking
export interface ProviderModeStats {
  requestsServed: number;
  tokensGenerated: number;
  selfRequests: number;
  selfTokensReceived: number;
  providerTimeMs: number;
  selfTimeMs: number;
  peakTokensPerSecond: number;
  lowestTokensPerSecond: number;

  // Uptime tracking
  sessionStartTime: number;        // Local timestamp when session started
  sessionUptime: number;            // Calculated: Date.now() - sessionStartTime (seconds)
  totalUptime: number;              // From backend (lifetime accumulated seconds)
  lastActivityTime: number;
}

// Worker Mode Stats (Image analysis) - Local tracking
export interface WorkerModeStats {
  tasksProcessed: number;
  tasksFailed: number;
  totalDetections: number;
  avgProcessingTimeMs: number;

  // Uptime tracking
  sessionStartTime: number;
  sessionUptime: number;
  totalUptime: number;
  lastActivityTime: number;
}

export type WorkerStatus = 'offline' | 'connecting' | 'online' | 'paused';

// Legacy WorkerStatistics for ImageWorkerScreen (keeping for backward compat)
export interface WorkerStatistics {
  tasksProcessed: number;
  tasksFailed: number;
  totalDetections: number;
  avgProcessingTimeMs: number;
  sessionStartTime: number;
}

interface AppState {
  // Identity
  peerId: string;
  role: PeerRole | null;

  // Authentication
  isAuthenticated: boolean;
  walletAddress: string | null;
  nodeId: string | null;

  // User profile
  userProfile: UserProfile | null;

  // Node settings (synced with backend)
  nodeSettings: NodeSettings | null;

  // Node statistics (synced with backend periodically)
  backendNodeStats: NodeStats | null;

  // Connection
  connected: boolean;

  // Provider mode
  providerModeEnabled: boolean;
  modelLoaded: boolean;
  modelLoading: boolean;
  modelLoadProgress: number;
  modelError: string | null;
  jobsServed: number;
  batteryThreshold: number; // Minimum battery % for provider mode (default 20)

  // Model download
  modelDownloaded: boolean;
  modelDownloading: boolean;
  modelDownloadProgress: number;
  modelFilename: string | null;
  modelPath: string | null;

  // User mode
  providers: ProviderInfo[];
  selectedProvider: ProviderInfo | null;
  assignedProviderId: string | null; // Sticky session - provider assigned to current chat
  messages: ChatMessage[];
  isGenerating: boolean;
  currentRequestId: string | null;

  // Chat history
  chatHistory: ChatHistory[];
  currentChatId: string | null;

  // Provider Mode Stats (local tracking)
  providerModeStats: ProviderModeStats;

  // Worker Mode Stats (local tracking)
  workerModeStats: WorkerModeStats;

  // Logs
  logs: string[];

  // Local inference mode (provider using own device)
  localInferenceMode: boolean;

  // Image Worker
  imageWorkerEnabled: boolean;
  imageWorkerStatus: WorkerStatus;
  imageWorkerStats: WorkerStatistics;
  imageWorkerLogs: Array<{
    timestamp: number;
    type: 'info' | 'success' | 'error';
    message: string;
  }>;
  coordinatorUrl: string;
  visionModelsDownloaded: boolean;
  visionModelsLoaded: boolean;

  // Actions
  setPeerId: (id: string) => void;
  setRole: (role: PeerRole) => void;
  setConnected: (v: boolean) => void;

  // Auth Actions
  setAuthenticated: (authenticated: boolean, walletAddress?: string, nodeId?: string) => void;
  checkAuthStatus: () => Promise<boolean>;
  handleAuthSuccess: (walletAddress: string, nodeId: string, peerId: string, displayName?: string) => Promise<void>;
  handleLogout: () => Promise<void>;

  setUserProfile: (profile: UserProfile) => void;
  setOnboardingCompleted: (v: boolean) => void;
  loadUserProfile: () => Promise<void>;

  // Node Settings Actions
  loadNodeSettings: () => Promise<void>;
  updateNodeSettings: (settings: Partial<NodeSettings>) => Promise<void>;
  setNodeSettings: (settings: NodeSettings | null) => void;

  // Node Stats Actions
  loadNodeStats: () => Promise<void>;
  syncNodeStats: () => Promise<void>;
  setBackendNodeStats: (stats: NodeStats | null) => void;
  updateLocalNodeStat: (key: keyof NodeStats, value: number) => void;

  setProviderModeEnabled: (v: boolean) => Promise<void>;
  loadProviderModeEnabled: () => Promise<void>;
  setBatteryThreshold: (threshold: number) => Promise<void>;
  loadBatteryThreshold: () => Promise<void>;
  setModelLoaded: (v: boolean) => void;
  setModelLoading: (v: boolean) => void;
  setModelLoadProgress: (v: number) => void;
  setModelError: (e: string | null) => void;
  incrementJobsServed: () => void;
  updateProviderStats: (tokensGenerated: number, durationMs: number) => Promise<void>;
  updateWorkerModeStats: (detections: number, processingTimeMs: number, success: boolean) => Promise<void>;
  setModelDownloaded: (v: boolean) => void;
  setModelDownloading: (v: boolean) => void;
  setModelDownloadProgress: (v: number) => void;
  setModelFilename: (filename: string | null) => void;
  setModelPath: (path: string | null) => void;
  setProviders: (providers: ProviderInfo[]) => void;
  setSelectedProvider: (p: ProviderInfo | null) => void;
  setAssignedProviderId: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendStreamToken: (requestId: string, token: string) => void;
  finaliseMessage: (requestId: string, tokensGenerated: number, durationMs: number, fulfilledBy?: string) => void;
  setGenerating: (v: boolean) => void;
  setCurrentRequestId: (id: string | null) => void;
  setLocalInferenceMode: (v: boolean) => Promise<void>;
  loadLocalInferenceMode: () => Promise<void>;
  clearMessages: () => void;
  saveCurrentChat: () => Promise<void>;
  loadChat: (chatId: string) => Promise<void>;
  loadChatHistory: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  toggleStarChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, newName: string) => Promise<void>;
  startNewChat: () => void;
  addLog: (msg: string) => void;
  loadLogs: () => Promise<void>;
  clearLogs: () => void;
  reset: () => void;

  // Image Worker Actions
  setImageWorkerEnabled: (v: boolean) => Promise<void>;
  loadImageWorkerEnabled: () => Promise<void>;
  setImageWorkerStatus: (s: WorkerStatus) => void;
  setImageWorkerStats: (stats: WorkerStatistics) => void;
  updateImageWorkerStats: (stats: Partial<WorkerStatistics>) => void;
  addImageWorkerLog: (type: 'info' | 'success' | 'error', message: string) => void;
  clearImageWorkerLogs: () => void;
  setCoordinatorUrl: (url: string) => Promise<void>;
  loadCoordinatorUrl: () => Promise<void>;
  setVisionModelsDownloaded: (v: boolean) => void;
  setVisionModelsLoaded: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  peerId: '',
  role: null,
  connected: false,
  isAuthenticated: false,
  walletAddress: null,
  nodeId: null,
  userProfile: null,
  nodeSettings: null,
  backendNodeStats: null,
  providerModeEnabled: false,
  modelLoaded: false,
  modelLoading: false,
  modelLoadProgress: 0,
  modelError: null,
  jobsServed: 0,
  batteryThreshold: 20, // Default 20%
  modelDownloaded: false,
  modelDownloading: false,
  modelDownloadProgress: 0,
  modelFilename: null,
  modelPath: null,
  providers: [],
  selectedProvider: null,
  assignedProviderId: null,
  messages: [],
  isGenerating: false,
  currentRequestId: null,
  chatHistory: [],
  currentChatId: null,
  logs: [],
  localInferenceMode: false,
  providerModeStats: {
    requestsServed: 0,
    tokensGenerated: 0,
    selfRequests: 0,
    selfTokensReceived: 0,
    providerTimeMs: 0,
    selfTimeMs: 0,
    peakTokensPerSecond: 0,
    lowestTokensPerSecond: Infinity,
    sessionStartTime: Date.now(),
    sessionUptime: 0,
    totalUptime: 0,
    lastActivityTime: Date.now(),
  },
  workerModeStats: {
    tasksProcessed: 0,
    tasksFailed: 0,
    totalDetections: 0,
    avgProcessingTimeMs: 0,
    sessionStartTime: Date.now(),
    sessionUptime: 0,
    totalUptime: 0,
    lastActivityTime: Date.now(),
  },
  imageWorkerEnabled: false,
  imageWorkerStatus: 'offline',
  imageWorkerStats: {
    tasksProcessed: 0,
    tasksFailed: 0,
    totalDetections: 0,
    avgProcessingTimeMs: 0,
    sessionStartTime: 0,
  },
  imageWorkerLogs: [],
  coordinatorUrl: COORDINATOR_URL,
  visionModelsDownloaded: false,
  visionModelsLoaded: false,

  setPeerId: (id) => set({ peerId: id }),
  setRole: (role) => set({ role }),
  setConnected: (v) => set({ connected: v }),

  // Auth Actions
  setAuthenticated: (authenticated, walletAddress, nodeId) => {
    set({
      isAuthenticated: authenticated,
      walletAddress: walletAddress || null,
      nodeId: nodeId || null,
    });
  },

  checkAuthStatus: async () => {
    try {
      const { isAuthenticated } = await import('../api/httpClient');
      const { getConnectedWallet, derivePeerId } = await import('../services/WalletService');

      const [hasTokens, wallet, storedProfile, storedNodeId] = await Promise.all([
        isAuthenticated(),
        getConnectedWallet(),
        AsyncStorage.getItem('user_profile'),
        AsyncStorage.getItem('node_id'),
      ]);

      const authenticated = hasTokens && wallet !== null;

      // Restore peerId from wallet on app reload
      const peerId = wallet ? derivePeerId(wallet) : '';

      // Restore userProfile from AsyncStorage
      let userProfile = null;
      if (storedProfile) {
        try {
          userProfile = JSON.parse(storedProfile);
          console.log('[AppStore] Restored user profile:', userProfile);
        } catch (parseError) {
          console.error('[AppStore] Failed to parse stored profile:', parseError);
        }
      }

      set({
        isAuthenticated: authenticated,
        walletAddress: wallet,
        nodeId: storedNodeId || get().nodeId, // Restore nodeId
        peerId: peerId || get().peerId, // Keep existing peerId if derivation fails
        userProfile: userProfile || get().userProfile, // Restore userProfile
      });

      console.log('[AppStore] Auth status checked - authenticated:', authenticated, 'peerId:', peerId, 'displayName:', userProfile?.displayName, 'nodeId:', storedNodeId);

      return authenticated;
    } catch (error) {
      console.error('[AppStore] Failed to check auth status:', error);
      return false;
    }
  },

  handleAuthSuccess: async (walletAddress, nodeId, peerId, displayName) => {
    try {
      // Update authentication state
      set({
        isAuthenticated: true,
        walletAddress,
        nodeId,
        peerId,
      });

      // Save nodeId to AsyncStorage for persistence
      if (nodeId) {
        await AsyncStorage.setItem('node_id', nodeId);
      }

      // Update user profile with display name if provided
      if (displayName) {
        const currentProfile = get().userProfile;
        const profileData = {
          displayName,
          gender: currentProfile?.gender || 'prefer-not-to-say',
          dateOfBirth: currentProfile?.dateOfBirth || '',
        };

        set({
          userProfile: profileData,
        });

        // Save to AsyncStorage
        await AsyncStorage.setItem('user_profile', JSON.stringify(profileData));
        console.log('[AppStore] Saved user profile to AsyncStorage:', profileData);
      }

      // Update RelayClient with new peer ID
      const { relayClient } = await import('../network/RelayClient');
      if (relayClient && relayClient.updatePeerIdFromWallet) {
        await relayClient.updatePeerIdFromWallet(walletAddress);
      }

      // Load node settings and stats from backend
      console.log('[AppStore] Loading node settings and stats...');
      await Promise.all([
        get().loadNodeSettings(),
        get().loadNodeStats(),
      ]);

      console.log('[AppStore] Auth success handled - peerId:', peerId, 'displayName:', displayName, 'nodeId:', nodeId);
    } catch (error) {
      console.error('[AppStore] Failed to handle auth success:', error);
    }
  },

  handleLogout: async () => {
    try {
      const { logout } = await import('../services/AuthService');
      const { clearAuthTokens } = await import('../api/httpClient');
      const { clearCachedSettings } = await import('../services/NodeSettingsService');
      const { clearCachedStats, stopPeriodicSync } = await import('../services/NodeStatsService');

      // Stop stats sync
      stopPeriodicSync();

      await Promise.all([
        logout(),
        clearAuthTokens(),
        clearCachedSettings(),
        clearCachedStats(),
      ]);

      set({
        isAuthenticated: false,
        walletAddress: null,
        nodeId: null,
        userProfile: null,
        nodeSettings: null,
        backendNodeStats: null,
      });

      console.log('[AppStore] Logout completed');
    } catch (error) {
      console.error('[AppStore] Logout failed:', error);
      throw error;
    }
  },

  setUserProfile: async (profile) => {
    set({ userProfile: profile });
    try {
      await AsyncStorage.setItem('userProfile', JSON.stringify(profile));
    } catch (e) {
      console.error('[AppStore] Failed to save user profile:', e);
    }
  },

  loadUserProfile: async () => {
    try {
      const profileJson = await AsyncStorage.getItem('userProfile');

      if (profileJson) {
        const profile = JSON.parse(profileJson);
        set({ userProfile: profile });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load user profile:', e);
    }
  },

  // Node Settings Actions
  loadNodeSettings: async () => {
    try {
      const nodeId = get().nodeId;
      if (!nodeId) {
        console.log('[AppStore] No nodeId, skipping settings load');
        return;
      }

      const { fetchNodeSettings } = await import('../services/NodeSettingsService');
      const settings = await fetchNodeSettings(nodeId);
      set({ nodeSettings: settings });
      console.log('[AppStore] Node settings loaded:', settings);

      // Validate and fix settings if prerequisites are not met
      const { modelDownloaded, visionModelsDownloaded } = get();
      console.log('[AppStore] 🔍 Validation check - modelDownloaded:', modelDownloaded, 'visionModelsDownloaded:', visionModelsDownloaded);
      console.log('[AppStore] 🔍 Backend settings - provider_mode_enabled:', settings.provider_mode_enabled, 'worker_mode_enabled:', settings.worker_mode_enabled);

      let needsUpdate = false;
      const updates: any = {};

      // Provider mode requires LLM model to be downloaded
      if (settings.provider_mode_enabled && !modelDownloaded) {
        console.warn('[AppStore] ⚠️ Provider mode enabled but LLM model not downloaded - disabling provider mode');
        updates.provider_mode_enabled = false;
        needsUpdate = true;
      }

      // Worker mode requires vision models to be downloaded
      if (settings.worker_mode_enabled && !visionModelsDownloaded) {
        console.warn('[AppStore] ⚠️ Worker mode enabled but vision models not downloaded - disabling worker mode');
        updates.worker_mode_enabled = false;
        needsUpdate = true;
      }

      // Update backend if needed
      if (needsUpdate) {
        console.log('[AppStore] 🔧 Correcting invalid mode settings:', updates);
        try {
          await get().updateNodeSettings(updates);
          console.log('[AppStore] ✅ Invalid mode settings corrected successfully');
        } catch (error) {
          console.error('[AppStore] ❌ Failed to correct invalid mode settings:', error);
          throw error;
        }
      } else {
        console.log('[AppStore] ✅ Mode settings validation passed - no correction needed');
      }
    } catch (error) {
      console.error('[AppStore] Failed to load node settings:', error);
      // Try to load cached settings
      const { loadCachedSettings } = await import('../services/NodeSettingsService');
      const cached = await loadCachedSettings();
      if (cached) {
        set({ nodeSettings: cached });
        console.log('[AppStore] Using cached node settings');

        // Also validate cached settings
        const { modelDownloaded, visionModelsDownloaded } = get();
        let needsUpdate = false;
        const updates: any = {};

        if (cached.provider_mode_enabled && !modelDownloaded) {
          console.warn('[AppStore] ⚠️ Cached provider mode enabled but LLM model not downloaded - disabling');
          updates.provider_mode_enabled = false;
          needsUpdate = true;
        }

        if (cached.worker_mode_enabled && !visionModelsDownloaded) {
          console.warn('[AppStore] ⚠️ Cached worker mode enabled but vision models not downloaded - disabling');
          updates.worker_mode_enabled = false;
          needsUpdate = true;
        }

        if (needsUpdate) {
          console.log('[AppStore] 🔧 Correcting invalid cached mode settings:', updates);
          try {
            await get().updateNodeSettings(updates);
          } catch (updateError) {
            console.error('[AppStore] Failed to update invalid settings:', updateError);
          }
        }
      }
    }
  },

  updateNodeSettings: async (partialSettings) => {
    try {
      const nodeId = get().nodeId;
      if (!nodeId) {
        throw new Error('No nodeId available');
      }

      console.log('[AppStore] 📤 updateNodeSettings called with:', partialSettings);

      const { updateNodeSettings } = await import('../services/NodeSettingsService');
      const payload = {
        node_id: nodeId,
        ...partialSettings,
      };

      console.log('[AppStore] 📤 Sending to backend:', payload);
      const updatedSettings = await updateNodeSettings(payload);
      set({ nodeSettings: updatedSettings });
      console.log('[AppStore] ✅ Node settings updated in backend:', updatedSettings);

      // Update local state if settings affect app behavior
      if (partialSettings.worker_mode_enabled !== undefined) {
        set({ imageWorkerEnabled: partialSettings.worker_mode_enabled });
      }
      if (partialSettings.provider_mode_enabled !== undefined) {
        set({ providerModeEnabled: partialSettings.provider_mode_enabled });
      }
      if (partialSettings.battery_threshold !== undefined) {
        set({ batteryThreshold: partialSettings.battery_threshold });
      }
    } catch (error) {
      console.error('[AppStore] Failed to update node settings:', error);
      throw error;
    }
  },

  setNodeSettings: (settings) => {
    set({ nodeSettings: settings });
  },

  // Node Stats Actions
  loadNodeStats: async () => {
    try {
      const nodeId = get().nodeId;
      if (!nodeId) {
        console.log('[AppStore] No nodeId, skipping stats load');
        return;
      }

      const { fetchNodeStats } = await import('../services/NodeStatsService');
      const backendStats = await fetchNodeStats(nodeId);

      // Calculate session start times from backend uptimes
      const proModeSessionStart = backendStats.pro_mode_session_uptime
        ? Date.now() - (backendStats.pro_mode_session_uptime * 1000)
        : Date.now();

      const workModeSessionStart = backendStats.work_mode_session_uptime
        ? Date.now() - (backendStats.work_mode_session_uptime * 1000)
        : Date.now();

      set({
        backendNodeStats: backendStats,
        // Initialize provider stats from backend
        providerModeStats: {
          requestsServed: backendStats.pro_mode_requests_served || 0,
          tokensGenerated: backendStats.pro_mode_tokens_generated || 0,
          selfRequests: backendStats.pro_mode_self_requests || 0,
          selfTokensReceived: 0, // Not tracked in backend
          providerTimeMs: 0, // Can't restore time accurately
          selfTimeMs: 0,
          peakTokensPerSecond: backendStats.pro_mode_peak_t_s || 0,
          lowestTokensPerSecond: backendStats.pro_mode_low_t_s === 0 ? Infinity : backendStats.pro_mode_low_t_s,
          sessionStartTime: proModeSessionStart,
          sessionUptime: backendStats.pro_mode_session_uptime || 0,
          totalUptime: backendStats.pro_mode_total_uptime || 0,
          lastActivityTime: Date.now(),
        },
        // Initialize worker stats from backend
        workerModeStats: {
          tasksProcessed: backendStats.work_mode_tasks_processed || 0,
          tasksFailed: backendStats.work_mode_tasks_failed || 0,
          totalDetections: backendStats.work_mode_total_detections || 0,
          avgProcessingTimeMs: backendStats.work_mode_avg_processing_time || 0,
          sessionStartTime: workModeSessionStart,
          sessionUptime: backendStats.work_mode_session_uptime || 0,
          totalUptime: backendStats.work_mode_total_uptime || 0,
          lastActivityTime: Date.now(),
        }
      });

      console.log('[AppStore] ✅ Node stats loaded and local stats initialized from backend:', backendStats);

      // Start periodic sync (every 5 minutes)
      const { startPeriodicSync } = await import('../services/NodeStatsService');
      startPeriodicSync(() => {
        const { providerModeStats, workerModeStats, nodeId: currentNodeId, providerModeEnabled, imageWorkerEnabled } = get();
        if (!currentNodeId) return null as any;

        // Only calculate session uptime for modes that are actually enabled
        const proSessionUptime = providerModeEnabled
          ? Math.floor((Date.now() - providerModeStats.sessionStartTime) / 1000)
          : 0;
        const workSessionUptime = imageWorkerEnabled
          ? Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000)
          : 0;

        return {
          node_id: currentNodeId,
          // Provider mode stats
          pro_mode_requests_served: providerModeStats.requestsServed,
          pro_mode_tokens_generated: providerModeStats.tokensGenerated,
          pro_mode_self_requests: providerModeStats.selfRequests,
          pro_mode_peak_t_s: providerModeStats.peakTokensPerSecond,
          pro_mode_avg_t_s: 0,
          pro_mode_low_t_s: providerModeStats.lowestTokensPerSecond === Infinity ? 0 : providerModeStats.lowestTokensPerSecond,
          pro_mode_response_avg_time: providerModeStats.requestsServed > 0
            ? Math.floor(providerModeStats.providerTimeMs / providerModeStats.requestsServed)
            : 0,
          pro_mode_session_uptime: proSessionUptime,
          pro_mode_total_uptime: providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime,
          // Worker mode stats
          work_mode_tasks_processed: workerModeStats.tasksProcessed,
          work_mode_tasks_failed: workerModeStats.tasksFailed,
          work_mode_total_detections: workerModeStats.totalDetections,
          work_mode_avg_processing_time: workerModeStats.avgProcessingTimeMs,
          work_mode_session_uptime: workSessionUptime,
          work_mode_total_uptime: imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime,
          // Node total uptime (only add session uptime if mode is enabled)
          node_total_uptime: (providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime)
            + (imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime),
          node_last_active_time: new Date().toISOString(),
        };
      });
      console.log('[AppStore] ✅ Periodic stats sync started (every 5 minutes)');
    } catch (error) {
      console.error('[AppStore] Failed to load node stats:', error);
      // Try to load cached stats
      const { loadCachedStats } = await import('../services/NodeStatsService');
      const cached = await loadCachedStats();
      if (cached) {
        const proModeSessionStart = cached.pro_mode_session_uptime
          ? Date.now() - (cached.pro_mode_session_uptime * 1000)
          : Date.now();

        const workModeSessionStart = cached.work_mode_session_uptime
          ? Date.now() - (cached.work_mode_session_uptime * 1000)
          : Date.now();

        set({
          backendNodeStats: cached,
          providerModeStats: {
            requestsServed: cached.pro_mode_requests_served || 0,
            tokensGenerated: cached.pro_mode_tokens_generated || 0,
            selfRequests: cached.pro_mode_self_requests || 0,
            selfTokensReceived: 0,
            providerTimeMs: 0,
            selfTimeMs: 0,
            peakTokensPerSecond: cached.pro_mode_peak_t_s || 0,
            lowestTokensPerSecond: cached.pro_mode_low_t_s === 0 ? Infinity : cached.pro_mode_low_t_s,
            sessionStartTime: proModeSessionStart,
            sessionUptime: cached.pro_mode_session_uptime || 0,
            totalUptime: cached.pro_mode_total_uptime || 0,
            lastActivityTime: Date.now(),
          },
          workerModeStats: {
            tasksProcessed: cached.work_mode_tasks_processed || 0,
            tasksFailed: cached.work_mode_tasks_failed || 0,
            totalDetections: cached.work_mode_total_detections || 0,
            avgProcessingTimeMs: cached.work_mode_avg_processing_time || 0,
            sessionStartTime: workModeSessionStart,
            sessionUptime: cached.work_mode_session_uptime || 0,
            totalUptime: cached.work_mode_total_uptime || 0,
            lastActivityTime: Date.now(),
          }
        });
        console.log('[AppStore] ✅ Using cached node stats and initialized local stats');

        // Start periodic sync even with cached data
        const { startPeriodicSync } = await import('../services/NodeStatsService');
        startPeriodicSync(() => {
          const { providerModeStats, workerModeStats, nodeId: currentNodeId } = get();
          if (!currentNodeId) return null as any;

          const proSessionUptime = Math.floor((Date.now() - providerModeStats.sessionStartTime) / 1000);
          const workSessionUptime = Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000);

          return {
            node_id: currentNodeId,
            pro_mode_requests_served: providerModeStats.requestsServed,
            pro_mode_tokens_generated: providerModeStats.tokensGenerated,
            pro_mode_self_requests: providerModeStats.selfRequests,
            pro_mode_peak_t_s: providerModeStats.peakTokensPerSecond,
            pro_mode_avg_t_s: 0,
            pro_mode_low_t_s: providerModeStats.lowestTokensPerSecond === Infinity ? 0 : providerModeStats.lowestTokensPerSecond,
            pro_mode_response_avg_time: providerModeStats.requestsServed > 0
              ? Math.floor(providerModeStats.providerTimeMs / providerModeStats.requestsServed)
              : 0,
            pro_mode_session_uptime: proSessionUptime,
            pro_mode_total_uptime: providerModeStats.totalUptime + proSessionUptime,
            work_mode_tasks_processed: workerModeStats.tasksProcessed,
            work_mode_tasks_failed: workerModeStats.tasksFailed,
            work_mode_total_detections: workerModeStats.totalDetections,
            work_mode_avg_processing_time: workerModeStats.avgProcessingTimeMs,
            work_mode_session_uptime: workSessionUptime,
            work_mode_total_uptime: workerModeStats.totalUptime + workSessionUptime,
            node_total_uptime: (providerModeStats.totalUptime + proSessionUptime) + (workerModeStats.totalUptime + workSessionUptime),
            node_last_active_time: new Date().toISOString(),
          };
        });
        console.log('[AppStore] ✅ Periodic stats sync started (from cache)');
      }
    }
  },

  syncNodeStats: async () => {
    try {
      const nodeId = get().nodeId;
      const { providerModeStats, workerModeStats, providerModeEnabled, imageWorkerEnabled } = get();

      if (!nodeId) {
        console.log('[AppStore] No nodeId, skipping stats sync');
        return;
      }

      const { updateNodeStats } = await import('../services/NodeStatsService');

      // Only calculate session uptime for modes that are actually enabled
      const proSessionUptime = providerModeEnabled
        ? Math.floor((Date.now() - providerModeStats.sessionStartTime) / 1000)
        : 0;
      const workSessionUptime = imageWorkerEnabled
        ? Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000)
        : 0;

      // Map to new backend format
      const payload = {
        node_id: nodeId,
        // Provider mode stats
        pro_mode_requests_served: providerModeStats.requestsServed,
        pro_mode_tokens_generated: providerModeStats.tokensGenerated,
        pro_mode_self_requests: providerModeStats.selfRequests,
        pro_mode_peak_t_s: providerModeStats.peakTokensPerSecond,
        pro_mode_avg_t_s: 0,
        pro_mode_low_t_s: providerModeStats.lowestTokensPerSecond === Infinity ? 0 : providerModeStats.lowestTokensPerSecond,
        pro_mode_response_avg_time: providerModeStats.requestsServed > 0
          ? Math.floor(providerModeStats.providerTimeMs / providerModeStats.requestsServed)
          : 0,
        pro_mode_session_uptime: proSessionUptime,
        pro_mode_total_uptime: providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime,
        // Worker mode stats
        work_mode_tasks_processed: workerModeStats.tasksProcessed,
        work_mode_tasks_failed: workerModeStats.tasksFailed,
        work_mode_total_detections: workerModeStats.totalDetections,
        work_mode_avg_processing_time: workerModeStats.avgProcessingTimeMs,
        work_mode_session_uptime: workSessionUptime,
        work_mode_total_uptime: imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime,
        // Node total uptime (only add session uptime if mode is enabled)
        node_total_uptime: (providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime)
          + (imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime),
        node_last_active_time: new Date().toISOString(),
      };

      const updatedStats = await updateNodeStats(payload);
      set({ backendNodeStats: updatedStats });
      console.log('[AppStore] Node stats synced to backend:', updatedStats);
    } catch (error) {
      console.error('[AppStore] Failed to sync node stats:', error);
      // Non-blocking - stats sync failures shouldn't break the app
    }
  },

  setBackendNodeStats: (stats) => {
    set({ backendNodeStats: stats });
  },

  updateLocalNodeStat: (key, value) => {
    const current = get().backendNodeStats;
    if (current) {
      set({
        backendNodeStats: {
          ...current,
          [key]: value,
        },
      });
    }
  },

  setProviderModeEnabled: async (v) => {
    console.log(`[AppStore] 🔧 setProviderModeEnabled called with: ${v}`);
    const { providerModeStats, modelDownloaded } = get();

    // Validate: Cannot enable provider mode without LLM model
    if (v && !modelDownloaded) {
      console.error('[AppStore] ❌ Cannot enable provider mode - LLM model not downloaded');
      throw new Error('LLM model must be downloaded before enabling provider mode');
    }

    // If enabling, reset session start time
    // If disabling, save current session to total uptime
    if (v) {
      // Enabling: Start new session
      set({
        providerModeEnabled: v,
        providerModeStats: {
          ...providerModeStats,
          sessionStartTime: Date.now(),
        }
      });
      console.log(`[AppStore] ✅ Provider mode enabled - new session started`);
    } else {
      // Disabling: Save session uptime to total
      const sessionDuration = Math.floor((Date.now() - providerModeStats.sessionStartTime) / 1000);
      set({
        providerModeEnabled: v,
        providerModeStats: {
          ...providerModeStats,
          totalUptime: providerModeStats.totalUptime + sessionDuration,
          sessionStartTime: Date.now(), // Reset for next time
          sessionUptime: 0,
        }
      });
      console.log(`[AppStore] ✅ Provider mode disabled - session saved (${sessionDuration}s)`);
    }

    try {
      await AsyncStorage.setItem('providerModeEnabled', v ? 'true' : 'false');
      console.log(`[AppStore] 💾 AsyncStorage saved - providerModeEnabled: ${v}`);

      // Sync to backend
      const nodeId = get().nodeId;
      if (nodeId) {
        await get().updateNodeSettings({ provider_mode_enabled: v });
        console.log(`[AppStore] ☁️ Backend synced - provider_mode_enabled: ${v}`);

        // Sync stats to backend immediately when disabling
        if (!v) {
          await get().syncNodeStats();
        }
      }
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

  setBatteryThreshold: async (threshold) => {
    try {
      await AsyncStorage.setItem('batteryThreshold', threshold.toString());
      set({ batteryThreshold: threshold });

      // Sync to backend
      const nodeId = get().nodeId;
      if (nodeId) {
        await get().updateNodeSettings({ battery_threshold: threshold });
        console.log(`[AppStore] ☁️ Backend synced - battery_threshold: ${threshold}`);
      }
    } catch (e) {
      console.error('[AppStore] Failed to save battery threshold:', e);
    }
  },

  loadBatteryThreshold: async () => {
    try {
      const value = await AsyncStorage.getItem('batteryThreshold');
      if (value !== null) {
        set({ batteryThreshold: parseInt(value, 10) });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load battery threshold:', e);
    }
  },

  setModelLoaded: (v) => set({ modelLoaded: v }),
  setModelLoading: (v) => set({ modelLoading: v }),
  setModelLoadProgress: (v) => set({ modelLoadProgress: v }),
  setModelError: (e) => set({ modelError: e }),
  incrementJobsServed: () => set((s) => ({ jobsServed: s.jobsServed + 1 })),

  // Update provider stats when serving a request
  updateProviderStats: async (tokensGenerated, durationMs) => {
    const { providerModeStats, workerModeStats, nodeId } = get();

    // Calculate tokens per second
    const tokensPerSecond = durationMs > 0 ? (tokensGenerated / (durationMs / 1000)) : 0;

    // Update peak and lowest
    const newPeak = Math.max(providerModeStats.peakTokensPerSecond, tokensPerSecond);
    const newLowest = providerModeStats.lowestTokensPerSecond === Infinity
      ? tokensPerSecond
      : Math.min(providerModeStats.lowestTokensPerSecond, tokensPerSecond);

    const updatedStats: ProviderModeStats = {
      ...providerModeStats,
      requestsServed: providerModeStats.requestsServed + 1,
      tokensGenerated: providerModeStats.tokensGenerated + tokensGenerated,
      providerTimeMs: providerModeStats.providerTimeMs + durationMs,
      peakTokensPerSecond: newPeak,
      lowestTokensPerSecond: newLowest,
      lastActivityTime: Date.now(),
    };

    set({ providerModeStats: updatedStats });

    // Cache to AsyncStorage immediately
    if (nodeId) {
      try {
        const { saveCachedStats } = await import('../services/NodeStatsService');
        const { providerModeEnabled, imageWorkerEnabled } = get();

        // Only calculate session uptime for modes that are actually enabled
        const proSessionUptime = providerModeEnabled
          ? Math.floor((Date.now() - updatedStats.sessionStartTime) / 1000)
          : 0;
        const workSessionUptime = imageWorkerEnabled
          ? Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000)
          : 0;

        await saveCachedStats({
          node_id: nodeId,
          // Provider mode stats
          pro_mode_requests_served: updatedStats.requestsServed,
          pro_mode_tokens_generated: updatedStats.tokensGenerated,
          pro_mode_self_requests: updatedStats.selfRequests,
          pro_mode_peak_t_s: updatedStats.peakTokensPerSecond,
          pro_mode_avg_t_s: 0,
          pro_mode_low_t_s: updatedStats.lowestTokensPerSecond === Infinity ? 0 : updatedStats.lowestTokensPerSecond,
          pro_mode_response_avg_time: updatedStats.requestsServed > 0
            ? Math.floor(updatedStats.providerTimeMs / updatedStats.requestsServed)
            : 0,
          pro_mode_session_uptime: proSessionUptime,
          pro_mode_total_uptime: providerModeEnabled ? updatedStats.totalUptime + proSessionUptime : updatedStats.totalUptime,
          // Worker mode stats (keep existing)
          work_mode_tasks_processed: workerModeStats.tasksProcessed,
          work_mode_tasks_failed: workerModeStats.tasksFailed,
          work_mode_total_detections: workerModeStats.totalDetections,
          work_mode_avg_processing_time: workerModeStats.avgProcessingTimeMs,
          work_mode_session_uptime: workSessionUptime,
          work_mode_total_uptime: imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime,
          // Node total (only add session uptime if mode is enabled)
          node_total_uptime: (providerModeEnabled ? updatedStats.totalUptime + proSessionUptime : updatedStats.totalUptime)
            + (imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime),
          node_last_active_time: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[AppStore] Failed to cache provider stats:', error);
      }
    }
  },

  // Update worker mode stats when processing a task
  updateWorkerModeStats: async (detections, processingTimeMs, success) => {
    const { providerModeStats, workerModeStats, nodeId } = get();

    // Update stats based on success/failure
    const updatedStats: WorkerModeStats = {
      ...workerModeStats,
      tasksProcessed: success ? workerModeStats.tasksProcessed + 1 : workerModeStats.tasksProcessed,
      tasksFailed: success ? workerModeStats.tasksFailed : workerModeStats.tasksFailed + 1,
      totalDetections: workerModeStats.totalDetections + detections,
      // Update running average: (old_avg * old_count + new_value) / new_count
      avgProcessingTimeMs: workerModeStats.tasksProcessed > 0
        ? ((workerModeStats.avgProcessingTimeMs * workerModeStats.tasksProcessed) + processingTimeMs) / (workerModeStats.tasksProcessed + 1)
        : processingTimeMs,
      lastActivityTime: Date.now(),
    };

    set({ workerModeStats: updatedStats });

    // Cache to AsyncStorage immediately
    if (nodeId) {
      try {
        const { saveCachedStats } = await import('../services/NodeStatsService');
        const { providerModeEnabled, imageWorkerEnabled } = get();

        // Only calculate session uptime for modes that are actually enabled
        const proSessionUptime = providerModeEnabled
          ? Math.floor((Date.now() - providerModeStats.sessionStartTime) / 1000)
          : 0;
        const workSessionUptime = imageWorkerEnabled
          ? Math.floor((Date.now() - updatedStats.sessionStartTime) / 1000)
          : 0;

        await saveCachedStats({
          node_id: nodeId,
          // Provider mode stats (keep existing)
          pro_mode_requests_served: providerModeStats.requestsServed,
          pro_mode_tokens_generated: providerModeStats.tokensGenerated,
          pro_mode_self_requests: providerModeStats.selfRequests,
          pro_mode_peak_t_s: providerModeStats.peakTokensPerSecond,
          pro_mode_avg_t_s: 0,
          pro_mode_low_t_s: providerModeStats.lowestTokensPerSecond === Infinity ? 0 : providerModeStats.lowestTokensPerSecond,
          pro_mode_response_avg_time: providerModeStats.requestsServed > 0
            ? Math.floor(providerModeStats.providerTimeMs / providerModeStats.requestsServed)
            : 0,
          pro_mode_session_uptime: proSessionUptime,
          pro_mode_total_uptime: providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime,
          // Worker mode stats (updated)
          work_mode_tasks_processed: updatedStats.tasksProcessed,
          work_mode_tasks_failed: updatedStats.tasksFailed,
          work_mode_total_detections: updatedStats.totalDetections,
          work_mode_avg_processing_time: updatedStats.avgProcessingTimeMs,
          work_mode_session_uptime: workSessionUptime,
          work_mode_total_uptime: imageWorkerEnabled ? updatedStats.totalUptime + workSessionUptime : updatedStats.totalUptime,
          // Node total (only add session uptime if mode is enabled)
          node_total_uptime: (providerModeEnabled ? providerModeStats.totalUptime + proSessionUptime : providerModeStats.totalUptime)
            + (imageWorkerEnabled ? updatedStats.totalUptime + workSessionUptime : updatedStats.totalUptime),
          node_last_active_time: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[AppStore] Failed to cache worker stats:', error);
      }
    }
  },

  setModelDownloaded: (v) => set({ modelDownloaded: v }),
  setModelDownloading: (v) => set({ modelDownloading: v }),
  setModelDownloadProgress: (v) => set({ modelDownloadProgress: v }),
  setModelFilename: (filename) => set({ modelFilename: filename }),
  setModelPath: (path) => set({ modelPath: path }),
  setLocalInferenceMode: async (v) => {
    set({ localInferenceMode: v });
    try {
      await AsyncStorage.setItem('localInferenceMode', v ? 'true' : 'false');
    } catch (e) {
      console.error('[AppStore] Failed to save local inference mode:', e);
    }
  },

  loadLocalInferenceMode: async () => {
    try {
      const value = await AsyncStorage.getItem('localInferenceMode');
      if (value !== null) {
        set({ localInferenceMode: value === 'true' });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load local inference mode:', e);
    }
  },

  setProviders: (providers) => set({ providers }),
  setSelectedProvider: (p) => set({ selectedProvider: p }),
  setAssignedProviderId: (id) => set({ assignedProviderId: id }),

  addMessage: (msg) =>
    set((s) => ({
      messages: [...s.messages, {
        ...msg,
        content: String(msg.content || ''),
        fulfilledBy: msg.fulfilledBy ? String(msg.fulfilledBy) : undefined,
      }]
    })),

  setMessages: (messages) => set({
    messages: messages.map(m => ({
      ...m,
      content: String(m.content || ''),
      fulfilledBy: m.fulfilledBy ? String(m.fulfilledBy) : undefined,
    }))
  }),

  // Append a streaming token to the last assistant message matching requestId
  appendStreamToken: (requestId, token) =>
    set((s) => {
      const messages = [...s.messages];
      const idx = messages.findIndex(
        (m) => m.role === 'assistant' && m.id === requestId,
      );
      // Ensure token is always a string
      const safeToken = String(token || '');

      if (idx === -1) {
        // First token — create the message
        console.log(`[appStore] 📝 Creating new message for ${requestId.substring(0, 8)}, first token: "${safeToken}"`);
        messages.push({
          id: requestId,
          role: 'assistant',
          content: safeToken,
          timestamp: Date.now(),
          streaming: true,
        });
      } else {
        const oldLength = messages[idx].content?.length || 0;
        messages[idx] = {
          ...messages[idx],
          content: String(messages[idx].content || '') + safeToken,
        };
        const newLength = messages[idx].content?.length || 0;

        // Log every 100 chars
        if (newLength > 0 && newLength % 100 < safeToken.length) {
          console.log(`[appStore] 📝 Message ${requestId.substring(0, 8)} now has ${newLength} chars`);
        }
      }
      return { messages };
    }),

  finaliseMessage: (requestId, tokensGenerated, durationMs, fulfilledBy) =>
    set((s) => {
      const messages = s.messages.map((m) =>
        m.id === requestId
          ? {
              ...m,
              streaming: false,
              tokensGenerated,
              durationMs,
              fulfilledBy: fulfilledBy ? String(fulfilledBy) : ''
            }
          : m,
      );

      // Update self request statistics (consumer mode)
      const tokensPerSecond = durationMs > 0 ? ((tokensGenerated || 0) / (durationMs / 1000)) : 0;

      // Update peak and lowest t/s for self requests too
      const newPeak = Math.max(s.providerModeStats.peakTokensPerSecond, tokensPerSecond);
      const newLowest = s.providerModeStats.lowestTokensPerSecond === Infinity
        ? tokensPerSecond
        : Math.min(s.providerModeStats.lowestTokensPerSecond, tokensPerSecond);

      const updatedStats = {
        ...s.providerModeStats,
        selfRequests: s.providerModeStats.selfRequests + 1,
        selfTokensReceived: s.providerModeStats.selfTokensReceived + (tokensGenerated || 0),
        selfTimeMs: s.providerModeStats.selfTimeMs + (durationMs || 0),
        peakTokensPerSecond: newPeak,
        lowestTokensPerSecond: newLowest,
        lastActivityTime: Date.now(),
      };

      // Save stats to local cache asynchronously (for crash resilience)
      // Also sync to backend immediately for self-requests
      setTimeout(async () => {
        try {
          const { saveCachedStats, updateNodeStats } = await import('../services/NodeStatsService');
          const { workerModeStats, nodeId, providerModeEnabled, imageWorkerEnabled } = get();
          if (nodeId) {
            // Only calculate session uptime for modes that are actually enabled
            const proSessionUptime = providerModeEnabled
              ? Math.floor((Date.now() - updatedStats.sessionStartTime) / 1000)
              : 0;
            const workSessionUptime = imageWorkerEnabled
              ? Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000)
              : 0;

            const statsPayload = {
              node_id: nodeId,
              // Provider mode stats (using updatedStats from closure)
              pro_mode_requests_served: updatedStats.requestsServed,
              pro_mode_tokens_generated: updatedStats.tokensGenerated,
              pro_mode_self_requests: updatedStats.selfRequests,
              pro_mode_peak_t_s: updatedStats.peakTokensPerSecond,
              pro_mode_avg_t_s: 0,
              pro_mode_low_t_s: updatedStats.lowestTokensPerSecond === Infinity ? 0 : updatedStats.lowestTokensPerSecond,
              pro_mode_response_avg_time: updatedStats.requestsServed > 0
                ? Math.floor(updatedStats.providerTimeMs / updatedStats.requestsServed)
                : 0,
              pro_mode_session_uptime: proSessionUptime,
              pro_mode_total_uptime: providerModeEnabled ? updatedStats.totalUptime + proSessionUptime : updatedStats.totalUptime,
              // Worker mode stats
              work_mode_tasks_processed: workerModeStats.tasksProcessed,
              work_mode_tasks_failed: workerModeStats.tasksFailed,
              work_mode_total_detections: workerModeStats.totalDetections,
              work_mode_avg_processing_time: workerModeStats.avgProcessingTimeMs,
              work_mode_session_uptime: workSessionUptime,
              work_mode_total_uptime: imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime,
              // Node total (only add session uptime if mode is enabled)
              node_total_uptime: (providerModeEnabled ? updatedStats.totalUptime + proSessionUptime : updatedStats.totalUptime)
                + (imageWorkerEnabled ? workerModeStats.totalUptime + workSessionUptime : workerModeStats.totalUptime),
              node_last_active_time: new Date().toISOString(),
            };

            // Save to local cache
            await saveCachedStats(statsPayload);
            console.log('[AppStore] Stats cached after self-request');

            // Sync to backend immediately for self-requests
            await updateNodeStats(statsPayload);
            console.log('[AppStore] Stats synced to backend after self-request');
          }
        } catch (error) {
          console.error('[AppStore] Failed to cache/sync stats:', error);
        }
      }, 0);

      return { messages, isGenerating: false, currentRequestId: null, providerModeStats: updatedStats };
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

  // Toggle star status for a chat
  toggleStarChat: async (chatId) => {
    const { chatHistory } = get();
    const updatedHistory = chatHistory.map(chat =>
      chat.id === chatId ? { ...chat, starred: !chat.starred } : chat
    );

    set({ chatHistory: updatedHistory });

    try {
      await AsyncStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('[AppStore] Failed to toggle star:', e);
    }
  },

  // Rename a chat
  renameChat: async (chatId, newName) => {
    const { chatHistory } = get();
    const updatedHistory = chatHistory.map(chat =>
      chat.id === chatId ? { ...chat, name: newName } : chat
    );

    set({ chatHistory: updatedHistory });

    try {
      await AsyncStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
    } catch (e) {
      console.error('[AppStore] Failed to rename chat:', e);
    }
  },

  // Start a new chat
  startNewChat: () => {
    set({
      messages: [],
      currentChatId: null,
      assignedProviderId: null, // Clear sticky session for new chat
      isGenerating: false,
      currentRequestId: null,
    });
  },

  // Log management
  addLog: (msg) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${msg}`;

    set((s) => {
      const newLogs = [...s.logs, logEntry].slice(-100); // Keep last 100 logs

      // Save to AsyncStorage
      AsyncStorage.setItem('activity_logs', JSON.stringify(newLogs)).catch(e => {
        console.error('[AppStore] Failed to save logs:', e);
      });

      return { logs: newLogs };
    });
  },

  loadLogs: async () => {
    try {
      const logsJson = await AsyncStorage.getItem('activity_logs');
      if (logsJson) {
        const logs = JSON.parse(logsJson);
        set({ logs });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load logs:', e);
    }
  },

  clearLogs: async () => {
    try {
      await AsyncStorage.removeItem('activity_logs');
      set({ logs: [] });
    } catch (e) {
      console.error('[AppStore] Failed to clear logs:', e);
    }
  },

  // Load node statistics
  // Image Worker Actions
  setImageWorkerEnabled: async (v) => {
    console.log(`[AppStore] 🔧 setImageWorkerEnabled called with: ${v}`);
    const { workerModeStats, visionModelsDownloaded } = get();

    // Validate: Cannot enable worker mode without vision models
    if (v && !visionModelsDownloaded) {
      console.error('[AppStore] ❌ Cannot enable worker mode - Vision models not downloaded');
      throw new Error('Vision models must be downloaded before enabling worker mode');
    }

    // If enabling, reset session start time
    // If disabling, save current session to total uptime
    if (v) {
      // Enabling: Start new session
      set({
        imageWorkerEnabled: v,
        workerModeStats: {
          ...workerModeStats,
          sessionStartTime: Date.now(),
        }
      });
      console.log(`[AppStore] ✅ Worker mode enabled - new session started`);
    } else {
      // Disabling: Save session uptime to total
      const sessionDuration = Math.floor((Date.now() - workerModeStats.sessionStartTime) / 1000);
      set({
        imageWorkerEnabled: v,
        workerModeStats: {
          ...workerModeStats,
          totalUptime: workerModeStats.totalUptime + sessionDuration,
          sessionStartTime: Date.now(), // Reset for next time
          sessionUptime: 0,
        }
      });
      console.log(`[AppStore] ✅ Worker mode disabled - session saved (${sessionDuration}s)`);
    }

    try {
      await AsyncStorage.setItem('imageWorkerEnabled', v ? 'true' : 'false');
      console.log(`[AppStore] 💾 AsyncStorage saved - imageWorkerEnabled: ${v}`);

      // Sync to backend
      const nodeId = get().nodeId;
      if (nodeId) {
        await get().updateNodeSettings({ worker_mode_enabled: v });
        console.log(`[AppStore] ☁️ Backend synced - worker_mode_enabled: ${v}`);

        // Sync stats to backend immediately when disabling
        if (!v) {
          await get().syncNodeStats();
        }
      }
    } catch (e) {
      console.error('[AppStore] Failed to save worker enabled state:', e);
    }
  },

  loadImageWorkerEnabled: async () => {
    try {
      const value = await AsyncStorage.getItem('imageWorkerEnabled');
      if (value !== null) {
        set({ imageWorkerEnabled: value === 'true' });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load worker enabled state:', e);
    }
  },

  setImageWorkerStatus: (s) => set({ imageWorkerStatus: s }),

  setImageWorkerStats: (stats) => set({ imageWorkerStats: stats }),

  updateImageWorkerStats: (stats) => {
    const current = get().imageWorkerStats;
    set({ imageWorkerStats: { ...current, ...stats } });
  },

  addImageWorkerLog: (type, message) => {
    const newLog = {
      timestamp: Date.now(),
      type,
      message,
    };
    set((state) => ({
      imageWorkerLogs: [newLog, ...state.imageWorkerLogs].slice(0, 100), // Keep last 100 logs
    }));
  },

  clearImageWorkerLogs: () => set({ imageWorkerLogs: [] }),

  setCoordinatorUrl: async (url) => {
    set({ coordinatorUrl: url });
    try {
      await AsyncStorage.setItem('coordinatorUrl', url);
    } catch (e) {
      console.error('[AppStore] Failed to save coordinator URL:', e);
    }
  },

  loadCoordinatorUrl: async () => {
    try {
      const url = await AsyncStorage.getItem('coordinatorUrl');
      if (url) {
        set({ coordinatorUrl: url });
      }
    } catch (e) {
      console.error('[AppStore] Failed to load coordinator URL:', e);
    }
  },

  setVisionModelsDownloaded: (v) => set({ visionModelsDownloaded: v }),
  setVisionModelsLoaded: (v) => set({ visionModelsLoaded: v }),

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