/**
 * WebRTCBackgroundService.ts
 *
 * Keeps JavaScript runtime alive in background to maintain WebRTC connections.
 *
 * Architecture:
 * - Foreground service (native) keeps process alive
 * - Headless task keeps JS event loop alive
 * - RelayClient/WebRTC continue running
 *
 * This is necessary because:
 * - WebRTC MUST run in JavaScript (native WebRTC bridge requirement)
 * - Android suspends JS when app backgrounds
 * - We need P2P WebRTC for privacy (no relay forwarding)
 */

import { NativeModules, AppState, AppStateStatus } from 'react-native';

// Import relay client dynamically to avoid circular dependency
let relayClient: any = null;
const getRelayClient = async () => {
  if (!relayClient) {
    const module = await import('../network/RelayClient');
    relayClient = module.relayClient;
  }
  return relayClient;
};

const { WebRTCBackgroundServiceModule } = NativeModules;

interface KeepAliveTaskData {
  taskType: 'keepalive';
  timestamp: number;
}

class WebRTCBackgroundServiceManager {
  private static instance: WebRTCBackgroundServiceManager;
  private keepAliveInterval: ReturnType<typeof setInterval> | null = null;
  private appStateSubscription: any = null;

  private constructor() {}

  static getInstance(): WebRTCBackgroundServiceManager {
    if (!WebRTCBackgroundServiceManager.instance) {
      WebRTCBackgroundServiceManager.instance = new WebRTCBackgroundServiceManager();
    }
    return WebRTCBackgroundServiceManager.instance;
  }

  /**
   * Start background service for provider mode
   * Keeps JS runtime alive to maintain WebRTC connections
   */
  async startProviderMode(peerId: string, displayName: string, title?: string, message?: string): Promise<void> {
    console.log('[WebRTCBackgroundService] Starting provider mode');

    // Ensure relay client is loaded
    await getRelayClient();

    // Start native foreground service with custom title/message
    if (WebRTCBackgroundServiceModule) {
      try {
        await WebRTCBackgroundServiceModule.startForegroundService(
          title || 'Provider Mode Active',
          message || 'Ready to serve inference requests securely'
        );
      } catch (error) {
        console.error('[WebRTCBackgroundService] Failed to start foreground service:', error);
      }
    }

    // Start keepalive ping to prevent JS suspension
    this.startKeepAlive();

    // Monitor app state changes
    this.monitorAppState();

    console.log('[WebRTCBackgroundService] ✅ Provider mode background service started');
  }

  /**
   * Stop background service
   */
  async stopProviderMode(): Promise<void> {
    console.log('[WebRTCBackgroundService] Stopping provider mode');

    // Stop keepalive
    this.stopKeepAlive();

    // Stop monitoring
    this.stopMonitoring();

    // Stop native foreground service
    if (WebRTCBackgroundServiceModule) {
      try {
        await WebRTCBackgroundServiceModule.stopForegroundService();
      } catch (error) {
        console.error('[WebRTCBackgroundService] Failed to stop foreground service:', error);
      }
    }

    console.log('[WebRTCBackgroundService] ✅ Provider mode background service stopped');
  }

  /**
   * Start keepalive ping
   * Keeps JS event loop active by scheduling recurring work
   */
  private startKeepAlive(): void {
    if (this.keepAliveInterval) {
      return; // Already running
    }

    console.log('[WebRTCBackgroundService] Starting keepalive ping (every 30s)');

    // Ping every 30 seconds to keep JS alive
    this.keepAliveInterval = setInterval(() => {
      const now = Date.now();
      console.log(`[WebRTCBackgroundService] ❤️ Keepalive ping: ${new Date(now).toISOString()}`);

      // Check relay connection (only if loaded)
      if (relayClient) {
        if (!relayClient.isConnected()) {
          console.warn('[WebRTCBackgroundService] ⚠️ Relay disconnected, attempting reconnect');
          // Relay client has auto-reconnect, just log
        }

        // Check WebRTC connection
        if (relayClient.isWebRTCConnected()) {
          console.log('[WebRTCBackgroundService] ✅ WebRTC connection active');
        }
      } else {
        console.log('[WebRTCBackgroundService] ⏳ Relay client not yet loaded');
      }
    }, 30000);
  }

  /**
   * Stop keepalive ping
   */
  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
      console.log('[WebRTCBackgroundService] Keepalive stopped');
    }
  }

  /**
   * Monitor app state changes
   * Log transitions to understand when JS might suspend
   */
  private monitorAppState(): void {
    if (this.appStateSubscription) {
      return; // Already monitoring
    }

    console.log('[WebRTCBackgroundService] Monitoring app state changes');

    this.appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      console.log(`[WebRTCBackgroundService] App state changed: ${nextAppState}`);

      if (nextAppState === 'background') {
        console.log('[WebRTCBackgroundService] ⚠️ App backgrounded - foreground service should keep JS alive');
      } else if (nextAppState === 'active') {
        console.log('[WebRTCBackgroundService] ✅ App foregrounded');
      }
    });
  }

  /**
   * Stop monitoring app state
   */
  private stopMonitoring(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
      console.log('[WebRTCBackgroundService] Stopped monitoring app state');
    }
  }
}

/**
 * Headless task handler for keepalive
 * This keeps the JS runtime active when app is backgrounded
 */
export const handleKeepAliveTask = async (taskData: KeepAliveTaskData): Promise<void> => {
  console.log('[WebRTCBackgroundService] Keepalive headless task executed');

  // This task just needs to exist to keep JS alive
  // The actual work is done by RelayClient and WebRTCClient

  // Return immediately - the setInterval in the main app keeps things alive
  return Promise.resolve();
};

// Export singleton instance
export const webrtcBackgroundService = WebRTCBackgroundServiceManager.getInstance();
