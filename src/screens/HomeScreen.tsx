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
import { VisionWorkerService } from '../services/VisionWorkerService';
import { VisionModelDownloader } from '../services/VisionModelDownloader';
import { FaceRecognitionService } from '../services/FaceRecognitionService';
import { llamaEngine } from '../inference/LlamaEngine';
import { COORDINATOR_URL } from '../config';

interface Props {
  onSelectRole: () => void;
  onOpenProfile: () => void;
  onOpenFaceTest?: () => void;
  onOpenImageWorker?: () => void;
}

export default function HomeScreen({ onSelectRole, onOpenProfile, onOpenFaceTest, onOpenImageWorker }: Props) {
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

  // Image Worker state
  const imageWorkerEnabled = useAppStore((s) => s.imageWorkerEnabled);
  const setImageWorkerEnabled = useAppStore((s) => s.setImageWorkerEnabled);
  const imageWorkerStatus = useAppStore((s) => s.imageWorkerStatus);
  const imageWorkerStats = useAppStore((s) => s.imageWorkerStats);
  const visionModelsDownloaded = useAppStore((s) => s.visionModelsDownloaded);
  const visionModelsLoaded = useAppStore((s) => s.visionModelsLoaded);
  const setVisionModelsDownloaded = useAppStore((s) => s.setVisionModelsDownloaded);
  const setVisionModelsLoaded = useAppStore((s) => s.setVisionModelsLoaded);
  const setModelLoaded = useAppStore((s) => s.setModelLoaded);

  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [batteryLevel, setBatteryLevel] = useState(100);

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
      // Check if LLM model is downloaded
      if (!modelDownloaded) {
        Toast.show({
          type: 'error',
          text1: 'llm model required',
          text2: 'please download the model from profile settings',
          position: 'top',
          visibilityTime: 4000,
        });
        return;
      }

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

      // MUTUAL EXCLUSIVITY: Disable worker mode if enabled
      if (imageWorkerEnabled) {
        await setImageWorkerEnabled(false);
        const workerService = VisionWorkerService.getInstance();
        await workerService.stopWorkerMode();
        try {
          const faceService = FaceRecognitionService.getInstance();
          await faceService.release();
        } catch (error) {
          console.warn('Error releasing vision models:', error);
        }
        setVisionModelsLoaded(false);
        addLog('⚠️ Worker mode disabled - provider mode enabled');
      }
    }

    // Battery is sufficient or turning off - proceed
    setProviderModeEnabled(value);
  };

  // Handle worker mode toggle
  const handleWorkerToggle = async (value: boolean) => {
    if (value) {
      // Check if vision models are downloaded
      if (!visionModelsDownloaded) {
        Toast.show({
          type: 'info',
          text1: 'vision models required',
          text2: 'please download models from profile settings',
          position: 'top',
          visibilityTime: 3000,
        });
        // Navigate to ProfileScreen
        if (onOpenProfile) {
          onOpenProfile();
        }
        return;
      }

      // Check battery level
      try {
        const level = await DeviceInfo.getBatteryLevel();
        const batteryPercent = Math.round(level * 100);

        if (batteryPercent < batteryThreshold) {
          Toast.show({
            type: 'error',
            text1: 'battery too low',
            text2: `please charge above ${batteryThreshold}% to enable worker mode`,
            position: 'top',
            visibilityTime: 4000,
          });
          return;
        }
      } catch (error) {
        console.error('Error checking battery level:', error);
      }

      // MUTUAL EXCLUSIVITY: Disable provider mode if enabled
      if (providerModeEnabled) {
        await setProviderModeEnabled(false);
        await llamaEngine.unload();
        setModelLoaded(false);
        addLog('⚠️ Provider mode disabled - worker mode enabled');
      }

      // Load vision models if not already loaded
      if (!visionModelsLoaded) {
        Toast.show({
          type: 'info',
          text1: 'loading vision models...',
          text2: 'this may take a moment',
          position: 'top',
        });

        try {
          const faceService = FaceRecognitionService.getInstance();
          await faceService.initialize();
          setVisionModelsLoaded(true);
          addLog('✅ Vision models loaded successfully');
        } catch (error) {
          Toast.show({
            type: 'error',
            text1: 'failed to load models',
            text2: 'could not initialize vision models',
            position: 'top',
          });
          addLog('❌ Failed to load vision models');
          return;
        }
      }

      await setImageWorkerEnabled(true);

      // Navigate to ImageWorkerScreen to complete setup
      if (onOpenImageWorker) {
        onOpenImageWorker();
      }
    } else {
      await setImageWorkerEnabled(false);
      const workerService = VisionWorkerService.getInstance();
      await workerService.stopWorkerMode();
    }
  };

  // Load chat history and logs on mount
  useEffect(() => {
    loadChatHistory();
    loadLogs();
  }, []);

  // Check vision models status on mount
  useEffect(() => {
    const checkVisionModels = async () => {
      const downloader = VisionModelDownloader.getInstance();
      const downloaded = await downloader.areAllModelsDownloaded();
      setVisionModelsDownloaded(downloaded);
    };
    checkVisionModels();
  }, []);

  // Monitor battery level
  useEffect(() => {
    const updateBattery = async () => {
      try {
        const level = await DeviceInfo.getBatteryLevel();
        setBatteryLevel(Math.round(level * 100));
      } catch (error) {
        console.error('Error getting battery level:', error);
      }
    };

    updateBattery();
    const interval = setInterval(updateBattery, 30000); // Update every 30s

    return () => clearInterval(interval);
  }, []);

  // Auto-start worker mode on app launch if enabled
  useEffect(() => {
    const autoStartWorker = async () => {
      console.log('[HomeScreen] 🔍 Checking for auto-start worker mode...');
      console.log('[HomeScreen] imageWorkerEnabled:', imageWorkerEnabled);
      console.log('[HomeScreen] visionModelsDownloaded:', visionModelsDownloaded);
      console.log('[HomeScreen] connected:', connected);

      if (!imageWorkerEnabled) {
        console.log('[HomeScreen] ❌ Worker mode not enabled in store - skipping auto-start');
        return;
      }

      if (!visionModelsDownloaded) {
        console.log('[HomeScreen] ❌ Vision models not downloaded - skipping auto-start');
        return;
      }

      if (!connected) {
        console.log('[HomeScreen] ❌ Not connected to relay - will retry when connected');
        return;
      }

      // Check battery level
      try {
        const level = await DeviceInfo.getBatteryLevel();
        const batteryPercent = Math.round(level * 100);
        console.log('[HomeScreen] 🔋 Battery level:', batteryPercent);

        if (batteryPercent < batteryThreshold) {
          console.log(`[HomeScreen] ❌ Battery too low (${batteryPercent}% < ${batteryThreshold}%) - skipping auto-start`);
          addLog(`⚠️ Worker mode auto-start skipped: battery too low (${batteryPercent}%)`);
          return;
        }
      } catch (error) {
        console.error('[HomeScreen] Error checking battery level:', error);
      }

      // Load vision models if not already loaded
      if (!visionModelsLoaded) {
        console.log('[HomeScreen] 📦 Loading vision models for auto-start...');
        addLog('🔄 Auto-loading vision models...');

        try {
          const faceService = FaceRecognitionService.getInstance();
          await faceService.initialize();
          setVisionModelsLoaded(true);
          console.log('[HomeScreen] ✅ Vision models loaded successfully');
          addLog('✅ Vision models loaded successfully');
        } catch (error) {
          console.error('[HomeScreen] ❌ Failed to load vision models:', error);
          addLog('❌ Failed to auto-load vision models');
          return;
        }
      }

      // Start worker service
      console.log('[HomeScreen] 🚀 Auto-starting worker mode...');
      addLog('🚀 Auto-starting worker mode...');

      try {
        const workerService = VisionWorkerService.getInstance();
        const displayName = userProfile?.displayName || 'Anonymous';

        console.log('[HomeScreen] Starting worker service with:', { displayName, coordinatorUrl: COORDINATOR_URL });
        await workerService.startWorkerMode(displayName, COORDINATOR_URL);
        console.log('[HomeScreen] ✅ Worker mode auto-started successfully');
        addLog('✅ Worker mode auto-started successfully');

        Toast.show({
          type: 'success',
          text1: 'worker mode active',
          text2: 'contributing to network',
          position: 'top',
          visibilityTime: 3000,
        });
      } catch (error) {
        console.error('[HomeScreen] ❌ Failed to auto-start worker mode:', error);
        addLog(`❌ Failed to auto-start worker: ${error}`);
        Toast.show({
          type: 'error',
          text1: 'worker auto-start failed',
          text2: 'please restart manually',
          position: 'top',
          visibilityTime: 4000,
        });
      }
    };

    // Delay auto-start slightly to allow app initialization to complete
    const timer = setTimeout(autoStartWorker, 2000);
    return () => clearTimeout(timer);
  }, [imageWorkerEnabled, visionModelsDownloaded, connected, visionModelsLoaded, batteryThreshold, userProfile, addLog]);

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

          {/* Image Worker Mode */}
          {onOpenImageWorker && (
            <View style={styles.workerSection}>
              <View style={styles.workerHeader}>
                <TouchableOpacity
                  style={styles.workerInfo}
                  onPress={onOpenImageWorker}
                  activeOpacity={0.85}
                >
                  <View style={styles.workerTitleRow}>
                    <Icon name="cpu" size={18} color={colors.accent.primary} />
                    <Text style={styles.workerTitle}>image worker</Text>
                    <Icon name="chevron-right" size={16} color={colors.text.tertiary} />
                  </View>
                  <Text style={styles.workerDesc}>
                    contribute device vision processing to the network
                  </Text>
                </TouchableOpacity>
                <Switch
                  value={imageWorkerEnabled}
                  onValueChange={handleWorkerToggle}
                  trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                  thumbColor={imageWorkerEnabled ? colors.button.secondaryText : colors.text.tertiary}
                  disabled={!visionModelsDownloaded || batteryLevel < batteryThreshold}
                />
              </View>
              <View style={styles.workerStats}>
                <View style={styles.workerStat}>
                  <Text style={styles.workerStatLabel}>status</Text>
                  <Text style={[
                    styles.workerStatValue,
                    {
                      color: imageWorkerStatus === 'online' ? colors.status.success :
                             imageWorkerStatus === 'connecting' ? colors.accent.secondary :
                             imageWorkerStatus === 'paused' ? colors.status.warning :
                             colors.text.tertiary
                    }
                  ]}>
                    {imageWorkerStatus}
                  </Text>
                </View>
                <View style={styles.workerStat}>
                  <Text style={styles.workerStatLabel}>processed</Text>
                  <Text style={styles.workerStatValue}>{imageWorkerStats.tasksProcessed}</Text>
                </View>
              </View>
            </View>
          )}

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

          {/* Face recognition test button - commented out for now
          {onOpenFaceTest && (
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: colors.darkGray, marginTop: 10 }]}
              onPress={onOpenFaceTest}
              activeOpacity={0.85}
            >
              <Text style={[styles.startButtonText, { color: colors.cream }]}>test face recognition</Text>
            </TouchableOpacity>
          )}
          */}

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
  // Image Worker Section
  workerSection: {
    backgroundColor: colors.terminal.background,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  workerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  workerInfo: {
    flex: 1,
  },
  workerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  workerTitle: {
    fontSize: 16,
    color: colors.accent.primary,
    fontFamily: fonts.regular,
  },
  workerDesc: {
    fontSize: 13,
    color: colors.text.tertiary,
    lineHeight: 18,
    fontFamily: fonts.regular,
  },
  workerStats: {
    flexDirection: 'row',
    gap: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  workerStat: {
    flex: 1,
  },
  workerStatLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginBottom: 2,
    fontFamily: fonts.regular,
    letterSpacing: 0.5,
  },
  workerStatValue: {
    fontSize: 16,
    color: colors.accent.primary,
    fontFamily: fonts.regular,
  },
});