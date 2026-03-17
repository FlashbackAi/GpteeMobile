import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Switch,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useAppStore } from '../store/appStore';
import { colors } from '../theme/colors';
import { NodeInfoPopup } from '../components/NodeInfoPopup';
import { LogsPopup } from '../components/LogsPopup';
import { Sidebar } from '../components/Sidebar';
import { relayClient } from '../network/RelayClient';

interface Props {
  onSelectRole: () => void;
  onOpenProfile: () => void;
}

export default function HomeScreen({ onSelectRole, onOpenProfile }: Props) {
  const connected = useAppStore((s) => s.connected);
  const modelDownloaded = useAppStore((s) => s.modelDownloaded);
  const modelLoaded = useAppStore((s) => s.modelLoaded);
  const providerModeEnabled = useAppStore((s) => s.providerModeEnabled);
  const setProviderModeEnabled = useAppStore((s) => s.setProviderModeEnabled);
  const userProfile = useAppStore((s) => s.userProfile);
  const chatHistory = useAppStore((s) => s.chatHistory);
  const currentChatId = useAppStore((s) => s.currentChatId);
  const loadChat = useAppStore((s) => s.loadChat);
  const loadChatHistory = useAppStore((s) => s.loadChatHistory);
  const logs = useAppStore((s) => s.logs);
  const loadLogs = useAppStore((s) => s.loadLogs);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const providers = useAppStore((s) => s.providers);
  const peerId = useAppStore((s) => s.peerId);
  const setSelectedProvider = useAppStore((s) => s.setSelectedProvider);
  const addLog = useAppStore((s) => s.addLog);
  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Load chat history and logs on mount
  useEffect(() => {
    loadChatHistory();
    loadLogs();
  }, []);

  // Registration updates are handled globally in App.tsx
  // No need to duplicate here to avoid race conditions

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={() => setShowSidebar(true)} style={styles.menuButton}>
                <Icon name="menu" size={24} color={colors.text.primary} />
              </TouchableOpacity>
              {/* <View>
                <Text style={styles.logo}>GPTee</Text>
                <Text style={styles.tagline}>GPT for Everyone, Free</Text>
              </View> */}
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity onPress={() => setShowNodeInfo(true)} style={styles.nodeChip}>
                <View style={[styles.nodeDot, (connected && providerModeEnabled) ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.nodeChipText}>Node</Text>
                <Icon name="terminal" size={14} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowLogs(true)} style={styles.logsChip}>
                <Text style={styles.logsChipText}>Logs</Text>
                <Icon name="file-text" size={14} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={onOpenProfile} style={styles.profileButton}>
                <Icon name="settings" size={20} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
          </View>
          {/* <View style={styles.statusRow}>
            <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
            <Text style={styles.statusText}>
              {connected ? 'Connected' : 'Connecting...'}
            </Text>
            {providers.length > 0 && (
              <>
                <Text style={styles.statusText}>•</Text>
                <TouchableOpacity onPress={() => setShowNodeInfo(true)}>
                  <Text style={[styles.statusText, styles.statusTextLink]}>
                    {`${providers.length} provider${providers.length !== 1 ? 's' : ''}`}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View> */}
        </View>

        {/* Node Info Popup */}
        <NodeInfoPopup
          visible={showNodeInfo}
          onClose={() => setShowNodeInfo(false)}
          connected={connected}
          providers={providers}
          currentPeerId={peerId}
          onSelectProvider={(provider) => {
            setSelectedProvider(provider);
            addLog(`✅ Selected provider: ${provider.displayName || provider.peerId}`);
          }}
        />

        {/* Logs Popup */}
        <LogsPopup
          visible={showLogs}
          logs={logs}
          onClose={() => setShowLogs(false)}
          onClearLogs={clearLogs}
        />

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.description}>
            Peer-to-peer AI inference network.{'\n\n'}
            Chat using your local model or connect to online providers.
          </Text>

          {/* Provider Mode Toggle */}
          <View style={styles.providerSection}>
            <View style={styles.providerHeader}>
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>Provider Mode</Text>
                <Text style={styles.providerDesc}>
                  Share your device's AI model with the network
                </Text>
              </View>
              <Switch
                value={providerModeEnabled}
                onValueChange={setProviderModeEnabled}
                trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                thumbColor={providerModeEnabled ? colors.button.primaryText : colors.text.tertiary}
                disabled={!modelDownloaded}
              />
            </View>
            {providerModeEnabled && (
              <View style={styles.providerActiveInfo}>
                <Text style={styles.providerActiveText}>
                  ✓ Provider mode active - your device is now visible to the network
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Start button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={onSelectRole}
            activeOpacity={0.85}
          >
            <Text style={styles.startButtonText}>Start Chat</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            All inference is private · End-to-end encrypted
          </Text>
        </View>
      </View>

      {/* Sidebar */}
      <Sidebar
        visible={showSidebar}
        onClose={() => setShowSidebar(false)}
        onHome={() => {
          // Already on home, just close sidebar
          setShowSidebar(false);
        }}
        chatHistory={chatHistory}
        onSelectChat={async (chatId) => {
          await loadChat(chatId);
          setShowSidebar(false);
          // Navigate to chat screen after loading chat
          onSelectRole();
        }}
        currentChatId={currentChatId || undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background.primary },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    justifyContent: 'space-between',
  },
  header: { alignItems: 'center', paddingTop: 20 },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  menuButton: {
    padding: 8,
    marginLeft: -8,
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  logsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logsChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.primary,
  },
  profileButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileIcon: {
    fontSize: 20,
  },
  logo: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.accent.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 4,
    letterSpacing: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotGreen: { backgroundColor: colors.status.success },
  dotRed: { backgroundColor: colors.status.error },
  statusText: {
    fontSize: 12,
    color: colors.text.tertiary,
  },
  statusTextLink: {
    color: colors.accent.primary,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 16,
    lineHeight: 26,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  bottomContainer: {
    paddingBottom: 40,
  },
  startButton: {
    backgroundColor: colors.button.primary,
    paddingVertical: 18,
    borderRadius: 16,
    marginBottom: 20,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.button.primaryText,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.text.tertiary,
  },
  warningBox: {
    backgroundColor: colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.status.warning,
  },
  warningText: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  providerSection: {
    backgroundColor: colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginTop: 32,
    borderWidth: 1,
    borderColor: colors.border,
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerInfo: {
    flex: 1,
    marginRight: 12,
  },
  providerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  providerDesc: {
    fontSize: 13,
    color: colors.text.tertiary,
    lineHeight: 18,
  },
  providerActiveInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  providerActiveText: {
    fontSize: 12,
    color: colors.status.success,
    textAlign: 'center',
  },
});