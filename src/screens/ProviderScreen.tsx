import React, { useEffect, useState } from 'react';
import {
  View, Text, Switch, TouchableOpacity,
  StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useAppStore } from '../store/appStore';
import { relayClient } from '../network/RelayClient';
import { llamaEngine } from '../inference/LlamaEngine';
import { InferenceRequestMessage } from '../network/PeerProtocol';
import { ModelDownloadManager, AVAILABLE_MODELS } from '../services/ModelDownloadManager';
import { HardwareMonitor } from '../utils/HardwareMonitor';
import ProviderService from '../services/ProviderService';

interface Props {
  onBack: () => void;
}

interface ActiveJob {
  requestId: string;
  fromPeerId: string;
  prompt: string;
  startedAt: number;
  tokensEmitted: number;
  tokensPerSecond: number;
}

export default function ProviderScreen({ onBack }: Props) {
  const [accepting, setAccepting] = useState(false);
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [log, setLog] = useState<string[]>([]);

  const {
    modelLoaded, modelLoading, modelLoadProgress, modelError,
    jobsServed, connected,
    modelDownloaded, modelDownloading, modelDownloadProgress, modelPath,
    setModelLoaded, setModelLoading, setModelLoadProgress, setModelError,
    incrementJobsServed,
    setModelDownloaded, setModelDownloading, setModelDownloadProgress,
    setModelFilename, setModelPath,
  } = useAppStore();

  const modelManager = ModelDownloadManager.getInstance();

  const addLog = (msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // ── Check model download status on mount ───────────────────────────────────
  useEffect(() => {
    checkModelDownloaded();
  }, []);

  const checkModelDownloaded = async () => {
    const model = AVAILABLE_MODELS[0];
    const isDownloaded = await modelManager.isModelDownloaded(model.filename);
    setModelDownloaded(isDownloaded);

    if (isDownloaded) {
      setModelFilename(model.filename);
      const path = modelManager.getModelPath(model.filename);
      setModelPath(path);

      // Auto-load if downloaded but not loaded
      if (!modelLoaded && !modelLoading) {
        handleLoadModel();
      }
    }
  };

  const handleDownloadModel = async () => {
    const model = AVAILABLE_MODELS[0];
    addLog(`📥 Downloading ${model.name}...`);

    setModelDownloading(true);
    setModelDownloadProgress(0);

    try {
      await HardwareMonitor.logMemoryUsage('Before Download');

      const path = await modelManager.downloadModel(model, (progress) => {
        setModelDownloadProgress(progress.progress);
        if (progress.progress % 10 === 0) {
          addLog(`Download: ${progress.progress.toFixed(1)}%`);
        }
      });

      setModelDownloaded(true);
      setModelDownloading(false);
      setModelFilename(model.filename);
      setModelPath(path);

      addLog('✅ Download complete — loading model...');
      handleLoadModel();
    } catch (e: any) {
      setModelDownloading(false);
      setModelError(e?.message ?? 'Download failed');
      addLog(`❌ Download failed: ${e?.message}`);
      Alert.alert('Download Failed', e?.message || 'Unknown error');
    }
  };

  const handleLoadModel = async () => {
    if (!modelDownloaded || !modelPath) {
      Alert.alert('Model Not Downloaded', 'Please download the model first.');
      return;
    }

    setModelLoading(true);
    setModelError(null);
    addLog('Loading model into memory...');

    try {
      await HardwareMonitor.logMemoryUsage('Before Model Load');

      await llamaEngine.load(modelPath, (progress) => {
        setModelLoadProgress(progress);
        if (progress % 20 === 0) addLog(`Loading: ${progress}%`);
      });

      setModelLoaded(true);
      setModelLoading(false);

      await HardwareMonitor.logMemoryUsage('After Model Load');
      addLog('✅ Model loaded — ready to accept jobs');
    } catch (e: any) {
      setModelError(e?.message ?? 'Failed to load model');
      setModelLoading(false);
      addLog(`❌ Model load failed: ${e?.message}`);
    }
  };

  // ── Wire up inference handler ──────────────────────────────────────────────
  useEffect(() => {
    relayClient.onInferenceRequest = accepting && modelLoaded
      ? handleInferenceRequest
      : null;

    return () => {
      relayClient.onInferenceRequest = null;
    };
  }, [accepting, modelLoaded]);

  const handleInferenceRequest = async (req: InferenceRequestMessage) => {
    if (activeJob) {
      // Busy — reject
      addLog(`⚠️  Busy — rejecting request from ${req.from.slice(0, 8)}`);
      return;
    }

    addLog(`📥 Job from ${req.from.slice(0, 8)}... — "${req.prompt.slice(0, 40)}"`);

    const job: ActiveJob = {
      requestId: req.requestId,
      fromPeerId: req.from,
      prompt: req.prompt,
      startedAt: Date.now(),
      tokensEmitted: 0,
      tokensPerSecond: 0,
    };
    setActiveJob(job);

    let tokensEmitted = 0;

    try {
      const { tokensGenerated, durationMs } = await llamaEngine.complete(
        req.prompt,
        (token) => {
          tokensEmitted++;
          const elapsedMs = Date.now() - job.startedAt;
          const tokensPerSec = elapsedMs > 0 ? (tokensEmitted / (elapsedMs / 1000)) : 0;

          job.tokensEmitted = tokensEmitted;
          job.tokensPerSecond = tokensPerSec;

          // Update UI every 5 tokens to avoid excessive re-renders
          if (tokensEmitted % 5 === 0) {
            setActiveJob({ ...job });
          }

          // Stream each token back to user
          relayClient.sendStreamToken(req.from, req.requestId, token);
        },
        req.params,
      );

      // Signal completion
      relayClient.sendStreamDone(req.from, req.requestId, tokensGenerated, durationMs);

      incrementJobsServed();
      addLog(`✅ Done — ${tokensGenerated} tokens, ${durationMs}ms (${Math.round(tokensGenerated / (durationMs / 1000))} tok/s)`);
    } catch (e: any) {
      addLog(`❌ Inference error: ${e?.message}`);
    } finally {
      setActiveJob(null);
    }
  };

  // ── Toggle accepting ───────────────────────────────────────────────────────
  const toggleAccepting = (val: boolean) => {
    setAccepting(val);

    if (val) {
      // Start foreground service to keep running in background
      ProviderService.start();
      addLog('🟢 Now accepting jobs (background service started)');
    } else {
      // Stop foreground service
      ProviderService.stop();
      addLog('🔴 Stopped accepting jobs (background service stopped)');
    }
  };

  // ── Clean up service on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (accepting) {
        ProviderService.stop();
      }
    };
  }, [accepting]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Provider Mode</Text>
          <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Model Status Card */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>MODEL STATUS</Text>
            {modelDownloading ? (
              <View>
                <View style={styles.row}>
                  <ActivityIndicator size="small" color={C.cyan} />
                  <Text style={styles.statusText}>
                    Downloading... {modelDownloadProgress.toFixed(1)}%
                  </Text>
                </View>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${modelDownloadProgress}%` }]} />
                </View>
              </View>
            ) : modelLoading ? (
              <View style={styles.row}>
                <ActivityIndicator size="small" color={C.cyan} />
                <Text style={styles.statusText}>
                  Loading... {modelLoadProgress}%
                </Text>
              </View>
            ) : modelLoaded ? (
              <View style={styles.row}>
                <Text style={styles.statusDot}>🟢</Text>
                <Text style={styles.statusText}>Qwen 3.5 0.8B · Ready</Text>
              </View>
            ) : !modelDownloaded ? (
              <View>
                <Text style={styles.errorText}>Model not downloaded</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleDownloadModel}>
                  <Text style={styles.retryText}>Download Model (~856 MB)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.errorText}>{modelError ?? 'Not loaded'}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleLoadModel}>
                  <Text style={styles.retryText}>Load Model</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Accept Jobs Toggle */}
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.flex1}>
                <Text style={styles.cardLabel}>ACCEPT JOBS</Text>
                <Text style={styles.cardSub}>
                  {accepting
                    ? 'You are online — fulfilling requests'
                    : 'Toggle on to start earning'}
                </Text>
              </View>
              <Switch
                value={accepting}
                onValueChange={toggleAccepting}
                disabled={!modelLoaded || !connected}
                trackColor={{ false: C.border, true: C.cyan + '60' }}
                thumbColor={accepting ? C.cyan : C.sub}
              />
            </View>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{jobsServed}</Text>
              <Text style={styles.statLabel}>Jobs served</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {activeJob ? activeJob.tokensEmitted : '—'}
              </Text>
              <Text style={styles.statLabel}>
                {activeJob ? 'Tokens emitted' : 'Idle'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, styles.statValueCyan]}>
                {activeJob ? activeJob.tokensPerSecond.toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>
                {activeJob ? 'tok/s' : '$GPTEE earned'}
              </Text>
            </View>
          </View>

          {/* Active Job */}
          {activeJob && (
            <View style={[styles.card, styles.cardActive]}>
              <Text style={styles.cardLabel}>ACTIVE JOB</Text>
              <Text style={styles.promptText} numberOfLines={3}>
                "{activeJob.prompt}"
              </Text>
              <View style={styles.row}>
                <ActivityIndicator size="small" color={C.cyan} />
                <Text style={styles.tokenText}>
                  {activeJob.tokensEmitted} tokens @ {activeJob.tokensPerSecond.toFixed(1)} tok/s
                </Text>
              </View>
            </View>
          )}

          {/* Log */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>ACTIVITY LOG</Text>
            {log.length === 0 ? (
              <Text style={styles.logEmpty}>No activity yet</Text>
            ) : (
              log.map((line, i) => (
                <Text key={i} style={styles.logLine} numberOfLines={2}>
                  {line}
                </Text>
              ))
            )}
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const C = {
  bg: '#070810', surface: '#0D0F1C', card: '#111527',
  border: '#1E2340', cyan: '#00D9FF', amber: '#F59E0B',
  green: '#10B981', red: '#F43F5E',
  text: '#E2E8F0', sub: '#64748B',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  container: { flex: 1 },
  scroll: { flex: 1, paddingHorizontal: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 12,
  },
  backBtn: { paddingRight: 8 },
  backText: { color: C.cyan, fontSize: 14 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotGreen: { backgroundColor: C.green },
  dotRed: { backgroundColor: C.red },

  card: {
    backgroundColor: C.card, borderRadius: 12,
    padding: 16, marginTop: 12,
    borderWidth: 1, borderColor: C.border,
  },
  cardActive: { borderColor: C.cyan + '60' },
  cardLabel: {
    fontSize: 10, fontWeight: '700', color: C.sub,
    letterSpacing: 2, marginBottom: 10,
  },
  cardSub: { fontSize: 13, color: C.sub, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex1: { flex: 1 },

  statusText: { fontSize: 14, color: C.text },
  statusDot: { fontSize: 14 },
  errorText: { fontSize: 13, color: C.red, marginBottom: 8 },
  retryBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: C.cyan + '20', borderRadius: 8,
    borderWidth: 1, borderColor: C.cyan + '50',
  },
  retryText: { fontSize: 12, color: C.cyan, fontWeight: '600' },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  statCard: {
    flex: 1, backgroundColor: C.card, borderRadius: 12,
    padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  statValue: { fontSize: 24, fontWeight: '700', color: C.text },
  statValueCyan: { color: C.cyan },
  statLabel: { fontSize: 11, color: C.sub, marginTop: 4 },

  promptText: { fontSize: 13, color: C.text, lineHeight: 20, marginBottom: 10 },
  tokenText: { fontSize: 13, color: C.cyan },

  logEmpty: { fontSize: 12, color: C.sub },
  logLine: {
    fontSize: 11, color: C.sub, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 3, lineHeight: 16,
  },

  progressBar: {
    height: 8,
    backgroundColor: C.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.cyan,
  },
});

const { Platform } = require('react-native');