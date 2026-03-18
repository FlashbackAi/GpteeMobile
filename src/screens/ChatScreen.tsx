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
import { colors } from '../theme/colors';
import ProviderService from '../services/ProviderService';
import { NodeInfoPopup } from '../components/NodeInfoPopup';
import { LogsPopup } from '../components/LogsPopup';
import { Sidebar } from '../components/Sidebar';
import { CustomToast } from '../components/CustomToast';

interface Props {
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenProfile?: () => void;
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
  const flatListRef = useRef<FlatList>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [liveMetrics, setLiveMetrics] = useState<{
    tokensGenerated: number;
    tokensPerSecond: number;
    elapsedMs: number;
  } | null>(null);

  const {
    connected, providers, selectedProvider, messages,
    isGenerating, setSelectedProvider, currentRequestId,
    assignedProviderId, setAssignedProviderId,
    addMessage, appendStreamToken, finaliseMessage,
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
        text1: 'Provider Switched',
        text2: `Now using ${newProviderName} (${tokensReceived} tokens preserved)`,
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
        text1: 'Inference Failed',
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

  const toggleLocalMode = (enabled: boolean) => {
    // Local Mode can only be toggled when Provider Mode is OFF
    if (providerModeEnabled) return;

    setUseLocalModel(enabled);
    if (enabled) {
      // State 3: Local User (uses own compute, doesn't serve)
      addLog('🔵 Local Mode ON (State 3: Local User - own compute only)');
    } else {
      // State 2: Consumer (requests from providers)
      addLog('🟣 Local Mode OFF (State 2: Consumer - requesting from providers)');
    }
  };

  const toggleProviderMode = async (enabled: boolean) => {
    if (enabled) {
      // Check battery level before enabling
      try {
        const level = await DeviceInfo.getBatteryLevel();
        const batteryPercent = Math.round(level * 100);

        if (batteryPercent < batteryThreshold) {
          Toast.show({
            type: 'error',
            text1: 'Battery Too Low',
            text2: `Please charge above ${batteryThreshold}% to enable provider mode`,
            position: 'top',
            visibilityTime: 4000,
          });
          return; // Don't enable provider mode
        }
      } catch (error) {
        console.error('Error checking battery level:', error);
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
    setAccepting(val);
    // Update provider mode in store - this triggers App.tsx to update relay registration
    await setProviderModeEnabled(val);

    if (val) {
      ProviderService.start();
      addLog('🟢 Now accepting jobs (available as provider)');
    } else {
      ProviderService.stop();
      addLog('🔴 Stopped accepting jobs (no longer available)');
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

      // Start live metrics
      setLiveMetrics({ tokensGenerated: 0, tokensPerSecond: 0, elapsedMs: 0 });

      try {
        const result = await llamaEngine.complete(prompt, (token) => {
          tokensGenerated++;
          appendStreamToken(assistantId, token);

          // Update live metrics every 5 tokens
          if (tokensGenerated % 5 === 0) {
            const elapsedMs = Date.now() - startTime;
            const tokensPerSecond = elapsedMs > 0 ? (tokensGenerated / elapsedMs) * 1000 : 0;
            setLiveMetrics({ tokensGenerated, tokensPerSecond, elapsedMs });
          }
        });

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
          <Switch
            value={accepting}
            onValueChange={toggleAccepting}
            trackColor={{ false: colors.input.border, true: colors.accent.primary }}
            thumbColor={accepting ? colors.button.primaryText : colors.text.tertiary}
            disabled={!modelLoaded}
          />
        </View>

        <View style={styles.providerRow}>
          <Text style={styles.providerLabel}>Model</Text>
          <Text style={styles.providerValue}>{modelLoaded ? 'Loaded' : 'Not loaded'}</Text>
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
        {/* Message bubble - thinking content is stripped, only show actual response */}
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
            <Icon name="menu" size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.localToggleContainer}>
            <Text style={styles.toggleLabel}>Local</Text>
            <Switch
              value={useLocalModel}
              onValueChange={toggleLocalMode}
              trackColor={{ false: colors.input.border, true: colors.accent.primary }}
              thumbColor={useLocalModel ? colors.button.secondaryText : colors.text.tertiary}
              disabled={providerModeEnabled}
              style={styles.localToggleSwitch}
            />
          </View>

          <View style={styles.nodeChipContainer}>
            <TouchableOpacity
              onPress={() => setShowNodeInfo(true)}
              style={styles.nodeChip}
              activeOpacity={0.7}
            >
              <View style={[styles.nodeDot, (connected && providerModeEnabled) ? styles.nodeDotGreen : styles.nodeDotRed]} />
              <Text style={styles.nodeChipText}>Node</Text>
              <Icon name="terminal" size={14} color={colors.text.primary} />
            </TouchableOpacity>
            <Switch
              value={providerModeEnabled}
              onValueChange={toggleProviderMode}
              trackColor={{ false: colors.input.border, true: colors.accent.primary }}
              thumbColor={providerModeEnabled ? colors.button.secondaryText : colors.text.tertiary}
              disabled={!modelDownloaded}
              style={styles.nodeToggle}
            />
          </View>

          <TouchableOpacity
            onPress={() => setShowLogs(true)}
            style={styles.logsChip}
            activeOpacity={0.7}
          >
            <Text style={styles.logsChipText}>Logs</Text>
            <Icon name="file-text" size={14} color={colors.text.primary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={onOpenProfile}
            style={styles.settingsChip}
            activeOpacity={0.7}
          >
            <Icon name="settings" size={18} color={colors.text.primary} />
          </TouchableOpacity>
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
            {connected ? 'Connected' : 'Connecting...'}
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
              {useLocalModel ? (modelLoaded ? 'Local Model' : 'Loading Model...') : 'No providers'}
            </Text>
          )}
        </View>


        {/* Live Metrics Bar */}
        {liveMetrics && useLocalModel && (
          <View style={styles.metricsBar}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Tokens</Text>
              <Text style={styles.metricValue}>{liveMetrics.tokensGenerated}</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Speed</Text>
              <Text style={styles.metricValue}>
                {liveMetrics.tokensPerSecond.toFixed(1)} t/s
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Time</Text>
              <Text style={styles.metricValue}>
                {(liveMetrics.elapsedMs / 1000).toFixed(1)}s
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Model</Text>
              <Text style={[styles.metricValue, styles.metricValueSmall]}>Qwen3.5</Text>
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
                  <Text style={styles.emptyText}>Model not downloaded.</Text>
                  {onOpenProfile && (
                    <TouchableOpacity style={styles.downloadButton} onPress={onOpenProfile}>
                      <Text style={styles.downloadButtonText}>Download Model</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : !modelLoaded && useLocalModel ? (
                <Text style={styles.emptyText}>Loading model...\nPlease wait.</Text>
              ) : !useLocalModel && providers.length === 0 ? (
                <Text style={styles.emptyText}>No providers online.\nSwitch to Local to use your own model.</Text>
              ) : (
                <>
                  <Text style={styles.emptyStateTitle}>Ask me anything</Text>
                  <View style={styles.suggestionGrid}>
                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('Write a creative story about ')}
                    >
                      <Icon name="edit" size={20} color={colors.accent.primary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>Help me write</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('Summarize this text: ')}
                    >
                      <Icon name="file-text" size={20} color={colors.accent.secondary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>Summarize text</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('Explain how ')}
                    >
                      <Icon name="help-circle" size={20} color={colors.accent.primary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>Explain a topic</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.suggestionCard}
                      onPress={() => setInput('Analyze and provide insights on ')}
                    >
                      <Icon name="trending-up" size={20} color={colors.accent.secondary} style={styles.suggestionIcon} />
                      <Text style={styles.suggestionText}>Analyze data</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          }
        />

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={
              useLocalModel
                ? modelLoaded
                  ? 'Ask me anything (using local model)...'
                  : 'Loading model...'
                : providers.length > 0
                ? `Ask me anything (using remote provider)...`
                : 'No providers online...'
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
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'android' ? 48 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 6,
  },
  headerButton: {
    padding: 0,
    marginRight: 2,
  },
  headerButtonText: {
    fontSize: 24,
    color: colors.text.primary,
  },
  localToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  localToggleSwitch: {
    transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }],
  },
  nodeChipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  nodeToggle: {
    transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }],
  },
  nodeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
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
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logsChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  settingsChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.background.card,
    borderWidth: 1,
    borderColor: colors.border,
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
  toggleLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.primary,
  },
  expandButton: {
    padding: 8,
  },
  expandButtonText: {
    fontSize: 18,
    color: colors.text.primary,
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
  },
  providerValue: {
    fontSize: 14,
    color: colors.text.primary,
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
  },
  activeJobText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.background.secondary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    color: colors.text.secondary,
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
  },
  queuePosition: {
    fontSize: 11,
    color: colors.text.tertiary,
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
  },
  cursor: {
    marginTop: 4,
  },
  metaText: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 6,
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
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.accent.primary,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  metricValueSmall: {
    fontSize: 12,
  },
  blueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  thinkingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  thinkingInline: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    marginHorizontal: 16,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  thinkingInlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  thinkingInlineText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontStyle: 'italic',
    lineHeight: 16,
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
  },
  emptyStateTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 32,
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
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
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
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.button.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
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
  },
});
