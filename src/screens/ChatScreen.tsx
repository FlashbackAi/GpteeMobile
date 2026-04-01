import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch, Animated, Keyboard,
} from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import Icon from 'react-native-vector-icons/Feather';
import Toast from 'react-native-toast-message';
import DeviceInfo from 'react-native-device-info';
import { useAppStore } from '../store/appStore';
import { relayClient } from '../network/RelayClient';
import { ChatMessage, ProviderInfo, InferenceRequestMessage } from '../network/PeerProtocol';
import { llamaEngine } from '../inference/LlamaEngine';
import { colors, fonts } from '../theme/colors';
import ProviderService from '../services/ProviderService';
import { NodeInfoPopup } from '../components/NodeInfoPopup';
import { LogsPopup } from '../components/LogsPopup';
import { FloatingDownloadButton } from '../components/FloatingDownloadButton';
import { Sidebar } from '../components/Sidebar';
import { CustomToast } from '../components/CustomToast';
import { checkNotificationPermission, requestNotificationPermission } from '../services/NotificationPermission';

interface Props {
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenProfile?: (highlightModel?: 'llm' | 'vision') => void;
}

export default function ChatScreen({ onBack, onOpenMenu, onOpenProfile }: Props) {
  const [input, setInput] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [providerExpanded, setProviderExpanded] = useState(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showFloatingDownload, setShowFloatingDownload] = useState(false);
  const [floatingDownloadMode, setFloatingDownloadMode] = useState<'provider' | 'worker'>('provider');
  const [acceptingToggleLoading, setAcceptingToggleLoading] = useState(false);
  const [localToggleLoading, setLocalToggleLoading] = useState(false);
  const [providerToggleLoading, setProviderToggleLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [liveMetrics, setLiveMetrics] = useState<{
    tokensGenerated: number;
    tokensPerSecond: number;
    elapsedMs: number;
  } | null>(null);
  const remoteThinkingCleanupRef = useRef<Map<string, () => void>>(new Map());

  const {
    connected, providers, selectedProvider, messages,
    isGenerating, setSelectedProvider, currentRequestId,
    assignedProviderId, setAssignedProviderId,
    addMessage, setMessages, appendStreamToken, finaliseMessage,
    setGenerating, setCurrentRequestId,
    modelLoaded, modelPath, modelDownloaded,
    setModelLoaded, setModelLoading,
    userProfile,
    providerModeEnabled,
    setProviderModeEnabled,
    batteryThreshold,
    chatHistory,
    currentChatId,
    saveCurrentChat,
    loadChat,
    loadChatHistory,
    startNewChat,
    peerId,
    logs,
    addLog,
    loadLogs,
    clearLogs,
    localInferenceMode,
    setLocalInferenceMode,
  } = useAppStore();

  // Use localInferenceMode from store as useLocalModel
  const useLocalModel = localInferenceMode;
  const setUseLocalModel = setLocalInferenceMode;

  // ── Keyboard event listeners ──────────────────────────────────────────────
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // ── Wire up relay callbacks ────────────────────────────────────────────────
  useEffect(() => {
    // User mode callbacks (receiving responses) - use store directly to avoid stale closures
    relayClient.onStreamToken = (requestId, token) => {
      // Clear thinking indicator on first token
      const cleanup = remoteThinkingCleanupRef.current.get(requestId);
      if (cleanup) {
        cleanup();
        remoteThinkingCleanupRef.current.delete(requestId);
      }

      const { appendStreamToken } = useAppStore.getState();
      appendStreamToken(requestId, token);
    };

    relayClient.onStreamDone = (requestId, tokensGenerated, durationMs, providerName) => {
      const { finaliseMessage } = useAppStore.getState();
      finaliseMessage(requestId, tokensGenerated, durationMs, providerName);
    };

    relayClient.onResponse = (requestId, response, tokensGenerated, durationMs, providerName) => {
      const { messages: msgs, addMessage, finaliseMessage } = useAppStore.getState();
      const exists = msgs.find((m) => m.id === requestId);

      if (!exists) {
        addMessage({
          id: requestId,
          role: 'assistant',
          content: response,
          timestamp: Date.now(),
          streaming: false,
          tokensGenerated,
          durationMs,
          fulfilledBy: providerName,
        });
      }
      finaliseMessage(requestId, tokensGenerated, durationMs, providerName);
    };

    // Failover callbacks
    relayClient.onProviderFailover = (requestId, newProviderName, tokensReceived) => {
      const { addLog } = useAppStore.getState();
      addLog(`♻️  Switched to ${newProviderName} (${tokensReceived} tokens preserved)`);

      // Show elegant toast notification
      Toast.show({
        type: 'info',
        text1: 'provider switched',
        text2: `now using ${newProviderName} (${tokensReceived} tokens preserved)`,
        position: 'top',
        visibilityTime: 3000,
      });
    };

    relayClient.onInferenceError = (requestId, code, message) => {
      const { addLog, messages, appendStreamToken, finaliseMessage, setGenerating, setCurrentRequestId } = useAppStore.getState();
      addLog(`❌ Inference failed: ${message}`);

      // Find and finalize the message with error (only if message exists)
      const msg = messages.find(m => m.id === requestId);
      if (msg) {
        appendStreamToken(requestId, `\n\n[Error: ${message}]`);
        finaliseMessage(requestId, 0, 0, 'Failed');
      }

      setGenerating(false);
      setCurrentRequestId(null);

      // Show elegant error toast
      Toast.show({
        type: 'error',
        text1: 'inference failed',
        text2: message,
        position: 'top',
        visibilityTime: 4000,
      });
    };

    // Queue handlers removed - using simple failover instead

    // NOTE: Provider mode callbacks (onInferenceRequest, onCancelRequest) are set up globally in App.tsx
    // We don't override them here to keep them active even when not on ChatScreen

    // Don't clean up callbacks on unmount - they need to stay active
    return () => {
      // Leave callbacks active - don't null them
    };
  }, []);

  // Sticky sessions: Use assigned provider for current chat, or auto-select first available
  useEffect(() => {
    if (!useLocalModel && providers.length > 0) {
      // If we have an assigned provider for this chat, find and use it
      if (assignedProviderId) {
        const assignedProvider = providers.find(p => p.peerId === assignedProviderId);
        if (assignedProvider) {
          setSelectedProvider(assignedProvider);
          addLog(`📌 Using sticky session provider: ${assignedProvider.displayName}`);
        } else {
          // Assigned provider is offline, fall back to first available
          setSelectedProvider(providers[0]);
          setAssignedProviderId(providers[0].peerId);
          addLog(`⚠️ Assigned provider offline, switching to: ${providers[0].displayName}`);
        }
      } else if (!selectedProvider) {
        // No assigned provider yet, select first and assign it
        setSelectedProvider(providers[0]);
        setAssignedProviderId(providers[0].peerId);
        addLog(`📌 Assigned provider for this chat: ${providers[0].displayName}`);
      }
    }
    if (providers.length === 0) {
      setSelectedProvider(null);
    }
  }, [providers, useLocalModel, assignedProviderId]);


  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  // Toggle provider panel animation
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: providerExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [providerExpanded]);

  // Load chat history on mount
  useEffect(() => {
    loadChatHistory();
  }, []);

  // Load logs on mount
  useEffect(() => {
    loadLogs();
  }, []);

  // Save chat when generation completes
  useEffect(() => {
    if (!isGenerating && messages.length > 0) {
      saveCurrentChat();
    }
  }, [isGenerating, messages.length]);

  // ── Three User States Logic ────────────────────────────────────────────────
  // State 1: Provider Mode ON → Force Local Mode ON (serves others + uses own compute)
  // State 2: Both OFF → Consumer mode (requests from providers)
  // State 3: Local ON, Provider OFF → Local User (uses own compute, doesn't serve)
  useEffect(() => {
    if (providerModeEnabled && !useLocalModel) {
      setUseLocalModel(true);
      addLog('🔄 Provider Mode ON → Local Model enabled (State 1: Provider)');
    }
  }, [providerModeEnabled]);

  // Auto-load model if local mode is enabled but model isn't loaded
  useEffect(() => {
    const autoLoadModel = async () => {
      if (useLocalModel && !providerModeEnabled && modelDownloaded && modelPath && !modelLoaded && !llamaEngine.isLoading()) {
        addLog('⏳ Auto-loading LLM model for local mode...');
        setModelLoading(true);
        try {
          await llamaEngine.loadModel(modelPath);
          setModelLoaded(true);
          setModelLoading(false);
          addLog('✅ LLM model loaded successfully');
        } catch (error: any) {
          setModelLoading(false);
          addLog(`❌ LLM model load failed: ${error.message}`);
        }
      }
    };
    autoLoadModel();
  }, [useLocalModel, providerModeEnabled, modelDownloaded, modelPath, modelLoaded]);

  // Registration updates are handled globally in App.tsx
  // No need to send updates here to avoid race conditions

  // Clean up provider service on unmount
  useEffect(() => {
    return () => {
      if (accepting) {
        ProviderService.stop();
      }
    };
  }, [accepting]);

  const toggleLocalMode = async (enabled: boolean) => {
    // Local Mode can only be toggled when Provider Mode is OFF
    if (providerModeEnabled) return;

    setLocalToggleLoading(true);
    try {
      if (enabled) {
      // Check if model is downloaded
      if (!modelDownloaded) {
        Toast.show({
          type: 'error',
          text1: 'model not downloaded',
          text2: 'please download the model first',
          position: 'top',
        });
        return;
      }

      // Load model if not already loaded
      if (modelDownloaded && modelPath && !llamaEngine.isLoaded() && !llamaEngine.isLoading()) {
        Toast.show({
          type: 'info',
          text1: 'loading model...',
          text2: 'this may take a moment',
          position: 'top',
        });

        addLog('⏳ Loading LLM model for local mode...');
        setModelLoading(true);
        try {
          await llamaEngine.loadModel(modelPath);
          setModelLoaded(true);
          setModelLoading(false);
          addLog('✅ LLM model loaded successfully');
          Toast.show({
            type: 'success',
            text1: 'model loaded',
            text2: 'you can now chat locally',
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
          return;
        }
      }

      setUseLocalModel(true);
      // State 3: Local User (uses own compute, doesn't serve)
      addLog('🔵 Local Mode ON (State 3: Local User - own compute only)');
    } else {
      // Unload model when disabling local mode (if provider mode is also off)
      if (!providerModeEnabled && llamaEngine.isLoaded()) {
        addLog('⏳ Unloading LLM model...');
        await llamaEngine.unload();
        setModelLoaded(false);
        addLog('✅ LLM model unloaded');
      }

        setUseLocalModel(false);
        // State 2: Consumer (requests from providers)
        addLog('🟣 Local Mode OFF (State 2: Consumer - requesting from providers)');
      }
    } finally {
      setLocalToggleLoading(false);
    }
  };

  const toggleProviderMode = async (enabled: boolean) => {
    setProviderToggleLoading(true);
    try {
      if (enabled) {
        // Check if model is downloaded
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

      // Check notification permission
      const hasNotificationPermission = await checkNotificationPermission();
      if (!hasNotificationPermission) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Toast.show({
            type: 'error',
            text1: 'notification permission required',
            text2: 'please enable notifications to see background service status',
            position: 'top',
          });
          return;
        }
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
    } else {
      // Disabling provider mode - unload the model
      if (llamaEngine.isLoaded()) {
        addLog('⏳ Unloading LLM model...');
        await llamaEngine.unload();
        setModelLoaded(false);
        addLog('✅ LLM model unloaded');
      }
    }

    await setProviderModeEnabled(enabled);
    // Relay registration update is handled by App.tsx useEffect

    if (enabled) {
      // State 1: Provider Mode ON → serves others, uses own compute
      addLog('🟢 Provider mode enabled (State 1: Provider - serving others)');
      // Automatically start accepting if model is loaded
      if (modelLoaded) {
        setAccepting(true);
        ProviderService.start();
        addLog('🟢 Now accepting jobs (available as provider)');
      }
    } else {
      // Transitioning out of Provider Mode
      // Will become State 2 (Consumer) if Local Mode OFF, or State 3 (Local User) if Local Mode ON
      const newState = useLocalModel ? 'State 3: Local User' : 'State 2: Consumer';
      addLog(`⚫ Provider mode disabled → ${newState}`);
        setAccepting(false);
        ProviderService.stop();
        addLog('🔴 Stopped accepting jobs (no longer available)');
      }
    } finally {
      setProviderToggleLoading(false);
    }
  };

  // Sync accepting state with provider mode when component mounts or provider mode changes
  useEffect(() => {
    if (providerModeEnabled && modelLoaded && !accepting) {
      setAccepting(true);
      ProviderService.start();
      // Relay registration is handled by App.tsx
      addLog('🟢 Now accepting jobs (available as provider)');
    } else if (!providerModeEnabled && accepting) {
      setAccepting(false);
      ProviderService.stop();
      // Relay registration is handled by App.tsx
      addLog('🔴 Stopped accepting jobs (no longer available)');
    }
  }, [providerModeEnabled, modelLoaded]);

  const toggleAccepting = async (val: boolean) => {
    setAcceptingToggleLoading(true);
    try {
      // Use toggleProviderMode to handle model loading/unloading
      await toggleProviderMode(val);
      setAccepting(val);
    } finally {
      setAcceptingToggleLoading(false);
    }
  };

  // ── Stop generation ────────────────────────────────────────────────────────
  const handleStop = async () => {
    if (!isGenerating) return;

    try {
      if (useLocalModel) {
        await llamaEngine.stop();
        addLog('🛑 Generation stopped by user');
      } else {
        // Send cancel to remote provider
        if (selectedProvider && currentRequestId) {
          relayClient.sendCancelRequest(selectedProvider.peerId, currentRequestId);
          addLog('🛑 Cancel request sent to provider');
        }
      }

      // Clear state
      setGenerating(false);
      setCurrentRequestId(null);
      setLiveMetrics(null);

      // Finalize the current message with proper metadata
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.streaming) {
        // Count tokens in partial response if any
        const tokenCount = lastMsg.content ? lastMsg.content.split(/\s+/).length : 0;
        const providerName = useLocalModel ? 'Local' : (selectedProvider?.displayName || 'Cancelled');
        finaliseMessage(lastMsg.id, tokenCount, 0, providerName);
      }
    } catch (error: any) {
      addLog(`❌ Error stopping: ${error.message}`);
    }
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isGenerating) return;

    if (useLocalModel) {
      // Use local model for inference
      if (!modelLoaded) {
        addLog('❌ Model not loaded yet');
        return;
      }

      setInput('');
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      const assistantId = uuidv4();
      addMessage({
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      });

      setGenerating(true);
      setCurrentRequestId(assistantId);

      const startTime = Date.now();
      let tokensGenerated = 0;
      let thinkingShown = false;
      let thinkingInterval: NodeJS.Timeout | null = null;

      // Start live metrics
      setLiveMetrics({ tokensGenerated: 0, tokensPerSecond: 0, elapsedMs: 0 });

      // Terminal-style thinking messages with green aesthetics
      const thinkingMessages = [
        '> initializing neural pathways...',
        '> loading context vectors...',
        '> analyzing query parameters...',
        '> processing semantic patterns...',
        '> generating response tokens...',
        '> optimizing output stream...',
      ];
      let thinkingIndex = 0;

      // Show thinking indicator after 1 second if no tokens received
      const thinkingTimeout = setTimeout(() => {
        if (tokensGenerated === 0) {
          thinkingShown = true;
          // Set initial thinking message
          const currentMessages = useAppStore.getState().messages;
          setMessages(
            currentMessages.map((m) =>
              m.id === assistantId
                ? { ...m, content: thinkingMessages[0], isThinking: true }
                : m
            )
          );

          // Cycle through thinking messages every 1.5 seconds
          thinkingInterval = setInterval(() => {
            thinkingIndex = (thinkingIndex + 1) % thinkingMessages.length;
            const currentMessages = useAppStore.getState().messages;
            setMessages(
              currentMessages.map((m) =>
                m.id === assistantId && m.isThinking
                  ? { ...m, content: thinkingMessages[thinkingIndex] }
                  : m
              )
            );
          }, 1500);
        }
      }, 1000);

      try {
        console.log(`[ChatScreen] 🎯 Starting local inference for message ${assistantId}`);
        const result = await llamaEngine.complete(prompt, (token) => {
          tokensGenerated++;

          // Clear thinking timeout and interval once tokens start coming
          if (tokensGenerated === 1) {
            clearTimeout(thinkingTimeout);
            if (thinkingInterval) {
              clearInterval(thinkingInterval);
              thinkingInterval = null;
            }
            // Clear thinking state and replace with actual content
            if (thinkingShown) {
              const currentMessages = useAppStore.getState().messages;
              setMessages(
                currentMessages.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: '', isThinking: false }
                    : m
                )
              );
            }
          }

          // Log first few tokens
          if (tokensGenerated <= 5) {
            console.log(`[ChatScreen] 📥 Received token ${tokensGenerated}: "${token}"`);
          }

          // Append token to message
          try {
            appendStreamToken(assistantId, token);
          } catch (e) {
            console.error(`[ChatScreen] ❌ Error appending token:`, e);
          }

          // Update live metrics every 5 tokens
          if (tokensGenerated % 5 === 0) {
            const elapsedMs = Date.now() - startTime;
            const tokensPerSecond = elapsedMs > 0 ? (tokensGenerated / elapsedMs) * 1000 : 0;
            setLiveMetrics({ tokensGenerated, tokensPerSecond, elapsedMs });
          }

          // Log progress every 50 tokens
          if (tokensGenerated % 50 === 0) {
            console.log(`[ChatScreen] 📊 Progress: ${tokensGenerated} tokens appended to UI`);
          }
        });

        console.log(`[ChatScreen] ✅ Completion finished - ${result.tokensGenerated} tokens in ${result.durationMs}ms`);

        const durationMs = Date.now() - startTime;
        const deviceName = userProfile?.displayName || 'Local Device';
        finaliseMessage(assistantId, result.tokensGenerated, result.durationMs, deviceName);

        // Clear metrics after delay
        setTimeout(() => setLiveMetrics(null), 2000);
      } catch (error: any) {
        appendStreamToken(assistantId, `\n\nError: ${error.message}`);
        const deviceName = userProfile?.displayName || 'Local Device';
        finaliseMessage(assistantId, 0, 0, deviceName);
        setLiveMetrics(null);
      } finally {
        // Cleanup thinking interval if still running
        clearTimeout(thinkingTimeout);
        if (thinkingInterval) {
          clearInterval(thinkingInterval);
        }
      }
    } else {
      // Use remote provider for inference
      if (!selectedProvider) {
        addLog('❌ No provider selected');
        return;
      }

      setInput('');
      const userMsg: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      };
      addMessage(userMsg);

      // Send request with full conversation history for failover support
      const requestId = relayClient.sendInferenceRequest(
        selectedProvider.peerId,
        prompt,
        messages // Pass full conversation history
      );
      addMessage({
        id: requestId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        streaming: true,
      });

      setGenerating(true);
      setCurrentRequestId(requestId);

      // Terminal-style thinking indicator for remote inference
      const thinkingMessages = [
        '> establishing connection...',
        '> sending request to provider...',
        '> waiting for response...',
        '> processing on remote device...',
        '> receiving tokens...',
        '> streaming response...',
      ];
      let thinkingIndex = 0;
      let thinkingShown = false;
      let thinkingInterval: NodeJS.Timeout | null = null;

      // Show thinking indicator after 1 second if no tokens received
      const thinkingTimeout = setTimeout(() => {
        thinkingShown = true;
        const currentMessages = useAppStore.getState().messages;
        setMessages(
          currentMessages.map((m) =>
            m.id === requestId
              ? { ...m, content: thinkingMessages[0], isThinking: true }
              : m
          )
        );

        // Cycle through thinking messages every 1.5 seconds
        thinkingInterval = setInterval(() => {
          thinkingIndex = (thinkingIndex + 1) % thinkingMessages.length;
          const currentMessages = useAppStore.getState().messages;
          setMessages(
            currentMessages.map((m) =>
              m.id === requestId && m.isThinking
                ? { ...m, content: thinkingMessages[thinkingIndex] }
                : m
            )
          );
        }, 1500);
      }, 1000);

      // Store cleanup function for when first token arrives
      const cleanup = () => {
        clearTimeout(thinkingTimeout);
        if (thinkingInterval) {
          clearInterval(thinkingInterval);
        }
        if (thinkingShown) {
          const currentMessages = useAppStore.getState().messages;
          setMessages(
            currentMessages.map((m) =>
              m.id === requestId
                ? { ...m, content: '', isThinking: false }
                : m
            )
          );
        }
      };

      // Store cleanup function so relay callback can access it
      remoteThinkingCleanupRef.current.set(requestId, cleanup);
    }
  };

  // ── Render provider info panel ──────────────────────────────────────────
  const panelHeight = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 280],
  });

  const renderProviderPanel = () => (
    <Animated.View style={[styles.providerPanel, { height: panelHeight, overflow: 'hidden' }]}>
      <View style={styles.providerContent}>
        <View style={styles.providerRow}>
          <Text style={styles.providerLabel}>Accept Jobs</Text>
          {acceptingToggleLoading ? (
            <ActivityIndicator size="small" color={colors.accent.primary} />
          ) : (
            <Switch
              value={accepting}
              onValueChange={toggleAccepting}
              trackColor={{ false: colors.input.border, true: colors.accent.primary }}
              thumbColor={accepting ? colors.button.primaryText : colors.text.tertiary}
              disabled={!modelLoaded}
            />
          )}
        </View>

        <View style={styles.providerRow}>
          <Text style={styles.providerLabel}>model</Text>
          <Text style={styles.providerValue}>{modelLoaded ? 'loaded' : 'not loaded'}</Text>
        </View>

        {activeJob && (
          <View style={styles.activeJobCard}>
            <Text style={styles.activeJobTitle}>Active Job</Text>
            <Text style={styles.activeJobText}>
              From: {activeJob.fromPeerId.slice(0, 8)}...
            </Text>
            <Text style={styles.activeJobText}>
              {activeJob.tokensEmitted} tokens @ {activeJob.tokensPerSecond.toFixed(1)} tok/s
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );

  // ── Render message ──────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    // Ensure content is always a string
    let displayContent = String(item.content || '');

    if (!isUser) {
      // Strip <think> tags completely - don't show thinking to users
      // Handle both complete blocks: "<think>...</think>Response"
      // And incomplete/unclosed tags: "<think>...Response" (model may not close the tag)

      // First, remove all complete thinking blocks with closing tags
      displayContent = displayContent.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();

      // Then, handle unclosed <think> tags - remove everything from <think> onward
      const thinkStart = displayContent.indexOf('<think>');
      if (thinkStart !== -1) {
        // Find where actual response starts after thinking
        // Look for common patterns: blank line, new paragraph, capitalized sentence
        const afterThink = displayContent.substring(thinkStart + 7); // Skip '<think>'

        // Try to find where thinking ends and response begins
        // Look for patterns like "\n\n" (blank line) or "\n#" (markdown header)
        const responseStart = afterThink.search(/\n\n[A-Z]|^[A-Z]/);

        if (responseStart !== -1) {
          // Found potential response text after thinking
          displayContent = afterThink.substring(responseStart).trim();
        } else {
          // No clear response found after <think>, keep text before <think>
          displayContent = displayContent.substring(0, thinkStart).trim();
        }
      }
    }

    // Return empty view if nothing to display (NOT null - React Native requires valid elements)
    if (!displayContent) {
      return <View key={String(item.id)} />;
    }

    // Safely build metadata text
    let metadataText = '';
    if (!item.streaming && item.tokensGenerated && item.tokensGenerated > 0) {
      const tokens = item.tokensGenerated || 0;
      const duration = item.durationMs || 0;
      const speed = duration > 0 ? (tokens / (duration / 1000)).toFixed(1) : '0';
      const provider = item.fulfilledBy ? String(item.fulfilledBy) : '';

      metadataText = `${tokens} tokens · ${duration}ms · ${speed} t/s`;
      if (provider && provider.length > 0) {
        metadataText += ` · ${provider}`;
      }
    }

    return (
      <View key={String(item.id)}>
        {/* Thinking indicator - terminal aesthetics */}
        {item.isThinking ? (
          <View style={styles.thinkingContainer}>
            <View style={styles.thinkingPrompt}>
              <Text style={styles.thinkingPromptText}>$</Text>
            </View>
            <Text style={styles.thinkingText}>{displayContent}</Text>
          </View>
        ) : (
          /* Message bubble - thinking content is stripped, only show actual response */
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            <Text style={styles.messageText}>{displayContent}</Text>
            {item.streaming && <ActivityIndicator size="small" color={colors.accent.primary} style={styles.cursor} />}
            {metadataText.length > 0 && (
              <Text style={styles.metaText}>{metadataText}</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        enabled={keyboardVisible}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setShowSidebar(true)} style={styles.headerButton}>
            <Icon name="menu" size={20} color={colors.text.primary} />
          </TouchableOpacity>

          {/* Right-aligned header controls */}
          <View style={styles.headerRight}>
            <View style={styles.localToggleContainer}>
              <Text style={styles.toggleLabel}>local</Text>
              {localToggleLoading ? (
                <ActivityIndicator size="small" color={colors.accent.primary} style={styles.localToggleSwitch} />
              ) : (
                <Switch
                  value={useLocalModel}
                  onValueChange={toggleLocalMode}
                  trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                  thumbColor={useLocalModel ? colors.button.secondaryText : colors.text.tertiary}
                  disabled={providerModeEnabled}
                  style={styles.localToggleSwitch}
                />
              )}
            </View>

            <View style={styles.nodeChipContainer}>
              <TouchableOpacity
                onPress={() => setShowNodeInfo(true)}
                style={styles.nodeChip}
                activeOpacity={0.7}
              >
                <View style={[styles.nodeDot, (connected && providerModeEnabled) ? styles.nodeDotGreen : styles.nodeDotRed]} />
                <Text style={styles.nodeChipText}>node</Text>
                <Icon name="terminal" size={12} color={colors.text.primary} />
              </TouchableOpacity>
              {providerToggleLoading ? (
                <ActivityIndicator size="small" color={colors.accent.primary} style={styles.nodeToggle} />
              ) : (
                <Switch
                  value={providerModeEnabled}
                  onValueChange={toggleProviderMode}
                  trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                  thumbColor={providerModeEnabled ? colors.button.secondaryText : colors.text.tertiary}
                  disabled={!modelDownloaded}
                  style={styles.nodeToggle}
                />
              )}
            </View>

            <TouchableOpacity
              onPress={() => setShowLogs(true)}
              style={styles.logsChip}
              activeOpacity={0.7}
            >
              <Text style={styles.logsChipText}>logs</Text>
              <Icon name="file-text" size={12} color={colors.text.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onOpenProfile}
              style={styles.settingsChip}
              activeOpacity={0.7}
            >
              <Icon name="settings" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
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
          onClose={() => setShowLogs(false)}
          logs={logs}
          onClear={clearLogs}
        />

        {/* Provider panel */}
        {providerModeEnabled && renderProviderPanel()}

        {/* Connection status */}
        <View style={styles.statusBar}>
          <View style={[styles.statusDot, { backgroundColor: connected ? colors.status.success : colors.status.error }]} />
          <Text style={styles.statusText}>
            {connected ? 'connected' : 'connecting...'}
          </Text>
          <Text style={styles.statusText}>•</Text>
          {!useLocalModel && providers.length > 0 ? (
            <TouchableOpacity onPress={() => {
              console.log('[ChatScreen] Opening node info popup');
              setShowNodeInfo(true);
            }} style={styles.providersButton}>
              <Text style={styles.statusTextLink}>
                {`${providers.length} provider${providers.length !== 1 ? 's' : ''}`}
              </Text>
              <Icon name="chevron-right" size={14} color={colors.accent.primary} />
            </TouchableOpacity>
          ) : (
            <Text style={styles.statusText}>
              {useLocalModel ? (modelLoaded ? 'local model' : 'loading model...') : 'no providers'}
            </Text>
          )}
        </View>


        {/* Live Metrics Bar */}
        {liveMetrics && useLocalModel && (
          <View style={styles.metricsBar}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>tokens</Text>
              <Text style={styles.metricValue}>{liveMetrics.tokensGenerated}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>speed</Text>
              <Text style={styles.metricValue}>
                {liveMetrics.tokensPerSecond.toFixed(1)} t/s
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>time</Text>
              <Text style={styles.metricValue}>
                {(liveMetrics.elapsedMs / 1000).toFixed(1)}s
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>model</Text>
              <Text style={[styles.metricValue, styles.metricValueSmall]}>qwen3.5</Text>
            </View>
          </View>
        )}

        {/* Chat messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item, index) => item?.id ? String(item.id) : `msg-${index}`}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              {useLocalModel && !modelDownloaded ? (
                <>
                  <Text style={styles.emptyText}>model not downloaded.</Text>
                  {onOpenProfile && (
                    <TouchableOpacity style={styles.downloadButton} onPress={onOpenProfile}>
                      <Text style={styles.downloadButtonText}>download model</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : !modelLoaded && useLocalModel ? (
                <Text style={styles.emptyText}>loading model...\nplease wait.</Text>
              ) : !useLocalModel && providers.length === 0 ? (
                <Text style={styles.emptyText}>no providers online.\nswitch to local to use your own model.</Text>
              ) : (
                <>
                  <Text style={styles.emptyStateTitle}>ask me anything</Text>
                  <View style={styles.suggestionGrid}>
                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('write a creative story about ')}
                    >
                      <Icon name="edit" size={20} color={colors.accent.primary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>help me write</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('summarize this text: ')}
                    >
                      <Icon name="file-text" size={20} color={colors.accent.secondary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>summarize text</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('explain how ')}
                    >
                      <Icon name="help-circle" size={20} color={colors.accent.primary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>explain a topic</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('analyze and provide insights on ')}
                    >
                      <Icon name="trending-up" size={20} color={colors.accent.secondary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>analyze data</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          }
        />

        {/* Disclaimer */}
        <View style={styles.disclaimerContainer}>
          <Icon name="alert-circle" size={14} color={colors.text.tertiary} />
          <Text style={styles.disclaimerText}>
            {useLocalModel
              ? 'as the model is running locally, information can be inaccurate or contain mistakes'
              : 'information can be inaccurate or contain mistakes · end-to-end encrypted'}
          </Text>
        </View>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              useLocalModel
                ? modelLoaded
                  ? 'ask me anything (using local model)...'
                  : 'loading model...'
                : providers.length > 0
                ? `ask me anything (using remote provider)...`
                : 'no providers online...'
            }
            placeholderTextColor={colors.input.placeholder}
            multiline
            maxLength={2000}
            editable={!isGenerating && ((useLocalModel && modelLoaded) || (!useLocalModel && !!selectedProvider))}
          />
          {isGenerating ? (
            <TouchableOpacity
              style={[styles.sendButton, styles.stopButton]}
              onPress={handleStop}
            >
              <Text style={styles.sendButtonText}>■</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!input.trim() || (useLocalModel && !modelLoaded) || (!useLocalModel && !selectedProvider)) && styles.sendButtonDisabled
              ]}
              onPress={handleSend}
              disabled={!input.trim() || (useLocalModel && !modelLoaded) || (!useLocalModel && !selectedProvider)}
            >
              <Icon name="send" size={18} color={colors.button.primaryText} />
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>


      {/* Sidebar */}
      <Sidebar
        visible={showSidebar}
        onClose={() => setShowSidebar(false)}
        onHome={onBack}
        chatHistory={chatHistory}
        onSelectChat={async (chatId) => {
          await loadChat(chatId);
          setShowSidebar(false);
        }}
        currentChatId={currentChatId || undefined}
        onNewChat={async () => {
          await startNewChat();
        }}
      />

      {/* Floating Download Button */}
      <FloatingDownloadButton
        visible={showFloatingDownload}
        mode={floatingDownloadMode}
        onDownload={() => {
          setShowFloatingDownload(false);
          onOpenProfile?.(floatingDownloadMode === 'provider' ? 'llm' : 'vision');
        }}
        onDismiss={() => setShowFloatingDownload(false)}
      />

      {/* Toast Notifications */}
      <Toast
        config={{
          info: ({ text1, text2 }) => (
            <CustomToast text1={text1} text2={text2} type="info" />
          ),
          error: ({ text1, text2 }) => (
            <CustomToast text1={text1} text2={text2} type="error" />
          ),
          success: ({ text1, text2 }) => (
            <CustomToast text1={text1} text2={text2} type="success" />
          ),
          warning: ({ text1, text2 }) => (
            <CustomToast text1={text1} text2={text2} type="warning" />
          ),
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingTop: Platform.OS === 'android' ? 48 : 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
    backgroundColor: colors.background.primary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerButtonText: {
    fontSize: 24,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  localToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 2,
    borderRadius: 6,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    height: 36,
  },
  localToggleSwitch: {
    transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }],
    marginHorizontal: -4,
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  nodeChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 2,
    borderRadius: 6,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    height: 36,
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  nodeToggle: {
    transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }],
    marginHorizontal: -6,
  },
  nodeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  nodeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  nodeDotGreen: {
    backgroundColor: colors.status.success,
  },
  nodeDotRed: {
    backgroundColor: colors.status.error,
  },
  logsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    height: 36,
  },
  logsChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  settingsChip: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: colors.terminal.background,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  toggleContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleWithExpand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandButton: {
    padding: 8,
  },
  expandButtonText: {
    fontSize: 18,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  providerPanel: {
    backgroundColor: colors.background.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  providerContent: {
    padding: 16,
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  providerLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    fontFamily: fonts.regular,
  },
  providerValue: {
    fontSize: 14,
    color: colors.text.primary,
    fontFamily: fonts.regular,
  },
  activeJobCard: {
    backgroundColor: colors.background.tertiary,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  activeJobTitle: {
    fontSize: 12,
    color: colors.accent.primary,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  activeJobText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontFamily: fonts.regular,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.terminal.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontFamily: fonts.regular,
  },
  providersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusTextLink: {
    fontSize: 12,
    color: colors.accent.primary,
    fontWeight: '600',
    fontFamily: fonts.regular,
  },
  queueBar: {
    backgroundColor: colors.background.secondary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  queueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  queueTextContainer: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 13,
    color: colors.text.primary,
    marginBottom: 2,
    fontFamily: fonts.regular,
  },
  queuePosition: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  queueProgressContainer: {
    width: '100%',
  },
  queueProgressBar: {
    height: 4,
    backgroundColor: colors.background.tertiary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  queueProgressFill: {
    height: '100%',
    backgroundColor: colors.status.info,
    borderRadius: 2,
  },
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent.primary,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.secondary,
  },
  messageText: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  cursor: {
    marginTop: 4,
  },
  metaText: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 6,
    fontFamily: fonts.regular,
  },
  metricsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.background.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent.primary,
    fontFamily: fonts.regular,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  metricValueSmall: {
    fontSize: 12,
  },
  // Terminal-style thinking indicator
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    // borderRadius: 8,
    // borderWidth: 1,
    // borderColor: colors.terminal.greenDim,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    marginHorizontal: 16,
    maxWidth: '85%',
    alignSelf: 'flex-start',
  },
  thinkingPrompt: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: colors.terminal.green,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  thinkingPromptText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.terminal.background,
  },
  thinkingText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.terminal.green,
    letterSpacing: 0.3,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginBottom: 16,
    fontFamily: fonts.regular,
  },
  downloadButton: {
    backgroundColor: colors.button.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.button.primaryText,
    fontFamily: fonts.regular,
  },
  emptyStateTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 32,
    fontFamily: fonts.regular,
  },
  suggestionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 150,
  },
  suggestionIcon: {
    opacity: 0.9,
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
    fontFamily: fonts.regular,
  },
  disclaimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: colors.background.secondary,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
    gap: 8,
    backgroundColor: colors.background.primary,
  },
  input: {
    flex: 1,
    backgroundColor: colors.input.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text.primary,
    maxHeight: 100,
    fontFamily: fonts.regular,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.button.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.button.disabled,
  },
  stopButton: {
    backgroundColor: colors.status.error,
  },
  sendButtonText: {
    fontSize: 20,
    color: colors.button.primaryText,
    fontFamily: fonts.regular,
  },
});
