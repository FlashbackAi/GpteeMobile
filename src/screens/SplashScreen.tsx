import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme/colors';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>gptee.org</Text>
        <Text style={styles.tagline}>decentralized inference</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.loadingText}>initializing...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
  },
  logo: {
    fontFamily: fonts.mono,
    fontSize: 42,
    fontWeight: '700',
    color: colors.terminal.green,
    marginBottom: 12,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.text.secondary,
    letterSpacing: 1,
  },
  footer: {
    position: 'absolute',
    bottom: 60,
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.text.tertiary,
    letterSpacing: 1,
  },
});
