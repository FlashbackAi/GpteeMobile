/**
 * BackgroundModeManager.ts
 *
 * UNIFIED manager for Provider Mode and Worker Mode with app-wide synchronization.
 *
 * Provider Mode: P2P WebRTC inference (privacy-first)
 * Worker Mode: Image analysis tasks from relay (vision processing)
 *
 * Features:
 * - Global state management (single source of truth)
 * - Automatic sync across ALL screens
 * - Persistent state (survives app restart)
 * - Mutual exclusivity (only one mode at a time)
 * - Background service lifecycle management
 *
 * Usage from ANY screen:
 *   backgroundModeManager.enableProvider()
 *   backgroundModeManager.enableWorker()
 *   backgroundModeManager.disable()
 */

import { useAppStore } from '../store/appStore';
import { webrtcBackgroundService } from './WebRTCBackgroundService';
import { relayClient } from '../network/RelayClient';
import { VisionWorkerService } from './VisionWorkerService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';

const MODE_STATE_KEY = 'background_mode_state';

type ModeType = 'none' | 'provider' | 'worker';

interface ModeState {
  mode: ModeType;
  peerId: string;
  displayName: string;
  startedAt: number | null;
}

class BackgroundModeManager {
  private static instance: BackgroundModeManager;
  private state: ModeState = {
    mode: 'none',
    peerId: '',
    displayName: '',
    startedAt: null,
  };

  private appStateSubscription: any = null;
  private stateListeners: Set<(state: ModeState) => void> = new Set();

  private constructor() {
    this.initialize();
  }

  static getInstance(): BackgroundModeManager {
    if (!BackgroundModeManager.instance) {
      BackgroundModeManager.instance = new BackgroundModeManager();
    }
    return BackgroundModeManager.instance;
  }

  /**
   * Initialize manager
   */
  private async initialize() {
    console.log('[BackgroundModeManager] Initializing...');

    // Restore state
    await this.restoreState();

    // Monitor app state
    this.monitorAppState();

    // Auto-restart if mode was enabled
    if (this.state.mode !== 'none') {
      console.log(`[BackgroundModeManager] ${this.state.mode} mode was enabled, restarting...`);
      await this.restartMode();
    }

    console.log('[BackgroundModeManager] ✅ Initialized');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Provider Mode (P2P WebRTC Inference)
  // ═══════════════════════════════════════════════════════════════════════════

  async enableProvider(): Promise<void> {
    console.log('[BackgroundModeManager] 🚀 Enabling Provider Mode...');

    const { peerId, userProfile, modelLoaded } = useAppStore.getState();

    if (!peerId) {
      throw new Error('No peerId - user must be authenticated');
    }

    if (!modelLoaded) {
      throw new Error('Model not loaded - cannot enable provider mode');
    }

    // Disable current mode if active
    if (this.state.mode !== 'none') {
      console.log(`[BackgroundModeManager] Disabling ${this.state.mode} mode first...`);
      await this.disable();
    }

    // Update state
    this.state = {
      mode: 'provider',
      peerId,
      displayName: userProfile?.displayName || 'GPTee User',
      startedAt: Date.now(),
    };

    try {
      // 1. Start foreground service (keeps process alive for WebRTC)
      console.log('[BackgroundModeManager] Starting WebRTC foreground service...');
      await webrtcBackgroundService.startProviderMode(
        this.state.peerId,
        this.state.displayName,
        'Provider Mode Active',
        `${this.state.displayName} • Ready for P2P inference`
      );

      // 2. Update relay registration to accept inference jobs
      // NOTE: Don't call connect() - App.tsx already connected. Just update registration.
      console.log('[BackgroundModeManager] Updating registration as provider (accepting WebRTC jobs)...');
      if (relayClient.isConnected()) {
        relayClient.updateRegistration({
          modelLoaded: true,
          acceptingJobs: true,
          providerModeEnabled: true,
        });
      } else {
        console.warn('[BackgroundModeManager] ⚠️ Relay not connected - cannot register as provider');
      }

      // 4. Persist & sync
      await this.saveState();
      this.syncToStore();
      this.notifyListeners();

      console.log('[BackgroundModeManager] ✅ Provider Mode enabled globally');
      console.log('[BackgroundModeManager] 🔒 P2P WebRTC ready - privacy mode active');
      useAppStore.getState().addLog('✅ Provider Mode enabled - P2P WebRTC active');

    } catch (error: any) {
      console.error('[BackgroundModeManager] ❌ Failed to enable provider mode:', error);
      this.state.mode = 'none';
      this.state.startedAt = null;
      await this.saveState();
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Worker Mode (Image Analysis via Relay)
  // ═══════════════════════════════════════════════════════════════════════════

  async enableWorker(): Promise<void> {
    console.log('[BackgroundModeManager] 🚀 Enabling Worker Mode...');

    const { peerId, userProfile, visionModelsDownloaded } = useAppStore.getState();

    if (!peerId) {
      throw new Error('No peerId - user must be authenticated');
    }

    if (!visionModelsDownloaded) {
      throw new Error('Vision models not downloaded - cannot enable worker mode');
    }

    // Disable current mode if active
    if (this.state.mode !== 'none') {
      console.log(`[BackgroundModeManager] Disabling ${this.state.mode} mode first...`);
      await this.disable();
    }

    // Update state
    this.state = {
      mode: 'worker',
      peerId,
      displayName: userProfile?.displayName || 'GPTee User',
      startedAt: Date.now(),
    };

    try {
      // 1. Start foreground service (keeps process alive for task processing)
      console.log('[BackgroundModeManager] Starting worker foreground service...');
      await webrtcBackgroundService.startProviderMode(
        this.state.peerId,
        this.state.displayName,
        'Worker Mode Active',
        `${this.state.displayName} • Processing vision tasks`
      );

      // 2. Start vision worker service
      console.log('[BackgroundModeManager] Starting vision worker service...');
      const coordinatorUrl = useAppStore.getState().coordinatorUrl;
      const workerService = VisionWorkerService.getInstance();
      await workerService.startWorkerMode(
        this.state.peerId,
        coordinatorUrl
      );

      // 3. Persist & sync
      await this.saveState();
      this.syncToStore();
      this.notifyListeners();

      console.log('[BackgroundModeManager] ✅ Worker Mode enabled globally');
      useAppStore.getState().addLog('✅ Worker Mode enabled - processing vision tasks');

    } catch (error: any) {
      console.error('[BackgroundModeManager] ❌ Failed to enable worker mode:', error);
      this.state.mode = 'none';
      this.state.startedAt = null;
      await this.saveState();
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Disable Current Mode
  // ═══════════════════════════════════════════════════════════════════════════

  async disable(): Promise<void> {
    console.log(`[BackgroundModeManager] 🛑 Disabling ${this.state.mode} mode...`);

    const currentMode = this.state.mode;

    if (currentMode === 'none') {
      console.log('[BackgroundModeManager] No mode active, nothing to disable');
      return;
    }

    try {
      if (currentMode === 'provider') {
        // Stop accepting jobs
        if (relayClient.isConnected()) {
          const modelLoaded = useAppStore.getState().modelLoaded;
          relayClient.updateRegistration({
            modelLoaded,
            acceptingJobs: false,
            providerModeEnabled: false,
          });
        }
      } else if (currentMode === 'worker') {
        // Stop vision worker service
        const workerService = VisionWorkerService.getInstance();
        await workerService.stopWorkerMode();
      }

      // Stop foreground service
      await webrtcBackgroundService.stopProviderMode();

      // Update state
      this.state.mode = 'none';
      this.state.startedAt = null;

      // Persist & sync
      await this.saveState();
      this.syncToStore();
      this.notifyListeners();

      console.log(`[BackgroundModeManager] ✅ ${currentMode} mode disabled`);
      useAppStore.getState().addLog(`🛑 ${currentMode} mode disabled`);

    } catch (error: any) {
      console.error(`[BackgroundModeManager] ❌ Failed to disable ${currentMode} mode:`, error);
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════════════════════

  get currentMode(): ModeType {
    return this.state.mode;
  }

  get isProviderMode(): boolean {
    return this.state.mode === 'provider';
  }

  get isWorkerMode(): boolean {
    return this.state.mode === 'worker';
  }

  get isAnyModeActive(): boolean {
    return this.state.mode !== 'none';
  }

  getState(): ModeState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes (for UI updates)
   */
  onStateChange(listener: (state: ModeState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState()); // Immediate callback
    return () => this.stateListeners.delete(listener);
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.stateListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[BackgroundModeManager] Error in listener:', error);
      }
    });
  }

  /**
   * Sync to zustand store (for compatibility with existing code)
   * IMPORTANT: Use direct state update to avoid triggering backend sync loops
   */
  private syncToStore(): void {
    const isProviderMode = this.state.mode === 'provider';
    const isWorkerMode = this.state.mode === 'worker';

    // Direct state update without triggering setters (avoids backend sync loop)
    useAppStore.setState({
      providerModeEnabled: isProviderMode,
      imageWorkerEnabled: isWorkerMode,
    });

    console.log(`[BackgroundModeManager] Store synced - provider: ${isProviderMode}, worker: ${isWorkerMode}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Persistence
  // ═══════════════════════════════════════════════════════════════════════════

  private async saveState(): Promise<void> {
    try {
      await AsyncStorage.setItem(MODE_STATE_KEY, JSON.stringify(this.state));
      console.log('[BackgroundModeManager] State saved:', this.state.mode);
    } catch (error) {
      console.error('[BackgroundModeManager] Failed to save state:', error);
    }
  }

  private async restoreState(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(MODE_STATE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
        console.log('[BackgroundModeManager] State restored:', this.state.mode);
      }
    } catch (error) {
      console.error('[BackgroundModeManager] Failed to restore state:', error);
    }
  }

  /**
   * Restart mode after app restart
   */
  private async restartMode(): Promise<void> {
    console.log(`[BackgroundModeManager] Restarting ${this.state.mode} mode...`);

    try {
      if (this.state.mode === 'provider') {
        await this.enableProvider();
      } else if (this.state.mode === 'worker') {
        await this.enableWorker();
      }

      console.log('[BackgroundModeManager] ✅ Mode restarted');
      useAppStore.getState().addLog(`✅ ${this.state.mode} mode restarted automatically`);

    } catch (error: any) {
      console.error('[BackgroundModeManager] ❌ Failed to restart mode:', error);

      // Disable on failure
      this.state.mode = 'none';
      this.state.startedAt = null;
      await this.saveState();
      this.syncToStore();
    }
  }

  /**
   * Monitor app state transitions
   */
  private monitorAppState(): void {
    if (this.appStateSubscription) return;

    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log(`[BackgroundModeManager] App state: ${nextAppState} (mode: ${this.state.mode})`);

      if (this.state.mode !== 'none') {
        if (nextAppState === 'background') {
          console.log(`[BackgroundModeManager] ⚠️ Backgrounded - ${this.state.mode} mode still active`);
          useAppStore.getState().addLog(`⚠️ Backgrounded - ${this.state.mode} mode still active`);
        } else if (nextAppState === 'active') {
          console.log(`[BackgroundModeManager] ✅ Foregrounded - ${this.state.mode} mode running`);
          this.syncToStore();
          this.notifyListeners();
        }
      }
    });
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.stateListeners.clear();
  }
}

// Export singleton
export const backgroundModeManager = BackgroundModeManager.getInstance();
