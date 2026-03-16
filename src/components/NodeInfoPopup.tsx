import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  connected: boolean;
  displayName?: string;
  relayUrl?: string;
}

export const NodeInfoPopup: React.FC<Props> = ({
  visible,
  onClose,
  connected,
  displayName = 'Relay Node',
  relayUrl = 'relay.gptee.network',
}) => {
  const [ping, setPing] = useState<number | null>(null);
  const [pingStatus, setPingStatus] = useState<'checking' | 'success' | 'error'>('checking');

  useEffect(() => {
    if (visible && connected) {
      // Simulate ping check
      setPingStatus('checking');
      setPing(null);

      const timer = setTimeout(() => {
        if (connected) {
          const simulatedPing = Math.floor(Math.random() * 100) + 20; // 20-120ms
          setPing(simulatedPing);
          setPingStatus('success');
        } else {
          setPingStatus('error');
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [visible, connected]);

  const formatTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.terminal}>
          {/* Terminal Header */}
          <View style={styles.terminalHeader}>
            <View style={styles.terminalButtons}>
              <View style={[styles.terminalButton, styles.terminalButtonRed]} />
              <View style={[styles.terminalButton, styles.terminalButtonYellow]} />
              <View style={[styles.terminalButton, styles.terminalButtonGreen]} />
            </View>
            <Text style={styles.terminalTitle}>node-info</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="x" size={18} color="#888" />
            </TouchableOpacity>
          </View>

          {/* Terminal Content */}
          <View style={styles.terminalBody}>
            {/* Column Headers */}
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderText}>Node</Text>
              <Text style={styles.tableHeaderText}>Ping</Text>
            </View>

            {/* Node Row */}
            <View style={styles.tableRow}>
              <View style={styles.nodeCell}>
                <View style={[styles.statusDot, connected ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.nodeNameText}>{displayName}</Text>
              </View>
              <View style={styles.pingCell}>
                {connected ? (
                  pingStatus === 'checking' ? (
                    <Text style={styles.pingText}>...</Text>
                  ) : ping !== null ? (
                    <Text style={[
                      styles.pingText,
                      ping < 50 ? styles.success : ping < 100 ? styles.warning : styles.value
                    ]}>
                      {ping}ms
                    </Text>
                  ) : (
                    <Text style={styles.mutedText}>N/A</Text>
                  )
                ) : (
                  <Text style={styles.errorText}>Offline</Text>
                )}
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  terminal: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#333',
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#2a2a2a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  terminalButtons: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  terminalButton: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  terminalButtonRed: {
    backgroundColor: '#ff5f56',
  },
  terminalButtonYellow: {
    backgroundColor: '#ffbd2e',
  },
  terminalButtonGreen: {
    backgroundColor: '#27c93f',
  },
  terminalTitle: {
    fontSize: 12,
    color: '#888',
    fontFamily: 'monospace',
    flex: 2,
    textAlign: 'center',
  },
  closeButton: {
    padding: 4,
    flex: 1,
    alignItems: 'flex-end',
  },
  terminalBody: {
    padding: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 16,
  },
  tableHeaderText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#888',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGreen: {
    backgroundColor: '#27c93f',
  },
  dotRed: {
    backgroundColor: '#ff5f56',
  },
  nodeNameText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#e0e0e0',
    fontWeight: '600',
  },
  pingCell: {
    alignItems: 'flex-end',
  },
  pingText: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '700',
  },
  value: {
    color: '#e0e0e0',
  },
  success: {
    color: '#27c93f',
  },
  warning: {
    color: '#ffbd2e',
  },
  errorText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#ff5f56',
    fontWeight: '700',
  },
  mutedText: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: '#666',
    fontWeight: '700',
  },
});
