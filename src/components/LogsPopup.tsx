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
import { colors } from '../theme/colors';

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
              <Icon name="terminal" size={24} color="#4CAF50" />
              <Text style={styles.title}>Activity Logs</Text>
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
            <View style={styles.terminalHeader}>
              <View style={styles.terminalControls}>
                <View style={[styles.terminalButton, styles.closeBtn]} />
                <View style={[styles.terminalButton, styles.minimizeBtn]} />
                <View style={[styles.terminalButton, styles.maximizeBtn]} />
              </View>
              <Text style={styles.terminalTitle}>bash</Text>
            </View>

            <ScrollView style={styles.terminalBody}>
              {logs.length === 0 ? (
                <View style={styles.emptyState}>
                  <Icon name="inbox" size={48} color="#444" />
                  <Text style={styles.emptyText}>No logs yet</Text>
                  <Text style={styles.emptySubtext}>
                    Activity logs will appear here as you use the app
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
    borderBottomColor: colors.border,
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
    fontWeight: '700',
    color: colors.text.primary,
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
    borderColor: '#333',
    overflow: 'hidden',
    maxHeight: '80%',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#2D2D2D',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  terminalControls: {
    flexDirection: 'row',
    gap: 8,
    marginRight: 12,
  },
  terminalButton: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  closeBtn: {
    backgroundColor: '#FF5F56',
  },
  minimizeBtn: {
    backgroundColor: '#FFBD2E',
  },
  maximizeBtn: {
    backgroundColor: '#27C93F',
  },
  terminalTitle: {
    fontSize: 11,
    color: '#888',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  terminalBody: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    maxHeight: 500,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  logPrompt: {
    fontSize: 11,
    color: '#4CAF50',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
    fontWeight: '700',
  },
  logText: {
    fontSize: 11,
    color: '#E0E0E0',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  terminalCursor: {
    width: 8,
    height: 14,
    backgroundColor: '#4CAF50',
    marginLeft: 2,
  },
});
