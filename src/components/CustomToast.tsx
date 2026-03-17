import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

interface ToastProps {
  text1?: string;
  text2?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

export const CustomToast: React.FC<ToastProps> = ({ text1, text2, type = 'info' }) => {
  const getIconAndColor = () => {
    switch (type) {
      case 'success':
        return { icon: 'check-circle', color: '#27c93f' };
      case 'error':
        return { icon: 'x-circle', color: '#ff5f56' };
      case 'warning':
        return { icon: 'alert-circle', color: '#ffbd2e' };
      case 'info':
      default:
        return { icon: 'refresh-cw', color: '#3B82F6' };
    }
  };

  const { icon, color } = getIconAndColor();

  return (
    <View style={[styles.container, { borderLeftColor: color }]}>
      <Icon name={icon} size={20} color={color} style={styles.icon} />
      <View style={styles.textContainer}>
        {text1 && <Text style={styles.text1}>{text1}</Text>}
        {text2 && <Text style={styles.text2}>{text2}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.card,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  text1: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  text2: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
