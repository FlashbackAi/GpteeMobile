import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DeviceInfo from 'react-native-device-info';
import { useAppStore } from '../store/appStore';
import { HardwareMonitor, SystemInfo, MemoryInfo } from '../utils/HardwareMonitor';
import {
  ModelDownloadManager,
  AVAILABLE_MODELS,
} from '../services/ModelDownloadManager';
import { colors } from '../theme/colors';

export const ProfileScreen: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const {
    modelDownloaded,
    modelDownloading,
    modelDownloadProgress,
    modelFilename,
    setModelDownloaded,
    setModelDownloading,
    setModelDownloadProgress,
    setModelFilename,
    setModelPath,
    batteryThreshold,
    setBatteryThreshold,
    loadBatteryThreshold,
  } = useAppStore();

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [modelSize, setModelSize] = useState<number>(0);
  const [batteryLevel, setBatteryLevel] = useState<number>(0);

  const modelManager = ModelDownloadManager.getInstance();

  useEffect(() => {
    loadSystemInfo();
    loadDownloadedModels();
    loadBatteryInfo();
    loadBatteryThreshold(); // Load saved threshold

    // Refresh memory info every 3 seconds
    const memInterval = setInterval(async () => {
      const mem = await HardwareMonitor.getMemoryInfo();
      setMemoryInfo(mem);
    }, 3000);

    // Refresh battery info every 10 seconds
    const batteryInterval = setInterval(() => {
      loadBatteryInfo();
    }, 10000);

    return () => {
      clearInterval(memInterval);
      clearInterval(batteryInterval);
    };
  }, []);

  const loadSystemInfo = async () => {
    const info = await HardwareMonitor.getSystemInfo();
    const mem = await HardwareMonitor.getMemoryInfo();
    const freeSpace = await modelManager.getAvailableSpace();
    setSystemInfo({ ...info, availableStorage: freeSpace });
    setMemoryInfo(mem);
  };

  const loadDownloadedModels = async () => {
    const models = await modelManager.listDownloadedModels();
    setDownloadedModels(models);

    // Check if the default model is downloaded
    const defaultModel = AVAILABLE_MODELS[0];
    const isDownloaded = await modelManager.isModelDownloaded(defaultModel);
    setModelDownloaded(isDownloaded);
    if (isDownloaded) {
      const filename = modelManager.getModelFilename(defaultModel);
      setModelFilename(filename);
      setModelPath(modelManager.getModelPath(defaultModel));
      // Get actual file size
      const size = await modelManager.getDownloadedModelSize(defaultModel);
      setModelSize(size);
    } else {
      setModelSize(0);
    }
  };

  const loadBatteryInfo = async () => {
    try {
      const level = await DeviceInfo.getBatteryLevel();
      setBatteryLevel(Math.round(level * 100));
    } catch (error) {
      console.error('Error getting battery level:', error);
    }
  };

  const handleBatteryThresholdChange = (value: number) => {
    setBatteryThreshold(value); // This saves to AsyncStorage via store action
  };

  const handleDownloadModel = async () => {
    const model = AVAILABLE_MODELS[0];

    // Check if already downloaded
    if (modelDownloaded) {
      Alert.alert('Already Downloaded', 'Model is already on your device.');
      return;
    }

    // Check available space - require at least 1GB free
    const freeSpace = await modelManager.getAvailableSpace();
    const requiredSpace = 1000000000; // 1GB minimum
    if (freeSpace < requiredSpace) {
      Alert.alert(
        'Insufficient Storage',
        `Need at least ${HardwareMonitor.formatBytes(requiredSpace)} free, but only ${HardwareMonitor.formatBytes(freeSpace)} available.`,
      );
      return;
    }

    setModelDownloading(true);
    setModelDownloadProgress(0);

    try {
      const path = await modelManager.downloadModel(model, (progress) => {
        setModelDownloadProgress(progress.progress);
      });

      setModelDownloaded(true);
      setModelDownloading(false);
      setModelFilename(model.filename);
      setModelPath(path);
      await loadDownloadedModels();

      Alert.alert('Success', 'Model downloaded successfully!');
    } catch (error: any) {
      setModelDownloading(false);
      Alert.alert('Download Failed', error.message || 'Unknown error');
    }
  };

  const handleDeleteModel = async () => {
    const model = AVAILABLE_MODELS[0];

    // Get actual file size if available
    const fileSize = await modelManager.getDownloadedModelSize(model);
    const sizeText = fileSize > 0
      ? `and free up ${HardwareMonitor.formatBytes(fileSize)}`
      : '';

    Alert.alert(
      'Delete Model?',
      `This will delete ${model.name} ${sizeText}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await modelManager.deleteModel(model);
              setModelDownloaded(false);
              setModelFilename(null);
              setModelPath(null);
              await loadDownloadedModels();
              Alert.alert('Deleted', 'Model removed successfully.');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete model');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.accent.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Profile</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* System Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Information</Text>
          {systemInfo && (
            <>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Device:</Text>
                <Text style={styles.infoValue}>{systemInfo.deviceModel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>OS Version:</Text>
                <Text style={styles.infoValue}>{systemInfo.osVersion}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>CPU Architecture:</Text>
                <Text style={styles.infoValue}>{systemInfo.cpuArch}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Total RAM:</Text>
                <Text style={styles.infoValue}>
                  {HardwareMonitor.formatBytes(systemInfo.totalRAM)}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Available Storage:</Text>
                <Text style={styles.infoValue}>
                  {HardwareMonitor.formatBytes(systemInfo.availableStorage)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* Memory Usage */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Memory Usage</Text>
          {memoryInfo && systemInfo && (
            <>
              {/* Device RAM */}
              <View style={styles.memoryOverview}>
                <Text style={styles.memoryMainText}>
                  Device: {HardwareMonitor.formatBytes(memoryInfo.usedRAM)} / {HardwareMonitor.formatBytes(systemInfo.totalRAM)}
                </Text>
                <Text
                  style={[
                    styles.memoryPercent,
                    memoryInfo.usagePercent > 70
                      ? styles.warningText
                      : styles.successText,
                  ]}>
                  {memoryInfo.usagePercent.toFixed(1)}%
                </Text>
              </View>

              {/* Visual progress bar */}
              <View style={styles.memoryBar}>
                <View
                  style={[
                    styles.memoryBarFill,
                    { width: `${memoryInfo.usagePercent}%` },
                    memoryInfo.usagePercent > 70
                      ? { backgroundColor: colors.status.warning }
                      : { backgroundColor: colors.status.success }
                  ]}
                />
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Free Device RAM:</Text>
                <Text style={styles.infoValue}>
                  {HardwareMonitor.formatBytes(memoryInfo.availableRAM)}
                </Text>
              </View>

              {/* App Memory */}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>App Memory:</Text>
                <Text style={styles.infoValue}>
                  {HardwareMonitor.formatBytes(memoryInfo.appMemory)}
                </Text>
              </View>

              {/* Model Memory (if loaded) */}
              {memoryInfo.modelMemory > 0 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Model in Memory:</Text>
                  <Text style={[styles.infoValue, styles.successText]}>
                    {HardwareMonitor.formatBytes(memoryInfo.modelMemory)}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Battery & Provider Mode */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Battery & Provider Mode</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Current Battery:</Text>
            <Text style={[
              styles.infoValue,
              batteryLevel < batteryThreshold ? styles.warningText : styles.successText
            ]}>
              {batteryLevel}%
            </Text>
          </View>

          <View style={styles.batteryConfig}>
            <Text style={styles.configLabel}>
              Minimum Battery for Provider Mode: {batteryThreshold}%
            </Text>
            <Text style={styles.configHint}>
              Provider mode will auto-disable below this level
            </Text>

            {/* Simple threshold buttons */}
            <View style={styles.thresholdButtons}>
              {[10, 20, 30, 40, 50].map(value => (
                <TouchableOpacity
                  key={value}
                  style={[
                    styles.thresholdButton,
                    batteryThreshold === value && styles.thresholdButtonActive
                  ]}
                  onPress={() => handleBatteryThresholdChange(value)}>
                  <Text style={[
                    styles.thresholdButtonText,
                    batteryThreshold === value && styles.thresholdButtonTextActive
                  ]}>
                    {value}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Model Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Model Management</Text>

          {/* Storage Path Info */}
          <View style={styles.pathInfo}>
            <Text style={styles.pathLabel}>Storage Location:</Text>
            <Text style={styles.pathText}>{modelManager.getModelDirectory()}</Text>
          </View>

          <View style={styles.modelCard}>
            <Text style={styles.modelName}>{AVAILABLE_MODELS[0].name}</Text>
            <Text style={styles.modelDesc}>
              {AVAILABLE_MODELS[0].description}
            </Text>
            {modelSize > 0 && (
              <Text style={styles.modelSize}>
                Size: {HardwareMonitor.formatBytes(modelSize)}
              </Text>
            )}

            {modelDownloading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${modelDownloadProgress}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {modelDownloadProgress.toFixed(1)}%
                </Text>
              </View>
            )}

            {modelDownloaded && !modelDownloading && (
              <View style={styles.downloadedBadge}>
                <Text style={styles.downloadedText}>✓ Downloaded</Text>
              </View>
            )}

            <View style={styles.buttonRow}>
              {!modelDownloaded && !modelDownloading && (
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={handleDownloadModel}>
                  <Text style={styles.downloadButtonText}>
                    Download Model
                  </Text>
                </TouchableOpacity>
              )}

              {modelDownloaded && !modelDownloading && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDeleteModel}>
                  <Text style={styles.deleteButtonText}>Delete Model</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* Downloaded Models List */}
        {downloadedModels.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Downloaded Models</Text>
            {downloadedModels.map((model) => (
              <View key={model} style={styles.modelListItem}>
                <Text style={styles.modelListText}>{model}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    marginLeft: -8,
  },
  backText: {
    color: colors.accent.primary,
    fontSize: 16,
  },
  title: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    color: colors.text.tertiary,
    fontSize: 14,
  },
  infoValue: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  warningText: {
    color: colors.status.warning,
  },
  successText: {
    color: colors.status.success,
  },
  modelCard: {
    backgroundColor: colors.background.card,
    borderRadius: 8,
    padding: 16,
  },
  modelName: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  modelDesc: {
    color: colors.text.tertiary,
    fontSize: 14,
    marginBottom: 8,
  },
  modelSize: {
    color: colors.text.disabled,
    fontSize: 12,
    marginBottom: 12,
  },
  progressContainer: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.background.tertiary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
  },
  progressText: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  downloadedBadge: {
    backgroundColor: colors.background.tertiary,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  downloadedText: {
    color: colors.status.success,
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  downloadButton: {
    flex: 1,
    backgroundColor: colors.button.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  downloadButtonText: {
    color: colors.button.primaryText,
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: colors.status.error,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  modelListItem: {
    backgroundColor: colors.background.card,
    borderRadius: 4,
    padding: 12,
    marginBottom: 8,
  },
  modelListText: {
    color: colors.text.primary,
    fontSize: 14,
  },
  pathInfo: {
    backgroundColor: colors.background.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  pathLabel: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginBottom: 4,
  },
  pathText: {
    color: colors.text.primary,
    fontSize: 11,
    fontFamily: 'monospace',
  },
  memoryOverview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  memoryMainText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  memoryPercent: {
    fontSize: 18,
    fontWeight: '700',
  },
  memoryBar: {
    height: 8,
    backgroundColor: colors.background.tertiary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  memoryBarFill: {
    height: '100%',
  },
  batteryConfig: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.background.card,
    borderRadius: 8,
  },
  configLabel: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  configHint: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginBottom: 12,
  },
  thresholdButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  thresholdButton: {
    flex: 1,
    minWidth: 60,
    backgroundColor: colors.background.tertiary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thresholdButtonActive: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
  thresholdButtonText: {
    color: colors.text.tertiary,
    fontSize: 14,
    fontWeight: '600',
  },
  thresholdButtonTextActive: {
    color: colors.background.primary,
  },
});
