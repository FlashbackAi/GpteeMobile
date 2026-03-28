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
import { ModeInfoPopup } from '../components/ModeInfoPopup';
import { FloatingDownloadButton } from '../components/FloatingDownloadButton';
import { Sidebar } from '../components/Sidebar';
import { relayClient } from '../network/RelayClient';
import { VisionWorkerService } from '../services/VisionWorkerService';
import { VisionModelDownloader } from '../services/VisionModelDownloader';
import { FaceRecognitionService } from '../services/FaceRecognitionService';
import { llamaEngine } from '../inference/LlamaEngine';
import { COORDINATOR_URL } from '../config';
import { startForegroundService, stopForegroundService, isServiceRunning } from '../services/ForegroundService';
import { promptBatteryOptimization } from '../services/BatteryOptimization';

interface Props {
  onSelectRole: () => void;
  onOpenProfile: (highlightModel?: 'llm' | 'vision') => void;
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

  // Provider stats
  const providerModeStats = useAppStore((s) => s.providerModeStats);

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
  const modelPath = useAppStore((s) => s.modelPath);
  const setModelLoading = useAppStore((s) => s.setModelLoading);

  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showModeInfo, setShowModeInfo] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'provider' | 'worker'>('provider');
  const [showFloatingDownload, setShowFloatingDownload] = useState(false);
  const [floatingDownloadMode, setFloatingDownloadMode] = useState<'provider' | 'worker'>('provider');
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
        // Show floating download button instead of toast
        setFloatingDownloadMode('provider');
        setShowFloatingDownload(true);
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

      // Prompt for battery optimization before enabling
      promptBatteryOptimization(
        async () => {
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

          // Load LLM model if not already loaded
          if (modelDownloaded && modelPath && !llamaEngine.isLoaded() && !llamaEngine.isLoading()) {
            Toast.show({
              type: 'info',
              text1: 'loading LLM model...',
              text2: 'this may take a moment',
              position: 'top',
            });

            addLog('⏳ Loading LLM model for provider mode...');
            setModelLoading(true);
            try {
              await llamaEngine.loadModel(modelPath);
              setModelLoaded(true);
              setModelLoading(false);
              addLog('✅ LLM model loaded successfully');
              Toast.show({
                type: 'success',
                text1: 'model loaded',
                text2: 'provider mode is now active',
                position: 'top',
              });
            } catch (error: any) {
              setModelLoading(false);
              addLog(`❌ LLM model load failed: ${error.message}`);
              Toast.show({
                type: 'error',
                text1: 'model load failed',
                text2: error.message,
                position: 'top',
              });
              // Don't enable provider mode if model load failed
              return;
            }
          }

          // Enable provider mode
          await setProviderModeEnabled(true);

          // Start foreground service
          try {
            await startForegroundService();
            addLog('✅ Background service started');
          } catch (error: any) {
            console.error('Failed to start foreground service:', error);
            addLog(`⚠️ Background service failed: ${error.message}`);
          }
        },
        () => {
          // User cancelled - don't enable
          addLog('⚠️ Provider mode requires battery optimization to be disabled');
        }
      );
    } else {
      // Disabling provider mode - unload the model and stop service
      if (llamaEngine.isLoaded()) {
        addLog('⏳ Unloading LLM model...');
        await llamaEngine.unload();
        setModelLoaded(false);
        addLog('✅ LLM model unloaded');
      }

      // Stop foreground service if no modes are active
      if (!imageWorkerEnabled && isServiceRunning()) {
        try {
          await stopForegroundService();
          addLog('✅ Background service stopped');
        } catch (error: any) {
          console.error('Failed to stop foreground service:', error);
        }
      }

      // Disable provider mode
      await setProviderModeEnabled(false);
    }
  };

  // Handle worker mode toggle
  const handleWorkerToggle = async (value: boolean) => {
    if (value) {
      // Check if vision models are downloaded
      if (!visionModelsDownloaded) {
        // Show floating download button instead of navigating
        setFloatingDownloadMode('worker');
        setShowFloatingDownload(true);
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

      // Prompt for battery optimization before enabling
      promptBatteryOptimization(
        async () => {
          // MUTUAL EXCLUSIVITY: Disable provider mode if enabled
          if (providerModeEnabled) {
            // handleProviderToggle will handle model unloading
            await handleProviderToggle(false);
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

          // Start foreground service
          try {
            await startForegroundService();
            addLog('✅ Background service started');
          } catch (error: any) {
            console.error('Failed to start foreground service:', error);
            addLog(`⚠️ Background service failed: ${error.message}`);
          }

          // Navigate to ImageWorkerScreen to complete setup
          if (onOpenImageWorker) {
            onOpenImageWorker();
          }
        },
        () => {
          // User cancelled - don't enable
          addLog('⚠️ Worker mode requires battery optimization to be disabled');
        }
      );
    } else {
      await setImageWorkerEnabled(false);
      const workerService = VisionWorkerService.getInstance();
      await workerService.stopWorkerMode();

      // Stop foreground service if no modes are active
      if (!providerModeEnabled && isServiceRunning()) {
        try {
          await stopForegroundService();
          addLog('✅ Background service stopped');
        } catch (error: any) {
          console.error('Failed to stop foreground service:', error);
        }
      }
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
  }, [imageWorkerEnabled, visionModelsDownloaded, connected, visionModelsLoaded, batteryThreshold, userProfile?.displayName, addLog]);

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

        {/* Mode Info Popup */}
        <ModeInfoPopup
          visible={showModeInfo}
          onClose={() => setShowModeInfo(false)}
          mode={selectedMode}
        />

        {/* Floating Download Button */}
        <FloatingDownloadButton
          visible={showFloatingDownload}
          mode={floatingDownloadMode}
          onDownload={() => {
            setShowFloatingDownload(false);
            onOpenProfile(floatingDownloadMode === 'provider' ? 'llm' : 'vision');
          }}
          onDismiss={() => setShowFloatingDownload(false)}
        />

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.welcome}>welcome to</Text>
          <Text style={styles.description}>
            peer-to-peer ai inference network
          </Text>

          {/* Guidance message */}
          {(!modelDownloaded || !visionModelsDownloaded) && (
            <View style={styles.guidanceCard}>
              <Icon name="info" size={16} color={colors.terminal.green} />
              <Text style={styles.guidanceText}>
                {!modelDownloaded && !visionModelsDownloaded
                  ? 'download models from settings to enable modes'
                  : !modelDownloaded
                  ? 'download llm model to enable provider mode'
                  : 'download vision models to enable worker mode'}
              </Text>
            </View>
          )}

          {/* 2-Column Mode Cards */}
          <View style={styles.modesGrid}>
            {/* Provider Mode Card */}
            <View style={styles.modeCard}>
              <View style={styles.modeHeader}>
                <Text style={styles.modeTitle}>provider</Text>
                <View style={styles.modeHeaderRight}>
                  <TouchableOpacity
                    style={styles.infoButton}
                    onPress={() => {
                      setSelectedMode('provider');
                      setShowModeInfo(true);
                    }}
                  >
                    <Icon name="info" size={16} color={colors.text.tertiary} />
                  </TouchableOpacity>
                  <Switch
                    value={providerModeEnabled}
                    onValueChange={handleProviderToggle}
                    trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                    thumbColor={providerModeEnabled ? colors.button.secondaryText : colors.text.tertiary}
                    style={styles.modeSwitch}
                  />
                </View>
              </View>
              <Text style={styles.modeDescription}>
                serve llm requests
              </Text>
              <View style={styles.modeStats}>
                <View style={styles.modeStat}>
                  <Text style={styles.modeStatLabel}>served</Text>
                  <Text style={styles.modeStatValue}>
                    {providerModeStats?.requestsServed || 0}
                  </Text>
                </View>
                <View style={styles.modeStat}>
                  <Text style={styles.modeStatLabel}>status</Text>
                  <View style={styles.modeStatusContainer}>
                    <View style={[styles.modeStatusDot, providerModeEnabled && styles.modeStatusActive]} />
                    <Text style={styles.modeStatusText}>
                      {providerModeEnabled ? 'online' : 'offline'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Worker Mode Card */}
            <View style={styles.modeCard}>
              <View style={styles.modeHeader}>
                <Text style={styles.modeTitle}>worker</Text>
                <View style={styles.modeHeaderRight}>
                  <TouchableOpacity
                    style={styles.infoButton}
                    onPress={() => {
                      setSelectedMode('worker');
                      setShowModeInfo(true);
                    }}
                  >
                    <Icon name="info" size={16} color={colors.text.tertiary} />
                  </TouchableOpacity>
                  <Switch
                    value={imageWorkerEnabled}
                    onValueChange={handleWorkerToggle}
                    trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                    thumbColor={imageWorkerEnabled ? colors.button.secondaryText : colors.text.tertiary}
                    style={styles.modeSwitch}
                  />
                </View>
              </View>
              <Text style={styles.modeDescription}>
                process vision tasks
              </Text>
              <View style={styles.modeStats}>
                <View style={styles.modeStat}>
                  <Text style={styles.modeStatLabel}>processed</Text>
                  <Text style={styles.modeStatValue}>
                    {imageWorkerStats.tasksProcessed}
                  </Text>
                </View>
                <View style={styles.modeStat}>
                  <Text style={styles.modeStatLabel}>status</Text>
                  <View style={styles.modeStatusContainer}>
                    <View style={[styles.modeStatusDot, imageWorkerEnabled && styles.modeStatusActive]} />
                    <Text style={styles.modeStatusText}>
                      {imageWorkerStatus === 'online' ? 'online' : imageWorkerStatus === 'connecting' ? 'connecting' : 'offline'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
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
    backgroundColor: 'rgba(39, 201, 63, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
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
    backgroundColor: 'rgba(39, 201, 63, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
  },
  logsChipText: {
    fontSize: 12,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  profileButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(39, 201, 63, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
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
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
    fontFamily: fonts.regular,
    marginBottom: 20,
  },
  guidanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(39, 201, 63, 0.1)',
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(39, 201, 63, 0.3)',
  },
  guidanceText: {
    flex: 1,
    fontSize: 12,
    color: colors.text.secondary,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  modesGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modeCard: {
    flex: 1,
    backgroundColor: colors.terminal.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
    minHeight: 180,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    minHeight: 32,
  },
  modeHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 60,
  },
  infoButton: {
    padding: 4,
  },
  modeSwitch: {
    transform: [{ scale: 0.8 }],
  },
  modeTitle: {
    fontSize: 16,
    color: colors.text.primary,
    fontFamily: fonts.bold,
  },
  modeDescription: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
    marginBottom: 16,
    lineHeight: 16,
  },
  modeStats: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 'auto',
  },
  modeStat: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeStatLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  modeStatValue: {
    fontSize: 16,
    color: colors.accent.primary,
    fontFamily: fonts.bold,
  },
  modeStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.disabled,
  },
  modeStatusActive: {
    backgroundColor: colors.status.success,
  },
  modeStatusText: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
    textTransform: 'lowercase',
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