import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch, Animated,
} from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import Icon from 'react-native-vector-icons/Feather';
import { useAppStore } from '../store/appStore';
import { relayClient } from '../network/RelayClient';
import { ChatMessage, ProviderInfo, InferenceRequestMessage } from '../network/PeerProtocol';
import { llamaEngine } from '../inference/LlamaEngine';
import { colors } from '../theme/colors';
import ProviderService from '../services/ProviderService';
import { ProviderNodesPopup } from '../components/ProviderNodesPopup';
import { NodeInfoPopup } from '../components/NodeInfoPopup';
import { Sidebar } from '../components/Sidebar';

interface Props {
  onBack: () => void;
  onOpenMenu: () => void;
  onOpenProfile?: () => void;
}

export default function ChatScreen({ onBack, onOpenMenu, onOpenProfile }: Props) {
  const [input, setInput] = useState('');
  const [useLocalModel, setUseLocalModel] = useState(true); // Use local model by default
  const [accepting, setAccepting] = useState(false);
  const [providerExpanded, setProviderExpanded] = useState(false);
  const [activeJob, setActiveJob] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showProviderNodes, setShowProviderNodes] = useState(false);
  const [showNodeInfo, setShowNodeInfo] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
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
    addMessage, appendStreamToken, finaliseMessage,
    setGenerating, setCurrentRequestId,
    modelLoaded, modelPath, modelDownloaded,
    setModelLoaded, setModelLoading,
    userProfile,
    providerModeEnabled,
    setProviderModeEnabled,
    chatHistory,
    currentChatId,
    saveCurrentChat,
    loadChat,
    loadChatHistory,
    startNewChat,
  } = useAppStore();

  // ── Wire up relay callbacks ────────────────────────────────────────────────
  useEffect(() => {
    // User mode callbacks (receiving responses)
    relayClient.onStreamToken = (requestId, token) => {
      appendStreamToken(requestId, token);
    };

    relayClient.onStreamDone = (requestId, tokensGenerated, durationMs) => {
      finaliseMessage(requestId, tokensGenerated, durationMs);
    };

    relayClient.onResponse = (requestId, response, tokensGenerated, durationMs) => {
      const { messages: msgs } = useAppStore.getState();
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
        });
      }
      finaliseMessage(requestId, tokensGenerated, durationMs);
    };

    // Provider mode callbacks (receiving requests)
    relayClient.onInferenceRequest = async (req: InferenceRequestMessage) => {
      if (!accepting) return;

      const job = {
        requestId: req.requestId,
        fromPeerId: req.from,
        prompt: req.prompt,
        startedAt: Date.now(),
        tokensEmitted: 0,
        tokensPerSecond: 0,
      };
      setActiveJob(job);
      addLog(`📥 Request from ${req.from.slice(0, 8)}: "${req.prompt.slice(0, 40)}..."`);

      let tokensEmitted = 0;

      try {
        await llamaEngine.complete(
          req.prompt,
          (token) => {
            tokensEmitted++;
            const elapsedMs = Date.now() - job.startedAt;
            const tokensPerSec = elapsedMs > 0 ? (tokensEmitted / (elapsedMs / 1000)) : 0;

            job.tokensEmitted = tokensEmitted;
            job.tokensPerSecond = tokensPerSec;

            if (tokensEmitted % 5 === 0) {
              setActiveJob({ ...job });
            }

            relayClient.sendStreamToken(req.from, req.requestId, token);
          },
          req.params,
        );

        const durationMs = Date.now() - job.startedAt;
        relayClient.sendStreamDone(req.from, req.requestId, tokensEmitted, durationMs);
        addLog(`✅ Completed ${tokensEmitted} tokens in ${(durationMs / 1000).toFixed(1)}s`);
        setActiveJob(null);
      } catch (error: any) {
        addLog(`❌ Error: ${error.message}`);
        setActiveJob(null);
      }
    };

    // Cancel request callback (provider receives cancel from user)
    relayClient.onCancelRequest = async (requestId) => {
      addLog(`🛑 Cancel request for ${requestId}`);
      await llamaEngine.stop();
      setActiveJob(null);
    };

    return () => {
      relayClient.onStreamToken = null;
      relayClient.onStreamDone = null;
      relayClient.onResponse = null;
      relayClient.onCancelRequest = null;
      relayClient.onInferenceRequest = null;
    };
  }, [accepting]);

  // Auto-select first provider when not using local model
  useEffect(() => {
    if (!useLocalModel && providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0]);
    }
    if (providers.length === 0) {
      setSelectedProvider(null);
    }
  }, [providers, useLocalModel]);

  // Auto-load model on mount if not loaded
  useEffect(() => {
    if (!llamaEngine.isLoaded() && modelPath && !llamaEngine.isLoading()) {
      addLog('⏳ Loading model...');
      setModelLoading(true);
      llamaEngine.loadModel(modelPath).then(() => {
        setModelLoaded(true);
        setModelLoading(false);
        addLog('✅ Model loaded');
      }).catch((error: any) => {
        setModelLoading(false);
        addLog(`❌ Model load failed: ${error.message}`);
      });
    } else if (llamaEngine.isLoaded() && !modelLoaded) {
      // Sync state if engine is loaded but store isn't updated
      setModelLoaded(true);
    }
  }, [modelPath]);


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

  // Save chat when generation completes
  useEffect(() => {
    if (!isGenerating && messages.length > 0) {
      saveCurrentChat();
    }
  }, [isGenerating, messages.length]);

  // Clean up provider service on unmount
  useEffect(() => {
    return () => {
      if (accepting) {
        ProviderService.stop();
      }
    };
  }, [accepting]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const toggleProviderMode = (enabled: boolean) => {
    setProviderModeEnabled(enabled);
    if (enabled) {
      addLog('🟢 Provider mode enabled - will accept jobs from other users');
      // Automatically start accepting if model is loaded
      if (modelLoaded) {
        toggleAccepting(true);
      }
    } else {
      addLog('⚫ Provider mode disabled');
      toggleAccepting(false);
    }
  };

  // Sync accepting state with provider mode when component mounts or provider mode changes
  useEffect(() => {
    if (providerModeEnabled && modelLoaded && !accepting) {
      setAccepting(true);
    } else if (!providerModeEnabled && accepting) {
      setAccepting(false);
    }
  }, [providerModeEnabled, modelLoaded]);

  const toggleAccepting = (val: boolean) => {
    setAccepting(val);

    if (val) {
      // Update registration with acceptingJobs=true (becomes available provider)
      const deviceInfo = {
        platform: Platform.OS,
        modelLoaded: modelLoaded,
        modelName: 'Qwen3.5-0.8B-Q8',
        acceptingJobs: true,
        displayName: userProfile?.displayName || 'Unknown Device',
      };
      relayClient.updateRegistration(deviceInfo);

      ProviderService.start();
      addLog('🟢 Now accepting jobs (available as provider)');
    } else {
      // Update registration with acceptingJobs=false (not available as provider)
      const deviceInfo = {
        platform: Platform.OS,
        modelLoaded: modelLoaded,
        modelName: 'Qwen3.5-0.8B-Q8',
        acceptingJobs: false,
        displayName: userProfile?.displayName || 'Unknown Device',
      };
      relayClient.updateRegistration(deviceInfo);

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

      // Finalize the current message
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && lastMsg.streaming) {
        finaliseMessage(lastMsg.id, 0, 0);
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
        finaliseMessage(assistantId, result.tokensGenerated, result.durationMs);

        // Clear metrics after delay
        setTimeout(() => setLiveMetrics(null), 2000);
      } catch (error: any) {
        appendStreamToken(assistantId, `\n\nError: ${error.message}`);
        finaliseMessage(assistantId, 0, 0);
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

      const requestId = relayClient.sendInferenceRequest(selectedProvider.peerId, prompt);
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

        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>Activity Log</Text>
          {logs.slice(-3).map((log, i) => (
            <Text key={i} style={styles.logText}>{log}</Text>
          ))}
        </View>
      </View>
    </Animated.View>
  );

  // ── Render message ──────────────────────────────────────────────────────
  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    // Extract thinking content
    let thinkingContent = '';
    let displayContent = item.content;

    if (!isUser) {
      // Check if we're still in thinking phase (has <think> but no </think> yet, or no content after </think>)
      const hasOpenThink = displayContent.includes('<think>');
      const hasCloseThink = displayContent.includes('</think>');

      if (hasOpenThink && hasCloseThink) {
        // Complete thinking block found
        const thinkMatch = displayContent.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkMatch) {
          thinkingContent = thinkMatch[1].trim();
        }

        // Remove thinking tags
        displayContent = displayContent.replace(/<think>[\s\S]*?<\/think>\n*/g, '').trim();

        // Only show thinking if there's no actual response yet
        if (displayContent.length === 0 && item.streaming) {
          // Still in thinking phase
        } else {
          // Response has started, clear thinking
          thinkingContent = '';
        }
      } else if (hasOpenThink && !hasCloseThink) {
        // Partial thinking block (still streaming thinking)
        const partial = displayContent.split('<think>')[1];
        if (partial) {
          thinkingContent = partial.trim();
        }
        // Remove partial thinking tag
        displayContent = displayContent.replace(/<think>[\s\S]*/g, '').trim();
      } else {
        // No thinking tags, just clean display
        displayContent = displayContent.trim();
      }
    }

    // Return minimal view if nothing to display
    if (!displayContent && !thinkingContent) {
      return <View style={{ height: 1 }} />;
    }

    return (
      <View>
        {/* Show thinking only while streaming and no actual response yet */}
        {!isUser && thinkingContent && item.streaming && !displayContent && (
          <View style={styles.thinkingInline}>
            <View style={styles.thinkingInlineHeader}>
              <View style={styles.blueDot} />
              <Text style={styles.thinkingLabel}>THINKING</Text>
            </View>
            <Text style={styles.thinkingInlineText} numberOfLines={2} ellipsizeMode="tail">
              {thinkingContent}
            </Text>
          </View>
        )}

        {/* Regular message bubble */}
        {displayContent ? (
          <View
            style={[
              styles.messageBubble,
              isUser ? styles.userMessage : styles.assistantMessage,
            ]}
          >
            <Text style={styles.messageText}>{displayContent}</Text>
            {item.streaming && <ActivityIndicator size="small" color={colors.accent.primary} style={styles.cursor} />}
            {!item.streaming && item.tokensGenerated && item.tokensGenerated > 0 && (
              <Text style={styles.metaText}>
                {`${item.tokensGenerated} tokens · ${item.durationMs || 0}ms · ${item.durationMs ? (item.tokensGenerated / (item.durationMs / 1000)).toFixed(1) : '0'} t/s`}
              </Text>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={() => setShowSidebar(true)} style={styles.headerButton}>
              <Icon name="menu" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <View style={styles.toggleContainer}>
              <View style={styles.toggle}>
                <Text style={styles.toggleLabel}>Local</Text>
                <Switch
                  value={useLocalModel}
                  onValueChange={setUseLocalModel}
                  trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                  thumbColor={useLocalModel ? colors.button.primaryText : colors.text.tertiary}
                />
              </View>
              <View style={styles.toggleWithExpand}>
                <View style={styles.toggle}>
                  <Text style={styles.toggleLabel}>Provider Mode</Text>
                  <Switch
                    value={providerModeEnabled}
                    onValueChange={toggleProviderMode}
                    trackColor={{ false: colors.input.border, true: colors.accent.primary }}
                    thumbColor={providerModeEnabled ? colors.button.primaryText : colors.text.tertiary}
                    disabled={!modelDownloaded}
                  />
                </View>
                {providerModeEnabled && (
                  <TouchableOpacity
                    onPress={() => setProviderExpanded(!providerExpanded)}
                    style={styles.expandButton}
                  >
                    <Icon
                      name={providerExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={colors.text.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setShowNodeInfo(true)} style={styles.nodeChip}>
              <View style={[styles.nodeDot, (connected && providerModeEnabled) ? styles.nodeDotGreen : styles.nodeDotRed]} />
              <Text style={styles.nodeChipText}>Node</Text>
              <Icon name="terminal" size={14} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Node Info Popup */}
        <NodeInfoPopup
          visible={showNodeInfo}
          onClose={() => setShowNodeInfo(false)}
          connected={connected && providerModeEnabled}
          displayName={userProfile?.displayName || 'My Device'}
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
            <TouchableOpacity onPress={() => setShowProviderNodes(true)} style={styles.providersButton}>
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
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {useLocalModel
                  ? modelLoaded
                    ? 'Using local model.\nStart a conversation!'
                    : !modelDownloaded
                    ? 'Model not downloaded.'
                    : 'Loading model...\nPlease wait.'
                  : providers.length === 0
                  ? 'No providers online.\nSwitch to Local to use your own model.'
                  : 'Using remote providers.\nStart a conversation!'}
              </Text>
              {useLocalModel && !modelDownloaded && onOpenProfile && (
                <TouchableOpacity style={styles.downloadButton} onPress={onOpenProfile}>
                  <Text style={styles.downloadButtonText}>Download Model</Text>
                </TouchableOpacity>
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
                  ? 'Message (using local model)...'
                  : 'Loading model...'
                : providers.length > 0
                ? `Message (using remote provider)...`
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
              <Text style={styles.sendButtonText}>↑</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Provider Nodes Popup */}
      <ProviderNodesPopup
        visible={showProviderNodes}
        providers={providers}
        onClose={() => setShowProviderNodes(false)}
        onSelectProvider={(provider) => {
          setSelectedProvider(provider);
          addLog(`✅ Selected provider: ${provider.displayName || provider.peerId}`);
        }}
      />

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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    padding: -10,
  },
  headerButtonText: {
    fontSize: 24,
    color: colors.text.primary,
  },
  nodeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
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
  nodeDotGreen: {
    backgroundColor: colors.status.success,
  },
  nodeDotRed: {
    backgroundColor: colors.status.error,
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
    fontSize: 12,
    color: colors.text.secondary,
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
  logsContainer: {
    marginTop: 12,
  },
  logsTitle: {
    fontSize: 12,
    color: colors.text.tertiary,
    marginBottom: 4,
  },
  logText: {
    fontSize: 11,
    color: colors.text.tertiary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
