import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
  } = useAppStore();

  // ── Load user profile and check model state on mount ──────────────────────
  useEffect(() => {
    loadUserProfile();
    loadProviderModeEnabled();
    checkModelDownloadState();
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

  // ── Connect to relay on mount ──────────────────────────────────────────────
  useEffect(() => {
    setPeerId(relayClient.getPeerId());

    relayClient.onConnectionChange = (connected) => {
      setConnected(connected);
    };

    relayClient.onProvidersUpdated = (providers) => {
      setProviders(providers);
    };

    // Clean up on unmount
    return () => {
      relayClient.disconnect();
    };
  }, []);

  // ── Start session ──────────────────────────────────────────────────────────
  const handleStart = () => {
    setStarted(true);

    const deviceInfo = {
      platform: Platform.OS,
      modelLoaded: false, // updated when model loads
      modelName: 'Qwen3.5-0.8B-Q8',
      acceptingJobs: false, // not accepting jobs by default
      displayName: userProfile?.displayName || 'Unknown Device',
    };

    // Connect as user by default, provider mode can be toggled in UI
    relayClient.connect('user', deviceInfo);
  };

  // ── Go back to home ────────────────────────────────────────────────────────
  const handleBack = async () => {
    relayClient.disconnect();
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