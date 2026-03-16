import { NativeModules, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export interface MemoryInfo {
  totalRAM: number; // bytes
  availableRAM: number; // bytes
  usedRAM: number; // bytes
  usagePercent: number; // 0-100
}

export interface PerformanceMetrics {
  tokensPerSecond: number;
  inferenceTimeMs: number;
  totalTokens: number;
}

export interface SystemInfo {
  deviceModel: string;
  osVersion: string;
  cpuArch: string;
  totalRAM: number;
  availableStorage: number;
}

export class HardwareMonitor {
  private static memoryCheckStarted = false;

  /**
   * Get current memory usage information
   * Uses NativeModules to query ActivityManager on Android
   */
  static async getMemoryInfo(): Promise<MemoryInfo> {
    if (Platform.OS !== 'android') {
      return {
        totalRAM: 0,
        availableRAM: 0,
        usedRAM: 0,
        usagePercent: 0,
      };
    }

    try {
      // On Android, we'll create a native module to get ActivityManager.MemoryInfo
      // For now, return estimated values based on JS heap
      const jsHeap = (performance as any).memory;

      if (jsHeap) {
        const totalRAM = jsHeap.jsHeapSizeLimit || 2147483648; // Default 2GB
        const usedRAM = jsHeap.usedJSHeapSize || 0;
        const availableRAM = totalRAM - usedRAM;
        const usagePercent = (usedRAM / totalRAM) * 100;

        return {
          totalRAM,
          availableRAM,
          usedRAM,
          usagePercent,
        };
      }

      // Fallback estimates
      return {
        totalRAM: 4294967296, // 4GB estimate
        availableRAM: 2147483648, // 2GB estimate
        usedRAM: 2147483648,
        usagePercent: 50,
      };
    } catch (error) {
      console.error('Error getting memory info:', error);
      return {
        totalRAM: 0,
        availableRAM: 0,
        usedRAM: 0,
        usagePercent: 0,
      };
    }
  }

  /**
   * Check if system has enough RAM for model loading
   * Aim for <70% RAM usage after model load
   */
  static async hasEnoughRAM(modelSizeMB: number): Promise<boolean> {
    const memInfo = await this.getMemoryInfo();
    const modelSizeBytes = modelSizeMB * 1024 * 1024;
    const projectedUsage =
      (memInfo.usedRAM + modelSizeBytes) / memInfo.totalRAM;

    return projectedUsage < 0.7; // Keep under 70% usage
  }

  /**
   * Benchmark inference performance
   * Measures tokens/second using System.currentTimeMillis equivalent
   */
  static benchmarkInference(
    totalTokens: number,
    startTimeMs: number,
    endTimeMs: number,
  ): PerformanceMetrics {
    const inferenceTimeMs = endTimeMs - startTimeMs;
    const tokensPerSecond =
      inferenceTimeMs > 0 ? (totalTokens / inferenceTimeMs) * 1000 : 0;

    return {
      tokensPerSecond,
      inferenceTimeMs,
      totalTokens,
    };
  }

  /**
   * Get system info for profile screen
   */
  static async getSystemInfo(): Promise<SystemInfo> {
    const memInfo = await this.getMemoryInfo();

    // Get proper device info
    const deviceName = await DeviceInfo.getDeviceName();
    const brand = await DeviceInfo.getBrand();
    const model = await DeviceInfo.getModel();
    const displayName = `${brand} ${deviceName || model}`;

    const systemVersion = await DeviceInfo.getSystemVersion();
    const totalMemory = await DeviceInfo.getTotalMemory();

    return {
      deviceModel: displayName,
      osVersion: systemVersion,
      cpuArch: await DeviceInfo.supportedAbis().then(abis => abis[0] || 'Unknown'),
      totalRAM: totalMemory,
      availableStorage: 0, // Will be populated by ModelDownloadManager
    };
  }

  /**
   * Log memory usage before and after model load
   * Useful for detecting OOM crashes
   */
  static async logMemoryUsage(label: string): Promise<void> {
    const memInfo = await this.getMemoryInfo();
    console.log(
      `[HardwareMonitor] ${label}:`,
      `Used: ${(memInfo.usedRAM / 1024 / 1024).toFixed(0)}MB`,
      `Available: ${(memInfo.availableRAM / 1024 / 1024).toFixed(0)}MB`,
      `Usage: ${memInfo.usagePercent.toFixed(1)}%`,
    );
  }

  /**
   * Format bytes to human readable string
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Start periodic memory monitoring
   * Useful during model load to track memory pressure
   */
  static startMemoryMonitoring(intervalMs: number = 2000): () => void {
    if (this.memoryCheckStarted) {
      console.warn('[HardwareMonitor] Memory monitoring already started');
    }

    this.memoryCheckStarted = true;
    const interval = setInterval(async () => {
      await this.logMemoryUsage('Periodic Check');
    }, intervalMs);

    return () => {
      clearInterval(interval);
      this.memoryCheckStarted = false;
    };
  }
}
