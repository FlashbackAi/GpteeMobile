import { NativeModules, Platform } from 'react-native';
import { useAppStore } from '../store/appStore';

const { ForegroundServiceModule } = NativeModules;

export interface ServiceStats {
  mode: 'provider' | 'worker' | 'both';
  providerRequests: number;
  providerTokens: number;
  workerTasks: number;
  workerDetections: number;
  uptime: number;
}

let updateInterval: NodeJS.Timeout | null = null;
let startTime: number = 0;
let isRunning = false;

/**
 * Format uptime in human-readable format
 */
const formatUptime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

/**
 * Update notification with real-time stats
 */
const updateNotification = async () => {
  if (!isRunning || Platform.OS !== 'android') return;

  try {
    const state = useAppStore.getState();
    const { providerModeEnabled, imageWorkerEnabled, providerModeStats, workerModeStats } = state;

    // Calculate current stats
    const stats: ServiceStats = {
      mode: (providerModeEnabled && imageWorkerEnabled) ? 'both' :
            providerModeEnabled ? 'provider' : 'worker',
      providerRequests: providerModeStats.requestsServed,
      providerTokens: providerModeStats.tokensGenerated,
      workerTasks: workerModeStats.tasksProcessed,
      workerDetections: workerModeStats.totalDetections,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    };

    // Build notification text
    let taskTitle = '';
    let taskDesc = '';

    if (stats.mode === 'both') {
      taskTitle = 'GPTee: Provider + Worker Active';
      taskDesc = `Provider: ${stats.providerRequests} requests, ${stats.providerTokens} tokens\nWorker: ${stats.workerTasks} tasks, ${stats.workerDetections} detections\nUptime: ${formatUptime(stats.uptime)}`;
    } else if (stats.mode === 'provider') {
      taskTitle = 'GPTee: Provider Mode Active';
      taskDesc = `${stats.providerRequests} requests served\n${stats.providerTokens} tokens generated\nUptime: ${formatUptime(stats.uptime)}`;
    } else {
      taskTitle = 'GPTee: Worker Mode Active';
      taskDesc = `${stats.workerTasks} tasks processed\n${stats.workerDetections} detections\nUptime: ${formatUptime(stats.uptime)}`;
    }

    // Update notification
    if (ForegroundServiceModule) {
      await ForegroundServiceModule.updateNotification({
        taskTitle,
        taskDesc,
      });
    }
  } catch (error) {
    console.error('[ForegroundService] Failed to update notification:', error);
  }
};

/**
 * Start foreground service
 */
export const startForegroundService = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    console.log('[ForegroundService] Service only available on Android');
    return;
  }

  try {
    if (isRunning) {
      console.log('[ForegroundService] Service already running');
      return;
    }

    if (!ForegroundServiceModule) {
      throw new Error('ForegroundServiceModule not available');
    }

    startTime = Date.now();

    const state = useAppStore.getState();
    const { providerModeEnabled, imageWorkerEnabled } = state;

    const mode = (providerModeEnabled && imageWorkerEnabled) ? 'both' :
                  providerModeEnabled ? 'provider' : 'worker';

    const taskTitle = `GPTee: ${mode === 'both' ? 'Provider + Worker' : mode === 'provider' ? 'Provider' : 'Worker'} Active`;
    const taskDesc = 'Starting...';

    await ForegroundServiceModule.startService({
      taskTitle,
      taskDesc,
      mode,
    });

    isRunning = true;

    // Start periodic notification updates (every 2 seconds)
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    updateInterval = setInterval(updateNotification, 2000);

    console.log('[ForegroundService] ✅ Service started successfully');
  } catch (error) {
    console.error('[ForegroundService] ❌ Failed to start service:', error);
    throw error;
  }
};

/**
 * Stop foreground service
 */
export const stopForegroundService = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    return;
  }

  try {
    if (!isRunning) {
      console.log('[ForegroundService] Service not running');
      return;
    }

    if (!ForegroundServiceModule) {
      throw new Error('ForegroundServiceModule not available');
    }

    await ForegroundServiceModule.stopService();

    isRunning = false;

    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }

    console.log('[ForegroundService] ✅ Service stopped successfully');
  } catch (error) {
    console.error('[ForegroundService] ❌ Failed to stop service:', error);
    throw error;
  }
};

/**
 * Check if service is running
 */
export const isServiceRunning = (): boolean => {
  return isRunning;
};

/**
 * Force update notification immediately
 */
export const updateServiceNotification = async (): Promise<void> => {
  await updateNotification();
};
