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

  // Accent colors
  accent: {
    primary: '#D4A574',      // Warm tan/beige (kept for contrast)
    secondary: '#C4915C',    // Darker tan
    tertiary: '#E8D4B8',     // Light cream
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
    primary: '#D4A574',
    primaryText: '#000000',
    secondary: '#1A1A1A',
    secondaryText: '#FFFFFF',
    disabled: '#2A2A2A',
    disabledText: '#505050',
  },
};

export type Colors = typeof colors;
