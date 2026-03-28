import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';

interface Props {
  visible: boolean;
  mode: 'provider' | 'worker';
  onDownload: () => void;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

export const FloatingDownloadButton: React.FC<Props> = ({
  visible,
  mode,
  onDownload,
  onDismiss,
}) => {
  const slideAnim = useRef(new Animated.Value(width)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Slide in from right
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 16,
          useNativeDriver: true,
          friction: 8,
          tension: 40,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Slide out to right
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: width,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const modelName = mode === 'provider' ? 'llm model' : 'vision models';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Icon name="download-cloud" size={20} color={colors.terminal.green} />
            </View>
            <Text style={styles.title}>download required</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} style={styles.closeButton}>
            <Icon name="x" size={18} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <Text style={styles.message}>
          {mode === 'provider'
            ? 'you need to download the llm model to enable provider mode'
            : 'you need to download vision models to enable worker mode'}
        </Text>

        {/* Download Button */}
        <TouchableOpacity style={styles.downloadButton} onPress={onDownload}>
          <Icon name="download" size={16} color="#000000" />
          <Text style={styles.downloadButtonText}>download {modelName}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    width: width - 32,
    maxWidth: 350,
    zIndex: 1000,
  },
  card: {
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 201, 63, 0.3)',
  },
  title: {
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fonts.bold,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  message: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
    lineHeight: 18,
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.terminal.green,
    paddingVertical: 12,
    borderRadius: 8,
  },
  downloadButtonText: {
    fontSize: 13,
    color: '#000000',
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
