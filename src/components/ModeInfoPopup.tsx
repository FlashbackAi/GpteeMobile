import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: 'provider' | 'worker';
}

export const ModeInfoPopup: React.FC<Props> = ({ visible, onClose, mode }) => {
  const getModeInfo = () => {
    if (mode === 'provider') {
      return {
        title: 'provider mode',
        description: 'share your device\'s llm capabilities with the network',
        icon: 'cpu',
        features: [
          'serve text generation requests to other users',
          'earn rewards for processing requests',
          'runs locally on your device',
          'automatic load balancing',
          'privacy-preserving - no data leaves your device',
        ],
        requirements: [
          'llm model downloaded (check profile settings)',
          'battery level above threshold',
          'stable network connection',
          'battery optimization disabled for background operation',
        ],
      };
    } else {
      return {
        title: 'worker mode',
        description: 'contribute vision processing power to the network',
        icon: 'eye',
        features: [
          'process face detection and recognition tasks',
          'earn rewards for completed tasks',
          'runs locally with on-device models',
          'automatic task assignment from coordinator',
          'privacy-first architecture',
        ],
        requirements: [
          'vision models downloaded (retina face + arcface)',
          'battery level above threshold',
          'stable network connection to coordinator',
          'battery optimization disabled for background operation',
        ],
      };
    }
  };

  const info = getModeInfo();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContainer}>
          <View style={styles.terminal}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconContainer}>
                  <Icon name={info.icon} size={24} color={colors.terminal.green} />
                </View>
                <Text style={styles.title}>{info.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="x" size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.description}>{info.description}</Text>

              {/* Features */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>features</Text>
                {info.features.map((feature, index) => (
                  <View key={index} style={styles.listItem}>
                    <Icon name="check" size={14} color={colors.terminal.green} />
                    <Text style={styles.listItemText}>{feature}</Text>
                  </View>
                ))}
              </View>

              {/* Requirements */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>requirements</Text>
                {info.requirements.map((requirement, index) => (
                  <View key={index} style={styles.listItem}>
                    <Icon name="alert-circle" size={14} color={colors.status.warning} />
                    <Text style={styles.listItemText}>{requirement}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.closeButtonFull} onPress={onClose}>
                <Text style={styles.closeButtonText}>got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
  },
  terminal: {
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(39, 201, 63, 0.3)',
  },
  title: {
    fontSize: 16,
    color: colors.text.primary,
    fontFamily: fonts.bold,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  description: {
    fontSize: 14,
    color: colors.text.secondary,
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    color: colors.terminal.green,
    fontFamily: fonts.bold,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  listItemText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  closeButtonFull: {
    backgroundColor: colors.terminal.green,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
