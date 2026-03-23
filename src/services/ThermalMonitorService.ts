import { NativeModules, NativeEventEmitter } from 'react-native';

export type ThermalStatus = 'nominal' | 'light' | 'moderate' | 'severe' | 'critical';

export interface ThermalInfo {
  status: ThermalStatus;
  statusCode: number; // Android thermal status code
}

// Native module for Android thermal monitoring
// We'll create the native implementation next
const { ThermalManager } = NativeModules;

export class ThermalMonitorService {
  private static instance: ThermalMonitorService;
  private currentStatus: ThermalStatus = 'nominal';
  private monitoringInterval: NodeJS.Timeout | null = null;
  private listeners: Map<string, (status: ThermalStatus) => void> = new Map();
  private eventEmitter: NativeEventEmitter | null = null;

  private constructor() {
    // Check if native module is available
    if (ThermalManager && ThermalManager.addListener) {
      this.eventEmitter = new NativeEventEmitter(ThermalManager);
    }
  }

  public static getInstance(): ThermalMonitorService {
    if (!ThermalMonitorService.instance) {
      ThermalMonitorService.instance = new ThermalMonitorService();
    }
    return ThermalMonitorService.instance;
  }

  /**
   * Get current thermal status
   */
  public async getCurrentStatus(): Promise<ThermalStatus> {
    try {
      if (ThermalManager && ThermalManager.getCurrentThermalStatus) {
        const info: ThermalInfo = await ThermalManager.getCurrentThermalStatus();
        this.currentStatus = info.status;
        return info.status;
      } else {
        // Fallback if native module not available
        console.warn('[ThermalMonitor] Native module not available, returning nominal');
        return 'nominal';
      }
    } catch (error) {
      console.error('[ThermalMonitor] Error getting thermal status:', error);
      return this.currentStatus; // Return cached status
    }
  }

  /**
   * Start monitoring thermal status
   * @param intervalMs Polling interval in milliseconds (default: 5000ms / 5s)
   */
  public startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      console.log('[ThermalMonitor] Already monitoring');
      return;
    }

    console.log(`[ThermalMonitor] Starting thermal monitoring (interval: ${intervalMs}ms)`);

    // Use native event listener if available (more efficient)
    if (this.eventEmitter && ThermalManager.startMonitoring) {
      this.eventEmitter.addListener('onThermalStatusChanged', (info: ThermalInfo) => {
        const previousStatus = this.currentStatus;
        this.currentStatus = info.status;

        if (previousStatus !== info.status) {
          console.log(`[ThermalMonitor] Thermal status changed: ${previousStatus} → ${info.status}`);
          this.notifyListeners(info.status);
        }
      });

      ThermalManager.startMonitoring(intervalMs);
    } else {
      // Fallback to polling
      console.log('[ThermalMonitor] Using polling fallback');
      this.monitoringInterval = setInterval(async () => {
        const previousStatus = this.currentStatus;
        const newStatus = await this.getCurrentStatus();

        if (previousStatus !== newStatus) {
          console.log(`[ThermalMonitor] Thermal status changed: ${previousStatus} → ${newStatus}`);
          this.notifyListeners(newStatus);
        }
      }, intervalMs);
    }

    // Get initial status
    this.getCurrentStatus();
  }

  /**
   * Stop monitoring thermal status
   */
  public stopMonitoring(): void {
    console.log('[ThermalMonitor] Stopping thermal monitoring');

    if (this.eventEmitter && ThermalManager.stopMonitoring) {
      this.eventEmitter.removeAllListeners('onThermalStatusChanged');
      ThermalManager.stopMonitoring();
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Register a listener for thermal status changes
   * @param id Unique identifier for the listener
   * @param callback Function to call when thermal status changes
   */
  public addListener(id: string, callback: (status: ThermalStatus) => void): void {
    this.listeners.set(id, callback);
  }

  /**
   * Remove a listener
   */
  public removeListener(id: string): void {
    this.listeners.delete(id);
  }

  /**
   * Remove all listeners
   */
  public removeAllListeners(): void {
    this.listeners.clear();
  }

  /**
   * Check if worker should pause based on thermal status
   */
  public shouldPauseWorker(status?: ThermalStatus): boolean {
    const currentStatus = status || this.currentStatus;
    return currentStatus === 'moderate' || currentStatus === 'severe' || currentStatus === 'critical';
  }

  /**
   * Check if worker can resume based on thermal status
   */
  public canResumeWorker(status?: ThermalStatus): boolean {
    const currentStatus = status || this.currentStatus;
    return currentStatus === 'nominal' || currentStatus === 'light';
  }

  /**
   * Get thermal policy for worker
   */
  public getThermalPolicy(status?: ThermalStatus) {
    const currentStatus = status || this.currentStatus;

    const policies = {
      nominal: {
        acceptTasks: true,
        maxConcurrentTasks: 2,
        cooldownBetweenTasksMs: 0,
      },
      light: {
        acceptTasks: true,
        maxConcurrentTasks: 2,
        cooldownBetweenTasksMs: 1000,
      },
      moderate: {
        acceptTasks: true,
        maxConcurrentTasks: 1,
        cooldownBetweenTasksMs: 3000,
      },
      severe: {
        acceptTasks: false,
        maxConcurrentTasks: 0,
        finishCurrentTask: true,
        cooldownBetweenTasksMs: 10000,
      },
      critical: {
        acceptTasks: false,
        maxConcurrentTasks: 0,
        finishCurrentTask: false, // Emergency stop
        cooldownBetweenTasksMs: 30000,
        notifyCoordinator: true,
      },
    };

    return policies[currentStatus];
  }

  /**
   * Notify all listeners of thermal status change
   */
  private notifyListeners(status: ThermalStatus): void {
    this.listeners.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[ThermalMonitor] Error in listener callback:', error);
      }
    });
  }

  /**
   * Get current cached status (synchronous)
   */
  public getCachedStatus(): ThermalStatus {
    return this.currentStatus;
  }
}
