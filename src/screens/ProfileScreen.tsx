import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Switch,
  Animated,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import DeviceInfo from 'react-native-device-info';
import { useAppStore } from '../store/appStore';
import { HardwareMonitor, SystemInfo, MemoryInfo } from '../utils/HardwareMonitor';
import {
  ModelDownloadManager,
  AVAILABLE_MODELS,
} from '../services/ModelDownloadManager';
import { colors, fonts } from '../theme/colors';
import { Accordion } from '../components/Accordion';
import { CustomModal, ModalType } from '../components/CustomModal';
import { AnimatedCornerBorder } from '../components/AnimatedCornerBorder';
import { VisionModelDownloader } from '../services/VisionModelDownloader';
import { VISION_MODELS } from '../services/FaceRecognitionModels';
import { VisionWorkerService } from '../services/VisionWorkerService';
import { FaceRecognitionService } from '../services/FaceRecognitionService';
import { llamaEngine } from '../inference/LlamaEngine';
import Toast from 'react-native-toast-message';
import type { ThermalStatus } from '../services/ThermalMonitorService';

interface ProfileScreenProps {
  onBack: () => void;
  highlightModel?: 'llm' | 'vision' | null;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack, highlightModel }) => {
  const {
    modelDownloaded,
    modelLoaded,
    modelDownloading,
    modelDownloadProgress,
    modelFilename,
    modelPath,
    setModelDownloaded,
    setModelDownloading,
    setModelDownloadProgress,
    setModelFilename,
    setModelPath,
    setModelLoading,
    batteryThreshold,
    setBatteryThreshold,
    loadBatteryThreshold,
    providerModeEnabled,
    setProviderModeEnabled,
    imageWorkerEnabled,
    setImageWorkerEnabled,
    userProfile,
    peerId,
    providerModeStats,
    workerModeStats,
    loadNodeStats,
    visionModelsDownloaded,
    visionModelsLoaded,
    setVisionModelsDownloaded,
    setVisionModelsLoaded,
    setModelLoaded,
    addLog,
    connected,
  } = useAppStore();

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [modelSize, setModelSize] = useState<number>(0);
  const [batteryLevel, setBatteryLevel] = useState<number>(0);
  const [thermalStatus, setThermalStatus] = useState<ThermalStatus>('nominal');
  const [downloadingVisionModels, setDownloadingVisionModels] = useState(false);
  const [visionModelsProgress, setVisionModelsProgress] = useState(0);
  const [visionModelsSize, setVisionModelsSize] = useState(0);
  const [providerToggleLoading, setProviderToggleLoading] = useState(false);
  const [workerToggleLoading, setWorkerToggleLoading] = useState(false);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<ModalType>('info');
  const [modalTitle, setModalTitle] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [modalButtons, setModalButtons] = useState<Array<{text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'danger'}>>([]);

  // Refs for scrolling
  const scrollViewRef = useRef<ScrollView>(null);
  const llmButtonRef = useRef<View>(null);
  const visionButtonRef = useRef<View>(null);

  const modelManager = ModelDownloadManager.getInstance();
  const visionDownloader = VisionModelDownloader.getInstance();

  // Helper function to show modal
  const showModal = (
    type: ModalType,
    title: string,
    message: string,
    buttons?: Array<{text: string; onPress: () => void; style?: 'primary' | 'secondary' | 'danger'}>
  ) => {
    setModalType(type);
    setModalTitle(title);
    setModalMessage(message);
    setModalButtons(buttons || [{ text: 'ok', onPress: () => setModalVisible(false), style: 'primary' }]);
    setModalVisible(true);
  };

  // Handle highlighting and scrolling when highlightModel is set
  // Scroll to highlighted button when highlightModel prop changes
  useEffect(() => {
    if (highlightModel) {
      // Wait for layout to complete
      const timer = setTimeout(() => {
        const targetRef = highlightModel === 'llm' ? llmButtonRef : visionButtonRef;

        if (targetRef.current) {
          // Measure and scroll to the button
          targetRef.current.measureLayout(
            scrollViewRef.current as any,
            (x, y) => {
              scrollViewRef.current?.scrollTo({ y: y - 100, animated: true });
            },
            () => {}
          );
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [highlightModel]);

  useEffect(() => {
    loadSystemInfo();
    loadDownloadedModels();
    loadVisionModels();
    loadBatteryInfo();
    loadThermalStatus();
    loadBatteryThreshold(); // Load saved threshold
    loadNodeStats(); // Load node statistics

    // Refresh memory info every 3 seconds
    const memInterval = setInterval(async () => {
      const mem = await HardwareMonitor.getMemoryInfo();
      setMemoryInfo(mem);
    }, 3000);

    // Refresh battery info every 10 seconds
    const batteryInterval = setInterval(() => {
      loadBatteryInfo();
    }, 10000);

    // Refresh thermal status every 10 seconds
    const thermalInterval = setInterval(() => {
      loadThermalStatus();
    }, 10000);

    return () => {
      clearInterval(memInterval);
      clearInterval(batteryInterval);
      clearInterval(thermalInterval);
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

  const loadThermalStatus = async () => {
    try {
      const { ThermalMonitorService } = require('../services/ThermalMonitorService');
      const status = await ThermalMonitorService.getInstance().getCurrentStatus();
      setThermalStatus(status);
    } catch (error) {
      console.warn('Error getting thermal status:', error);
      setThermalStatus('nominal'); // Fallback to nominal on error
    }
  };

  const getThermalColor = (status: ThermalStatus) => {
    switch (status) {
      case 'nominal':
        return colors.status.success;
      case 'light':
        return colors.accent.primary;
      case 'moderate':
        return colors.status.warning;
      case 'severe':
      case 'critical':
        return colors.status.error;
      default:
        return colors.text.tertiary;
    }
  };

  const loadVisionModels = async () => {
    const downloaded = await visionDownloader.areAllModelsDownloaded();
    setVisionModelsDownloaded(downloaded);

    if (downloaded) {
      // Calculate total size of downloaded vision models
      let totalSize = 0;
      for (const model of VISION_MODELS) {
        const size = await visionDownloader.getDownloadedModelSize(model);
        totalSize += size;
      }
      setVisionModelsSize(totalSize);
    } else {
      setVisionModelsSize(0);
    }
  };

  const handleBatteryThresholdChange = (value: number) => {
    setBatteryThreshold(value); // This saves to AsyncStorage via store action
  };

  const handleProviderModeToggle = async (value: boolean) => {
    setProviderToggleLoading(true);
    try {
      if (value) {
        // Check if LLM model is downloaded
        if (!modelDownloaded) {
          Toast.show({
            type: 'error',
            text1: 'llm model required',
            text2: 'please download the model first',
            position: 'top',
          });
          return;
        }

      // Check battery level
      if (batteryLevel < batteryThreshold) {
        Toast.show({
          type: 'error',
          text1: 'battery too low',
          text2: `please charge above ${batteryThreshold}%`,
          position: 'top',
        });
        return;
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
        Toast.show({
          type: 'info',
          text1: 'worker mode disabled',
          text2: 'provider mode enabled',
          position: 'top',
        });
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
      await setProviderModeEnabled(value);
    } finally {
      setProviderToggleLoading(false);
    }
  };

  const handleWorkerModeToggle = async (value: boolean) => {
    setWorkerToggleLoading(true);
    try {
      if (value) {
        // Check if vision models are downloaded
        if (!visionModelsDownloaded) {
          Toast.show({
            type: 'error',
            text1: 'vision models required',
            text2: 'please download vision models first',
            position: 'top',
          });
          return;
        }

      // Check battery level
      if (batteryLevel < batteryThreshold) {
        Toast.show({
          type: 'error',
          text1: 'battery too low',
          text2: `please charge above ${batteryThreshold}%`,
          position: 'top',
        });
        return;
      }

      // MUTUAL EXCLUSIVITY: Disable provider mode if enabled
      if (providerModeEnabled) {
        // setProviderModeEnabled will handle model unloading
        await handleProviderModeToggle(false);
        Toast.show({
          type: 'info',
          text1: 'provider mode disabled',
          text2: 'worker mode enabled',
          position: 'top',
        });
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
        } catch (error) {
          Toast.show({
            type: 'error',
            text1: 'failed to load models',
            text2: 'could not initialize vision models',
            position: 'top',
          });
          return;
        }
      }
    } else {
        const workerService = VisionWorkerService.getInstance();
        await workerService.stopWorkerMode();
      }
      setImageWorkerEnabled(value);
    } finally {
      setWorkerToggleLoading(false);
    }
  };

  const handleDownloadModel = async () => {
    const model = AVAILABLE_MODELS[0];

    // Check if already downloaded
    if (modelDownloaded) {
      showModal('info', 'already downloaded', 'model is already on your device.');
      return;
    }

    // Check available space - require at least 1GB free
    const freeSpace = await modelManager.getAvailableSpace();
    const requiredSpace = 1000000000; // 1GB minimum
    if (freeSpace < requiredSpace) {
      showModal(
        'warning',
        'insufficient storage',
        `need at least ${HardwareMonitor.formatBytes(requiredSpace)} free, but only ${HardwareMonitor.formatBytes(freeSpace)} available.`
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

      showModal('success', 'success', 'model downloaded successfully!');
    } catch (error: any) {
      setModelDownloading(false);
      showModal('error', 'download failed', error.message || 'unknown error');
    }
  };

  const formatUptime = (sessionStartTime: number) => {
    const startTime = sessionStartTime || Date.now();
    const uptimeMs = Date.now() - startTime;
    const hours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const minutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const formatNumber = (num: number) => {
    const value = num || 0;
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  const handleDeleteModel = async () => {
    const model = AVAILABLE_MODELS[0];

    // Get actual file size if available
    const fileSize = await modelManager.getDownloadedModelSize(model);
    const sizeText = fileSize > 0
      ? `and free up ${HardwareMonitor.formatBytes(fileSize)}`
      : '';

    showModal(
      'confirm',
      'delete model?',
      `this will delete ${model.name} ${sizeText}.`,
      [
        { text: 'cancel', onPress: () => setModalVisible(false), style: 'secondary' },
        {
          text: 'delete',
          style: 'danger',
          onPress: async () => {
            setModalVisible(false);
            try {
              await modelManager.deleteModel(model);
              setModelDownloaded(false);
              setModelFilename(null);
              setModelPath(null);
              await loadDownloadedModels();
              showModal('success', 'deleted', 'model removed successfully.');
            } catch (error: any) {
              showModal('error', 'error', error.message || 'failed to delete model');
            }
          },
        },
      ]
    );
  };

  const handleDownloadVisionModels = async () => {
    if (visionModelsDownloaded) {
      Toast.show({
        type: 'info',
        text1: 'already downloaded',
        text2: 'vision models are already on your device',
        position: 'top',
      });
      return;
    }

    // Check available space - require at least 100MB free
    const freeSpace = await modelManager.getAvailableSpace();
    const requiredSpace = 100000000; // 100MB minimum
    if (freeSpace < requiredSpace) {
      showModal(
        'warning',
        'insufficient storage',
        `need at least ${HardwareMonitor.formatBytes(requiredSpace)} free, but only ${HardwareMonitor.formatBytes(freeSpace)} available.`
      );
      return;
    }

    setDownloadingVisionModels(true);
    setVisionModelsProgress(0);

    try {
      let totalProgress = 0;
      let completedModels = 0;

      await visionDownloader.downloadAllModels((modelName, progress) => {
        if (progress.progress === 100) {
          completedModels++;
        }
        // Average progress across all models
        totalProgress = (completedModels * 100 + progress.progress) / VISION_MODELS.length;
        setVisionModelsProgress(Math.round(totalProgress));
      });

      setVisionModelsDownloaded(true);
      await loadVisionModels();

      Toast.show({
        type: 'success',
        text1: 'vision models downloaded',
        text2: 'you can now enable image worker mode',
        position: 'top',
      });
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'download failed',
        text2: error.message,
        position: 'top',
      });
    } finally {
      setDownloadingVisionModels(false);
    }
  };

  const handleDeleteVisionModels = async () => {
    const sizeText = visionModelsSize > 0
      ? `and free up ${HardwareMonitor.formatBytes(visionModelsSize)}`
      : '';

    showModal(
      'confirm',
      'delete vision models?',
      `this will delete all vision models ${sizeText}.`,
      [
        { text: 'cancel', onPress: () => setModalVisible(false), style: 'secondary' },
        {
          text: 'delete',
          style: 'danger',
          onPress: async () => {
            setModalVisible(false);
            try {
              await visionDownloader.deleteAllModels();
              setVisionModelsDownloaded(false);
              await loadVisionModels();
              showModal('success', 'deleted', 'vision models removed successfully.');
            } catch (error: any) {
              showModal('error', 'error', error.message || 'failed to delete models');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.accent.primary} />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* model management */}
        <Accordion title="model management" icon="download" defaultExpanded={true}>
          <View style={styles.accordionContent}>

          {/* Storage Path */}
          <View style={styles.styledBoxContainer}>
            <View style={styles.styledBoxLabel}>
              <Text style={styles.styledBoxLabelText}>storage path</Text>
            </View>
            <View style={styles.styledBox}>
              <Text style={styles.styledBoxValue} numberOfLines={2}>
                {modelManager.getModelDirectory()}
              </Text>
            </View>
          </View>

          {/* Model Info Card */}
          <View style={styles.modelTerminalCard}>
            <View style={styles.modelHeader}>
              <View style={styles.terminalPrompt}>
                <Text style={styles.terminalPromptText}>$</Text>
              </View>
              <Text style={styles.modelTerminalName}>{AVAILABLE_MODELS[0].name}</Text>
            </View>

            <View style={styles.modelMetaRow}>
              <Text style={styles.modelMetaLabel}>type:</Text>
              <Text style={styles.modelMetaValue}>quantized</Text>
            </View>

            <View style={styles.modelMetaRow}>
              <Text style={styles.modelMetaLabel}>desc:</Text>
              <Text style={styles.modelMetaValue}>{AVAILABLE_MODELS[0].description}</Text>
            </View>

            {modelSize > 0 && (
              <View style={styles.modelMetaRow}>
                <Text style={styles.modelMetaLabel}>size:</Text>
                <Text style={styles.modelMetaValue}>{HardwareMonitor.formatBytes(modelSize)}</Text>
              </View>
            )}

            {/* Download Progress */}
            {modelDownloading && (
              <View style={styles.terminalProgressContainer}>
                <View style={styles.terminalProgressBar}>
                  <View
                    style={[
                      styles.terminalProgressFill,
                      { width: `${modelDownloadProgress}%` },
                    ]}
                  />
                </View>
                <Text style={styles.terminalProgressText}>
                  [{modelDownloadProgress.toFixed(1)}%] downloading...
                </Text>
              </View>
            )}

            {/* Status Badge */}
            {modelDownloaded && !modelDownloading && (
              <View style={styles.modelStatusRow}>
                <Text style={styles.modelStatusLabel}>status:</Text>
                <Text style={styles.modelStatusReady}>● ready</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modelActions}>
              {!modelDownloaded && !modelDownloading && (
                <AnimatedCornerBorder
                  isActive={highlightModel === 'llm'}
                  borderRadius={6}
                  cornerSize={20}
                  borderWidth={3}
                  color={colors.terminal.green}
                >
                  <View ref={llmButtonRef}>
                    <TouchableOpacity
                      style={[
                        styles.terminalButton,
                        highlightModel === 'llm' && { borderWidth: 0, borderColor: 'transparent' }
                      ]}
                      onPress={handleDownloadModel}>
                      <Text style={styles.terminalButtonText}>[ download ]</Text>
                    </TouchableOpacity>
                  </View>
                </AnimatedCornerBorder>
              )}

              {modelDownloaded && !modelDownloading && (
                <TouchableOpacity
                  style={styles.terminalButtonDanger}
                  onPress={handleDeleteModel}>
                  <Text style={styles.terminalButtonDangerText}>[ delete ]</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Vision Models Card */}
          <View style={styles.modelTerminalCard}>
            <View style={styles.modelHeader}>
              <View style={styles.terminalPrompt}>
                <Text style={styles.terminalPromptText}>$</Text>
              </View>
              <Text style={styles.modelTerminalName}>vision models</Text>
            </View>

            <View style={styles.modelMetaRow}>
              <Text style={styles.modelMetaLabel}>type:</Text>
              <Text style={styles.modelMetaValue}>onnx runtime</Text>
            </View>

            <View style={styles.modelMetaRow}>
              <Text style={styles.modelMetaLabel}>desc:</Text>
              <Text style={styles.modelMetaValue}>face detection & age/gender estimation</Text>
            </View>

            {visionModelsSize > 0 && (
              <View style={styles.modelMetaRow}>
                <Text style={styles.modelMetaLabel}>size:</Text>
                <Text style={styles.modelMetaValue}>{HardwareMonitor.formatBytes(visionModelsSize)}</Text>
              </View>
            )}

            {/* Download Progress */}
            {downloadingVisionModels && (
              <View style={styles.terminalProgressContainer}>
                <View style={styles.terminalProgressBar}>
                  <View
                    style={[
                      styles.terminalProgressFill,
                      { width: `${visionModelsProgress}%` },
                    ]}
                  />
                </View>
                <Text style={styles.terminalProgressText}>
                  [{visionModelsProgress.toFixed(1)}%] downloading...
                </Text>
              </View>
            )}

            {/* Status Badge */}
            {visionModelsDownloaded && !downloadingVisionModels && (
              <View style={styles.modelStatusRow}>
                <Text style={styles.modelStatusLabel}>status:</Text>
                <Text style={styles.modelStatusReady}>● ready</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modelActions}>
              {!visionModelsDownloaded && !downloadingVisionModels && (
                <AnimatedCornerBorder
                  isActive={highlightModel === 'vision'}
                  borderRadius={6}
                  cornerSize={20}
                  borderWidth={3}
                  color={colors.terminal.green}
                >
                  <View ref={visionButtonRef}>
                    <TouchableOpacity
                      style={[
                        styles.terminalButton,
                        highlightModel === 'vision' && { borderWidth: 0, borderColor: 'transparent' }
                      ]}
                      onPress={handleDownloadVisionModels}>
                      <Text style={styles.terminalButtonText}>[ download ]</Text>
                    </TouchableOpacity>
                  </View>
                </AnimatedCornerBorder>
              )}

              {visionModelsDownloaded && !downloadingVisionModels && (
                <TouchableOpacity
                  style={styles.terminalButtonDanger}
                  onPress={handleDeleteVisionModels}>
                  <Text style={styles.terminalButtonDangerText}>[ delete ]</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
        </Accordion>

        {/* Power & Provider */}
        <Accordion title="power & provider" icon="battery-charging" defaultExpanded={true}>
          <View style={styles.accordionContent}>
            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>provider mode</Text>
              </View>
              <View style={styles.styledBox}>
                <View style={styles.switchRow}>
                  <Text style={styles.styledBoxValue}>{providerModeEnabled ? 'enabled' : 'disabled'}</Text>
                  {providerToggleLoading ? (
                    <ActivityIndicator size="small" color={colors.terminal.green} />
                  ) : (
                    <Switch
                      value={providerModeEnabled}
                      onValueChange={handleProviderModeToggle}
                      trackColor={{ false: colors.input.border, true: colors.terminal.green }}
                      thumbColor={colors.terminal.prompt}
                    />
                  )}
                </View>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>worker mode</Text>
              </View>
              <View style={styles.styledBox}>
                <View style={styles.switchRow}>
                  <Text style={styles.styledBoxValue}>{imageWorkerEnabled ? 'enabled' : 'disabled'}</Text>
                  {workerToggleLoading ? (
                    <ActivityIndicator size="small" color={colors.terminal.green} />
                  ) : (
                    <Switch
                      value={imageWorkerEnabled}
                      onValueChange={handleWorkerModeToggle}
                      trackColor={{ false: colors.input.border, true: colors.terminal.green }}
                      thumbColor={colors.terminal.prompt}
                    />
                  )}
                </View>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>battery threshold</Text>
              </View>
              <View style={styles.styledBox}>
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
          </View>
        </Accordion>

        {/* Worker Statistics */}
        <Accordion title="worker statistics" icon="package" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>processed</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerModeStats.tasksProcessed}</Text>
                  <Text style={styles.statBoxUnit}>tasks</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>detections</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerModeStats.totalDetections}</Text>
                  <Text style={styles.statBoxUnit}>found</Text>
                </View>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>failed</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerModeStats.tasksFailed}</Text>
                  <Text style={styles.statBoxUnit}>tasks</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>avg time</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {workerModeStats.avgProcessingTimeMs > 0
                      ? (workerModeStats.avgProcessingTimeMs / 1000).toFixed(1)
                      : '0.0'}
                  </Text>
                  <Text style={styles.statBoxUnit}>seconds</Text>
                </View>
              </View>
            </View>
          </View>
        </Accordion>

        {/* Device Health */}
        <Accordion title="device health" icon="activity" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>thermal status</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={[
                  styles.styledBoxValue,
                  { color: getThermalColor(thermalStatus) }
                ]}>
                  {thermalStatus}
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  {thermalStatus === 'nominal' || thermalStatus === 'light'
                    ? 'device temperature normal'
                    : 'device may throttle performance'}
                </Text>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>network</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={[
                  styles.styledBoxValue,
                  { color: connected ? colors.status.success : colors.status.error }
                ]}>
                  {connected ? 'connected' : 'disconnected'}
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  {connected ? 'relay server reachable' : 'cannot reach coordinator'}
                </Text>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>battery</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={[
                  styles.styledBoxValue,
                  { color: batteryLevel < batteryThreshold ? colors.status.warning : colors.terminal.green }
                ]}>
                  {batteryLevel}%
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  min threshold: {batteryThreshold}%
                </Text>
              </View>
            </View>
          </View>
        </Accordion>

        {/* Profile Section */}
        <Accordion title="profile" icon="user" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>display name</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={styles.styledBoxValue}>{userProfile?.displayName || 'not set'}</Text>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>peer id</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={styles.styledBoxValue}>{peerId}</Text>
              </View>
            </View>
          </View>
        </Accordion>

        {/* provider statistics */}
        <Accordion title="provider statistics" icon="bar-chart-2" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            {/* Row 1: Requests & Tokens */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>served</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{formatNumber(providerModeStats.requestsServed)}</Text>
                  <Text style={styles.statBoxUnit}>requests</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>tokens</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{formatNumber(providerModeStats.tokensGenerated)}</Text>
                  <Text style={styles.statBoxUnit}>generated</Text>
                </View>
              </View>
            </View>

            {/* Row 2: Self & Uptime */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>self</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{formatNumber(providerModeStats.selfRequests)}</Text>
                  <Text style={styles.statBoxUnit}>local</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>uptime</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{formatUptime(providerModeStats.sessionStartTime)}</Text>
                  <Text style={styles.statBoxUnit}>session</Text>
                </View>
              </View>
            </View>

            {/* Row 3: Performance Metrics */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>peak t/s</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {(providerModeStats.peakTokensPerSecond || 0) > 0 ? (providerModeStats.peakTokensPerSecond || 0).toFixed(1) : '0.0'}
                  </Text>
                  <Text style={styles.statBoxUnit}>tok/sec</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>avg t/s</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {(() => {
                      const totalTokens = (providerModeStats.tokensGenerated || 0) + (providerModeStats.selfTokensReceived || 0);
                      const totalTimeMs = (providerModeStats.providerTimeMs || 0) + (providerModeStats.selfTimeMs || 0);
                      const avgTps = totalTimeMs > 0 ? (totalTokens / (totalTimeMs / 1000)).toFixed(1) : '0.0';
                      return avgTps;
                    })()}
                  </Text>
                  <Text style={styles.statBoxUnit}>tok/sec</Text>
                </View>
              </View>
            </View>

            {/* Row 4: Low & Avg Time */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>low t/s</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {(providerModeStats.lowestTokensPerSecond || 0) < Infinity && (providerModeStats.lowestTokensPerSecond || 0) > 0
                      ? (providerModeStats.lowestTokensPerSecond || 0).toFixed(1)
                      : '0.0'}
                  </Text>
                  <Text style={styles.statBoxUnit}>tok/sec</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>avg time</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {(() => {
                      const totalRequests = (providerModeStats.requestsServed || 0) + (providerModeStats.selfRequests || 0);
                      const totalTimeMs = (providerModeStats.providerTimeMs || 0) + (providerModeStats.selfTimeMs || 0);
                      const avgResponseTime = totalRequests > 0 ? ((totalTimeMs / totalRequests) / 1000).toFixed(1) : '0.0';
                      return avgResponseTime;
                    })()}s
                  </Text>
                  <Text style={styles.statBoxUnit}>response</Text>
                </View>
              </View>
            </View>
          </View>
        </Accordion>

        {/* Device Information */}
        <Accordion title="device information" icon="smartphone" defaultExpanded={false}>
          <View style={styles.accordionContent}>
          {systemInfo && (
            <>
              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>device</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>{systemInfo.deviceModel}</Text>
                </View>
              </View>

              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>os version</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>{systemInfo.osVersion}</Text>
                </View>
              </View>

              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>cpu architecture</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>{systemInfo.cpuArch}</Text>
                </View>
              </View>

              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>total ram</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>
                    {HardwareMonitor.formatBytes(systemInfo.totalRAM)}
                  </Text>
                </View>
              </View>

              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>available storage</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>
                    {HardwareMonitor.formatBytes(systemInfo.availableStorage)}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Memory Usage */}
          {memoryInfo && systemInfo && (
            <>
              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>free device ram</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>
                    {HardwareMonitor.formatBytes(memoryInfo.availableRAM)}
                  </Text>
                  <Text style={styles.styledBoxSubtext}>
                    {memoryInfo.usagePercent.toFixed(1)}% used
                  </Text>
                </View>
              </View>

              {/* App Memory */}
              <View style={styles.styledBoxContainer}>
                <View style={styles.styledBoxLabel}>
                  <Text style={styles.styledBoxLabelText}>app memory</Text>
                </View>
                <View style={styles.styledBox}>
                  <Text style={styles.styledBoxValue}>
                    {HardwareMonitor.formatBytes(memoryInfo.appMemory)}
                  </Text>
                  {memoryInfo.modelMemory > 0 && (
                    <Text style={styles.styledBoxSubtext}>
                      model: {HardwareMonitor.formatBytes(memoryInfo.modelMemory)}
                    </Text>
                  )}
                </View>
              </View>
            </>
          )}
          </View>
        </Accordion>
      </ScrollView>

      {/* Custom Modal */}
      <CustomModal
        visible={modalVisible}
        type={modalType}
        title={modalTitle}
        message={modalMessage}
        buttons={modalButtons}
        onClose={() => setModalVisible(false)}
      />
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
    fontFamily: fonts.regular,
  },
  title: {
    color: colors.text.primary,
    fontSize: 20,
    fontFamily: fonts.regular,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  profileInfo: {
    gap: 12,
  },
  accordionContent: {
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.background.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    color: colors.text.primary,
    marginBottom: 4,
    fontFamily: fonts.regular,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    fontFamily: fonts.regular,
  },
  // Stats row layout (2 boxes per row)
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  // node statistics - Terminal Style Boxes
  statBoxContainer: {
    flex: 1,
    position: 'relative',
  },
  statBoxLabel: {
    position: 'absolute',
    top: -8,
    left: 12,
    backgroundColor: colors.terminal.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    zIndex: 1,
  },
  statBoxLabelText: {
    fontFamily: fonts.regular,
    color: colors.terminal.green,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  statBox: {
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    padding: 12,
    paddingTop: 16,
    alignItems: 'center',
    minHeight: 70,
    justifyContent: 'center',
  },
  statBoxValue: {
    fontFamily: fonts.regular,
    fontSize: 18,
    color: colors.terminal.green,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statBoxUnit: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.terminal.prompt,
    letterSpacing: 0.3,
  },
  // Styled box layout (terminal aesthetic)
  styledBoxContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  styledBoxLabel: {
    position: 'absolute',
    top: -8,
    left: 12,
    backgroundColor: colors.terminal.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    zIndex: 1,
  },
  styledBoxLabelText: {
    fontFamily: fonts.regular,
    color: colors.terminal.green,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  styledBox: {
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    padding: 16,
    paddingTop: 20,
  },
  styledBoxValue: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.terminal.green,
    letterSpacing: 0.3,
  },
  styledBoxSubtext: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.terminal.prompt,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    fontFamily: fonts.regular,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    color: colors.text.tertiary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  infoValue: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  modelDesc: {
    color: colors.text.tertiary,
    fontSize: 14,
    marginBottom: 8,
    fontFamily: fonts.regular,
  },
  modelSize: {
    color: colors.text.disabled,
    fontSize: 12,
    marginBottom: 12,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  pathText: {
    color: colors.text.primary,
    fontSize: 11,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  memoryPercent: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.regular,
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
    fontFamily: fonts.regular,
  },
  configHint: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginBottom: 12,
    fontFamily: fonts.regular,
  },
  thresholdButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  thresholdButton: {
    flex: 1,
    minWidth: 60,
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.terminal.greenDim,
  },
  thresholdButtonActive: {
    backgroundColor: colors.terminal.green,
    borderColor: colors.terminal.green,
  },
  thresholdButtonText: {
    color: colors.text.tertiary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.regular,
  },
  thresholdButtonTextActive: {
    color: colors.background.primary,
    fontFamily: fonts.regular,
  },
  // model management - Terminal Style
  modelTerminalCard: {
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    padding: 16,
    gap: 8,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  terminalPrompt: {
    backgroundColor: colors.terminal.green,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  terminalPromptText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.terminal.background,
  },
  modelTerminalName: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.terminal.green,
    letterSpacing: 0.5,
  },
  modelMetaRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  modelMetaLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.terminal.prompt,
    minWidth: 50,
  },
  modelMetaValue: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.terminal.green,
    flex: 1,
  },
  modelStatusRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    marginTop: 4,
  },
  modelStatusLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.terminal.prompt,
    minWidth: 50,
  },
  modelStatusReady: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.terminal.green,
  },
  terminalProgressContainer: {
    marginTop: 8,
    gap: 6,
  },
  terminalProgressBar: {
    height: 6,
    backgroundColor: colors.background.tertiary,
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  terminalProgressFill: {
    height: '100%',
    backgroundColor: colors.terminal.green,
  },
  terminalProgressText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.terminal.prompt,
    letterSpacing: 0.5,
  },
  modelActions: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  terminalButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.terminal.green,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  terminalButtonText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.terminal.green,
    letterSpacing: 1,
  },
  terminalButtonDanger: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.status.error,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  terminalButtonDangerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.status.error,
    letterSpacing: 1,
  },
  sectionDivider: {
    marginTop: 20,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  sectionDividerText: {
    fontSize: 12,
    color: colors.terminal.green,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statBoxContainer: {
    flex: 1,
  },
  statBoxLabel: {
    marginBottom: 6,
  },
  statBoxLabelText: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statBox: {
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(39, 201, 63, 0.4)',
    padding: 12,
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 24,
    color: colors.terminal.green,
    fontFamily: fonts.bold,
    marginBottom: 4,
  },
  statBoxUnit: {
    fontSize: 10,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
});
