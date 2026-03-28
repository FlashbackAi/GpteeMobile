import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';

export type ModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

interface Button {
  text: string;
  onPress: () => void;
  style?: 'primary' | 'secondary' | 'danger';
}

interface Props {
  visible: boolean;
  type: ModalType;
  title: string;
  message: string;
  buttons?: Button[];
  onClose?: () => void;
  icon?: string;
}

/**
 * Reusable custom modal for consistent alerts and confirmations throughout the app
 */
export const CustomModal: React.FC<Props> = ({
  visible,
  type,
  title,
  message,
  buttons,
  onClose,
  icon,
}) => {
  const getIconForType = (): string => {
    if (icon) return icon;

    switch (type) {
      case 'success': return 'check-circle';
      case 'error': return 'x-circle';
      case 'warning': return 'alert-triangle';
      case 'info': return 'info';
      case 'confirm': return 'help-circle';
      default: return 'info';
    }
  };

  const getColorForType = (): string => {
    switch (type) {
      case 'success': return colors.status.success;
      case 'error': return colors.status.error;
      case 'warning': return colors.status.warning;
      case 'info': return colors.terminal.green;
      case 'confirm': return colors.accent.primary;
      default: return colors.terminal.green;
    }
  };

  const defaultButtons: Button[] = buttons || [
    {
      text: 'ok',
      onPress: onClose || (() => {}),
      style: 'primary',
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.8)" barStyle="light-content" />
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: `${getColorForType()}20` }]}>
            <Icon name={getIconForType()} size={48} color={getColorForType()} />
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Message */}
          <Text style={styles.message}>{message}</Text>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            {defaultButtons.map((button, index) => {
              const buttonStyle = button.style || 'primary';

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.button,
                    buttonStyle === 'primary' && styles.buttonPrimary,
                    buttonStyle === 'secondary' && styles.buttonSecondary,
                    buttonStyle === 'danger' && styles.buttonDanger,
                    defaultButtons.length === 1 && styles.buttonFull,
                  ]}
                  onPress={button.onPress}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      buttonStyle === 'primary' && styles.buttonTextPrimary,
                      buttonStyle === 'secondary' && styles.buttonTextSecondary,
                      buttonStyle === 'danger' && styles.buttonTextDanger,
                    ]}
                  >
                    {button.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modal: {
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonsContainer: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonFull: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  buttonDanger: {
    backgroundColor: colors.status.error,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: fonts.regular,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: colors.terminal.background,
  },
  buttonTextSecondary: {
    color: colors.text.secondary,
  },
  buttonTextDanger: {
    color: '#ffffff',
  },
});

/**
 * Helper function to show success modal
 */
export const showSuccessModal = (title: string, message: string, onClose?: () => void) => {
  // This would typically be managed through a context/provider
  // For now, component can be used directly
  return {
    type: 'success' as ModalType,
    title,
    message,
    onClose,
  };
};

/**
 * Helper function to show error modal
 */
export const showErrorModal = (title: string, message: string, onClose?: () => void) => {
  return {
    type: 'error' as ModalType,
    title,
    message,
    onClose,
  };
};

/**
 * Helper function to show confirmation modal
 */
export const showConfirmModal = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void
) => {
  return {
    type: 'confirm' as ModalType,
    title,
    message,
    buttons: [
      {
        text: 'cancel',
        onPress: onCancel || (() => {}),
        style: 'secondary' as const,
      },
      {
        text: 'confirm',
        onPress: onConfirm,
        style: 'primary' as const,
      },
    ],
  };
};
