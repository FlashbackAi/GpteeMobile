import { NativeModules, Linking, Platform, Alert } from 'react-native';
import DeviceInfo from 'react-native-device-info';

/**
 * Check if battery optimization is disabled for the app
 */
export const isBatteryOptimizationDisabled = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true; // iOS doesn't need this
  }

  try {
    // For Android, we'll assume it's enabled by default
    // This is a simplified check - a proper implementation would need a native module
    return false;
  } catch (error) {
    console.error('[BatteryOptimization] Failed to check status:', error);
    return false;
  }
};

/**
 * Open Android battery optimization settings for the app
 */
export const openBatteryOptimizationSettings = async (): Promise<void> => {
  if (Platform.OS !== 'android') {
    console.log('[BatteryOptimization] Not available on iOS');
    return;
  }

  try {
    const packageName = await DeviceInfo.getBundleId();

    // Try to open battery optimization settings
    // This requires REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission
    const settingsUrl = `android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`;

    await Linking.openSettings();

    console.log('[BatteryOptimization] Opened settings');
  } catch (error) {
    console.error('[BatteryOptimization] Failed to open settings:', error);

    // Fallback: open general app settings
    try {
      await Linking.openSettings();
    } catch (fallbackError) {
      console.error('[BatteryOptimization] Failed to open fallback settings:', fallbackError);
    }
  }
};

/**
 * Show dialog prompting user to disable battery optimization
 */
export const promptBatteryOptimization = (
  onConfirm: () => void,
  onCancel?: () => void
): void => {
  if (Platform.OS !== 'android') {
    onConfirm(); // Skip on iOS
    return;
  }

  Alert.alert(
    'disable battery optimization',
    'to keep gptee running in the background and serve requests reliably, you need to disable battery optimization.\n\n' +
    'this is required for provider and worker modes to function properly when the screen is off.\n\n' +
    'steps:\n' +
    '1. tap "open settings"\n' +
    '2. find "gptee" in the list\n' +
    '3. select "don\'t optimize" or "unrestricted"',
    [
      {
        text: 'later',
        style: 'cancel',
        onPress: onCancel,
      },
      {
        text: 'open settings',
        onPress: async () => {
          await openBatteryOptimizationSettings();
          onConfirm();
        },
      },
    ],
    { cancelable: false }
  );
};

/**
 * Show educational info about battery optimization
 */
export const showBatteryOptimizationInfo = (): void => {
  Alert.alert(
    'why disable battery optimization?',
    '• keeps gptee running in background\n' +
    '• ensures you can serve inference requests\n' +
    '• prevents android from killing the service\n' +
    '• similar to how music/fitness apps work\n\n' +
    'you can enable battery optimization again in android settings if needed.',
    [{ text: 'got it' }]
  );
};
