import { StyleSheet, TextStyle } from 'react-native';
import { fonts } from './colors';

// Base text style with lowercase transformation
export const baseTextStyle: TextStyle = {
  fontFamily: fonts.regular,
  textTransform: 'lowercase',
};

// Global text styles with Space Grotesk
export const textStyles = StyleSheet.create({
  regular: {
    fontFamily: fonts.regular,
    textTransform: 'lowercase',
  },
  medium: {
    fontFamily: fonts.medium,
    textTransform: 'lowercase',
  },
  semiBold: {
    fontFamily: fonts.semiBold,
    textTransform: 'lowercase',
  },
  bold: {
    fontFamily: fonts.bold,
    textTransform: 'lowercase',
  },
  light: {
    fontFamily: fonts.light,
    textTransform: 'lowercase',
  },
  // For LLM responses - no transformation
  llmResponse: {
    fontFamily: fonts.regular,
    textTransform: 'none',
  },
});
