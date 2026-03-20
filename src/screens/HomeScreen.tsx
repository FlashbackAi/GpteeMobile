import React, { useState, useEffect, useCallback } from 'react';
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
import Toast from 'react-native-toast-message';
import DeviceInfo from 'react-native-device-info';
import { useAppStore } from '../store/appStore';
import { colors, fonts } from '../theme/colors';
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
  const batteryThreshold = useAppStore((s) => s.batteryThreshold);
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
  const [greeting, setGreeting] = useState('');

  // Get time-based greeting - memoized for efficiency
  const getGreeting = useCallback(() => {
    const hour = new Date().getHours();
    const displayName = userProfile?.displayName || 'there';

    if (hour >= 5 && hour < 12) {
      return `good morning, ${displayName}!`;
    } else if (hour >= 12 && hour < 17) {
      return `good afternoon, ${displayName}!`;
    } else if (hour >= 17 && hour < 21) {
      return `good evening, ${displayName}!`;
    } else {
      // Late night/early morning - funky greetings
      const funkyGreetings = [
        `hey there, ${displayName}!`,
        `glad to see you, ${displayName}!`,
        `welcome back, ${displayName}!`,
        `what's up, ${displayName}!`,
        `hey ${displayName}, ready to chat?`,
      ];
      return funkyGreetings[Math.floor(Math.random() * funkyGreetings.length)];
    }
  }, [userProfile?.displayName]);

  // Update greeting on mount and when user profile changes
  useEffect(() => {
    setGreeting(getGreeting());
    // Update greeting every minute to stay current
    const interval = setInterval(() => {
      setGreeting(getGreeting());
    }, 60000); // 60 seconds

    return () => clearInterval(interval);
  }, [getGreeting]);

  // Handle provider mode toggle with battery check
  const handleProviderToggle = async (value: boolean) => {
    if (value) {
      // Check battery level before enabling
      try {
        const level = await DeviceInfo.getBatteryLevel();
        const batteryPercent = Math.round(level * 100);

        if (batteryPercent < batteryThreshold) {
          Toast.show({
            type: 'error',
            text1: 'battery too low',
            text2: `please charge above ${batteryThreshold}% to enable provider mode`,
            position: 'top',
            visibilityTime: 4000,
          });
          return; // Don't enable provider mode
        }
      } catch (error) {
        console.error('Error checking battery level:', error);
      }
    }

    // Battery is sufficient or turning off - proceed
    setProviderModeEnabled(value);
  };

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
                <Text style={styles.logo}>gptee</Text>
                <Text style={styles.tagline}>gpt for everyone, free</Text>
              </View> */}
            </View>
            <View style={styles.headerButtons}>
              <TouchableOpacity onPress={() => setShowNodeInfo(true)} style={styles.nodeChip}>
                <View style={[styles.nodeDot, (connected && providerModeEnabled) ? styles.dotGreen : styles.dotRed]} />
                <Text style={styles.nodeChipText}>node</Text>
                <Icon name="terminal" size={14} color={colors.text.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowLogs(true)} style={styles.logsChip}>
                <Text style={styles.logsChipText}>logs</Text>
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
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.welcome}>welcome to</Text>
          <Text style={styles.description}>
            peer-to-peer ai inference network.{'\n\n'}
            chat using your local model or connect to online providers.
          </Text>

          {/* Provider Mode Toggle */}
          <View style={styles.providerSection}>
            <View style={styles.providerHeader}>
              <View style={styles.providerInfo}>
                <Text style={styles.providerTitle}>provider mode</Text>
                <Text style={styles.providerDesc}>
                  share your device's ai model with the network
                </Text>
              </View>
              <Switch
                value={providerModeEnabled}
                onValueChange={handleProviderToggle}
                trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                thumbColor={providerModeEnabled ? colors.button.secondaryText : colors.text.tertiary}
                disabled={!modelDownloaded}
              />
            </View>
            {providerModeEnabled && (
              <View style={styles.providerActiveInfo}>
                <Text style={styles.providerActiveText}>
                  ✓ provider mode active - your device is now visible to the network
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
            <Text style={styles.startButtonText}>start chat</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            all inference is private · end-to-end encrypted
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
        onNewChat={onSelectRole}
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
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  nodeChipText: {
    fontSize: 12,
    color: colors.text.primary,
    fontFamily: fonts.regular,
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
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  logsChipText: {
    fontSize: 12,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  profileButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  profileIcon: {
    fontSize: 20,
  },
  logo: {
    fontSize: 48,
    color: colors.accent.primary,
    letterSpacing: -1,
    fontFamily: fonts.bold,
  },
  tagline: {
    fontSize: 14,
    color: colors.text.tertiary,
    marginTop: 4,
    letterSpacing: 1,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  statusTextLink: {
    color: colors.accent.primary,
    fontFamily: fonts.regular,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  greeting: {
    fontSize: 20,
    color: colors.accent.primary,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: fonts.bold,
    letterSpacing: 0.3,
  },
  welcome: {
    fontSize: 18,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: fonts.regular,
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 16,
    lineHeight: 26,
    color: colors.text.secondary,
    textAlign: 'center',
    fontFamily: fonts.regular,
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
    color: colors.button.primaryText,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  providerSection: {
    backgroundColor: colors.terminal.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 32,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
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
    color: colors.text.primary,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  providerDesc: {
    fontSize: 13,
    color: colors.text.tertiary,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  providerActiveInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  providerActiveText: {
    fontSize: 12,
    color: colors.status.success,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
});