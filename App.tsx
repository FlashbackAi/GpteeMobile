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

  // Queue for pending inference requests
  const requestQueueRef = React.useRef<Array<{req: any, startTime: number}>>([]);

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
      setProviders(providers);
    };

    // Helper to wait for WebRTC connection to be established
    const waitForWebRTC = (peerId: string, timeoutMs: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          // Check if WebRTC is connected to the correct peer
          if (relayClient.isWebRTCConnected() && relayClient.getActiveProviderId() === peerId) {
            clearInterval(checkInterval);
            resolve(true);
          } else if (Date.now() - startTime > timeoutMs) {
            clearInterval(checkInterval);
            resolve(false);
          }
        }, 100); // Check every 100ms
      });
    };

    // Helper function to process next request in queue
    const processNextRequest = async () => {
      if (requestQueueRef.current.length === 0) {
        activeRequestRef.current = null;
        relayClient.setProviderBusy(false);
        return;
      }

      const { req, startTime } = requestQueueRef.current.shift()!;
      const { addLog } = useAppStore.getState();

      // Track this request and mark as busy
      activeRequestRef.current = { requestId: req.requestId, cancelled: false };
      relayClient.setProviderBusy(true);

      // Notify queue of updated positions
      sendQueueUpdates();

      const waitTime = Date.now() - startTime;
      addLog(`📥 Processing request from ${req.from.slice(0, 8)} (waited ${(waitTime / 1000).toFixed(1)}s)`);

      // Check if we need to switch to a different consumer
      const currentPeer = relayClient.getActiveProviderId();
      if (currentPeer && currentPeer !== req.from) {
        addLog(`🔄 Switching from ${currentPeer.slice(0, 8)} to ${req.from.slice(0, 8)} - closing old WebRTC`);
        relayClient.closeWebRTC();
      }

      // If no WebRTC connection, send ready-to-process signal
      if (!relayClient.isWebRTCConnected() || relayClient.getActiveProviderId() !== req.from) {
        // Send ready-to-process signal so consumer can retry WebRTC
        relayClient.sendReadyToProcess(req.from, req.requestId);
        addLog(`📤 Sent ready signal to ${req.from.slice(0, 8)}, waiting for WebRTC...`);

        // Wait for WebRTC to be established (max 10 seconds)
        const webrtcReady = await waitForWebRTC(req.from, 10000);
        if (!webrtcReady) {
          addLog(`⚠️ WebRTC not established after 10s, request will fail`);
        }
      } else {
        addLog(`✅ WebRTC already connected to ${req.from.slice(0, 8)}, reusing connection`);
      }

      await handleInferenceRequest(req);

      // Process next in queue
      processNextRequest();
    };

    // Helper to send queue status updates to all waiting consumers
    const sendQueueUpdates = () => {
      requestQueueRef.current.forEach((item, index) => {
        relayClient.sendQueueStatus(item.req.from, item.req.requestId, index + 1, requestQueueRef.current.length);
      });
    };

    // Actual inference handling logic
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
          } catch (error) {
            addLog(`⚠️ Completed ${tokensEmitted} tokens but WebRTC disconnected`);
          }
        } else {
          addLog(`🛑 Request cancelled - ${tokensEmitted} tokens generated before stop`);
        }

        // Clear active request and mark provider as not busy
        // Keep WebRTC open for same consumer to send more requests
        activeRequestRef.current = null;
        relayClient.setProviderBusy(false);
      } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        activeRequestRef.current = null;
        relayClient.setProviderBusy(false);
      }
    };

    // Set up provider mode inference request handler (global, always active)
    relayClient.onInferenceRequest = async (req) => {
      const { providerModeEnabled: accepting, modelLoaded, addLog } = useAppStore.getState();

      if (!accepting || !modelLoaded) {
        console.log('[App] Ignoring inference request - not accepting or model not loaded');
        return;
      }

      // Check if already processing a request
      if (activeRequestRef.current && !activeRequestRef.current.cancelled) {
        // Add to queue
        requestQueueRef.current.push({ req, startTime: Date.now() });
        const queuePos = requestQueueRef.current.length;

        console.log(`[App] 📋 Provider busy - queued request ${req.requestId} (position ${queuePos})`);
        addLog(`📋 Queued request from ${req.from.slice(0, 8)} (position ${queuePos})`);

        // Send queue status to consumer
        relayClient.sendQueueStatus(req.from, req.requestId, queuePos, queuePos);
        return;
      }

      // Process immediately if not busy
      activeRequestRef.current = { requestId: req.requestId, cancelled: false };

      // Mark as busy IMMEDIATELY to reject concurrent WebRTC offers
      relayClient.setProviderBusy(true);

      addLog(`📥 Request from ${req.from.slice(0, 8)}: "${req.prompt.slice(0, 40)}..."`);

      await handleInferenceRequest(req);

      // Process next in queue after completion
      processNextRequest();
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