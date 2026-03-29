import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';

const { width } = Dimensions.get('window');

interface Props {
  visible: boolean;
  onOpenSettings: () => void;
  onLater: () => void;
}

/**
 * Animated guide modal for battery optimization settings
 * Shows visual steps of what settings to change
 */
export const BatteryOptimizationGuide: React.FC<Props> = ({
  visible,
  onOpenSettings,
  onLater,
}) => {
  const stepAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Animate through steps
      Animated.loop(
        Animated.sequence([
          Animated.timing(stepAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(stepAnim, {
            toValue: 2,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(stepAnim, {
            toValue: 3,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.delay(1000),
          Animated.timing(stepAnim, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      stepAnim.setValue(0);
    }
  }, [visible]);

  const getStepOpacity = (step: number) => {
    return stepAnim.interpolate({
      inputRange: [step - 1, step, step + 1],
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onLater}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Icon name="battery-charging" size={32} color={colors.accent.primary} />
            </View>
            <Text style={styles.title}>disable battery optimization</Text>
            <Text style={styles.subtitle}>
              keep gptee running in the background to serve requests reliably
            </Text>
          </View>

          {/* Animated Steps */}
          <View style={styles.stepsContainer}>
            <Animated.View style={[styles.step, { opacity: getStepOpacity(1) }]}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>1</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>open settings</Text>
                <Text style={styles.stepDescription}>
                  tap the button below to open battery optimization settings
                </Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.step, { opacity: getStepOpacity(2) }]}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>2</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>find gptee</Text>
                <Text style={styles.stepDescription}>
                  scroll through the list and find "gptee" app
                </Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.step, { opacity: getStepOpacity(3) }]}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>3</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>select "don't optimize"</Text>
                <Text style={styles.stepDescription}>
                  choose "unrestricted" or "don't optimize" option
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* Info Box */}
          <View style={styles.infoBox}>
            <Icon name="info" size={16} color={colors.terminal.green} />
            <Text style={styles.infoText}>
              this prevents android from killing the service when screen is off, similar to how music or fitness apps work
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onLater}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonTextSecondary}>later</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={onOpenSettings}
              activeOpacity={0.8}
            >
              <Icon name="external-link" size={18} color={colors.terminal.background} />
              <Text style={styles.buttonTextPrimary}>open settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modal: {
    backgroundColor: colors.background.primary,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 450,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${colors.accent.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  stepsContainer: {
    marginBottom: 20,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.terminal.background,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 15,
    fontFamily: fonts.regular,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: `${colors.terminal.green}15`,
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: colors.terminal.green,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.text.secondary,
    lineHeight: 18,
    marginLeft: 8,
  },
  buttonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: colors.accent.primary,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  buttonTextPrimary: {
    fontSize: 15,
    fontFamily: fonts.regular,
    fontWeight: '600',
    color: colors.terminal.background,
  },
  buttonTextSecondary: {
    fontSize: 15,
    fontFamily: fonts.regular,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
