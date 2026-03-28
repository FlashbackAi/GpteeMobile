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

  // Provider Mode Stats (LLM serving)
  pro_mode_requests_served: number;
  pro_mode_tokens_generated: number;
  pro_mode_self_requests: number;
  pro_mode_peak_t_s: number;
  pro_mode_avg_t_s: number;
  pro_mode_low_t_s: number;
  pro_mode_response_avg_time: number;

  // Provider Mode Uptime
  pro_mode_session_uptime: number;         // Current session (seconds)
  pro_mode_total_uptime: number;           // Lifetime accumulated (seconds)
  pro_mode_session_start_time?: string;    // ISO timestamp

  // Worker Mode Stats (Image analysis)
  work_mode_tasks_processed: number;
  work_mode_tasks_failed: number;
  work_mode_total_detections: number;
  work_mode_avg_processing_time: number;   // milliseconds

  // Worker Mode Uptime
  work_mode_session_uptime: number;        // Current session (seconds)
  work_mode_total_uptime: number;          // Lifetime accumulated (seconds)
  work_mode_session_start_time?: string;   // ISO timestamp

  // Node-Level Uptime
  node_total_uptime: number;               // Total contribution (seconds)
  node_last_active_time?: string;          // ISO timestamp

  created_at?: string;
  updated_at?: string;
}

export interface GetNodeStatsResponse {
  node_id: string;
  pro_mode_requests_served: number;
  pro_mode_tokens_generated: number;
  pro_mode_self_requests: number;
  pro_mode_peak_t_s: number;
  pro_mode_avg_t_s: number;
  pro_mode_low_t_s: number;
  pro_mode_response_avg_time: number;
  pro_mode_session_uptime: number;
  pro_mode_total_uptime: number;
  pro_mode_session_start_time?: string;
  work_mode_tasks_processed: number;
  work_mode_tasks_failed: number;
  work_mode_total_detections: number;
  work_mode_avg_processing_time: number;
  work_mode_session_uptime: number;
  work_mode_total_uptime: number;
  work_mode_session_start_time?: string;
  node_total_uptime: number;
  node_last_active_time?: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateNodeStatsPayload {
  node_id: string;
  pro_mode_requests_served?: number;
  pro_mode_tokens_generated?: number;
  pro_mode_self_requests?: number;
  pro_mode_peak_t_s?: number;
  pro_mode_avg_t_s?: number;
  pro_mode_low_t_s?: number;
  pro_mode_response_avg_time?: number;
  pro_mode_session_uptime?: number;
  pro_mode_total_uptime?: number;
  pro_mode_session_start_time?: string;
  work_mode_tasks_processed?: number;
  work_mode_tasks_failed?: number;
  work_mode_total_detections?: number;
  work_mode_avg_processing_time?: number;
  work_mode_session_uptime?: number;
  work_mode_total_uptime?: number;
  work_mode_session_start_time?: string;
  node_total_uptime?: number;
  node_last_active_time?: string;
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
      pro_mode_requests_served: response.data.pro_mode_requests_served || 0,
      pro_mode_tokens_generated: response.data.pro_mode_tokens_generated || 0,
      pro_mode_self_requests: response.data.pro_mode_self_requests || 0,
      pro_mode_peak_t_s: response.data.pro_mode_peak_t_s || 0,
      pro_mode_avg_t_s: response.data.pro_mode_avg_t_s || 0,
      pro_mode_low_t_s: response.data.pro_mode_low_t_s || Infinity,
      pro_mode_response_avg_time: response.data.pro_mode_response_avg_time || 0,
      pro_mode_session_uptime: response.data.pro_mode_session_uptime || 0,
      pro_mode_total_uptime: response.data.pro_mode_total_uptime || 0,
      pro_mode_session_start_time: response.data.pro_mode_session_start_time,
      work_mode_tasks_processed: response.data.work_mode_tasks_processed || 0,
      work_mode_tasks_failed: response.data.work_mode_tasks_failed || 0,
      work_mode_total_detections: response.data.work_mode_total_detections || 0,
      work_mode_avg_processing_time: response.data.work_mode_avg_processing_time || 0,
      work_mode_session_uptime: response.data.work_mode_session_uptime || 0,
      work_mode_total_uptime: response.data.work_mode_total_uptime || 0,
      work_mode_session_start_time: response.data.work_mode_session_start_time,
      node_total_uptime: response.data.node_total_uptime || 0,
      node_last_active_time: response.data.node_last_active_time,
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
      pro_mode_requests_served: 0,
      pro_mode_tokens_generated: 0,
      pro_mode_self_requests: 0,
      pro_mode_peak_t_s: 0,
      pro_mode_avg_t_s: 0,
      pro_mode_low_t_s: Infinity,
      pro_mode_response_avg_time: 0,
      pro_mode_session_uptime: 0,
      pro_mode_total_uptime: 0,
      work_mode_tasks_processed: 0,
      work_mode_tasks_failed: 0,
      work_mode_total_detections: 0,
      work_mode_avg_processing_time: 0,
      work_mode_session_uptime: 0,
      work_mode_total_uptime: 0,
      node_total_uptime: 0,
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
      pro_mode_requests_served: response.data.pro_mode_requests_served || 0,
      pro_mode_tokens_generated: response.data.pro_mode_tokens_generated || 0,
      pro_mode_self_requests: response.data.pro_mode_self_requests || 0,
      pro_mode_peak_t_s: response.data.pro_mode_peak_t_s || 0,
      pro_mode_avg_t_s: response.data.pro_mode_avg_t_s || 0,
      pro_mode_low_t_s: response.data.pro_mode_low_t_s || Infinity,
      pro_mode_response_avg_time: response.data.pro_mode_response_avg_time || 0,
      pro_mode_session_uptime: response.data.pro_mode_session_uptime || 0,
      pro_mode_total_uptime: response.data.pro_mode_total_uptime || 0,
      pro_mode_session_start_time: response.data.pro_mode_session_start_time,
      work_mode_tasks_processed: response.data.work_mode_tasks_processed || 0,
      work_mode_tasks_failed: response.data.work_mode_tasks_failed || 0,
      work_mode_total_detections: response.data.work_mode_total_detections || 0,
      work_mode_avg_processing_time: response.data.work_mode_avg_processing_time || 0,
      work_mode_session_uptime: response.data.work_mode_session_uptime || 0,
      work_mode_total_uptime: response.data.work_mode_total_uptime || 0,
      work_mode_session_start_time: response.data.work_mode_session_start_time,
      node_total_uptime: response.data.node_total_uptime || 0,
      node_last_active_time: response.data.node_last_active_time,
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
    console.log('[NodeStats] Stats saved to cache');
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
