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

// Import Mobile Wallet Adapter
import '@solana-mobile/mobile-wallet-adapter-protocol';

AppRegistry.registerComponent(appName, () => App);
