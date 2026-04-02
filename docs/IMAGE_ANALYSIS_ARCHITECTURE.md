# Distributed Image Analysis Architecture

## Overview

A decentralized image processing system where a **Coordinator** distributes computer vision tasks to **Worker** devices. Workers analyze images using on-device ONNX models and report results back to be stored in DynamoDB.

**Key Capabilities**:
- Face detection with age/gender estimation
- Object detection (extensible)
- Image classification (extensible)
- OCR/text extraction (future)

---

## System Components

### 1. **Coordinator (Central Task Distributor)**
- Runs on relay server or dedicated cloud instance
- Maintains image analysis job queue with priority management
- Distributes tasks to available workers using intelligent load balancing
- Aggregates results and stores in DynamoDB
- Monitors worker health and performance
- Handles task failures, retries, and timeouts
- Provides real-time analytics and monitoring dashboard

### 2. **Workers (Mobile Devices)**
- Run computer vision models (detection, classification, etc.)
- Process images assigned by coordinator
- Monitor device health (thermal, battery, connectivity)
- Maintain local task logs and offline queue
- Report results back to coordinator with guaranteed delivery
- Support graceful degradation and failover

### 3. **Storage Layer**
- **DynamoDB**: Persistent storage for analysis results and worker metrics
- **Device Local Storage**: Task logs, thermal history, offline queue
- **S3**: Image storage with presigned URLs
- **ElastiCache/Redis** (optional): Task queue and real-time coordination

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                     Image Source (S3/URL)                     │
└─────────────────────────┬────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────────┐
│                  COORDINATOR (Relay Server)                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Job Queue Manager (Priority Queue)                       │ │
│  │  - Receives image analysis requests                       │ │
│  │  - Queues tasks with priority (high/normal/low)           │ │
│  │  - Tracks task status (pending/assigned/completed/failed) │ │
│  │  - Handles task timeouts and retries (exponential backoff)│ │
│  │  - Deduplication (skip already processed images)          │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Worker Registry & Load Balancer                          │ │
│  │  - Maintains list of available workers                    │ │
│  │  - Monitors worker health (thermal, battery, connectivity)│ │
│  │  - Assigns tasks based on:                                │ │
│  │    * Worker capacity (thermal/battery)                    │ │
│  │    * Current workload (active tasks)                      │ │
│  │    * Performance history (avg processing time)            │ │
│  │    * Device capabilities (model support, hardware accel)  │ │
│  │  - Heartbeat monitoring (30s interval, 90s timeout)       │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Result Aggregator & Validator                            │ │
│  │  - Receives analysis results from workers                 │ │
│  │  - Validates result integrity (schema, confidence thresh) │ │
│  │  - Enriches data (timestamps, metadata)                   │ │
│  │  - Writes to DynamoDB (batch writes for efficiency)       │ │
│  │  - Triggers callbacks/webhooks for completed tasks        │ │
│  └─────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  Analytics & Monitoring                                   │ │
│  │  - Real-time worker pool status                           │ │
│  │  - Task throughput metrics (tasks/sec, avg latency)       │ │
│  │  - Error rate tracking and alerting                       │ │
│  │  - Cost analytics (worker utilization, task distribution) │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────┬──────────────────────────────┬───────────────────┘
            │                              │
    Task Assignment                   Results Upload
    (WebSocket)                       (WebSocket/HTTP)
            │                              │
      ┌─────▼──────┐              ┌────────▼─────┐
      │  Worker 1  │              │   Worker 2   │
      │            │              │              │
      │ Android    │              │   Android    │
      │ Snapdragon │              │   MediaTek   │
      │ QNN Accel  │              │   NNAPI      │
      └────────────┘              └──────────────┘
            │                              │
            └──────────┬───────────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │      DynamoDB Tables         │
         │  - analysis_results          │
         │  - worker_metrics            │
         │  - task_logs                 │
         │  - analytics_aggregates      │
         └─────────────────────────────┘
```

---

## Data Models

### **DynamoDB Table: `analysis_results`**

Generic schema supporting multiple analysis types (face detection, object detection, etc.)

```json
{
  "image_id": "uuid",              // Partition Key
  "result_id": "uuid",             // Sort Key (detection_id, object_id, etc.)
  "image_name": "photo_001.jpg",
  "image_url": "s3://bucket/photo_001.jpg",
  "analysis_type": "face_detection",  // face_detection | object_detection | classification

  // Generic detection data
  "bbox": {
    "x": 120,
    "y": 250,
    "width": 80,
    "height": 100
  },
  "confidence": 0.987,

  // Analysis-specific attributes (flexible schema)
  "attributes": {
    "age": 28,                     // For face detection
    "gender": "M",
    "gender_confidence": 0.959,
    // OR for object detection:
    "class": "person",
    "class_id": 0
  },

  // Metadata
  "indexed_timestamp": 1710512000000,
  "indexed_by": "Samsung Galaxy S21 (Worker-1)",
  "worker_id": "worker-1-uuid",
  "processing_time_ms": 450,
  "model_versions": {
    "detection": "retinaface_mv2",
    "analysis": "buffalo_l_genderage"
  },
  "hardware_accelerator": "qnn",  // qnn | nnapi | cpu

  // Quality metrics
  "quality_score": 0.95,           // Overall detection quality
  "blur_score": 0.12,              // Lower = less blur
  "brightness": 0.65               // 0-1 normalized
}
```

### **DynamoDB Table: `worker_metrics`**

```json
{
  "worker_id": "uuid",             // Partition Key
  "timestamp": 1710512000000,      // Sort Key

  // Device info
  "device_name": "Samsung Galaxy S21",
  "device_model": "SM-G991B",
  "platform": "android",
  "os_version": "14",
  "chip_vendor": "qualcomm",       // qualcomm | mediatek | samsung | apple

  // Health metrics
  "thermal_status": "nominal",     // nominal | light | moderate | severe | critical
  "battery_level": 85,
  "battery_temperature": 32.5,     // Celsius
  "cpu_usage_percent": 45,
  "memory_usage_mb": 1250,
  "network_type": "wifi",          // wifi | cellular | ethernet
  "network_quality": "good",       // excellent | good | fair | poor

  // Performance metrics
  "tasks_completed": 42,
  "tasks_failed": 2,
  "avg_processing_time_ms": 520,
  "tasks_in_queue": 3,
  "uptime_ms": 3600000,            // Worker session uptime

  // Availability
  "is_available": true,
  "max_concurrent_tasks": 2,
  "current_concurrent_tasks": 1,
  "last_heartbeat": 1710512000000,

  // Capabilities
  "supported_models": ["face_detection", "object_detection"],
  "hardware_acceleration": ["qnn", "cpu"],
  "max_image_resolution": 6000000  // pixels (e.g., 6MP)
}
```

### **DynamoDB Table: `task_logs`**

```json
{
  "task_id": "uuid",               // Partition Key
  "timestamp": 1710512000000,      // Sort Key

  // Task info
  "image_id": "uuid",
  "image_name": "photo_001.jpg",
  "image_url": "s3://...",
  "analysis_type": "face_detection",
  "priority": "normal",            // low | normal | high

  // Assignment info
  "worker_id": "uuid",
  "assigned_at": 1710511900000,
  "started_at": 1710511950000,
  "completed_at": 1710512000000,

  // Status tracking
  "status": "completed",           // pending | assigned | processing | completed | failed | timeout
  "retry_count": 0,
  "max_retries": 3,

  // Results
  "detections_found": 3,
  "processing_time_ms": 450,
  "error_message": null,
  "error_code": null,              // TIMEOUT | WORKER_OFFLINE | MODEL_ERROR | etc.

  // Context
  "thermal_status_at_completion": "nominal",
  "battery_level_at_completion": 82
}
```

### **DynamoDB Table: `analytics_aggregates`** (NEW)

Pre-aggregated analytics for dashboard performance

```json
{
  "metric_type": "hourly_throughput",  // Partition Key
  "timestamp": 1710511200000,          // Sort Key (hour bucket)

  "tasks_completed": 1250,
  "tasks_failed": 15,
  "avg_processing_time_ms": 485,
  "median_processing_time_ms": 420,
  "p95_processing_time_ms": 890,

  "active_workers": 12,
  "total_workers_seen": 18,

  "detections_by_type": {
    "face_detection": 1100,
    "object_detection": 150
  }
}
```

---

## Message Protocol

### **Message Types (extending existing relay protocol)**

```typescript
// Worker lifecycle
type MessageType =
  | 'worker_register'            // Worker announces capabilities
  | 'worker_deregister'          // Worker going offline
  | 'worker_status'              // Periodic health metrics
  | 'worker_heartbeat'           // Lightweight keepalive (every 30s)

  // Task lifecycle
  | 'task_assign'                // Coordinator → Worker: analyze this image
  | 'task_accept'                // Worker → Coordinator: task accepted
  | 'task_reject'                // Worker → Coordinator: cannot accept (overloaded/low battery)
  | 'task_progress'              // Worker → Coordinator: task progress update (optional)
  | 'task_result'                // Worker → Coordinator: analysis complete
  | 'task_error'                 // Worker → Coordinator: task failed

  // Worker control
  | 'worker_pause'               // Worker → Coordinator: pausing work (thermal/battery)
  | 'worker_resume'              // Worker → Coordinator: resuming work
  | 'coordinator_pause_worker'   // Coordinator → Worker: please pause (maintenance)
  | 'coordinator_resume_worker'  // Coordinator → Worker: resume work

interface WorkerRegisterMessage extends BaseMessage {
  type: 'worker_register';
  workerId: string;                // Unique device ID
  workerInfo: {
    deviceName: string;
    deviceModel: string;
    platform: 'android' | 'ios';
    osVersion: string;
    chipVendor: 'qualcomm' | 'mediatek' | 'samsung' | 'apple';

    // Current health
    thermalStatus: ThermalStatus;
    batteryLevel: number;
    networkType: 'wifi' | 'cellular';

    // Capabilities
    modelsLoaded: {
      face_detection: boolean;
      object_detection: boolean;
      // Extensible for future models
    };
    hardwareAcceleration: Array<'qnn' | 'nnapi' | 'coreml' | 'cpu'>;
    maxConcurrentTasks: number;
    maxImageResolution: number;    // Max pixels (e.g., 6000000 for 6MP)
  };
}

interface WorkerHeartbeatMessage extends BaseMessage {
  type: 'worker_heartbeat';
  workerId: string;
  timestamp: number;
  thermalStatus: ThermalStatus;
  batteryLevel: number;
  activeTasks: number;
}

interface TaskAssignMessage extends BaseMessage {
  type: 'task_assign';
  to: string;                      // worker_id
  taskId: string;
  imageId: string;
  imageName: string;
  imageUrl: string;                // S3 presigned URL (expires in 1 hour)
  analysisType: 'face_detection' | 'object_detection' | 'classification';
  priority: 'low' | 'normal' | 'high';
  timeout: number;                 // Max processing time in ms (default: 30000)

  // Optional: model preferences
  modelHints?: {
    preferredDetector?: string;
    minConfidence?: number;
    maxDetections?: number;
  };
}

interface TaskAcceptMessage extends BaseMessage {
  type: 'task_accept';
  taskId: string;
  workerId: string;
  estimatedCompletionMs: number;   // Worker's estimate based on image size
}

interface TaskRejectMessage extends BaseMessage {
  type: 'task_reject';
  taskId: string;
  workerId: string;
  reason: 'overloaded' | 'low_battery' | 'thermal_warning' | 'model_not_loaded' | 'network_poor';
  retryAfterMs?: number;           // Suggest when worker might be available
}

interface TaskResultMessage extends BaseMessage {
  type: 'task_result';
  taskId: string;
  imageId: string;
  imageName: string;
  analysisType: string;

  // Generic detection results
  detectionsFound: number;
  detections: Array<{
    detectionId: string;
    bbox: { x: number; y: number; width: number; height: number };
    confidence: number;
    attributes: Record<string, any>;  // Flexible schema for different analysis types
  }>;

  // Performance metrics
  processingTimeMs: number;
  thermalStatus: ThermalStatus;
  hardwareAccelerator: string;      // Which accelerator was used
  modelVersions: Record<string, string>;

  // Quality metrics
  imageQuality?: {
    resolution: { width: number; height: number };
    blurScore?: number;
    brightness?: number;
  };
}

interface TaskErrorMessage extends BaseMessage {
  type: 'task_error';
  taskId: string;
  workerId: string;
  errorCode: 'MODEL_ERROR' | 'DOWNLOAD_FAILED' | 'OUT_OF_MEMORY' | 'TIMEOUT' | 'INVALID_IMAGE';
  errorMessage: string;
  retryable: boolean;
}

interface WorkerStatusMessage extends BaseMessage {
  type: 'worker_status';
  workerId: string;

  // Health
  thermalStatus: ThermalStatus;
  batteryLevel: number;
  cpuUsagePercent: number;
  memoryUsageMb: number;
  networkType: 'wifi' | 'cellular' | 'ethernet';
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';

  // Performance
  activeTasks: number;
  tasksCompleted: number;
  tasksFailed: number;
  avgProcessingTimeMs: number;
  uptimeMs: number;

  // Availability
  availableForWork: boolean;
  maxConcurrentTasks: number;
}

type ThermalStatus = 'nominal' | 'light' | 'moderate' | 'severe' | 'critical';
```

---

## Worker State Machine

```
┌─────────────┐
│    IDLE     │◄──────────────────────────┐
└──────┬──────┘                           │
       │                                  │
       │ worker_register                  │
       ▼                                  │
┌─────────────┐                           │
│  AVAILABLE  │◄──────────┐               │
└──────┬──────┘           │               │
       │                  │               │
       │ task_assign      │ task_complete │
       ▼                  │               │
┌─────────────┐           │               │
│ PROCESSING  │───────────┘               │
└──────┬──────┘                           │
       │                                  │
       │ thermal_alert / low_battery      │
       ▼                                  │
┌─────────────┐                           │
│   PAUSED    │───────────────────────────┤
└─────────────┘   thermal_normal /        │
       │           battery_charged        │
       │                                  │
       │ connection_lost                  │
       ▼                                  │
┌─────────────┐                           │
│  OFFLINE    │───────────────────────────┘
└─────────────┘   reconnect (heartbeat)
```

**State Descriptions**:

- **IDLE**: Worker installed but not registered with coordinator
- **AVAILABLE**: Registered and ready to accept tasks
- **PROCESSING**: Actively processing one or more tasks
- **PAUSED**: Temporarily unavailable (thermal/battery), will auto-resume
- **OFFLINE**: Disconnected from coordinator (network issue, app backgrounded)

---

## Worker Mode Toggle

### **Mutual Exclusion: LLM vs Image Analysis**

**Rule**: Only ONE mode can be active at a time to optimize memory and thermal performance.

```typescript
enum WorkerMode {
  IDLE = 'idle',                   // No models loaded
  LLM_INFERENCE = 'llm',           // llama.rn loaded, provider mode ON
  IMAGE_ANALYSIS = 'vision'        // ONNX vision models loaded, provider mode OFF
}

// State transitions
interface ModeTransition {
  from: WorkerMode;
  to: WorkerMode;
  actions: string[];
  estimatedTimeMs: number;
}

const transitions: ModeTransition[] = [
  {
    from: 'llm',
    to: 'vision',
    estimatedTimeMs: 5000,
    actions: [
      '1. Disable LLM provider mode (acceptingJobs = false)',
      '2. Unload llama.rn model from memory',
      '3. Clear chat history/context',
      '4. Trigger garbage collection',
      '5. Load ONNX vision models (detection + analysis)',
      '6. Initialize hardware accelerator (QNN/NNAPI)',
      '7. Register as image_worker with coordinator',
      '8. Update UI to show Image Analysis mode'
    ]
  },
  {
    from: 'vision',
    to: 'llm',
    estimatedTimeMs: 8000,
    actions: [
      '1. Deregister from image worker pool',
      '2. Complete any in-flight tasks (graceful shutdown)',
      '3. Release ONNX models from memory',
      '4. Release hardware accelerator resources',
      '5. Trigger garbage collection',
      '6. Load llama.rn model',
      '7. Enable LLM provider mode (acceptingJobs = true)',
      '8. Register with relay as LLM provider',
      '9. Update UI to show LLM Provider mode'
    ]
  }
];
```

**UI Controls**:
```typescript
interface WorkerModeControl {
  currentMode: WorkerMode;
  targetMode: WorkerMode | null;
  transitioning: boolean;
  transitionProgress: number;  // 0-100%

  // Actions
  switchMode(to: WorkerMode): Promise<void>;
  cancelTransition(): void;
}
```

---

## Thermal Monitoring

### **Android Thermal Status API**

```typescript
import { NativeModules } from 'react-native';

interface ThermalManager {
  getCurrentThermalStatus(): Promise<ThermalStatus>;
  startMonitoring(intervalMs: number): void;
  stopMonitoring(): void;

  // Listeners
  onThermalStatusChanged(callback: (status: ThermalStatus) => void): void;
  onCriticalThermalAlert(callback: () => void): void;
}

const { ThermalManager } = NativeModules;

// Worker behavior based on thermal status
const THERMAL_POLICIES = {
  nominal: {
    acceptTasks: true,
    maxConcurrentTasks: 2,
    cooldownBetweenTasksMs: 0
  },
  light: {
    acceptTasks: true,
    maxConcurrentTasks: 2,
    cooldownBetweenTasksMs: 1000
  },
  moderate: {
    acceptTasks: true,
    maxConcurrentTasks: 1,
    cooldownBetweenTasksMs: 3000
  },
  severe: {
    acceptTasks: false,           // Reject new tasks
    maxConcurrentTasks: 0,
    finishCurrentTask: true,      // Complete running task then pause
    cooldownBetweenTasksMs: 10000
  },
  critical: {
    acceptTasks: false,
    maxConcurrentTasks: 0,
    finishCurrentTask: false,     // Emergency stop
    cooldownBetweenTasksMs: 30000,
    notifyCoordinator: true       // Send critical alert
  }
};

// Auto-resume thresholds
const THERMAL_RESUME_THRESHOLD = 'light';
const BATTERY_RESUME_THRESHOLD = 20;  // %
```

### **Thermal-Based Task Scheduling**

```typescript
class ThermalAwareScheduler {
  private currentThermalStatus: ThermalStatus;
  private taskQueue: Task[] = [];

  async shouldAcceptTask(task: Task): Promise<boolean> {
    const policy = THERMAL_POLICIES[this.currentThermalStatus];

    if (!policy.acceptTasks) return false;

    const activeTasks = this.getActiveTasks();
    if (activeTasks.length >= policy.maxConcurrentTasks) return false;

    const batteryLevel = await getBatteryLevel();
    if (batteryLevel < 15 && task.priority !== 'high') return false;

    return true;
  }

  async onThermalStatusChanged(newStatus: ThermalStatus) {
    this.currentThermalStatus = newStatus;

    if (newStatus === 'severe' || newStatus === 'critical') {
      await this.pauseWorker();
    } else if (newStatus === 'nominal' || newStatus === 'light') {
      await this.resumeWorker();
    }
  }
}
```

---

## Local Task Logging (Device)

### **SQLite Local Database**

```sql
CREATE TABLE task_logs (
  task_id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  image_name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  analysis_type TEXT NOT NULL,

  -- Timestamps
  assigned_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,

  -- Status
  status TEXT NOT NULL,  -- pending|processing|completed|failed|timeout
  priority TEXT NOT NULL,

  -- Results
  detections_found INTEGER,
  processing_time_ms INTEGER,

  -- Health context
  thermal_status_start TEXT,
  thermal_status_end TEXT,
  battery_level_start INTEGER,
  battery_level_end INTEGER,

  -- Error tracking
  error_message TEXT,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Upload tracking
  uploaded_to_cloud BOOLEAN DEFAULT 0,
  upload_attempts INTEGER DEFAULT 0,
  last_upload_attempt INTEGER,

  -- Metadata
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Indexes
CREATE INDEX idx_status ON task_logs(status, created_at);
CREATE INDEX idx_uploaded ON task_logs(uploaded_to_cloud, completed_at);
CREATE INDEX idx_failed ON task_logs(status, retry_count) WHERE status = 'failed';

-- Offline queue view
CREATE VIEW offline_queue AS
SELECT * FROM task_logs
WHERE uploaded_to_cloud = 0
  AND status IN ('completed', 'failed')
  AND upload_attempts < 3
ORDER BY priority DESC, completed_at ASC;
```

### **Offline Queue Manager**

```typescript
class OfflineQueueManager {
  async syncPendingResults() {
    const pendingTasks = await db.query(
      'SELECT * FROM offline_queue LIMIT 10'
    );

    for (const task of pendingTasks) {
      try {
        await this.uploadResult(task);
        await db.execute(
          'UPDATE task_logs SET uploaded_to_cloud = 1 WHERE task_id = ?',
          [task.task_id]
        );
      } catch (error) {
        await db.execute(
          'UPDATE task_logs SET upload_attempts = upload_attempts + 1, last_upload_attempt = ? WHERE task_id = ?',
          [Date.now(), task.task_id]
        );
      }
    }
  }

  // Retry with exponential backoff
  getRetryDelay(attemptCount: number): number {
    return Math.min(1000 * Math.pow(2, attemptCount), 60000);
  }
}
```

---

## Coordinator Implementation Plan

### **Architecture: Extend Relay Server**

```
gpteeRelay/
├── src/
│   ├── server.ts                 (existing - WebSocket server)
│   ├── types.ts                  (extend with image analysis types)
│   ├── coordinators/
│   │   ├── ImageAnalysisCoordinator.ts  (NEW - main coordinator)
│   │   ├── WorkerRegistry.ts            (NEW - worker lifecycle management)
│   │   ├── TaskQueue.ts                 (NEW - priority queue with retry)
│   │   └── LoadBalancer.ts              (NEW - intelligent task assignment)
│   ├── storage/
│   │   ├── DynamoDBClient.ts            (NEW - DynamoDB abstraction)
│   │   └── RedisClient.ts               (NEW - optional, for task queue)
│   └── monitoring/
│       ├── MetricsCollector.ts          (NEW - analytics)
│       └── HealthMonitor.ts             (NEW - worker health checks)
```

### **ImageAnalysisCoordinator.ts - Core Logic**

```typescript
class ImageAnalysisCoordinator {
  private workerRegistry: WorkerRegistry;
  private taskQueue: TaskQueue;
  private loadBalancer: LoadBalancer;
  private dynamoClient: DynamoDBClient;
  private metricsCollector: MetricsCollector;

  // ===== Task Distribution =====

  async submitTask(
    imageId: string,
    imageUrl: string,
    analysisType: string,
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<string> {
    // Create task
    const task = {
      taskId: uuidv4(),
      imageId,
      imageUrl,
      analysisType,
      priority,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3
    };

    // Check for duplicates
    const existing = await this.taskQueue.findByImageId(imageId);
    if (existing) return existing.taskId;

    // Enqueue
    await this.taskQueue.enqueue(task);
    await this.assignTasks();  // Try immediate assignment

    return task.taskId;
  }

  async assignTasks(): Promise<void> {
    const pendingTasks = await this.taskQueue.getPending();

    for (const task of pendingTasks) {
      const worker = await this.loadBalancer.selectBestWorker(task);

      if (!worker) {
        console.log(`No available worker for task ${task.taskId}`);
        continue;
      }

      // Send task to worker
      await this.sendMessage(worker.workerId, {
        type: 'task_assign',
        to: worker.workerId,
        ...task
      });

      // Update task status
      await this.taskQueue.markAssigned(task.taskId, worker.workerId);

      // Set timeout
      this.setTaskTimeout(task.taskId, task.timeout || 30000);
    }
  }

  // ===== Worker Management =====

  async registerWorker(workerId: string, info: WorkerInfo): Promise<void> {
    await this.workerRegistry.register(workerId, info);
    await this.dynamoClient.writeWorkerMetrics(workerId, info);

    console.log(`Worker registered: ${workerId} (${info.deviceName})`);

    // Try to assign pending tasks
    await this.assignTasks();
  }

  async deregisterWorker(workerId: string): Promise<void> {
    // Reassign active tasks
    const activeTasks = await this.taskQueue.getByWorkerId(workerId);
    for (const task of activeTasks) {
      await this.taskQueue.markFailed(task.taskId, 'WORKER_OFFLINE');
      await this.retryTask(task);
    }

    await this.workerRegistry.deregister(workerId);
    console.log(`Worker deregistered: ${workerId}`);
  }

  async updateWorkerStatus(workerId: string, status: WorkerStatus): Promise<void> {
    await this.workerRegistry.updateStatus(workerId, status);

    // Check if worker became unavailable
    if (!status.availableForWork) {
      await this.handleWorkerUnavailable(workerId);
    }
  }

  // ===== Result Handling =====

  async processResult(result: TaskResult): Promise<void> {
    const task = await this.taskQueue.getById(result.taskId);

    if (!task) {
      console.error(`Unknown task: ${result.taskId}`);
      return;
    }

    // Validate result
    if (!this.validateResult(result)) {
      console.error(`Invalid result for task: ${result.taskId}`);
      await this.retryTask(task);
      return;
    }

    // Store results in DynamoDB
    await this.dynamoClient.writeAnalysisResults(result);

    // Update task status
    await this.taskQueue.markCompleted(result.taskId);

    // Update metrics
    this.metricsCollector.recordTaskCompletion(task, result);

    console.log(`Task completed: ${result.taskId} (${result.detectionsFound} detections)`);
  }

  async processError(taskId: string, error: TaskError): Promise<void> {
    const task = await this.taskQueue.getById(taskId);

    if (!task) return;

    // Log error
    await this.dynamoClient.writeTaskLog(taskId, {
      status: 'failed',
      errorCode: error.errorCode,
      errorMessage: error.errorMessage
    });

    // Retry if retryable
    if (error.retryable && task.retryCount < task.maxRetries) {
      await this.retryTask(task);
    } else {
      await this.taskQueue.markFailed(taskId, error.errorCode);
    }
  }

  // ===== Load Balancing =====

  private async retryTask(task: Task): Promise<void> {
    task.retryCount++;

    // Exponential backoff
    const delayMs = Math.min(1000 * Math.pow(2, task.retryCount), 60000);

    setTimeout(async () => {
      await this.taskQueue.enqueue(task);
      await this.assignTasks();
    }, delayMs);
  }

  private setTaskTimeout(taskId: string, timeoutMs: number): void {
    setTimeout(async () => {
      const task = await this.taskQueue.getById(taskId);

      if (task && task.status === 'assigned') {
        console.log(`Task timeout: ${taskId}`);
        await this.processError(taskId, {
          errorCode: 'TIMEOUT',
          errorMessage: `Task exceeded timeout (${timeoutMs}ms)`,
          retryable: true
        });
      }
    }, timeoutMs);
  }

  private validateResult(result: TaskResult): boolean {
    // Schema validation
    if (!result.detectionsFound || result.detectionsFound < 0) return false;
    if (!result.detections || !Array.isArray(result.detections)) return false;

    // Confidence threshold
    for (const detection of result.detections) {
      if (detection.confidence < 0.3) return false;
    }

    return true;
  }

  // ===== Health Monitoring =====

  async monitorWorkerHealth(): void {
    setInterval(async () => {
      const workers = await this.workerRegistry.getAll();

      for (const worker of workers) {
        const timeSinceLastHeartbeat = Date.now() - worker.lastHeartbeat;

        if (timeSinceLastHeartbeat > 90000) {  // 90s timeout
          console.log(`Worker timeout: ${worker.workerId}`);
          await this.deregisterWorker(worker.workerId);
        }
      }
    }, 30000);  // Check every 30s
  }
}
```

### **LoadBalancer.ts - Intelligent Task Assignment**

```typescript
class LoadBalancer {
  constructor(private workerRegistry: WorkerRegistry) {}

  async selectBestWorker(task: Task): Promise<Worker | null> {
    const availableWorkers = await this.workerRegistry.getAvailable();

    if (availableWorkers.length === 0) return null;

    // Filter by capability
    const capableWorkers = availableWorkers.filter(w =>
      w.supportedModels.includes(task.analysisType)
    );

    if (capableWorkers.length === 0) return null;

    // Score each worker
    const scoredWorkers = capableWorkers.map(worker => ({
      worker,
      score: this.calculateWorkerScore(worker, task)
    }));

    // Sort by score (higher is better)
    scoredWorkers.sort((a, b) => b.score - a.score);

    return scoredWorkers[0].worker;
  }

  private calculateWorkerScore(worker: Worker, task: Task): number {
    let score = 100;

    // Thermal penalty
    const thermalPenalty = {
      nominal: 0,
      light: -5,
      moderate: -20,
      severe: -50,
      critical: -100
    };
    score += thermalPenalty[worker.thermalStatus];

    // Battery penalty
    if (worker.batteryLevel < 20) score -= 30;
    else if (worker.batteryLevel < 50) score -= 10;

    // Workload penalty
    const workloadRatio = worker.currentConcurrentTasks / worker.maxConcurrentTasks;
    score -= workloadRatio * 20;

    // Performance bonus (faster workers get higher score)
    const performanceBonus = Math.max(0, (1000 - worker.avgProcessingTimeMs) / 100);
    score += performanceBonus;

    // Hardware acceleration bonus
    if (worker.hardwareAcceleration.includes('qnn')) score += 10;
    else if (worker.hardwareAcceleration.includes('nnapi')) score += 5;

    // Network quality bonus
    const networkBonus = {
      excellent: 10,
      good: 5,
      fair: -5,
      poor: -20
    };
    score += networkBonus[worker.networkQuality];

    return score;
  }
}
```

---

## Mobile Worker Implementation Plan

### **Phase 1: Add Worker Services**

```
GpteeMobile/src/services/
├── vision/
│   ├── VisionModelService.ts         (existing - FaceRecognitionService renamed)
│   ├── VisionWorkerService.ts        (NEW - manages worker mode)
│   └── ModelRegistry.ts              (NEW - dynamic model loading)
├── health/
│   ├── ThermalMonitorService.ts      (NEW - thermal monitoring)
│   ├── BatteryMonitorService.ts      (NEW - battery monitoring)
│   └── NetworkMonitorService.ts      (NEW - network quality)
├── storage/
│   ├── TaskLogService.ts             (NEW - local SQLite logging)
│   └── OfflineQueueService.ts        (NEW - offline result queue)
└── coordination/
    ├── CoordinatorClient.ts          (NEW - WebSocket client for coordinator)
    └── TaskScheduler.ts              (NEW - local task scheduling)
```

### **Phase 2: Add Worker UI**

```
GpteeMobile/src/screens/
├── WorkerModeScreen.tsx              (NEW - toggle & monitor worker mode)
├── TaskLogsScreen.tsx                (NEW - view local task history)
└── WorkerDashboardScreen.tsx         (NEW - real-time stats, health metrics)
```

### **VisionWorkerService.ts - Main Worker Logic**

```typescript
class VisionWorkerService {
  private workerId: string;
  private coordinatorClient: CoordinatorClient;
  private visionModelService: VisionModelService;
  private taskScheduler: TaskScheduler;
  private thermalMonitor: ThermalMonitorService;
  private isActive: boolean = false;

  async startWorkerMode(): Promise<void> {
    // Load vision models
    await this.visionModelService.loadModels(['face_detection', 'age_gender']);

    // Connect to coordinator
    await this.coordinatorClient.connect();

    // Register as worker
    await this.register();

    // Start health monitoring
    this.thermalMonitor.startMonitoring(5000);
    this.thermalMonitor.onThermalStatusChanged(status => this.handleThermalChange(status));

    // Start heartbeat
    this.startHeartbeat();

    this.isActive = true;
  }

  async stopWorkerMode(): Promise<void> {
    // Deregister
    await this.deregister();

    // Stop monitoring
    this.thermalMonitor.stopMonitoring();

    // Disconnect
    await this.coordinatorClient.disconnect();

    // Unload models
    await this.visionModelService.unloadModels();

    this.isActive = false;
  }

  private async register(): Promise<void> {
    const deviceInfo = await DeviceInfo.getDeviceInfo();
    const batteryLevel = await BatteryMonitor.getLevel();
    const thermalStatus = await this.thermalMonitor.getCurrentStatus();

    await this.coordinatorClient.send({
      type: 'worker_register',
      workerId: this.workerId,
      workerInfo: {
        deviceName: deviceInfo.deviceName,
        deviceModel: deviceInfo.model,
        platform: 'android',
        osVersion: deviceInfo.osVersion,
        chipVendor: this.detectChipVendor(),
        thermalStatus,
        batteryLevel,
        networkType: 'wifi',
        modelsLoaded: {
          face_detection: true,
          object_detection: false
        },
        hardwareAcceleration: ['qnn', 'cpu'],
        maxConcurrentTasks: 2,
        maxImageResolution: 6000000
      }
    });
  }

  private async handleTaskAssignment(task: TaskAssignMessage): Promise<void> {
    // Check if we can accept
    const canAccept = await this.taskScheduler.shouldAcceptTask(task);

    if (!canAccept) {
      await this.coordinatorClient.send({
        type: 'task_reject',
        taskId: task.taskId,
        workerId: this.workerId,
        reason: 'overloaded'
      });
      return;
    }

    // Accept task
    await this.coordinatorClient.send({
      type: 'task_accept',
      taskId: task.taskId,
      workerId: this.workerId,
      estimatedCompletionMs: 5000
    });

    // Process task
    try {
      const result = await this.processTask(task);

      // Send result
      await this.coordinatorClient.send({
        type: 'task_result',
        ...result
      });

      // Log locally
      await TaskLogService.markCompleted(task.taskId, result);

    } catch (error) {
      await this.coordinatorClient.send({
        type: 'task_error',
        taskId: task.taskId,
        workerId: this.workerId,
        errorCode: 'MODEL_ERROR',
        errorMessage: error.message,
        retryable: true
      });

      await TaskLogService.markFailed(task.taskId, error);
    }
  }

  private async processTask(task: TaskAssignMessage): Promise<TaskResult> {
    const startTime = Date.now();
    const thermalStart = await this.thermalMonitor.getCurrentStatus();

    // Download image
    const imagePath = await this.downloadImage(task.imageUrl);

    // Analyze image
    const detections = await this.visionModelService.analyzeImage(
      imagePath,
      task.analysisType
    );

    const processingTime = Date.now() - startTime;
    const thermalEnd = await this.thermalMonitor.getCurrentStatus();

    return {
      taskId: task.taskId,
      imageId: task.imageId,
      imageName: task.imageName,
      analysisType: task.analysisType,
      detectionsFound: detections.length,
      detections,
      processingTimeMs: processingTime,
      thermalStatus: thermalEnd,
      hardwareAccelerator: 'qnn',
      modelVersions: {
        detection: 'retinaface_mv2',
        analysis: 'buffalo_l_genderage'
      }
    };
  }
}
```

---

## Implementation Roadmap

### **Sprint 1: Foundation** (Week 1)
- [ ] Extend relay types with generic image analysis messages
- [ ] Implement ImageAnalysisCoordinator class
- [ ] Implement WorkerRegistry and TaskQueue
- [ ] Create DynamoDB tables (analysis_results, worker_metrics, task_logs)
- [ ] Add DynamoDB client to relay

### **Sprint 2: Worker Core** (Week 1-2)
- [ ] Rename FaceRecognitionService → VisionModelService
- [ ] Implement VisionWorkerService
- [ ] Implement ThermalMonitorService
- [ ] Implement BatteryMonitorService
- [ ] Implement TaskLogService with SQLite
- [ ] Worker registration/deregistration flow

### **Sprint 3: Task Processing** (Week 2)
- [ ] Image download/caching pipeline
- [ ] Task scheduling with priority queue
- [ ] Result reporting to coordinator
- [ ] Offline queue with retry logic
- [ ] Thermal-based pause/resume
- [ ] Task timeout handling

### **Sprint 4: Load Balancing & Intelligence** (Week 2-3)
- [ ] Implement LoadBalancer with scoring algorithm
- [ ] Worker capability matching
- [ ] Dynamic task reassignment on worker failure
- [ ] Heartbeat monitoring (30s interval, 90s timeout)
- [ ] Worker health checks

### **Sprint 5: Mode Switching** (Week 3)
- [ ] LLM ↔ Vision mode toggle
- [ ] Memory management (unload/load models)
- [ ] UI for mode selection (WorkerModeScreen)
- [ ] State persistence across app restarts
- [ ] Graceful mode transition (complete in-flight tasks)

### **Sprint 6: Monitoring & Analytics** (Week 3-4)
- [ ] Worker metrics dashboard (relay)
- [ ] Task logs viewer (mobile - TaskLogsScreen)
- [ ] Real-time analytics (MetricsCollector)
- [ ] Performance optimization (batch writes, connection pooling)
- [ ] Error tracking and alerting

### **Sprint 7: Advanced Features** (Week 4+)
- [ ] Task deduplication (skip already processed images)
- [ ] Result caching (avoid reprocessing same image)
- [ ] A/B testing framework (test different models)
- [ ] Cost analytics (worker utilization, task distribution)
- [ ] Auto-scaling (add/remove workers based on queue depth)

---

## Advanced Features

### **1. Task Deduplication**

```typescript
class TaskDeduplicator {
  async checkDuplicate(imageId: string): Promise<Task | null> {
    // Check DynamoDB for existing result
    const existing = await dynamoClient.query('analysis_results', {
      image_id: imageId,
      limit: 1
    });

    if (existing.length > 0) {
      console.log(`Skipping duplicate image: ${imageId}`);
      return null;
    }

    // Check pending tasks
    return await taskQueue.findByImageId(imageId);
  }
}
```

### **2. Result Caching**

```typescript
class ResultCache {
  private cache: Map<string, AnalysisResult> = new Map();
  private ttl: number = 3600000;  // 1 hour

  async get(imageId: string): Promise<AnalysisResult | null> {
    const cached = this.cache.get(imageId);

    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached;
    }

    // Check DynamoDB
    const fromDb = await dynamoClient.getAnalysisResult(imageId);
    if (fromDb) {
      this.cache.set(imageId, fromDb);
      return fromDb;
    }

    return null;
  }

  async set(imageId: string, result: AnalysisResult): Promise<void> {
    this.cache.set(imageId, { ...result, timestamp: Date.now() });
  }
}
```

### **3. A/B Testing Framework**

```typescript
class ABTestingFramework {
  async assignModelVariant(task: Task): Promise<string> {
    // 10% of tasks use experimental model
    const variant = Math.random() < 0.1 ? 'experimental' : 'production';

    await dynamoClient.writeTaskLog(task.taskId, {
      abTestVariant: variant
    });

    return variant;
  }

  async compareVariants(): Promise<ABTestResults> {
    const results = await dynamoClient.query('task_logs', {
      groupBy: 'abTestVariant',
      metrics: ['avg_processing_time_ms', 'success_rate']
    });

    return {
      production: results.production,
      experimental: results.experimental,
      improvement: (results.experimental.avg_processing_time_ms - results.production.avg_processing_time_ms) / results.production.avg_processing_time_ms
    };
  }
}
```

### **4. Auto-Scaling**

```typescript
class AutoScaler {
  async checkScaling(): Promise<void> {
    const queueDepth = await taskQueue.getPendingCount();
    const activeWorkers = await workerRegistry.getAvailableCount();

    const queuePerWorker = activeWorkers > 0 ? queueDepth / activeWorkers : queueDepth;

    if (queuePerWorker > 10) {
      // Queue too deep, need more workers
      await this.sendWorkerRecruitmentNotification();
    } else if (queuePerWorker < 2 && activeWorkers > 3) {
      // Overcapacity, suggest workers can go idle
      await this.sendWorkerIdleNotification();
    }
  }
}
```

---

## Security Considerations

1. **Authentication**: Workers authenticate with coordinator using device-specific tokens (JWT)
2. **Image URLs**: Use S3 presigned URLs with 1-hour expiration
3. **Data Privacy**: No image data stored on relay, only metadata and results
4. **Worker Validation**: Verify worker device signatures before accepting results
5. **Rate Limiting**: Prevent abuse by limiting tasks per worker (max 100 tasks/hour)
6. **Result Integrity**: Validate result schema and confidence thresholds
7. **Secure WebSocket**: Use WSS (TLS) for coordinator-worker communication
8. **API Keys**: Store DynamoDB credentials securely (AWS IAM roles, not hardcoded)

---

## Performance Optimizations

1. **Batch Writes**: Batch DynamoDB writes (up to 25 items per request)
2. **Connection Pooling**: Reuse WebSocket connections
3. **Image Caching**: Cache downloaded images temporarily on device
4. **Model Sharing**: Share ONNX model instances across tasks (memory optimization)
5. **Lazy Loading**: Load models on-demand, not at app startup
6. **Compression**: Use gzip for WebSocket messages >1KB
7. **Prefetching**: Prefetch next task's image while processing current task

---

## Monitoring & Observability

### **Key Metrics**

- **Task Throughput**: Tasks completed per second
- **Task Latency**: p50, p95, p99 processing times
- **Worker Availability**: % of time workers are available
- **Error Rate**: Failed tasks / total tasks
- **Retry Rate**: Retried tasks / total tasks
- **Worker Utilization**: Active tasks / max concurrent tasks
- **Thermal Events**: Frequency of thermal throttling
- **Network Quality**: Distribution of network types (wifi vs cellular)

### **Dashboards**

1. **Coordinator Dashboard** (relay server):
   - Real-time worker pool status
   - Task queue depth over time
   - Error rate by error code
   - Worker performance leaderboard

2. **Worker Dashboard** (mobile app):
   - Tasks completed today
   - Earnings (if monetized)
   - Thermal/battery history
   - Network usage

---

## Next Steps

1. **Design Review**: Validate architecture with team
2. **Prototype**: Build minimal coordinator + 1 worker (Sprint 1-2)
3. **Test**: Verify end-to-end flow with sample images
4. **Scale**: Add load balancing and fault tolerance (Sprint 3-4)
5. **Monitor**: Add observability (Sprint 6)
6. **Optimize**: Performance tuning and cost optimization (Sprint 7)
