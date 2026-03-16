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
    // Prioritize 'browser' field to resolve react-native-webrtc correctly
    resolverMainFields: ['browser', 'main', 'react-native', 'module'],
    sourceExts: ['js', 'json', 'ts', 'tsx', 'jsx'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
