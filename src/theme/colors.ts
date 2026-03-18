// Space Grotesk font family
export const fonts = {
  regular: 'spacegrotesk',
  medium: 'spacegroteskmedium',
  semiBold: 'spacegrotesksemibold',
  bold: 'spacegroteskbold',
  light: 'spacegrotesklight',
};

// Pure black theme for GPTee
export const colors = {
  // Background colors
  background: {
    primary: '#000000',      // Pure black
    secondary: '#0A0A0A',    // Slightly off-black
    tertiary: '#1A1A1A',     // Dark grey
    card: '#0A0A0A',         // Card background
  },

  // Text colors
  text: {
    primary: '#FFFFFF',      // Pure white
    secondary: '#E0E0E0',    // Light grey
    tertiary: '#A0A0A0',     // Medium grey
    disabled: '#505050',     // Dark grey
  },

  // Accent colors (developer aesthetic)
  accent: {
    primary: '#27c93f',      // Terminal green
    secondary: '#00d9ff',    // Cyan blue
    tertiary: '#1db954',     // Darker green
    neutral: '#FFFFFF',      // White
  },

  // Terminal colors (developer aesthetic)
  terminal: {
    green: '#27c93f',        // Bright terminal green
    blue: '#00d9ff',         // Cyan terminal blue
    greenDim: 'rgba(39, 201, 63, 0.6)',   // Dim green for borders
    blueDim: 'rgba(0, 217, 255, 0.6)',    // Dim blue for borders
    background: '#0d0d0d',   // Terminal black background
    prompt: '#888888',       // Terminal grey
  },

  // Status colors
  status: {
    success: '#4CAF50',      // Green
    error: '#F44336',        // Red
    warning: '#FF9800',      // Orange
    info: '#2196F3',         // Blue
  },

  // UI elements
  border: '#1A1A1A',
  divider: '#1A1A1A',
  overlay: 'rgba(0, 0, 0, 0.95)',
  shadow: 'rgba(0, 0, 0, 0.8)',

  // Input colors
  input: {
    background: '#1A1A1A',
    border: '#2A2A2A',
    placeholder: '#505050',
  },

  // Button colors
  button: {
    primary: '#27c93f',      // Terminal green
    primaryText: '#000000',  // Black text on green
    secondary: '#1A1A1A',
    secondaryText: '#FFFFFF',
    disabled: '#2A2A2A',
    disabledText: '#505050',
  },
};

export type Colors = typeof colors;
