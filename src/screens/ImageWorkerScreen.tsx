import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import Toast from 'react-native-toast-message';
import DeviceInfo from 'react-native-device-info';
import { colors, fonts } from '../theme/colors';
import { Accordion } from '../components/Accordion';
import { useAppStore } from '../store/appStore';
import { VisionWorkerService } from '../services/VisionWorkerService';
import type { ThermalStatus } from '../services/ThermalMonitorService';

export interface ImageWorkerScreenProps {
  onBack: () => void;
}

export const ImageWorkerScreen: React.FC<ImageWorkerScreenProps> = ({ onBack }) => {
  const workerService = VisionWorkerService.getInstance();

  // Store state
  const workerEnabled = useAppStore((s) => s.imageWorkerEnabled);
  const setWorkerEnabled = useAppStore((s) => s.setImageWorkerEnabled);
  const workerStatus = useAppStore((s) => s.imageWorkerStatus);
  const workerStats = useAppStore((s) => s.imageWorkerStats);
  const workerLogs = useAppStore((s) => s.imageWorkerLogs);
  const addWorkerLog = useAppStore((s) => s.addImageWorkerLog);
  const coordinatorUrl = useAppStore((s) => s.coordinatorUrl);
  const userProfile = useAppStore((s) => s.userProfile);
  const connected = useAppStore((s) => s.connected);
  const visionModelsDownloaded = useAppStore((s) => s.visionModelsDownloaded);
  const visionModelsLoaded = useAppStore((s) => s.visionModelsLoaded);
  const batteryThreshold = useAppStore((s) => s.batteryThreshold);

  // Local UI state
  const [deviceId, setDeviceId] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [batteryLevel, setBatteryLevel] = useState<number>(0);
  const [thermalStatus, setThermalStatus] = useState<ThermalStatus>('nominal');
  const [uptime, setUptime] = useState(0);

  useEffect(() => {
    loadDeviceInfo();
    loadBatteryInfo();
    loadThermalStatus();

    // Update battery every 10s
    const batteryInterval = setInterval(() => {
      loadBatteryInfo();
    }, 10000);

    // Update thermal status every 5s
    const thermalInterval = setInterval(() => {
      loadThermalStatus();
    }, 5000);

    // Update uptime every second when worker is active
    let uptimeInterval: NodeJS.Timeout | null = null;
    if (workerEnabled && workerStatus === 'online') {
      uptimeInterval = setInterval(() => {
        // Only calculate if sessionStartTime is set (not 0)
        if (workerStats.sessionStartTime > 0) {
          const elapsed = Math.floor((Date.now() - workerStats.sessionStartTime) / 1000);
          setUptime(elapsed);
        } else {
          setUptime(0);
        }
      }, 1000);
    }

    return () => {
      clearInterval(batteryInterval);
      clearInterval(thermalInterval);
      if (uptimeInterval) clearInterval(uptimeInterval);
    };
  }, [workerEnabled, workerStatus, workerStats.sessionStartTime]);

  // Hook into worker events for logging
  useEffect(() => {
    // Log when worker mode starts
    if (workerEnabled) {
      addWorkerLog('info', 'Worker mode started');
    } else {
      addWorkerLog('info', 'Worker mode stopped');
    }
  }, [workerEnabled, addWorkerLog]);

  // Log status changes
  useEffect(() => {
    addWorkerLog('info', `Status: ${workerStatus}`);
  }, [workerStatus, addWorkerLog]);

  // Log task completions
  useEffect(() => {
    if (workerStats.tasksProcessed > 0) {
      addWorkerLog('success', `Task completed (${workerStats.totalDetections} total detections)`);
    }
  }, [workerStats.tasksProcessed, workerStats.totalDetections, addWorkerLog]);

  // Log task failures
  useEffect(() => {
    if (workerStats.tasksFailed > 0) {
      addWorkerLog('error', 'Task failed');
    }
  }, [workerStats.tasksFailed, addWorkerLog]);

  const loadDeviceInfo = async () => {
    try {
      // Get device unique ID
      const uniqueId = await DeviceInfo.getUniqueId();
      setDeviceId(uniqueId);

      // Use user profile display name if available, otherwise use device name
      if (userProfile?.displayName) {
        setDisplayName(userProfile.displayName);
      } else {
        const deviceName = await DeviceInfo.getDeviceName();
        setDisplayName(deviceName);
      }
    } catch (error) {
      console.error('Error loading device info:', error);
    }
  };

  const loadBatteryInfo = async () => {
    try {
      const level = await DeviceInfo.getBatteryLevel();
      setBatteryLevel(Math.round(level * 100));
    } catch (error) {
      console.error('Error loading battery info:', error);
    }
  };

  const loadThermalStatus = async () => {
    try {
      const status = await workerService.getThermalMonitor().getCurrentStatus();
      setThermalStatus(status);
    } catch (error) {
      console.error('Error loading thermal status:', error);
    }
  };

  const handleWorkerToggle = async (value: boolean) => {
    if (value) {
      // Check if vision models are downloaded
      if (!visionModelsDownloaded) {
        Toast.show({
          type: 'error',
          text1: 'vision models required',
          text2: 'please download vision models from profile settings',
          position: 'top',
          visibilityTime: 4000,
        });
        return;
      }

      // Check battery level before enabling
      if (batteryLevel < batteryThreshold) {
        Toast.show({
          type: 'error',
          text1: 'battery too low',
          text2: `please charge above ${batteryThreshold}% to enable worker mode`,
          position: 'top',
          visibilityTime: 4000,
        });
        return;
      }

      // Check connection
      if (!connected) {
        Toast.show({
          type: 'error',
          text1: 'not connected',
          text2: 'please ensure you are connected to the relay server',
          position: 'top',
          visibilityTime: 4000,
        });
        return;
      }

      try {
        await setWorkerEnabled(true);

        // Start worker service
        const name = displayName || 'Anonymous Worker';
        await workerService.startWorkerMode(name, coordinatorUrl);

        Toast.show({
          type: 'success',
          text1: 'worker mode enabled',
          text2: 'now processing vision tasks from the network',
          position: 'top',
        });
      } catch (error) {
        console.error('Failed to start worker mode:', error);
        await setWorkerEnabled(false);
        Toast.show({
          type: 'error',
          text1: 'failed to start',
          text2: 'could not start worker mode',
          position: 'top',
        });
      }
    } else {
      try {
        await setWorkerEnabled(false);

        // Stop worker service
        await workerService.stopWorkerMode();

        Toast.show({
          type: 'info',
          text1: 'worker mode disabled',
          text2: 'stopped processing vision tasks',
          position: 'top',
        });
      } catch (error) {
        console.error('Failed to stop worker mode:', error);
      }
    }
  };

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const getThermalColor = () => {
    switch (thermalStatus) {
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

  const getStatusColor = () => {
    switch (workerStatus) {
      case 'online':
        return colors.status.success;
      case 'connecting':
        return colors.accent.primary;
      case 'paused':
        return colors.status.warning;
      case 'offline':
      default:
        return colors.text.tertiary;
    }
  };

  const getStatusIcon = () => {
    switch (workerStatus) {
      case 'online':
        return 'check-circle';
      case 'connecting':
        return 'loader';
      case 'paused':
        return 'pause-circle';
      case 'offline':
      default:
        return 'circle';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.accent.primary} />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Worker Control */}
        <View style={styles.controlCard}>
          <View style={styles.controlHeader}>
            <View>
              <Text style={styles.controlTitle}>worker mode</Text>
              <Text style={styles.controlSubtitle}>
                {workerEnabled ? 'contributing to network' : 'offline - not processing'}
              </Text>
            </View>
            <Switch
              value={workerEnabled}
              onValueChange={handleWorkerToggle}
              trackColor={{ false: colors.input.border, true: colors.accent.primary }}
              thumbColor={workerEnabled ? colors.button.secondaryText : colors.text.tertiary}
              disabled={!visionModelsDownloaded || batteryLevel < batteryThreshold}
            />
          </View>

          {workerEnabled && (
            <View style={styles.statusRow}>
              <View style={styles.statusBadge}>
                <Icon
                  name={getStatusIcon()}
                  size={14}
                  color={getStatusColor()}
                  style={workerStatus === 'connecting' ? styles.spinning : undefined}
                />
                <Text style={[styles.statusText, { color: getStatusColor() }]}>
                  {workerStatus}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Worker Logs */}
        <Accordion title="worker logs" icon="file-text" defaultExpanded={true}>
          <View style={styles.accordionContent}>
            <ScrollView
              style={styles.logsContainer}
              nestedScrollEnabled={true}
            >
              {workerLogs.length === 0 ? (
                <Text style={styles.logsEmpty}>
                  No logs yet. Enable worker mode to start.
                </Text>
              ) : (
                workerLogs.map((log, index) => (
                  <View key={index} style={styles.logItem}>
                    <Text style={styles.logTimestamp}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </Text>
                    <Text
                      style={[
                        styles.logMessage,
                        log.type === 'error' && { color: colors.status.error },
                        log.type === 'success' && { color: colors.status.success },
                      ]}
                    >
                      {log.message}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </Accordion>

        {/* Worker Statistics */}
        <Accordion title="worker statistics" icon="bar-chart-2" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            {/* Row 1: Tasks & Detections */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>processed</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerStats.tasksProcessed}</Text>
                  <Text style={styles.statBoxUnit}>tasks</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>detections</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerStats.totalDetections}</Text>
                  <Text style={styles.statBoxUnit}>found</Text>
                </View>
              </View>
            </View>

            {/* Row 2: Failed & Avg Time */}
            <View style={styles.statsRow}>
              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>failed</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>{workerStats.tasksFailed}</Text>
                  <Text style={styles.statBoxUnit}>tasks</Text>
                </View>
              </View>

              <View style={styles.statBoxContainer}>
                <View style={styles.statBoxLabel}>
                  <Text style={styles.statBoxLabelText}>avg time</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statBoxValue}>
                    {workerStats.avgProcessingTimeMs > 0 ? (workerStats.avgProcessingTimeMs / 1000).toFixed(1) : '0.0'}
                  </Text>
                  <Text style={styles.statBoxUnit}>seconds</Text>
                </View>
              </View>
            </View>

            {/* Row 3: Uptime */}
            {workerEnabled && (
              <View style={styles.statsRow}>
                <View style={styles.statBoxContainer}>
                  <View style={styles.statBoxLabel}>
                    <Text style={styles.statBoxLabelText}>uptime</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statBoxValue}>{formatUptime(uptime)}</Text>
                    <Text style={styles.statBoxUnit}>session</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        </Accordion>


        {/* Worker Identity */}
        <Accordion title="worker identity" icon="tag" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>display name</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={styles.styledBoxValue}>{displayName}</Text>
                <Text style={styles.styledBoxSubtext}>
                  visible to coordinator
                </Text>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>device id</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={styles.styledBoxValue} numberOfLines={1}>
                  {deviceId || 'loading...'}
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  unique device identifier
                </Text>
              </View>
            </View>
          </View>
        </Accordion>

        {/* Device Health */}
        <Accordion title="device health" icon="activity" defaultExpanded={false}>
          <View style={styles.accordionContent}>
            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>battery</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={[
                  styles.styledBoxValue,
                  { color: batteryLevel < 20 ? colors.status.error : colors.accent.primary }
                ]}>
                  {batteryLevel}%
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  {batteryLevel < 20 ? 'too low for worker mode' : 'sufficient for processing'}
                </Text>
              </View>
            </View>

            <View style={styles.styledBoxContainer}>
              <View style={styles.styledBoxLabel}>
                <Text style={styles.styledBoxLabelText}>thermal</Text>
              </View>
              <View style={styles.styledBox}>
                <Text style={[
                  styles.styledBoxValue,
                  { color: getThermalColor() }
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
                <Text style={styles.styledBoxValue}>
                  {connected ? 'connected' : 'disconnected'}
                </Text>
                <Text style={styles.styledBoxSubtext}>
                  {connected ? 'relay server reachable' : 'cannot reach coordinator'}
                </Text>
              </View>
            </View>
          </View>
        </Accordion>
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
    justifyContent: 'space-between',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: colors.accent.primary,
    fontSize: 16,
    fontFamily: fonts.regular,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  // Control Card
  controlCard: {
    backgroundColor: colors.terminal.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  controlTitle: {
    fontSize: 18,
    color: colors.accent.primary,
    fontFamily: fonts.regular,
    marginBottom: 4,
  },
  controlSubtitle: {
    fontSize: 13,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  statusRow: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.terminal.greenDim,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.background.card,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    letterSpacing: 0.5,
  },
  spinning: {
    // TODO: Add rotation animation
  },
  // Accordion Content
  accordionContent: {
    gap: 12,
  },
  // Styled Boxes
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
    color: colors.accent.primary,
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
    color: colors.accent.primary,
    letterSpacing: 0.3,
  },
  styledBoxSubtext: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.terminal.prompt,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
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
    color: colors.accent.primary,
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
    color: colors.accent.primary,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statBoxUnit: {
    fontFamily: fonts.regular,
    fontSize: 10,
    color: colors.terminal.prompt,
    letterSpacing: 0.3,
  },
  // Capabilities
  capabilityCard: {
    backgroundColor: colors.background.card,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.status.success,
  },
  capabilityDisabled: {
    borderColor: colors.border,
  },
  capabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  capabilityTitle: {
    fontSize: 14,
    color: colors.status.success,
    fontFamily: fonts.regular,
  },
  capabilityTitleDisabled: {
    color: colors.text.disabled,
  },
  capabilityDesc: {
    fontSize: 12,
    color: colors.text.tertiary,
    fontFamily: fonts.regular,
  },
  capabilityDescDisabled: {
    fontSize: 12,
    color: colors.text.disabled,
    fontFamily: fonts.regular,
  },
  // Logs
  logsContainer: {
    maxHeight: 200,
    backgroundColor: colors.terminal.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
    padding: 12,
  },
  logsEmpty: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.text.tertiary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  logItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.terminal.greenDim,
  },
  logTimestamp: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.terminal.prompt,
    marginBottom: 2,
  },
  logMessage: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.accent.primary,
  },
});
