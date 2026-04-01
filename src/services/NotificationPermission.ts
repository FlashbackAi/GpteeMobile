import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Request notification permission (Android 13+)
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true; // iOS handles this differently
  }

  if (Platform.Version < 33) {
    // Android 12 and below don't need runtime notification permission
    return true;
  }

  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Enable Notifications',
        message: 'GPTee needs notification permission to show background service status and stats.',
        buttonNeutral: 'Ask Me Later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      }
    );

    const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
    console.log('[NotificationPermission] Permission granted:', isGranted);
    return isGranted;
  } catch (error) {
    console.error('[NotificationPermission] Failed to request permission:', error);
    return false;
  }
};

/**
 * Check if notification permission is granted
 */
export const checkNotificationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version < 33) {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    console.log('[NotificationPermission] Permission check result:', granted);
    return granted;
  } catch (error) {
    console.error('[NotificationPermission] Failed to check permission:', error);
    return false;
  }
};
