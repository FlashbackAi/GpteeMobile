/**
 * Node Statistics Service
 *
 * Handles node performance statistics
 * - Stores locally in AsyncStorage and appStore
 * - Periodically syncs to backend (every 5 minutes or on app close)
 * - Backend values OVERWRITE existing values (as per API spec)
 */

import httpClient from '../api/httpClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NodeStats {
  node_id: string;
  served_requests: number;
  tokens_generated: number;
  self_requests: number;
  session_uptime: number; // in seconds
  peak_t_s: number; // peak tokens per second
  avg_t_s: number; // average tokens per second
  low_t_s: number; // lowest tokens per second
  response_avg_time: number; // in milliseconds
  created_at?: string;
  updated_at?: string;
}

export interface GetNodeStatsResponse {
  node_id: string;
  served_requests: number;
  tokens_generated: number;
  self_requests: number;
  session_uptime: number;
  peak_t_s: number;
  avg_t_s: number;
  low_t_s: number;
  response_avg_time: number;
  created_at: string;
  updated_at: string;
}

export interface UpdateNodeStatsPayload {
  node_id: string;
  served_requests?: number;
  tokens_generated?: number;
  self_requests?: number;
  session_uptime?: number;
  peak_t_s?: number;
  avg_t_s?: number;
  low_t_s?: number;
  response_avg_time?: number;
}

const STATS_STORAGE_KEY = 'node_stats';
const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

let syncInterval: NodeJS.Timeout | null = null;

/**
 * Fetch node statistics from backend
 */
export const fetchNodeStats = async (nodeId: string): Promise<NodeStats> => {
  try {
    console.log('[NodeStats] Fetching stats for node:', nodeId);

    const response = await httpClient.get<GetNodeStatsResponse>(
      `/stats/node?node_id=${nodeId}`
    );

    const stats: NodeStats = {
      node_id: response.data.node_id,
      served_requests: response.data.served_requests || 0,
      tokens_generated: response.data.tokens_generated || 0,
      self_requests: response.data.self_requests || 0,
      session_uptime: response.data.session_uptime || 0,
      peak_t_s: response.data.peak_t_s || 0,
      avg_t_s: response.data.avg_t_s || 0,
      low_t_s: response.data.low_t_s || Infinity,
      response_avg_time: response.data.response_avg_time || 0,
      created_at: response.data.created_at,
      updated_at: response.data.updated_at,
    };

    // Save to AsyncStorage
    await AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    console.log('[NodeStats] Stats fetched and saved:', stats);

    return stats;
  } catch (error: any) {
    console.error('[NodeStats] Failed to fetch stats:', error);

    // Try to load from AsyncStorage as fallback
    const cached = await loadCachedStats();
    if (cached) {
      console.log('[NodeStats] Using cached stats:', cached);
      return cached;
    }

    // Return default stats if nothing cached
    return {
      node_id: nodeId,
      served_requests: 0,
      tokens_generated: 0,
      self_requests: 0,
      session_uptime: 0,
      peak_t_s: 0,
      avg_t_s: 0,
      low_t_s: Infinity,
      response_avg_time: 0,
    };
  }
};

/**
 * Update node statistics in backend
 * WARNING: Backend OVERWRITES values (not incremental)
 */
export const updateNodeStats = async (
  payload: UpdateNodeStatsPayload
): Promise<NodeStats> => {
  try {
    console.log('[NodeStats] Updating stats:', payload);

    const response = await httpClient.put<GetNodeStatsResponse>(
      '/stats/node',
      payload
    );

    const stats: NodeStats = {
      node_id: response.data.node_id,
      served_requests: response.data.served_requests || 0,
      tokens_generated: response.data.tokens_generated || 0,
      self_requests: response.data.self_requests || 0,
      session_uptime: response.data.session_uptime || 0,
      peak_t_s: response.data.peak_t_s || 0,
      avg_t_s: response.data.avg_t_s || 0,
      low_t_s: response.data.low_t_s || Infinity,
      response_avg_time: response.data.response_avg_time || 0,
      created_at: response.data.created_at,
      updated_at: response.data.updated_at,
    };

    // Save to AsyncStorage
    await AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    console.log('[NodeStats] Stats updated and saved:', stats);

    return stats;
  } catch (error: any) {
    console.error('[NodeStats] Failed to update stats:', error);
    // Don't throw - stats sync failures should be non-blocking
    throw new Error(error.response?.data?.message || 'Failed to update node stats');
  }
};

/**
 * Load cached statistics from AsyncStorage
 */
export const loadCachedStats = async (): Promise<NodeStats | null> => {
  try {
    const cached = await AsyncStorage.getItem(STATS_STORAGE_KEY);
    if (cached) {
      const stats = JSON.parse(cached);
      console.log('[NodeStats] Loaded cached stats:', stats);
      return stats;
    }
    return null;
  } catch (error) {
    console.error('[NodeStats] Failed to load cached stats:', error);
    return null;
  }
};

/**
 * Save stats to AsyncStorage (for local updates before sync)
 */
export const saveCachedStats = async (stats: NodeStats): Promise<void> => {
  try {
    await AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
    console.log('[NodeStats] Stats saved to cache:', stats);
  } catch (error) {
    console.error('[NodeStats] Failed to save stats to cache:', error);
  }
};

/**
 * Clear cached statistics
 */
export const clearCachedStats = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(STATS_STORAGE_KEY);
    console.log('[NodeStats] Cached stats cleared');
  } catch (error) {
    console.error('[NodeStats] Failed to clear cached stats:', error);
  }
};

/**
 * Start periodic sync to backend
 */
export const startPeriodicSync = (getStatsCallback: () => NodeStats) => {
  if (syncInterval) {
    console.log('[NodeStats] Periodic sync already running');
    return;
  }

  console.log('[NodeStats] Starting periodic sync (every 5 minutes)');

  syncInterval = setInterval(async () => {
    try {
      const currentStats = getStatsCallback();
      console.log('[NodeStats] Periodic sync triggered');
      await updateNodeStats(currentStats);
    } catch (error) {
      console.error('[NodeStats] Periodic sync failed:', error);
      // Continue - don't stop the interval on error
    }
  }, SYNC_INTERVAL);
};

/**
 * Stop periodic sync
 */
export const stopPeriodicSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[NodeStats] Periodic sync stopped');
  }
};

/**
 * Force immediate sync to backend
 */
export const forceSyncNow = async (stats: NodeStats): Promise<void> => {
  try {
    console.log('[NodeStats] Force syncing stats to backend');
    await updateNodeStats(stats);
  } catch (error) {
    console.error('[NodeStats] Force sync failed:', error);
    // Save to cache at least
    await saveCachedStats(stats);
  }
};
