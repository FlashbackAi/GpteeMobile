/**
 * @format
 */

// Polyfills MUST be imported FIRST, before any other code
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

// Install Web Crypto API polyfill for Mobile Wallet Adapter (RN 0.75.x doesn't have it built-in)
import { install } from 'react-native-quick-crypto';
install();

// Setup global polyfills for Node.js APIs
global.Buffer = Buffer;
global.process = global.process || { env: {} };

// Polyfill for Solana Mobile Wallet Adapter
// React Native is always considered a secure context (native app)
if (typeof global.window === 'undefined') {
  global.window = {};
}
global.window.isSecureContext = true;

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Fix for New Architecture: Register AppRegistry as a callable module
// This is required for Mobile Wallet Adapter's headless task to work
if (global.__fbBatchedBridge) {
  global.__fbBatchedBridge.registerCallableModule('AppRegistry', AppRegistry);
}

// Register the Solana Mobile Wallet Adapter headless task BEFORE importing MWA
AppRegistry.registerHeadlessTask('SolanaMobileWalletAdapterSessionBackgroundTask', () => {
  return async () => {
    // This is a no-op task that is used to keep the app alive while the session is active.
    // The actual session management is handled in the native module.
  };
});

// Import Mobile Wallet Adapter after registering headless task
import '@solana-mobile/mobile-wallet-adapter-protocol';

// Suppress the AppRegistry.startHeadlessTask error from MWA in New Architecture
// This error doesn't actually prevent the wallet flow from working
const originalConsoleError = console.error;
console.error = (...args) => {
  // Filter out the specific MWA headless task error
  const errorString = args.join(' ');
  if (errorString.includes('AppRegistry.startHeadlessTask') &&
      errorString.includes('Module has not been registered as callable')) {
    // Suppress this specific error - it's a known issue with MWA + New Architecture
    return;
  }
  // Log all other errors normally
  originalConsoleError(...args);
};

AppRegistry.registerComponent(appName, () => App);
