/**
 * @format
 */

// Polyfills MUST be imported FIRST, before any other code
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

// Install Web Crypto API polyfill for Mobile Wallet Adapter
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

// Polyfill base64ToArrayBuffer for Solana Mobile Wallet Adapter (removed in RN 0.82)
global.base64ToArrayBuffer = function(base64) {
  const binaryString = global.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Polyfill arrayBufferToBase64 for Solana Mobile Wallet Adapter
global.arrayBufferToBase64 = function(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return global.btoa(binary);
};

// Alias for Solana Mobile Wallet Adapter
global.base64FromArrayBuffer = global.arrayBufferToBase64;

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

// Register GPTee Provider/Worker mode headless task
AppRegistry.registerHeadlessTask('GPTeeBackgroundTask', () => {
  return async (taskData) => {
    console.log('[HeadlessTask] GPTee background task started:', taskData);

    // Keep JavaScript runtime alive for WebRTC/WebSocket connections
    // The actual relay connection and inference handling runs in the main JS context
    // This task just ensures the JS bundle stays loaded

    return new Promise((resolve) => {
      // Run indefinitely until service is stopped
      // The foreground service will keep this alive
    });
  };
});

// Import Mobile Wallet Adapter after registering headless task
import '@solana-mobile/mobile-wallet-adapter-protocol';

// Suppress known headless task errors that don't affect functionality
// These errors occur during hot reload but don't prevent the app from working
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.error = (...args) => {
  const errorString = args.join(' ');

  // Filter out known non-critical errors
  if (
    // MWA headless task error
    (errorString.includes('AppRegistry.startHeadlessTask') &&
     errorString.includes('Module has not been registered as callable')) ||
    // Microtask error during hot reload
    errorString.includes('Could not enqueue microtask because they are disabled') ||
    // Background actions headless task registration warning
    errorString.includes('registerHeadlessTask') ||
    errorString.includes('registerCancellableHeadlessTask') ||
    // GPTee headless task warnings during hot reload
    errorString.includes('GPTeeInferenceTask') ||
    errorString.includes('GPTeeCancellationTask') ||
    errorString.includes('GPTeeWorkerTask')
  ) {
    // Suppress these specific errors - they're hot reload artifacts
    return;
  }

  // Log all other errors normally
  originalConsoleError(...args);
};

console.warn = (...args) => {
  const warnString = args.join(' ');

  // Filter out headless task warnings
  if (
    warnString.includes('registerHeadlessTask') ||
    warnString.includes('registerCancellableHeadlessTask')
  ) {
    return;
  }

  // Log all other warnings normally
  originalConsoleWarn(...args);
};

AppRegistry.registerComponent(appName, () => App);
