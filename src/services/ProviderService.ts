import { NativeModules, Platform } from 'react-native';

interface ProviderServiceInterface {
  startService(): void;
  stopService(): void;
}

const { ProviderService } = NativeModules;

export default {
  start: () => {
    if (Platform.OS === 'android' && ProviderService) {
      ProviderService.startService();
    }
  },
  stop: () => {
    if (Platform.OS === 'android' && ProviderService) {
      ProviderService.stopService();
    }
  },
} as ProviderServiceInterface;
