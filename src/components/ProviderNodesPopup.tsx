import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { colors } from '../theme/colors';
import { ProviderInfo } from '../network/PeerProtocol';

interface Props {
  visible: boolean;
  providers: ProviderInfo[];
  currentPeerId: string;
  isAcceptingJobs: boolean;
  onClose: () => void;
  onSelectProvider?: (provider: ProviderInfo) => void;
}

interface ProviderStatus {
  provider: ProviderInfo;
  ping: number | null;
  status: 'checking' | 'online' | 'offline';
}

export const ProviderNodesPopup: React.FC<Props> = ({
  visible,
  providers,
  currentPeerId,
  isAcceptingJobs,
  onClose,
  onSelectProvider,
}) => {
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);

  useEffect(() => {
    console.log('[ProviderNodesPopup] visible:', visible, 'providers:', providers.length, 'isAcceptingJobs:', isAcceptingJobs);
    console.log('[ProviderNodesPopup] currentPeerId:', currentPeerId);
    console.log('[ProviderNodesPopup] providers list:', JSON.stringify(providers.map(p => ({ peerId: p.peerId, displayName: p.displayName }))));

    if (visible) {
      // Combine own node (if accepting jobs) with other providers
      const allProviders = [...providers];

      // Add own node if accepting jobs and not already in list
      if (isAcceptingJobs && !providers.find(p => p.peerId === currentPeerId)) {
        console.log('[ProviderNodesPopup] Adding own node to list');
        allProviders.unshift({
          peerId: currentPeerId,
          modelName: 'Qwen3.5-0.8B-Q8',
          platform: 'android',
          displayName: 'You',
        });
      }

      console.log('[ProviderNodesPopup] Total providers to show:', allProviders.length);
      console.log('[ProviderNodesPopup] All providers:', JSON.stringify(allProviders.map(p => ({ peerId: p.peerId, displayName: p.displayName }))));

      // Initialize provider statuses
      const initialStatuses: ProviderStatus[] = allProviders.map(p => ({
        provider: p,
        ping: null,
        status: 'checking',
      }));
      console.log('[ProviderNodesPopup] Setting provider statuses:', initialStatuses.length);
      setProviderStatuses(initialStatuses);

      // Simulate ping check (in a real implementation, you'd ping the providers)
      allProviders.forEach((provider, index) => {
        setTimeout(() => {
          // Own node gets 0ms ping, others get simulated ping
          const simulatedPing = provider.peerId === currentPeerId ? 0 : Math.floor(Math.random() * 150) + 50;
          setProviderStatuses(prev => {
            const updated = [...prev];
            if (updated[index]) {
              updated[index] = {
                ...updated[index],
                ping: simulatedPing,
                status: 'online',
              };
            }
            return updated;
          });
        }, 500 + index * 200); // Stagger the ping checks
      });
    } else {
      // Reset when popup closes
      setProviderStatuses([]);
    }
  }, [visible, providers, currentPeerId, isAcceptingJobs]);

  const getPingColor = (ping: number | null) => {
    if (ping === null) return colors.text.disabled;
    if (ping < 100) return colors.status.success;
    if (ping < 200) return colors.status.warning;
    return colors.status.error;
  };

  const getStatusDotColor = (status: ProviderStatus['status']) => {
    switch (status) {
      case 'online':
        return colors.status.success;
      case 'offline':
        return colors.status.error;
      case 'checking':
      default:
        return colors.text.disabled;
    }
  };

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
              <Icon name="server" size={24} color={colors.accent.primary} />
              <Text style={styles.title}>Provider Nodes</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="x" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Stats Bar */}
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{providers.length}</Text>
              <Text style={styles.statLabel}>Total Nodes</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {providerStatuses.filter(p => p.status === 'online').length}
              </Text>
              <Text style={styles.statLabel}>Online</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {providerStatuses.filter(p => p.ping && p.ping < 100).length}
              </Text>
              <Text style={styles.statLabel}>Low Latency</Text>
            </View>
          </View>

          {/* Provider List */}
          <ScrollView style={styles.scrollView}>
            {providerStatuses.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="server" size={48} color={colors.text.disabled} />
                <Text style={styles.emptyText}>No providers available</Text>
                <Text style={styles.emptySubtext}>
                  Waiting for providers to come online...
                </Text>
              </View>
            ) : (
              providerStatuses.map((item, index) => {
                const isOwnNode = item.provider.peerId === currentPeerId;
                return (
                <TouchableOpacity
                  key={item.provider.peerId}
                  style={[styles.providerCard, isOwnNode && styles.providerCardOwn]}
                  onPress={() => {
                    if (onSelectProvider && item.status === 'online' && !isOwnNode) {
                      onSelectProvider(item.provider);
                      onClose();
                    }
                  }}
                  disabled={item.status !== 'online' || isOwnNode}
                >
                  <View style={styles.providerHeader}>
                    <View style={styles.providerNameRow}>
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: getStatusDotColor(item.status) },
                        ]}
                      />
                      <Text style={styles.providerName}>
                        {item.provider.displayName || `Provider ${index + 1}`}
                        {isOwnNode && <Text style={styles.youBadge}> (You)</Text>}
                      </Text>
                    </View>
                    {item.status === 'checking' ? (
                      <ActivityIndicator size="small" color={colors.accent.primary} />
                    ) : item.ping !== null ? (
                      <View style={styles.pingBadge}>
                        <Text
                          style={[
                            styles.pingText,
                            { color: getPingColor(item.ping) },
                          ]}
                        >
                          {item.ping}ms
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.providerDetails}>
                    <View style={styles.detailRow}>
                      <Icon name="cpu" size={14} color={colors.text.tertiary} />
                      <Text style={styles.detailText}>{item.provider.modelName}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Icon name="smartphone" size={14} color={colors.text.tertiary} />
                      <Text style={styles.detailText}>{item.provider.platform}</Text>
                    </View>
                  </View>

                  {item.status === 'online' && !isOwnNode && (
                    <View style={styles.selectButton}>
                      <Text style={styles.selectButtonText}>Select Provider</Text>
                      <Icon name="chevron-right" size={16} color={colors.accent.primary} />
                    </View>
                  )}
                </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
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
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 8,
  },
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.accent.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  scrollView: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
  },
  providerCard: {
    backgroundColor: colors.background.card,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerCardOwn: {
    borderColor: colors.accent.primary,
    borderWidth: 2,
    backgroundColor: colors.background.secondary,
  },
  youBadge: {
    color: colors.accent.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  pingBadge: {
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pingText: {
    fontSize: 13,
    fontWeight: '600',
  },
  providerDetails: {
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: colors.text.tertiary,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent.primary,
  },
});
