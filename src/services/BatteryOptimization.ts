import { NativeModules, Platform } from 'react-native';

const { BatteryOptimizationModule } = NativeModules;

/**
 * Check if battery optimization is disabled for the app
 */
export const isBatteryOptimizationDisabled = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true; // iOS doesn't need this
  }

  try {
    if (BatteryOptimizationModule) {
      const isIgnoring = await BatteryOptimizationModule.isIgnoringBatteryOptimizations();
      console.log('[BatteryOptimization] Battery optimization disabled:', isIgnoring);
      return isIgnoring;
    } else {
      console.warn('[BatteryOptimization] Native module not available');
      return false;
    }
  } catch (error) {
    console.error('[BatteryOptimization] Failed to check status:', error);
    return false;
  }
};

/**
 * Open Android battery optimization settings for the app
 * This will directly open the battery optimization prompt for the app
 */
export const openBatteryOptimizationSettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('[BatteryOptimization] Not available on iOS');
    return false;
  }

  try {
    if (BatteryOptimizationModule) {
      await BatteryOptimizationModule.openBatteryOptimizationSettings();
      console.log('[BatteryOptimization] Opened settings');
      return true;
    } else {
      console.warn('[BatteryOptimization] Native module not available');
      return false;
    }
  } catch (error) {
    console.error('[BatteryOptimization] Failed to open settings:', error);
    return false;
  }
};
