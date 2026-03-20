import React from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';

interface Props {
  visible: boolean;
  logs: string[];
  onClose: () => void;
  onClearLogs: () => void;
}

export const LogsPopup: React.FC<Props> = ({
  visible,
  logs,
  onClose,
  onClearLogs,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.popup}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Icon name="terminal" size={24} color={colors.terminal.green} />
              <Text style={styles.title}>activity logs</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={onClearLogs} style={styles.clearButton}>
                <Icon name="trash-2" size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="x" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Terminal Window */}
          <View style={styles.terminal}>
            <ScrollView style={styles.terminalBody}>
              {logs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="inbox" size={48} color={colors.text.disabled} />
                  <Text style={styles.emptyText}>no logs yet</Text>
                  <Text style={styles.emptySubtext}>
                    activity logs will appear here as you use the app
                  </Text>
                </View>
              ) : (
                <>
                  {logs.map((log, i) => (
                    <View key={i} style={styles.logLine}>
                      <Text style={styles.logPrompt}>$</Text>
                      <Text style={styles.logText}>{log}</Text>
                    </View>
                  ))}
                  <View style={styles.logLine}>
                    <Text style={styles.logPrompt}>$</Text>
                    <View style={styles.terminalCursor} />
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  popup: {
    backgroundColor: colors.background.primary,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  clearButton: {
    padding: 8,
  },
  closeButton: {
    padding: 8,
  },
  terminal: {
    margin: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  terminalBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxHeight: 500,
    backgroundColor: '#000000',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.text.tertiary,
    marginTop: 16,
    marginBottom: 8,
    fontFamily: fonts.regular,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.text.disabled,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  logLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  logPrompt: {
    fontSize: 11,
    color: colors.terminal.green,
    fontFamily: fonts.regular,
    marginRight: 8,
  },
  logText: {
    fontSize: 11,
    color: colors.text.primary,
    fontFamily: fonts.regular,
    flex: 1,
  },
  terminalCursor: {
    width: 8,
    height: 14,
    backgroundColor: colors.terminal.green,
    marginLeft: 2,
  },
});
