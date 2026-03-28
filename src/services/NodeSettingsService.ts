/**
 * Node Settings Service
 *
 * Handles node settings (worker mode, provider mode, battery threshold)
 * - Fetches from backend on login
 * - Updates backend when settings change
 * - Persists to AsyncStorage for offline access
 */

import httpClient from '../api/httpClient';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface NodeSettings {
  node_id: string;
  worker_mode_enabled: boolean;
  provider_mode_enabled: boolean;
  battery_threshold: number;
  worker_mode_updated_at?: string;
  provider_mode_updated_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GetNodeSettingsResponse {
  node_id: string;
  worker_mode_enabled: boolean;
  provider_mode_enabled: boolean;
  battery_threshold: number;
  worker_mode_updated_at: string | null;
  provider_mode_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateNodeSettingsPayload {
  node_id: string;
  worker_mode_enabled?: boolean;
  provider_mode_enabled?: boolean;
  battery_threshold?: number;
}

const SETTINGS_STORAGE_KEY = 'node_settings';

/**
 * Fetch node settings from backend
 */
export const fetchNodeSettings = async (nodeId: string): Promise<NodeSettings> => {
  try {
    console.log('[NodeSettings] Fetching settings for node:', nodeId);

    const response = await httpClient.get<GetNodeSettingsResponse>(
      `/node/settings?node_id=${nodeId}`
    );

    const settings: NodeSettings = {
      node_id: response.data.node_id,
      worker_mode_enabled: response.data.worker_mode_enabled,
      provider_mode_enabled: response.data.provider_mode_enabled,
      battery_threshold: response.data.battery_threshold,
      worker_mode_updated_at: response.data.worker_mode_updated_at || undefined,
      provider_mode_updated_at: response.data.provider_mode_updated_at || undefined,
      created_at: response.data.created_at,
      updated_at: response.data.updated_at,
    };

    // Save to AsyncStorage for offline access
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    console.log('[NodeSettings] Settings fetched and saved:', settings);

    return settings;
  } catch (error: any) {
    console.error('[NodeSettings] Failed to fetch settings:', error);

    // Try to load from AsyncStorage as fallback
    const cached = await loadCachedSettings();
    if (cached) {
      console.log('[NodeSettings] Using cached settings:', cached);
      return cached;
    }

    throw new Error(error.response?.data?.message || 'Failed to fetch node settings');
  }
};

/**
 * Update node settings in backend
 */
export const updateNodeSettings = async (
  payload: UpdateNodeSettingsPayload
): Promise<NodeSettings> => {
  try {
    console.log('[NodeSettings] Updating settings:', payload);

    const response = await httpClient.put<GetNodeSettingsResponse>(
      '/node/settings',
      payload
    );

    const settings: NodeSettings = {
      node_id: response.data.node_id,
      worker_mode_enabled: response.data.worker_mode_enabled,
      provider_mode_enabled: response.data.provider_mode_enabled,
      battery_threshold: response.data.battery_threshold,
      worker_mode_updated_at: response.data.worker_mode_updated_at || undefined,
      provider_mode_updated_at: response.data.provider_mode_updated_at || undefined,
      created_at: response.data.created_at,
      updated_at: response.data.updated_at,
    };

    // Save to AsyncStorage
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    console.log('[NodeSettings] Settings updated and saved:', settings);

    return settings;
  } catch (error: any) {
    console.error('[NodeSettings] Failed to update settings:', error);
    throw new Error(error.response?.data?.message || 'Failed to update node settings');
  }
};

/**
 * Load cached settings from AsyncStorage
 */
export const loadCachedSettings = async (): Promise<NodeSettings | null> => {
  try {
    const cached = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
    if (cached) {
      const settings = JSON.parse(cached);
      console.log('[NodeSettings] Loaded cached settings:', settings);
      return settings;
    }
    return null;
  } catch (error) {
    console.error('[NodeSettings] Failed to load cached settings:', error);
    return null;
  }
};

/**
 * Clear cached settings
 */
export const clearCachedSettings = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(SETTINGS_STORAGE_KEY);
    console.log('[NodeSettings] Cached settings cleared');
  } catch (error) {
    console.error('[NodeSettings] Failed to clear cached settings:', error);
  }
};
