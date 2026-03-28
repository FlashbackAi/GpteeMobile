import React, { useRef, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors, fonts } from '../theme/colors';
import { logService, LogEntry, LogCategory } from '../services/LogService';

interface Props {
  visible: boolean;
  logs: string[]; // Legacy prop, not used
  onClose: () => void;
  onClearLogs: () => void;
}

type TabType = 'all' | 'provider' | 'worker';

export const LogsPopup: React.FC<Props> = ({
  visible,
  onClose,
  onClearLogs,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedTab, setSelectedTab] = useState<TabType>('all');
  const [categorizedLogs, setCategorizedLogs] = useState<LogEntry[]>([]);

  // Subscribe to log updates
  useEffect(() => {
    const unsubscribe = logService.subscribe((logs) => {
      setCategorizedLogs(logs);
    });

    // Load initial logs
    setCategorizedLogs(logService.getLogs());

    return unsubscribe;
  }, []);

  // Filter logs based on selected tab
  const filteredLogs = (() => {
    if (selectedTab === 'all') return categorizedLogs;
    if (selectedTab === 'provider') return categorizedLogs.filter(log => log.category === 'provider');
    if (selectedTab === 'worker') return categorizedLogs.filter(log => log.category === 'worker');
    return categorizedLogs;
  })();

  // Auto-scroll to bottom when new logs added
  useEffect(() => {
    if (visible && filteredLogs.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [filteredLogs.length, visible]);

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
            {/* Terminal Header */}
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>gptee logs</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="x" size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'all' && styles.tabActive]}
                onPress={() => setSelectedTab('all')}
              >
                <Text style={[styles.tabText, selectedTab === 'all' && styles.tabTextActive]}>
                  all
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'provider' && styles.tabActive]}
                onPress={() => setSelectedTab('provider')}
              >
                <Text style={[styles.tabText, selectedTab === 'provider' && styles.tabTextActive]}>
                  provider
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, selectedTab === 'worker' && styles.tabActive]}
                onPress={() => setSelectedTab('worker')}
              >
                <Text style={[styles.tabText, selectedTab === 'worker' && styles.tabTextActive]}>
                  worker
                </Text>
              </TouchableOpacity>
            </View>

            {/* Terminal Content */}
            <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={filteredLogs.length === 0 ? styles.scrollContentEmpty : styles.scrollContent}
              showsVerticalScrollIndicator={true}
            >
              {filteredLogs.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Icon name="terminal" size={56} color="#27c93f" />
                  </View>
                  <Text style={styles.emptyText}>no logs yet</Text>
                  <Text style={styles.emptySubtext}>
                    activity logs will appear here as you use the app
                  </Text>
                  <View style={styles.emptyHint}>
                    <Text style={styles.emptyHintText}>
                      • enable provider or worker mode to generate logs
                    </Text>
                    <Text style={styles.emptyHintText}>
                      • logs are automatically categorized and persisted
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {filteredLogs.map((log, i) => (
                    <View key={i} style={styles.logLine}>
                      <Text style={styles.logTimestamp}>
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </Text>
                      <Text style={[styles.logCategory, { color: getCategoryColor(log.category) }]}>
                        [{log.category}]
                      </Text>
                      <Text style={[styles.logText, { color: getLevelColor(log.level) }]}>
                        {log.message}
                      </Text>
                    </View>
                  ))}
                  <View style={styles.cursorLine}>
                    <Text style={styles.promptSymbol}>$</Text>
                    <View style={styles.cursor} />
                  </View>
                </>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
              <TouchableOpacity style={styles.footerButton} onPress={() => {
                logService.clearLogs();
                onClearLogs();
              }}>
                <Icon name="trash-2" size={14} color={colors.text.tertiary} />
                <Text style={styles.footerButtonText}>clear</Text>
              </TouchableOpacity>
              <View style={styles.logCount}>
                <Text style={styles.logCountText}>
                  {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Helper functions for color coding
const getCategoryColor = (category: LogCategory): string => {
  switch (category) {
    case 'provider':
      return '#4A9EFF'; // Blue
    case 'worker':
      return '#FFB84A'; // Orange
    case 'system':
      return '#888'; // Gray
    default:
      return '#888';
  }
};

const getLevelColor = (level: string): string => {
  switch (level) {
    case 'success':
      return '#27c93f'; // Green
    case 'error':
      return '#ff5f56'; // Red
    case 'warning':
      return '#ffbd2e'; // Yellow
    case 'info':
    default:
      return '#e0e0e0'; // Light gray
  }
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
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  terminalTitle: {
    fontSize: 14,
    color: colors.terminal.green,
    fontFamily: fonts.bold,
  },
  closeButton: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.terminal.green,
  },
  tabText: {
    fontSize: 11,
    color: '#666',
    fontFamily: fonts.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: colors.terminal.green,
    fontFamily: fonts.bold,
  },
  scrollView: {
    maxHeight: 400,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  scrollContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 60,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'rgba(39, 201, 63, 0.3)',
  },
  emptyText: {
    fontSize: 18,
    color: '#e0e0e0',
    marginBottom: 12,
    fontFamily: fonts.regular,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#888',
    textAlign: 'center',
    fontFamily: fonts.regular,
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 280,
  },
  emptyHint: {
    backgroundColor: 'rgba(39, 201, 63, 0.05)',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: colors.terminal.green,
    maxWidth: 320,
  },
  emptyHintText: {
    fontSize: 12,
    color: '#999',
    fontFamily: fonts.regular,
    lineHeight: 18,
    marginBottom: 6,
  },
  logLine: {
    flexDirection: 'row',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  logTimestamp: {
    fontSize: 9,
    color: '#666',
    fontFamily: fonts.regular,
    marginRight: 6,
  },
  logCategory: {
    fontSize: 9,
    fontFamily: fonts.bold,
    marginRight: 6,
    textTransform: 'uppercase',
  },
  logText: {
    fontSize: 11,
    fontFamily: fonts.regular,
    lineHeight: 16,
    flex: 1,
  },
  cursorLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  promptSymbol: {
    fontSize: 11,
    color: colors.terminal.green,
    fontFamily: fonts.regular,
    marginRight: 8,
  },
  cursor: {
    width: 8,
    height: 14,
    backgroundColor: colors.terminal.green,
    opacity: 0.8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
    gap: 12,
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
  },
  footerButtonText: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  logCount: {
    marginLeft: 'auto',
  },
  logCountText: {
    fontSize: 11,
    color: '#666',
    fontFamily: fonts.regular,
  },
});
