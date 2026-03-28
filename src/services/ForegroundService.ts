import BackgroundService from 'react-native-background-actions';
import { useAppStore } from '../store/appStore';

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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Background task that keeps the service alive and updates notification
 */
const backgroundTask = async (taskData: any) => {
  const { delay } = taskData;

  await new Promise(async () => {
    while (BackgroundService.isRunning()) {
      // Update notification with current stats
      await updateNotification();

      // Wait before next update
      await sleep(delay);
    }
  });
};

/**
 * Update notification with real-time stats
 */
const updateNotification = async () => {
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
    await BackgroundService.updateNotification({
      taskTitle,
      taskDesc,
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: false,
      },
    });
  } catch (error) {
    console.error('[ForegroundService] Failed to update notification:', error);
  }
};

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
 * Start foreground service
 */
export const startForegroundService = async (): Promise<void> => {
  try {
    if (BackgroundService.isRunning()) {
      console.log('[ForegroundService] Service already running');
      return;
    }

    startTime = Date.now();

    const state = useAppStore.getState();
    const { providerModeEnabled, imageWorkerEnabled } = state;

    const mode = (providerModeEnabled && imageWorkerEnabled) ? 'both' :
                  providerModeEnabled ? 'provider' : 'worker';

    const options = {
      taskName: 'GPTee Background Service',
      taskTitle: `GPTee: ${mode === 'both' ? 'Provider + Worker' : mode === 'provider' ? 'Provider' : 'Worker'} Active`,
      taskDesc: 'Starting...',
      taskIcon: {
        name: 'ic_launcher',
        type: 'mipmap',
      },
      color: '#27c93f',
      linkingURI: 'gptee://',
      parameters: {
        delay: 2000, // Update notification every 2 seconds
      },
      progressBar: {
        max: 100,
        value: 0,
        indeterminate: false,
      },
    };

    await BackgroundService.start(backgroundTask, options);
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
  try {
    if (!BackgroundService.isRunning()) {
      console.log('[ForegroundService] Service not running');
      return;
    }

    await BackgroundService.stop();

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
  return BackgroundService.isRunning();
};

/**
 * Force update notification immediately
 */
export const updateServiceNotification = async (): Promise<void> => {
  if (BackgroundService.isRunning()) {
    await updateNotification();
  }
};
