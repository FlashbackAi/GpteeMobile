import React, { useState, useEffect } from 'react';
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
import { ProviderInfo } from '../network/PeerProtocol';

interface Props {
  visible: boolean;
  onClose: () => void;
  connected: boolean;
  providers: ProviderInfo[];
  currentPeerId: string;
  onSelectProvider?: (provider: ProviderInfo) => void;
}

interface ProviderPingStatus {
  peerId: string;
  ping: number | null;
  status: 'checking' | 'online' | 'offline';
}

export const NodeInfoPopup: React.FC<Props> = ({
  visible,
  onClose,
  connected,
  providers,
  currentPeerId,
  onSelectProvider,
}) => {
  const [providerPings, setProviderPings] = useState<Map<string, ProviderPingStatus>>(new Map());

  useEffect(() => {
    console.log('[NodeInfoPopup] Visibility changed:', visible, 'Providers:', providers.length);

    if (!visible) {
      // Reset pings when closed
      setProviderPings(new Map());
      return;
    }

    console.log('[NodeInfoPopup] Opening - providers:', providers.length);

    // Initialize ping status for all providers
    const initialPings = new Map<string, ProviderPingStatus>();
    providers.forEach(provider => {
      initialPings.set(provider.peerId, {
        peerId: provider.peerId,
        ping: null,
        status: 'checking',
      });
    });
    setProviderPings(initialPings);

    // TODO: Implement real WebRTC ping measurement
    // For now, simulate pings with staggered timing
    providers.forEach((provider, index) => {
      setTimeout(() => {
        const isOwnNode = provider.peerId === currentPeerId;
        const simulatedPing = isOwnNode ? 0 : Math.floor(Math.random() * 150) + 30;

        setProviderPings(prev => {
          const updated = new Map(prev);
          updated.set(provider.peerId, {
            peerId: provider.peerId,
            ping: simulatedPing,
            status: 'online',
          });
          return updated;
        });
      }, 300 + index * 200);
    });
  }, [visible, providers, currentPeerId]);

  const getPingColor = (ping: number | null) => {
    if (ping === null) return '#666';
    if (ping === 0) return '#27c93f'; // Own node
    if (ping < 100) return '#27c93f'; // Good
    if (ping < 200) return '#ffbd2e'; // Warning
    return '#ff5f56'; // Poor
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
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.terminal}>
            {/* Terminal Header */}
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>provider-nodes</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="x" size={18} color={colors.text.tertiary} />
              </TouchableOpacity>
            </View>

            {/* Terminal Content */}
            <View style={styles.terminalBody}>
              {/* Column Headers */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1 }]}>node</Text>
                <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'right' }]}>ping</Text>
              </View>

              {/* Scrollable Provider List */}
              <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={true}>

                {/* Provider Rows */}
                {providers.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>no providers online</Text>
                    <Text style={styles.emptySubtext}>waiting for nodes to connect...</Text>
                  </View>
                ) : (
                  providers.map((provider) => {
                    const isOwnNode = provider.peerId === currentPeerId;
                    const pingStatus = providerPings.get(provider.peerId);

                    return (
                      <View key={provider.peerId} style={styles.rowContainer}>
                        {isOwnNode && (
                          <View style={styles.ownNodeBadge}>
                            <Text style={styles.ownNodeBadgeText}>this node</Text>
                          </View>
                        )}
                        <TouchableOpacity
                          style={[styles.tableRow, isOwnNode && styles.tableRowOwn]}
                          onPress={() => {
                            if (onSelectProvider && !isOwnNode && pingStatus?.status === 'online') {
                              onSelectProvider(provider);
                              onClose();
                            }
                          }}
                          disabled={isOwnNode || !pingStatus || pingStatus.status !== 'online'}
                        >
                          <View style={[styles.nodeCell, { flex: 1 }]}>
                            <View style={[
                              styles.statusDot,
                              pingStatus?.status === 'online' ? styles.dotGreen : styles.dotRed
                            ]} />
                            <Text style={styles.nodeNameText} numberOfLines={1}>
                              {provider.displayName || 'Unknown'}
                            </Text>
                          </View>
                          <View style={[styles.pingCell, { width: 80 }]}>
                            {!pingStatus ? (
                              <Text style={styles.mutedText}>N/A</Text>
                            ) : pingStatus.status === 'checking' ? (
                              <Text style={styles.pingText}>...</Text>
                            ) : pingStatus.ping !== null ? (
                              <Text style={[
                                styles.pingText,
                                { color: getPingColor(pingStatus.ping) }
                              ]}>
                                {pingStatus.ping}ms
                              </Text>
                            ) : (
                              <Text style={styles.mutedText}>N/A</Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </ScrollView>

              {/* Footer info */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  {providers.length > 0 ? '• tap to select provider' : '• enable provider mode to appear in list'}
                </Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
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
    paddingHorizontal: 16,
    paddingVertical: 40,
  },
  terminal: {
    width: '100%',
    maxWidth: 900,
    minWidth: 320,
    maxHeight: '85%',
    backgroundColor: '#000000',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  terminalTitle: {
    fontSize: 12,
    color: colors.terminal.green,
    fontFamily: fonts.regular,
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 4,
    alignItems: 'flex-end',
  },
  terminalBody: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    backgroundColor: '#000000',
  },
  scrollView: {
    maxHeight: 450,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
    marginBottom: 8,
  },
  tableHeaderText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#888',
    letterSpacing: 0.5,
  },
  rowContainer: {
    position: 'relative',
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    minHeight: 56,
  },
  tableRowOwn: {
    backgroundColor: 'rgba(39, 201, 63, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
  },
  nodeCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotGreen: {
    backgroundColor: '#27c93f',
    shadowColor: '#27c93f',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 3,
  },
  dotRed: {
    backgroundColor: '#ff5f56',
  },
  nodeNameText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: '#e0e0e0',
    letterSpacing: 0.3,
    flex: 1,
  },
  ownNodeBadge: {
    position: 'absolute',
    top: -6,
    left: 12,
    backgroundColor: '#000000',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.terminal.green,
    zIndex: 1,
  },
  ownNodeBadgeText: {
    fontFamily: fonts.regular,
    color: '#27c93f',
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  pingCell: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
  },
  pingText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    letterSpacing: 0.5,
  },
  mutedText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: '#e0e0e0',
    marginBottom: 10,
  },
  emptySubtext: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: '#666',
  },
  footer: {
    marginTop: 16,
    paddingTop: 16,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: '#777',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
