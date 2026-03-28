import AsyncStorage from '@react-native-async-storage/async-storage';

export type LogCategory = 'provider' | 'worker' | 'system';

export interface LogEntry {
  timestamp: number;
  category: LogCategory;
  message: string;
  level: 'info' | 'success' | 'warning' | 'error';
}

const MAX_LOGS = 500; // Keep last 500 logs
const STORAGE_KEY = 'app_logs_v2';

/**
 * Enhanced log service with categories and timestamps
 */
class LogService {
  private logs: LogEntry[] = [];
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();

  constructor() {
    this.loadLogs();
  }

  /**
   * Add a log entry
   */
  addLog(message: string, category: LogCategory = 'system', level: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      category,
      message,
      level,
    };

    this.logs.push(entry);

    // Keep only last MAX_LOGS entries
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(-MAX_LOGS);
    }

    // Notify listeners
    this.notifyListeners();

    // Save to storage
    this.saveLogs();
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by category
   */
  getLogsByCategory(category: LogCategory): LogEntry[] {
    return this.logs.filter(log => log.category === category);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
    this.notifyListeners();
    this.saveLogs();
  }

  /**
   * Subscribe to log updates
   */
  subscribe(callback: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Load logs from AsyncStorage
   */
  private async loadLogs(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('[LogService] Failed to load logs:', error);
    }
  }

  /**
   * Save logs to AsyncStorage
   */
  private async saveLogs(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.error('[LogService] Failed to save logs:', error);
    }
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    const logs = this.getLogs();
    this.listeners.forEach(callback => callback(logs));
  }

  /**
   * Format timestamp for display
   */
  static formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Get color for log level
   */
  static getColorForLevel(level: LogEntry['level']): string {
    switch (level) {
      case 'success': return '#27c93f';
      case 'warning': return '#ffbd2e';
      case 'error': return '#ff5f56';
      case 'info':
      default: return '#e0e0e0';
    }
  }

  /**
   * Get prefix for category
   */
  static getPrefixForCategory(category: LogCategory): string {
    switch (category) {
      case 'provider': return '[provider]';
      case 'worker': return '[worker]';
      case 'system': return '[system]';
      default: return '';
    }
  }
}

// Export singleton instance
export const logService = new LogService();
