/**
 * Application Configuration
 *
 * Centralized configuration for environment-specific settings.
 * Update these values based on your network and deployment environment.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Network Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base server hostname/IP
 * Change this value for different environments:
 * - Development: 'localhost' or local network IP (e.g., '192.168.0.66')
 * - Production: Your deployed server IP or domain (e.g., 'api.gptee.ai')
 */
const SERVER_HOST = 'api.gptee.ai';

/**
 * Relay Server WebSocket URL
 * This is the main relay server for P2P communication and provider discovery.
 * Uses secure WebSocket (wss) via ALB/HTTPS
 */
export const RELAY_SERVER_URL = `wss://${SERVER_HOST}`;

/**
 * Backend API Base URL
 * This is the HTTP REST API endpoint for authentication and data sync.
 * Uses HTTPS via ALB (port 443 - standard HTTPS port, handled by ALB)
 */
export const API_BASE_URL = `https://${SERVER_HOST}/api`;

/**
 * Image Worker Coordinator WebSocket URL
 * This is the coordinator server for distributed image analysis tasks.
 *
 * For now, this points to the same relay server but could be separate
 * in a production deployment.
 */
export const COORDINATOR_URL = `wss://${SERVER_HOST}`;

// ═══════════════════════════════════════════════════════════════════════════
// Worker Configuration
// ═══════════════════════════════════════════════════════════════════════════

export const WORKER_CONFIG = {
  /**
   * Maximum number of concurrent image processing tasks
   */
  maxConcurrentTasks: 8,

  /**
   * Maximum image resolution in pixels (e.g., 6MP = 6,000,000 pixels)
   */
  maxImageResolution: 6_000_000,

  /**
   * Heartbeat interval in milliseconds
   */
  heartbeatIntervalMs: 30_000, // 30 seconds

  /**
   * Status update interval in milliseconds
   */
  statusUpdateIntervalMs: 60_000, // 60 seconds

  /**
   * Minimum battery level to accept tasks (percentage)
   */
  minBatteryLevel: 20,
};

// ═══════════════════════════════════════════════════════════════════════════
// Feature Flags
// ═══════════════════════════════════════════════════════════════════════════

export const FEATURES = {
  /**
   * Enable debug logging
   */
  debugLogging: process.env.NODE_ENV === 'production',

  /**
   * Enable thermal monitoring
   */
  thermalMonitoring: true,

  /**
   * Enable image worker mode
   */
  imageWorkerMode: true,

  /**
   * Enable provider mode
   */
  providerMode: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// App Metadata
// ═══════════════════════════════════════════════════════════════════════════

export const APP_INFO = {
  name: 'GPTee',
  tagline: 'gpt for everyone, free.',
  version: '1.0.0',
  network: 'p2p ai inference network',
};

// ═══════════════════════════════════════════════════════════════════════════
// Export all config as default for convenience
// ═══════════════════════════════════════════════════════════════════════════

export default {
  RELAY_SERVER_URL,
  API_BASE_URL,
  COORDINATOR_URL,
  WORKER_CONFIG,
  FEATURES,
  APP_INFO,
};
