/**
 * @format
 */

// Polyfills MUST be imported FIRST, before any other code
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Buffer } from 'buffer';

// Setup global polyfills for Node.js APIs
global.Buffer = Buffer;
global.process = global.process || { env: {} };

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
