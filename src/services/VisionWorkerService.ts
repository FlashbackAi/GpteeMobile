import { v4 as uuidv4 } from 'uuid';
import DeviceInfo from 'react-native-device-info';
import RNFS from 'react-native-fs';
import { ThermalMonitorService, ThermalStatus } from './ThermalMonitorService';
import { TaskLogService } from './TaskLogService';
import { FaceRecognitionService } from './FaceRecognitionService';
import { COORDINATOR_URL, WORKER_CONFIG } from '../config';
import {
  WorkerRegisterMessage,
  WorkerDeregisterMessage,
  WorkerHeartbeatMessage,
  WorkerStatusMessage,
  TaskAssignMessage,
  TaskAcceptMessage,
  TaskRejectMessage,
  TaskResultMessage,
  TaskErrorMessage,
  WorkerPauseMessage,
  WorkerResumeMessage,
} from '../../../gpteeRelay/src/types';

export type WorkerStatus = 'offline' | 'connecting' | 'online' | 'paused';

export interface WorkerConfig {
  coordinatorUrl: string; // WebSocket URL for coordinator
  maxConcurrentTasks: number;
  maxImageResolution: number; // Max pixels (e.g., 6000000 for 6MP)
  heartbeatIntervalMs: number; // Default: 30000 (30s)
  statusUpdateIntervalMs: number; // Default: 60000 (60s)
  minBatteryLevel: number; // Minimum battery to accept tasks
}

export interface WorkerStatistics {
  tasksProcessed: number;
  tasksFailed: number;
  totalDetections: number;
  avgProcessingTimeMs: number;
  sessionStartTime: number;
}

type MessageHandler = (message: any) => void;

export class VisionWorkerService {
  private static instance: VisionWorkerService;

  // Services
  private thermalMonitor: ThermalMonitorService;
  private taskLogService: TaskLogService;
  private faceService: FaceRecognitionService;

  // WebSocket connection
  private ws: WebSocket | null = null;
  private workerId: string = '';
  private displayName: string = '';
  private deviceModel: string = '';
  private chipVendor: string = 'qualcomm'; // TODO: Detect from device

  // Worker state
  private status: WorkerStatus = 'offline';
  private isInitialized: boolean = false;
  private activeTasks: Map<string, TaskAssignMessage> = new Map();

  // Config
  private config: WorkerConfig = {
    coordinatorUrl: COORDINATOR_URL,
    maxConcurrentTasks: WORKER_CONFIG.maxConcurrentTasks,
    maxImageResolution: WORKER_CONFIG.maxImageResolution,
    heartbeatIntervalMs: WORKER_CONFIG.heartbeatIntervalMs,
    statusUpdateIntervalMs: WORKER_CONFIG.statusUpdateIntervalMs,
    minBatteryLevel: WORKER_CONFIG.minBatteryLevel,
  };

  // Statistics
  private stats: WorkerStatistics = {
    tasksProcessed: 0,
    tasksFailed: 0,
    totalDetections: 0,
    avgProcessingTimeMs: 0,
    sessionStartTime: 0,
  };

  // Intervals
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private statusUpdateInterval: NodeJS.Timeout | null = null;

  // Event listeners
  private listeners: Map<string, MessageHandler> = new Map();

  private constructor() {
    this.thermalMonitor = ThermalMonitorService.getInstance();
    this.taskLogService = TaskLogService.getInstance();
    this.faceService = FaceRecognitionService.getInstance();
  }

  public static getInstance(): VisionWorkerService {
    if (!VisionWorkerService.instance) {
      VisionWorkerService.instance = new VisionWorkerService();
    }
    return VisionWorkerService.instance;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Initialization & Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[VisionWorker] Initializing worker service');

    try {
      // Initialize services
      await this.taskLogService.initialize();

      // Verify FaceRecognitionService is ready (should be initialized globally in App.tsx)
      if (!this.faceService.isReady()) {
        console.log('[VisionWorker] ⚠️ FaceRecognitionService not ready, initializing now...');
        await this.faceService.initialize();
        console.log('[VisionWorker] ✅ FaceRecognitionService initialized');
      } else {
        console.log('[VisionWorker] ✅ FaceRecognitionService already initialized');
      }

      // Load device info
      this.workerId = await DeviceInfo.getUniqueId();
      this.deviceModel = await DeviceInfo.getModel();

      console.log(`[VisionWorker] Worker ID: ${this.workerId}`);
      console.log(`[VisionWorker] Device: ${this.deviceModel}`);

      this.isInitialized = true;
    } catch (error) {
      console.error('[VisionWorker] Initialization failed:', error);
      throw error;
    }
  }

  public async startWorkerMode(displayName: string, coordinatorUrl?: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.status !== 'offline') {
      console.log('[VisionWorker] Already running');
      return;
    }

    console.log('[VisionWorker] Starting worker mode');

    this.displayName = displayName;
    if (coordinatorUrl) {
      this.config.coordinatorUrl = coordinatorUrl;
    }

    // Reset statistics
    this.stats = {
      tasksProcessed: 0,
      tasksFailed: 0,
      totalDetections: 0,
      avgProcessingTimeMs: 0,
      sessionStartTime: Date.now(),
    };

    // Notify stats update
    this.notifyListeners('stats_updated', { stats: this.stats });

    // Start thermal monitoring
    this.thermalMonitor.startMonitoring(5000);
    this.thermalMonitor.addListener('worker', (status) => this.handleThermalChange(status));

    // Connect to coordinator
    await this.connectToCoordinator();

    this.status = 'online';
    this.notifyListeners('status_changed', { status: this.status });
  }

  public async stopWorkerMode(): Promise<void> {
    console.log('[VisionWorker] Stopping worker mode');

    // Deregister from coordinator
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      await this.deregister();
    }

    // Stop intervals
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.statusUpdateInterval) {
      clearInterval(this.statusUpdateInterval);
      this.statusUpdateInterval = null;
    }

    // Stop thermal monitoring
    this.thermalMonitor.stopMonitoring();
    this.thermalMonitor.removeListener('worker');

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.status = 'offline';
    this.notifyListeners('status_changed', { status: this.status });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WebSocket Connection
  // ═══════════════════════════════════════════════════════════════════════════

  private async connectToCoordinator(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[VisionWorker] 🔌 Attempting to connect to coordinator: ${this.config.coordinatorUrl}`);

      this.status = 'connecting';
      this.notifyListeners('status_changed', { status: this.status });

      try {
        this.ws = new WebSocket(this.config.coordinatorUrl);
        console.log('[VisionWorker] 📡 WebSocket instance created');
      } catch (error) {
        console.error('[VisionWorker] ❌ Failed to create WebSocket:', error);
        this.status = 'offline';
        this.notifyListeners('status_changed', { status: this.status });
        reject(error);
        return;
      }

      this.ws.onopen = async () => {
        console.log('[VisionWorker] ✅ WebSocket OPENED - Connected to coordinator');
        console.log('[VisionWorker] 📝 About to send worker_register message');

        try {
          // Register as worker
          await this.register();
          console.log('[VisionWorker] ✅ Worker registration message sent');

          // Start heartbeat
          this.startHeartbeat();

          // Start status updates
          this.startStatusUpdates();

          this.status = 'online';
          this.notifyListeners('status_changed', { status: this.status });
          console.log('[VisionWorker] 🟢 Status changed to ONLINE');

          resolve();
        } catch (error) {
          console.error('[VisionWorker] ❌ Error during registration:', error);
          reject(error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[VisionWorker] ❌ WebSocket ERROR event:', error);
        console.error('[VisionWorker] Error details:', JSON.stringify(error));
        this.status = 'offline';
        this.notifyListeners('status_changed', { status: this.status });
        reject(error);
      };

      this.ws.onclose = (event) => {
        console.log('[VisionWorker] 🔴 WebSocket CLOSED');
        console.log('[VisionWorker] Close code:', event.code);
        console.log('[VisionWorker] Close reason:', event.reason);
        console.log('[VisionWorker] Was clean:', event.wasClean);
        this.status = 'offline';
        this.notifyListeners('status_changed', { status: this.status });
      };

      this.ws.onmessage = (event) => {
        console.log('[VisionWorker] 📨 Message received:', event.data.substring(0, 100));
        this.handleMessage(event.data);
      };

      // Add timeout for connection
      setTimeout(() => {
        if (this.status === 'connecting') {
          console.error('[VisionWorker] ⏱️ Connection timeout after 10 seconds');
          if (this.ws) {
            this.ws.close();
          }
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private async register(): Promise<void> {
    console.log('[VisionWorker] 📋 Building registration message...');
    const thermalStatus = await this.thermalMonitor.getCurrentStatus();
    const batteryLevel = Math.round((await DeviceInfo.getBatteryLevel()) * 100);
    const osVersion = await DeviceInfo.getSystemVersion();

    const message: WorkerRegisterMessage = {
      type: 'worker_register',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      workerId: this.workerId,
      workerInfo: {
        deviceName: this.displayName,
        deviceModel: this.deviceModel,
        platform: 'android',
        osVersion,
        chipVendor: this.chipVendor,
        thermalStatus,
        batteryLevel,
        networkType: 'wifi', // TODO: Detect
        modelsLoaded: {
          face_detection: true,
          object_detection: false,
        },
        hardwareAcceleration: ['cpu'], // TODO: Detect QNN/NNAPI
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        maxImageResolution: this.config.maxImageResolution,
      },
    };

    console.log('[VisionWorker] 📤 Sending worker_register message');
    console.log('[VisionWorker] Worker ID:', this.workerId);
    console.log('[VisionWorker] Display Name:', this.displayName);
    console.log('[VisionWorker] Message type:', message.type);

    this.sendMessage(message);
    console.log('[VisionWorker] ✅ worker_register message sent to coordinator');
  }

  private async deregister(): Promise<void> {
    const message: WorkerDeregisterMessage = {
      type: 'worker_deregister',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      workerId: this.workerId,
    };

    this.sendMessage(message);
    console.log('[VisionWorker] Deregistered from coordinator');
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const thermalStatus = await this.thermalMonitor.getCurrentStatus();
      const batteryLevel = Math.round((await DeviceInfo.getBatteryLevel()) * 100);

      const message: WorkerHeartbeatMessage = {
        type: 'worker_heartbeat',
        id: uuidv4(),
        from: this.workerId,
        timestamp: Date.now(),
        workerId: this.workerId,
        thermalStatus,
        batteryLevel,
        activeTasks: this.activeTasks.size,
      };

      this.sendMessage(message);
    }, this.config.heartbeatIntervalMs);
  }

  private startStatusUpdates(): void {
    this.statusUpdateInterval = setInterval(async () => {
      await this.sendStatusUpdate();
    }, this.config.statusUpdateIntervalMs);
  }

  private async sendStatusUpdate(): Promise<void> {
    const thermalStatus = await this.thermalMonitor.getCurrentStatus();
    const batteryLevel = Math.round((await DeviceInfo.getBatteryLevel()) * 100);

    const message: WorkerStatusMessage = {
      type: 'worker_status',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      workerId: this.workerId,
      thermalStatus,
      batteryLevel,
      cpuUsagePercent: 0, // TODO: Implement
      memoryUsageMb: 0, // TODO: Implement
      networkType: 'wifi', // TODO: Detect
      networkQuality: 'good', // TODO: Detect
      activeTasks: this.activeTasks.size,
      tasksCompleted: this.stats.tasksProcessed,
      tasksFailed: this.stats.tasksFailed,
      avgProcessingTimeMs: this.stats.avgProcessingTimeMs,
      uptimeMs: Date.now() - this.stats.sessionStartTime,
      availableForWork: this.status === 'online' && !this.thermalMonitor.shouldPauseWorker(),
      maxConcurrentTasks: this.config.maxConcurrentTasks,
    };

    this.sendMessage(message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Message Handling
  // ═══════════════════════════════════════════════════════════════════════════

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'task_assign':
          this.handleTaskAssign(message as TaskAssignMessage);
          break;

        case 'coordinator_pause_worker':
          this.handleCoordinatorPause(message);
          break;

        case 'coordinator_resume_worker':
          this.handleCoordinatorResume(message);
          break;

        default:
          console.log(`[VisionWorker] Unhandled message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[VisionWorker] Error parsing message:', error);
    }
  }

  private async handleTaskAssign(task: TaskAssignMessage): Promise<void> {
    console.log(`[VisionWorker] Task assigned: ${task.taskId} (${task.analysisType})`);

    // Check if we can accept the task
    const canAccept = await this.canAcceptTask(task);

    if (!canAccept.accept) {
      console.log(`[VisionWorker] Rejecting task: ${canAccept.reason}`);
      this.rejectTask(task, canAccept.reason!);
      return;
    }

    // Accept task
    this.acceptTask(task);

    // Process task
    this.processTask(task);
  }

  private async canAcceptTask(task: TaskAssignMessage): Promise<{
    accept: boolean;
    reason?: 'overloaded' | 'low_battery' | 'thermal_warning' | 'model_not_loaded' | 'network_poor';
  }> {
    // Check concurrent tasks
    if (this.activeTasks.size >= this.config.maxConcurrentTasks) {
      return { accept: false, reason: 'overloaded' };
    }

    // Check battery
    const batteryLevel = Math.round((await DeviceInfo.getBatteryLevel()) * 100);
    if (batteryLevel < this.config.minBatteryLevel) {
      return { accept: false, reason: 'low_battery' };
    }

    // Check thermal status
    const thermalStatus = await this.thermalMonitor.getCurrentStatus();
    if (this.thermalMonitor.shouldPauseWorker(thermalStatus)) {
      return { accept: false, reason: 'thermal_warning' };
    }

    // Check model support
    if (task.analysisType === 'face_detection') {
      // Face detection is supported
    } else {
      return { accept: false, reason: 'model_not_loaded' };
    }

    return { accept: true };
  }

  private acceptTask(task: TaskAssignMessage): void {
    this.activeTasks.set(task.taskId, task);

    const message: TaskAcceptMessage = {
      type: 'task_accept',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      taskId: task.taskId,
      workerId: this.workerId,
      estimatedCompletionMs: 5000, // TODO: Better estimation
    };

    this.sendMessage(message);

    // Log task
    this.taskLogService.insertTask({
      taskId: task.taskId,
      imageId: task.imageId,
      imageName: task.imageName,
      imageUrl: task.imageUrl,
      analysisType: task.analysisType,
      priority: task.priority,
      assignedAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    });
  }

  private rejectTask(task: TaskAssignMessage, reason: string): void {
    const message: TaskRejectMessage = {
      type: 'task_reject',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      taskId: task.taskId,
      workerId: this.workerId,
      reason: reason as any,
      retryAfterMs: 30000,
    };

    this.sendMessage(message);
  }

  private async processTask(task: TaskAssignMessage): Promise<void> {
    const startTime = Date.now();
    const thermalStart = await this.thermalMonitor.getCurrentStatus();
    const batteryStart = Math.round((await DeviceInfo.getBatteryLevel()) * 100);

    try {
      console.log(`[VisionWorker] Processing task: ${task.taskId}`);

      await this.taskLogService.markProcessing(task.taskId, thermalStart);

      // Download image
      const localPath = await this.downloadImage(task.imageUrl, task.imageName);

      // Analyze image
      const result = await this.faceService.detectAndAnalyzeFaces(localPath, 2600);

      // Clean up downloaded file
      await RNFS.unlink(localPath);

      const processingTime = Date.now() - startTime;
      const thermalEnd = await this.thermalMonitor.getCurrentStatus();
      const batteryEnd = Math.round((await DeviceInfo.getBatteryLevel()) * 100);

      console.log(`[VisionWorker] Task completed: ${task.taskId} (${result.detections.length} detections)`);

      // Send result
      this.sendTaskResult(task, result, processingTime, thermalEnd);

      // Update statistics
      this.stats.tasksProcessed++;
      this.stats.totalDetections += result.detections.length;
      if (this.stats.avgProcessingTimeMs === 0) {
        this.stats.avgProcessingTimeMs = processingTime;
      } else {
        this.stats.avgProcessingTimeMs = (this.stats.avgProcessingTimeMs + processingTime) / 2;
      }

      // Log completion
      await this.taskLogService.markCompleted(task.taskId, {
        detectionsFound: result.detections.length,
        processingTimeMs: processingTime,
        thermalStatusEnd: thermalEnd,
        batteryLevelEnd: batteryEnd,
      });

      // Remove from active tasks
      this.activeTasks.delete(task.taskId);

      this.notifyListeners('task_completed', { taskId: task.taskId, result });

    } catch (error: any) {
      console.error(`[VisionWorker] Task failed: ${task.taskId}`, error);

      this.stats.tasksFailed++;

      // Send error
      this.sendTaskError(task, error);

      // Log failure
      await this.taskLogService.markFailed(task.taskId, {
        errorCode: 'MODEL_ERROR',
        errorMessage: error.message || 'Unknown error',
      });

      // Remove from active tasks
      this.activeTasks.delete(task.taskId);

      this.notifyListeners('task_failed', { taskId: task.taskId, error });
    }
  }

  private async downloadImage(url: string, filename: string): Promise<string> {
    // Extract clean filename (remove any query parameters if present)
    const cleanFilename = filename.split('?')[0];
    const localPath = `${RNFS.CachesDirectoryPath}/worker_${cleanFilename}`;

    console.log(`[VisionWorker] Downloading image: ${url}`);
    console.log(`[VisionWorker] Saving to: ${localPath}`);

    const result = await RNFS.downloadFile({
      fromUrl: url,
      toFile: localPath,
    }).promise;

    if (result.statusCode !== 200) {
      throw new Error(`Failed to download image: HTTP ${result.statusCode}`);
    }

    console.log(`[VisionWorker] ✅ Downloaded successfully`);
    return localPath;
  }

  private sendTaskResult(task: TaskAssignMessage, result: any, processingTimeMs: number, thermalStatus: ThermalStatus): void {
    const message: TaskResultMessage = {
      type: 'task_result',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      taskId: task.taskId,
      imageId: task.imageId,
      imageName: task.imageName,
      analysisType: task.analysisType,
      detectionsFound: result.detections.length,
      detections: result.detections.map((det: any, idx: number) => ({
        detectionId: uuidv4(),
        bbox: det.bbox,
        confidence: det.confidence,
        attributes: {
          age: result.ageGenderResults?.[idx]?.age,
          gender: result.ageGenderResults?.[idx]?.gender,
          gender_confidence: result.ageGenderResults?.[idx]?.confidence,
        },
      })),
      processingTimeMs,
      thermalStatus,
      hardwareAccelerator: 'cpu', // TODO: Detect actual accelerator
      modelVersions: {
        detection: 'retinaface_mv2',
        age_gender: 'buffalo_l_genderage',
      },
      imageQuality: {
        resolution: { width: result.width, height: result.height },
      },
    };

    this.sendMessage(message);
  }

  private sendTaskError(task: TaskAssignMessage, error: Error): void {
    const message: TaskErrorMessage = {
      type: 'task_error',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      taskId: task.taskId,
      workerId: this.workerId,
      errorCode: 'MODEL_ERROR',
      errorMessage: error.message || 'Unknown error',
      retryable: true,
    };

    this.sendMessage(message);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Thermal Management
  // ═══════════════════════════════════════════════════════════════════════════

  private async handleThermalChange(status: ThermalStatus): Promise<void> {
    console.log(`[VisionWorker] Thermal status changed: ${status}`);

    if (this.thermalMonitor.shouldPauseWorker(status)) {
      console.log('[VisionWorker] Pausing worker due to thermal status');
      await this.pauseWorker('thermal');
    } else if (this.status === 'paused' && this.thermalMonitor.canResumeWorker(status)) {
      console.log('[VisionWorker] Resuming worker - thermal status normalized');
      await this.resumeWorker();
    }
  }

  private async pauseWorker(reason: 'thermal' | 'battery' | 'manual'): Promise<void> {
    if (this.status === 'paused') return;

    this.status = 'paused';

    const message: WorkerPauseMessage = {
      type: 'worker_pause',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      workerId: this.workerId,
      reason,
    };

    this.sendMessage(message);
    this.notifyListeners('status_changed', { status: this.status });
  }

  private async resumeWorker(): Promise<void> {
    if (this.status !== 'paused') return;

    this.status = 'online';

    const message: WorkerResumeMessage = {
      type: 'worker_resume',
      id: uuidv4(),
      from: this.workerId,
      timestamp: Date.now(),
      workerId: this.workerId,
    };

    this.sendMessage(message);
    this.notifyListeners('status_changed', { status: this.status });
  }

  private handleCoordinatorPause(message: any): void {
    console.log('[VisionWorker] Coordinator requested pause');
    this.pauseWorker('manual');
  }

  private handleCoordinatorResume(message: any): void {
    console.log('[VisionWorker] Coordinator requested resume');
    this.resumeWorker();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════════════════════════

  private sendMessage(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  public addEventListener(event: string, handler: MessageHandler): void {
    this.listeners.set(event, handler);
  }

  public removeEventListener(event: string): void {
    this.listeners.delete(event);
  }

  private notifyListeners(event: string, data: any): void {
    const handler = this.listeners.get(event);
    if (handler) {
      handler(data);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Getters
  // ═══════════════════════════════════════════════════════════════════════════

  public getStatus(): WorkerStatus {
    return this.status;
  }

  public getStatistics(): WorkerStatistics {
    return { ...this.stats };
  }

  public getWorkerId(): string {
    return this.workerId;
  }

  public getDisplayName(): string {
    return this.displayName;
  }

  public getThermalMonitor(): ThermalMonitorService {
    return this.thermalMonitor;
  }

  public isActive(): boolean {
    return this.status === 'online' || this.status === 'paused';
  }
}
