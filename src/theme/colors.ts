// Cream/Beige color palette for GPTee
export const colors = {
  // Background colors
  background: {
    primary: '#1A1410',      // Dark brown-black
    secondary: '#2D2420',    // Slightly lighter brown
    tertiary: '#3D342C',     // Medium brown
    card: '#2D2420',         // Card background
  },

  // Text colors
  text: {
    primary: '#F5EFE7',      // Cream white
    secondary: '#D6C9BA',    // Light beige
    tertiary: '#A89C8E',     // Muted beige
    disabled: '#6B6158',     // Dark beige
  },

  // Accent colors
  accent: {
    primary: '#D4A574',      // Warm tan/beige
    secondary: '#C4915C',    // Darker tan
    tertiary: '#E8D4B8',     // Light cream
  },

  // Status colors
  status: {
    success: '#8B9D7F',      // Muted sage green
    error: '#C97D7D',        // Muted red
    warning: '#D4A574',      // Warm tan
    info: '#9FB4B8',         // Muted blue-grey
  },

  // UI elements
  border: '#3D342C',
  divider: '#3D342C',
  overlay: 'rgba(26, 20, 16, 0.9)',
  shadow: 'rgba(0, 0, 0, 0.3)',

  // Input colors
  input: {
    background: '#3D342C',
    border: '#4D433A',
    placeholder: '#6B6158',
  },

  // Button colors
  button: {
    primary: '#D4A574',
    primaryText: '#1A1410',
    secondary: '#3D342C',
    secondaryText: '#F5EFE7',
    disabled: '#4D433A',
    disabledText: '#6B6158',
  },
};

export type Colors = typeof colors;
