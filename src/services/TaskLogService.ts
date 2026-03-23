import SQLite, { SQLiteDatabase } from 'react-native-sqlite-storage';
import { ThermalStatus } from './ThermalMonitorService';

SQLite.enablePromise(true);

export interface TaskLog {
  taskId: string;
  imageId: string;
  imageName: string;
  imageUrl: string;
  analysisType: string;
  priority: string;

  // Timestamps
  assignedAt: number;
  startedAt?: number;
  completedAt?: number;

  // Status
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'timeout';

  // Results
  detectionsFound?: number;
  processingTimeMs?: number;

  // Health context
  thermalStatusStart?: string;
  thermalStatusEnd?: string;
  batteryLevelStart?: number;
  batteryLevelEnd?: number;

  // Error tracking
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;

  // Upload tracking
  uploadedToCloud: boolean;
  uploadAttempts: number;
  lastUploadAttempt?: number;

  // Metadata
  createdAt: number;
  updatedAt: number;
}

export interface TaskStatistics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalDetections: number;
  avgProcessingTimeMs: number;
}

export class TaskLogService {
  private static instance: TaskLogService;
  private db: SQLiteDatabase | null = null;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): TaskLogService {
    if (!TaskLogService.instance) {
      TaskLogService.instance = new TaskLogService();
    }
    return TaskLogService.instance;
  }

  /**
   * Initialize the database
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('[TaskLogService] Initializing database');
      this.db = await SQLite.openDatabase({
        name: 'image_worker.db',
        location: 'default',
      });

      await this.createTables();
      this.initialized = true;
      console.log('[TaskLogService] Database initialized');
    } catch (error) {
      console.error('[TaskLogService] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS task_logs (
        task_id TEXT PRIMARY KEY,
        image_id TEXT NOT NULL,
        image_name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        analysis_type TEXT NOT NULL,
        priority TEXT NOT NULL,

        assigned_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,

        status TEXT NOT NULL,

        detections_found INTEGER,
        processing_time_ms INTEGER,

        thermal_status_start TEXT,
        thermal_status_end TEXT,
        battery_level_start INTEGER,
        battery_level_end INTEGER,

        error_message TEXT,
        error_code TEXT,
        retry_count INTEGER DEFAULT 0,

        uploaded_to_cloud INTEGER DEFAULT 0,
        upload_attempts INTEGER DEFAULT 0,
        last_upload_attempt INTEGER,

        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
    `;

    const createIndexes = `
      CREATE INDEX IF NOT EXISTS idx_status ON task_logs(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_uploaded ON task_logs(uploaded_to_cloud, completed_at);
      CREATE INDEX IF NOT EXISTS idx_failed ON task_logs(status, retry_count);
    `;

    await this.db.executeSql(createTableSQL);
    await this.db.executeSql(createIndexes);
  }

  /**
   * Insert a new task log
   */
  public async insertTask(task: Partial<TaskLog> & {
    taskId: string;
    imageId: string;
    imageName: string;
    imageUrl: string;
    analysisType: string;
    priority: string;
  }): Promise<void> {
    if (!this.db) await this.initialize();

    const now = Date.now();
    const sql = `
      INSERT INTO task_logs (
        task_id, image_id, image_name, image_url, analysis_type, priority,
        assigned_at, status, thermal_status_start, battery_level_start,
        retry_count, uploaded_to_cloud, upload_attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await this.db!.executeSql(sql, [
      task.taskId,
      task.imageId,
      task.imageName,
      task.imageUrl,
      task.analysisType,
      task.priority,
      task.assignedAt || now,
      task.status || 'pending',
      task.thermalStatusStart || null,
      task.batteryLevelStart || null,
      task.retryCount || 0,
      0, // uploadedToCloud
      0, // uploadAttempts
      now,
      now,
    ]);

    console.log(`[TaskLogService] Inserted task: ${task.taskId}`);
  }

  /**
   * Update task status to processing
   */
  public async markProcessing(taskId: string, thermalStatus?: ThermalStatus): Promise<void> {
    if (!this.db) await this.initialize();

    const sql = `
      UPDATE task_logs
      SET status = 'processing', started_at = ?, thermal_status_start = ?, updated_at = ?
      WHERE task_id = ?
    `;

    await this.db!.executeSql(sql, [Date.now(), thermalStatus || null, Date.now(), taskId]);
  }

  /**
   * Mark task as completed
   */
  public async markCompleted(
    taskId: string,
    result: {
      detectionsFound: number;
      processingTimeMs: number;
      thermalStatusEnd?: ThermalStatus;
      batteryLevelEnd?: number;
    }
  ): Promise<void> {
    if (!this.db) await this.initialize();

    const sql = `
      UPDATE task_logs
      SET status = 'completed',
          completed_at = ?,
          detections_found = ?,
          processing_time_ms = ?,
          thermal_status_end = ?,
          battery_level_end = ?,
          updated_at = ?
      WHERE task_id = ?
    `;

    await this.db!.executeSql(sql, [
      Date.now(),
      result.detectionsFound,
      result.processingTimeMs,
      result.thermalStatusEnd || null,
      result.batteryLevelEnd || null,
      Date.now(),
      taskId,
    ]);

    console.log(`[TaskLogService] Marked completed: ${taskId}`);
  }

  /**
   * Mark task as failed
   */
  public async markFailed(
    taskId: string,
    error: { errorCode: string; errorMessage: string; thermalStatusEnd?: ThermalStatus }
  ): Promise<void> {
    if (!this.db) await this.initialize();

    const sql = `
      UPDATE task_logs
      SET status = 'failed',
          completed_at = ?,
          error_code = ?,
          error_message = ?,
          thermal_status_end = ?,
          updated_at = ?
      WHERE task_id = ?
    `;

    await this.db!.executeSql(sql, [
      Date.now(),
      error.errorCode,
      error.errorMessage,
      error.thermalStatusEnd || null,
      Date.now(),
      taskId,
    ]);

    console.log(`[TaskLogService] Marked failed: ${taskId} - ${error.errorCode}`);
  }

  /**
   * Mark task as uploaded to cloud
   */
  public async markUploaded(taskId: string): Promise<void> {
    if (!this.db) await this.initialize();

    const sql = `
      UPDATE task_logs
      SET uploaded_to_cloud = 1, updated_at = ?
      WHERE task_id = ?
    `;

    await this.db!.executeSql(sql, [Date.now(), taskId]);
  }

  /**
   * Increment upload attempt
   */
  public async incrementUploadAttempt(taskId: string): Promise<void> {
    if (!this.db) await this.initialize();

    const sql = `
      UPDATE task_logs
      SET upload_attempts = upload_attempts + 1,
          last_upload_attempt = ?,
          updated_at = ?
      WHERE task_id = ?
    `;

    await this.db!.executeSql(sql, [Date.now(), Date.now(), taskId]);
  }

  /**
   * Get pending uploads (offline queue)
   */
  public async getPendingUploads(limit: number = 10): Promise<TaskLog[]> {
    if (!this.db) await this.initialize();

    const sql = `
      SELECT * FROM task_logs
      WHERE uploaded_to_cloud = 0
        AND status IN ('completed', 'failed')
        AND upload_attempts < 3
      ORDER BY priority DESC, completed_at ASC
      LIMIT ?
    `;

    const [result] = await this.db!.executeSql(sql, [limit]);
    return this.mapRowsToTaskLogs(result.rows);
  }

  /**
   * Get recent task logs
   */
  public async getRecentTasks(limit: number = 50): Promise<TaskLog[]> {
    if (!this.db) await this.initialize();

    const sql = `
      SELECT * FROM task_logs
      ORDER BY created_at DESC
      LIMIT ?
    `;

    const [result] = await this.db!.executeSql(sql, [limit]);
    return this.mapRowsToTaskLogs(result.rows);
  }

  /**
   * Get task statistics
   */
  public async getStatistics(): Promise<TaskStatistics> {
    if (!this.db) await this.initialize();

    const sql = `
      SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks,
        SUM(COALESCE(detections_found, 0)) as total_detections,
        AVG(CASE WHEN processing_time_ms IS NOT NULL THEN processing_time_ms ELSE NULL END) as avg_processing_time_ms
      FROM task_logs
    `;

    const [result] = await this.db!.executeSql(sql);
    const row = result.rows.item(0);

    return {
      totalTasks: row.total_tasks || 0,
      completedTasks: row.completed_tasks || 0,
      failedTasks: row.failed_tasks || 0,
      totalDetections: row.total_detections || 0,
      avgProcessingTimeMs: row.avg_processing_time_ms || 0,
    };
  }

  /**
   * Delete old tasks (cleanup)
   */
  public async deleteOldTasks(olderThanDays: number = 30): Promise<number> {
    if (!this.db) await this.initialize();

    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const sql = `
      DELETE FROM task_logs
      WHERE completed_at < ? AND uploaded_to_cloud = 1
    `;

    const [result] = await this.db!.executeSql(sql, [cutoffTime]);
    console.log(`[TaskLogService] Deleted ${result.rowsAffected} old tasks`);
    return result.rowsAffected;
  }

  /**
   * Close database connection
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[TaskLogService] Database closed');
    }
  }

  /**
   * Map SQLite rows to TaskLog objects
   */
  private mapRowsToTaskLogs(rows: any): TaskLog[] {
    const tasks: TaskLog[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows.item(i);
      tasks.push({
        taskId: row.task_id,
        imageId: row.image_id,
        imageName: row.image_name,
        imageUrl: row.image_url,
        analysisType: row.analysis_type,
        priority: row.priority,
        assignedAt: row.assigned_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        detectionsFound: row.detections_found,
        processingTimeMs: row.processing_time_ms,
        thermalStatusStart: row.thermal_status_start,
        thermalStatusEnd: row.thermal_status_end,
        batteryLevelStart: row.battery_level_start,
        batteryLevelEnd: row.battery_level_end,
        errorMessage: row.error_message,
        errorCode: row.error_code,
        retryCount: row.retry_count,
        uploadedToCloud: row.uploaded_to_cloud === 1,
        uploadAttempts: row.upload_attempts,
        lastUploadAttempt: row.last_upload_attempt,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    return tasks;
  }
}
