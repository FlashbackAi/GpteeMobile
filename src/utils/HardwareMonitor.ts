import { NativeModules, Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';

export interface MemoryInfo {
  totalRAM: number; // bytes - device total RAM
  availableRAM: number; // bytes - device available RAM
  usedRAM: number; // bytes - device used RAM
  usagePercent: number; // 0-100 - device RAM usage
  appMemory: number; // bytes - this app's memory usage
  modelMemory: number; // bytes - model memory usage (estimated)
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
   * Uses DeviceInfo to get real device and app memory stats
   */
  static async getMemoryInfo(): Promise<MemoryInfo> {
    try {
      // Get actual device RAM info
      const totalRAM = await DeviceInfo.getTotalMemory();
      const usedMemory = await DeviceInfo.getUsedMemory();
      const availableRAM = totalRAM - usedMemory;
      const usagePercent = (usedMemory / totalRAM) * 100;

      // Get JS heap for app memory estimation
      const jsHeap = (performance as any).memory;
      let appMemory = 0;

      if (jsHeap && jsHeap.usedJSHeapSize) {
        // JS heap size is a good approximation of app memory usage
        appMemory = jsHeap.usedJSHeapSize;
      }

      // Model memory will be updated separately when model is loaded
      const modelMemory = 0;

      return {
        totalRAM,
        availableRAM,
        usedRAM: usedMemory,
        usagePercent,
        appMemory,
        modelMemory,
      };
    } catch (error) {
      console.error('Error getting memory info:', error);
      return {
        totalRAM: 0,
        availableRAM: 0,
        usedRAM: 0,
        usagePercent: 0,
        appMemory: 0,
        modelMemory: 0,
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
