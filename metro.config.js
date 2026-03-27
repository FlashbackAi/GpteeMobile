const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      crypto: require.resolve('react-native-get-random-values'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      events: require.resolve('events'),
      util: require.resolve('util'),
    },
    // Prioritize 'react-native' field for native modules (MWA), then 'browser' for web polyfills
    resolverMainFields: ['react-native', 'browser', 'main'],
    sourceExts: ['js', 'json', 'ts', 'tsx', 'jsx'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
