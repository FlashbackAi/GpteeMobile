import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { relayClient } from './src/network/RelayClient';
import { useAppStore, UserProfile } from './src/store/appStore';
import { llamaEngine } from './src/inference/LlamaEngine';
import HomeScreen from './src/screens/HomeScreen';
import ChatScreen from './src/screens/ChatScreen';
import ChatHistoryScreen from './src/screens/ChatHistoryScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { ChatMessage } from './src/network/PeerProtocol';
import { ModelDownloadManager, AVAILABLE_MODELS } from './src/services/ModelDownloadManager';

export default function App() {
  const [showProfile, setShowProfile] = useState(false);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [started, setStarted] = useState(false);
  const {
    setConnected,
    setProviders,
    setPeerId,
    reset,
    messages,
    setMessages,
    onboardingCompleted,
    setUserProfile,
    loadUserProfile,
    userProfile,
    setModelDownloaded,
    setModelPath,
    setModelFilename,
    loadProviderModeEnabled,
    providerModeEnabled,
    setProviderModeEnabled,
    modelLoaded,
    setModelLoaded,
    setModelLoading,
    modelPath,
    addLog,
    loadLocalInferenceMode,
    connected,
    batteryThreshold,
    loadBatteryThreshold,
  } = useAppStore();

  // ── Load user profile and check model state on mount ──────────────────────
  const [dataLoaded, setDataLoaded] = useState(false);

  // Track active inference request to handle cancellation
  const activeRequestRef = React.useRef<{requestId: string, cancelled: boolean} | null>(null);

  useEffect(() => {
    const loadData = async () => {
      await loadUserProfile();
      await loadProviderModeEnabled();
      await loadLocalInferenceMode();
      await checkModelDownloadState();

      // Load model if downloaded
      const { modelPath: path, modelDownloaded } = useAppStore.getState();
      if (modelDownloaded && path && !llamaEngine.isLoaded() && !llamaEngine.isLoading()) {
        addLog('⏳ Loading model on startup...');
        setModelLoading(true);
        try {
          await llamaEngine.loadModel(path);
          setModelLoaded(true);
          setModelLoading(false);
          addLog('✅ Model loaded successfully');
        } catch (error: any) {
          setModelLoading(false);
          addLog(`❌ Model load failed: ${error.message}`);
        }
      }

      setDataLoaded(true); // Signal that data is loaded and we can connect
    };
    loadData();
  }, []);

  // ── Check if model is downloaded ───────────────────────────────────────────
  const checkModelDownloadState = async () => {
    const modelManager = ModelDownloadManager.getInstance();
    const defaultModel = AVAILABLE_MODELS[0];
    const isDownloaded = await modelManager.isModelDownloaded(defaultModel);
    setModelDownloaded(isDownloaded);
    if (isDownloaded) {
      const filename = modelManager.getModelFilename(defaultModel);
      setModelFilename(filename);
      setModelPath(modelManager.getModelPath(defaultModel));
    }
  };

  // ── Connect to relay after data is loaded ─────────────────────────────────
  useEffect(() => {
    if (!dataLoaded) return; // Wait for provider mode and profile to load

    setPeerId(relayClient.getPeerId());

    relayClient.onConnectionChange = (connected) => {
      setConnected(connected);
    };

    relayClient.onProvidersUpdated = (providers) => {
      console.log(`[App] 📥 onProvidersUpdated called with ${providers.length} providers`);
      providers.forEach((p, i) => {
        console.log(`[App]   ${i + 1}. ${p.displayName} (${p.peerId.substring(0, 8)}...)`);
      });
      setProviders(providers);
      console.log(`[App] ✅ setProviders called with ${providers.length} providers`);
    };

    // Handle inference request
    const handleInferenceRequest = async (req: any) => {
      const { addLog } = useAppStore.getState();

      addLog(`📥 Request from ${req.from.slice(0, 8)}: "${req.prompt.slice(0, 40)}..."`);

      let tokensEmitted = 0;
      const startTime = Date.now();

      try {
        await llamaEngine.complete(
          req.prompt,
          (token) => {
            // Only send token if request hasn't been cancelled
            if (activeRequestRef.current?.requestId === req.requestId && !activeRequestRef.current.cancelled) {
              tokensEmitted++;
              try {
                relayClient.sendStreamToken(req.from, req.requestId, token);
              } catch (error) {
                // WebRTC disconnected - mark as cancelled and stop sending
                if (activeRequestRef.current) {
                  activeRequestRef.current.cancelled = true;
                }
                console.log('[App] WebRTC disconnected during streaming, stopping token send');
              }
            }
          },
          req.params,
        );

        // Only send done if request hasn't been cancelled
        if (activeRequestRef.current?.requestId === req.requestId && !activeRequestRef.current.cancelled) {
          const durationMs = Date.now() - startTime;
          try {
            relayClient.sendStreamDone(req.from, req.requestId, tokensEmitted, durationMs);
            addLog(`✅ Completed ${tokensEmitted} tokens in ${(durationMs / 1000).toFixed(1)}s`);

            // Update provider statistics
            const { nodeStats, saveNodeStats } = useAppStore.getState();

            // Calculate tokens per second for this request
            const tokensPerSecond = durationMs > 0 ? (tokensEmitted / (durationMs / 1000)) : 0;

            // Update peak and lowest t/s
            const newPeak = Math.max(nodeStats.peakTokensPerSecond, tokensPerSecond);
            const newLowest = nodeStats.lowestTokensPerSecond === Infinity
              ? tokensPerSecond
              : Math.min(nodeStats.lowestTokensPerSecond, tokensPerSecond);

            useAppStore.setState({
              nodeStats: {
                ...nodeStats,
                totalRequestsServed: nodeStats.totalRequestsServed + 1,
                totalTokensGenerated: nodeStats.totalTokensGenerated + tokensEmitted,
                totalProviderTimeMs: nodeStats.totalProviderTimeMs + durationMs,
                peakTokensPerSecond: newPeak,
                lowestTokensPerSecond: newLowest,
                lastActivityTime: Date.now(),
              },
            });
            saveNodeStats(); // Persist to AsyncStorage
          } catch (error) {
            addLog(`⚠️ Completed ${tokensEmitted} tokens but WebRTC disconnected`);
          }
        } else {
          addLog(`🛑 Request cancelled - ${tokensEmitted} tokens generated before stop`);
        }

        // Clear active request
        activeRequestRef.current = null;
      } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        activeRequestRef.current = null;
      }
    };

    // Set up provider mode inference request handler (global, always active)
    relayClient.onInferenceRequest = async (req) => {
      const { providerModeEnabled: accepting, modelLoaded, addLog } = useAppStore.getState();

      console.log(`[App] 📨 onInferenceRequest called - requestId: ${req.requestId}, from: ${req.from.slice(0, 8)}`);
      console.log(`[App] 🔍 Current active request: ${activeRequestRef.current?.requestId || 'none'}`);

      if (!accepting || !modelLoaded) {
        console.log('[App] Ignoring inference request - not accepting or model not loaded');
        return;
      }

      // Check if already processing a request - reject with error
      if (activeRequestRef.current && !activeRequestRef.current.cancelled) {
        console.log(`[App] ⛔ Provider busy - rejecting request ${req.requestId} (currently processing ${activeRequestRef.current.requestId})`);
        addLog(`⛔ Busy - rejected request from ${req.from.slice(0, 8)}`);
        // Consumer will failover to another provider
        return;
      }

      // Process request
      console.log(`[App] ✅ Accepting request ${req.requestId}`);
      activeRequestRef.current = { requestId: req.requestId, cancelled: false };
      addLog(`📥 Request from ${req.from.slice(0, 8)}: "${req.prompt.slice(0, 40)}..."`);
      await handleInferenceRequest(req);
      console.log(`[App] ✅ Completed request ${req.requestId}`);
    };

    // Set up cancel request handler (global)
    relayClient.onCancelRequest = async (requestId) => {
      const { addLog } = useAppStore.getState();
      addLog(`🛑 Cancel request for ${requestId}`);

      // Mark request as cancelled
      if (activeRequestRef.current?.requestId === requestId) {
        activeRequestRef.current.cancelled = true;
      }

      await llamaEngine.stop();
    };

    // Connect to relay with loaded provider mode state
    const { providerModeEnabled, userProfile: profile, modelLoaded: isModelLoaded } = useAppStore.getState();
    const deviceInfo = {
      platform: Platform.OS,
      modelLoaded: isModelLoaded,
      modelName: 'Qwen3.5-0.8B-Q8',
      acceptingJobs: providerModeEnabled && isModelLoaded, // Must have model loaded to accept jobs
      displayName: profile?.displayName || 'Unknown Device',
    };
    relayClient.connect('user', deviceInfo);

    // Clean up on unmount
    return () => {
      relayClient.disconnect();
    };
  }, [dataLoaded]);

  // ── Update relay registration when model loads or provider mode changes ───
  useEffect(() => {
    if (!connected) return; // Only update if connected to relay

    const deviceInfo = {
      platform: Platform.OS,
      modelLoaded: modelLoaded,
      modelName: 'Qwen3.5-0.8B-Q8',
      acceptingJobs: providerModeEnabled && modelLoaded,
      displayName: userProfile?.displayName || 'Unknown Device',
    };

    console.log(`[App] 🔄 Updating registration - modelLoaded: ${modelLoaded}, providerModeEnabled: ${providerModeEnabled}, acceptingJobs: ${deviceInfo.acceptingJobs}`);
    relayClient.updateRegistration(deviceInfo);

    if (modelLoaded && providerModeEnabled) {
      addLog('✅ Model loaded - provider mode active');
    }
  }, [modelLoaded, connected, providerModeEnabled, userProfile]);

  // ── Battery monitoring for provider mode auto-disable ──────────────────────
  useEffect(() => {
    if (!providerModeEnabled) return; // Only monitor if provider mode is on

    // Load battery threshold on mount
    loadBatteryThreshold();

    const checkBattery = async () => {
      try {
        const level = await DeviceInfo.getBatteryLevel();
        const batteryPercent = Math.round(level * 100);

        // Auto-disable provider mode if battery falls below threshold
        if (batteryPercent < batteryThreshold) {
          addLog(`⚠️ Battery low (${batteryPercent}%) - disabling provider mode`);
          await setProviderModeEnabled(false);
        }
      } catch (error) {
        console.error('Error checking battery level:', error);
      }
    };

    // Check battery immediately
    checkBattery();

    // Check every 30 seconds
    const interval = setInterval(checkBattery, 30000);

    return () => clearInterval(interval);
  }, [providerModeEnabled, batteryThreshold]);

  // ── Start session ──────────────────────────────────────────────────────────
  const handleStart = () => {
    setStarted(true);
    // Relay connection already established on mount, just transition to chat screen
  };

  // ── Go back to home ────────────────────────────────────────────────────────
  const handleBack = async () => {
    // Don't disconnect relay - keep connection alive so provider mode works in HomeScreen
    await llamaEngine.unload();
    reset();
    setStarted(false);
  };

  // ── Load saved chat ────────────────────────────────────────────────────────
  const handleSelectChat = (session: { messages: ChatMessage[] }) => {
    setMessages(session.messages);
  };

  // ── Handle onboarding completion ───────────────────────────────────────────
  const handleOnboardingComplete = (profile: UserProfile) => {
    setUserProfile(profile);
  };

  // ── Routing ───────────────────────────────────────────────────────────────
  // Show onboarding if not completed
  if (!onboardingCompleted) {
    return <OnboardingScreen onComplete={handleOnboardingComplete} />;
  }

  if (showProfile) {
    return <ProfileScreen onBack={() => {
      setShowProfile(false);
      // Trigger model load check when returning from profile
      if (!started) setStarted(false);
    }} />;
  }

  if (showChatHistory) {
    return (
      <ChatHistoryScreen
        onBack={() => setShowChatHistory(false)}
        onSelectChat={handleSelectChat}
        currentMessages={messages}
      />
    );
  }

  if (!started) {
    return <HomeScreen onSelectRole={handleStart} onOpenProfile={() => setShowProfile(true)} />;
  }

  return (
    <ChatScreen
      onBack={handleBack}
      onOpenMenu={() => setShowChatHistory(true)}
      onOpenProfile={() => setShowProfile(true)}
    />
  );
}