# Node Settings & Statistics Integration

## Overview

Integrated two new backend APIs for managing node configuration and performance tracking:

1. **Node Settings API** - Persistent configuration (worker mode, provider mode, battery threshold)
2. **Node Statistics API** - Performance metrics (requests served, tokens generated, uptime, etc.)

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         LOGIN                                │
│  handleAuthSuccess() → loadNodeSettings() + loadNodeStats() │
│           ↓                                                  │
│   Backend API → appStore → AsyncStorage (cache)             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    SETTINGS UPDATE                           │
│  User changes setting → updateNodeSettings()                 │
│           ↓                                                  │
│   Backend API (PUT) → appStore → AsyncStorage → UI updates  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    STATS TRACKING                            │
│  Local stats (nodeStats) → Periodic sync every 5 min        │
│           ↓                                                  │
│   Backend API (PUT) → backendNodeStats → AsyncStorage       │
└─────────────────────────────────────────────────────────────┘
```

### Storage Strategy

| Data | Location | Sync Strategy |
|------|----------|---------------|
| `nodeSettings` | Backend + AsyncStorage | Load on login, update immediately on change |
| `backendNodeStats` | Backend + AsyncStorage | Load on login, sync every 5 minutes |
| `nodeStats` (local) | appStore only | Real-time tracking, source for backend sync |

## Files Created

### 1. `src/services/NodeSettingsService.ts`

Handles all node settings operations:

```typescript
export interface NodeSettings {
  node_id: string;
  worker_mode_enabled: boolean;
  provider_mode_enabled: boolean;
  battery_threshold: number;
  worker_mode_updated_at?: string;
  provider_mode_updated_at?: string;
  created_at?: string;
  updated_at?: string;
}

// Functions
fetchNodeSettings(nodeId: string): Promise<NodeSettings>
updateNodeSettings(payload: UpdateNodeSettingsPayload): Promise<NodeSettings>
loadCachedSettings(): Promise<NodeSettings | null>
clearCachedSettings(): Promise<void>
```

**AsyncStorage Key:** `'node_settings'`

### 2. `src/services/NodeStatsService.ts`

Handles all node statistics operations:

```typescript
export interface NodeStats {
  node_id: string;
  served_requests: number;
  tokens_generated: number;
  self_requests: number;
  session_uptime: number; // seconds
  peak_t_s: number; // peak tokens/sec
  avg_t_s: number; // average tokens/sec
  low_t_s: number; // lowest tokens/sec
  response_avg_time: number; // milliseconds
  created_at?: string;
  updated_at?: string;
}

// Functions
fetchNodeStats(nodeId: string): Promise<NodeStats>
updateNodeStats(payload: UpdateNodeStatsPayload): Promise<NodeStats>
loadCachedStats(): Promise<NodeStats | null>
saveCachedStats(stats: NodeStats): Promise<void>
clearCachedStats(): Promise<void>
startPeriodicSync(getStatsCallback: () => NodeStats): void
stopPeriodicSync(): void
forceSyncNow(stats: NodeStats): Promise<void>
```

**AsyncStorage Key:** `'node_stats'`

**Sync Interval:** 5 minutes (300000ms)

## appStore Integration

### New State Fields

```typescript
interface AppState {
  // ... existing fields ...

  // Node settings (synced with backend)
  nodeSettings: NodeSettings | null;

  // Node statistics (synced with backend periodically)
  backendNodeStats: NodeStats | null;
}
```

### New Actions

#### Settings Actions

```typescript
// Load settings from backend (called on login)
loadNodeSettings(): Promise<void>

// Update settings and sync to backend
updateNodeSettings(settings: Partial<NodeSettings>): Promise<void>

// Direct setter
setNodeSettings(settings: NodeSettings | null): void
```

#### Stats Actions

```typescript
// Load stats from backend (called on login)
loadNodeStats(): Promise<void>

// Sync local stats to backend (called periodically)
syncNodeStats(): Promise<void>

// Direct setter
setBackendNodeStats(stats: NodeStats | null): void

// Update single stat value
updateLocalNodeStat(key: keyof NodeStats, value: number): void
```

## Usage Examples

### 1. Load Settings on Login

This happens automatically in `handleAuthSuccess()`:

```typescript
// In handleAuthSuccess()
await Promise.all([
  get().loadNodeSettings(),
  get().loadNodeStats(),
]);
```

### 2. Update Worker Mode Setting

```typescript
import { useAppStore } from '../store/appStore';

const toggleWorkerMode = async () => {
  const { updateNodeSettings, nodeSettings } = useAppStore.getState();

  await updateNodeSettings({
    worker_mode_enabled: !nodeSettings?.worker_mode_enabled,
  });

  // Settings are now:
  // 1. Saved to backend
  // 2. Updated in appStore
  // 3. Cached in AsyncStorage
  // 4. imageWorkerEnabled state updated automatically
};
```

### 3. Update Provider Mode & Battery Threshold

```typescript
const updateProviderSettings = async () => {
  await updateNodeSettings({
    provider_mode_enabled: true,
    battery_threshold: 30,
  });

  // Automatically updates:
  // - appStore.providerModeEnabled
  // - appStore.batteryThreshold
};
```

### 4. Read Settings in UI

```typescript
import { useAppStore } from '../store/appStore';

function SettingsScreen() {
  const nodeSettings = useAppStore(s => s.nodeSettings);

  return (
    <View>
      <Text>Worker Mode: {nodeSettings?.worker_mode_enabled ? 'ON' : 'OFF'}</Text>
      <Text>Provider Mode: {nodeSettings?.provider_mode_enabled ? 'ON' : 'OFF'}</Text>
      <Text>Battery Threshold: {nodeSettings?.battery_threshold}%</Text>
    </View>
  );
}
```

### 5. Start Periodic Stats Sync

```typescript
import { startPeriodicSync } from '../services/NodeStatsService';
import { useAppStore } from '../store/appStore';

// In your main App.tsx or relevant component
useEffect(() => {
  if (isAuthenticated) {
    // Start syncing stats every 5 minutes
    startPeriodicSync(() => {
      const { nodeStats } = useAppStore.getState();
      return convertLocalStatsToBackendFormat(nodeStats);
    });
  }

  return () => {
    stopPeriodicSync();
  };
}, [isAuthenticated]);
```

### 6. Force Immediate Stats Sync

```typescript
import { forceSyncNow } from '../services/NodeStatsService';

const handleAppClose = async () => {
  const { backendNodeStats } = useAppStore.getState();
  if (backendNodeStats) {
    await forceSyncNow(backendNodeStats);
  }
};
```

## Backend API Reference

### Node Settings API

#### GET `/api/node/settings?node_id={nodeId}`

**Headers:**
- `Authorization: Bearer {accessToken}`

**Response:**
```json
{
  "node_id": "12345",
  "worker_mode_enabled": true,
  "provider_mode_enabled": false,
  "battery_threshold": 20,
  "worker_mode_updated_at": "2024-01-01T00:00:00.000Z",
  "provider_mode_updated_at": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

#### PUT `/api/node/settings`

**Headers:**
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**Body:**
```json
{
  "node_id": "12345",
  "worker_mode_enabled": true,
  "provider_mode_enabled": false,
  "battery_threshold": 30
}
```

**Response:** Same as GET

### Node Statistics API

#### GET `/api/stats/node?node_id={nodeId}`

**Response:**
```json
{
  "node_id": "12345",
  "served_requests": 150,
  "tokens_generated": 5000,
  "self_requests": 10,
  "session_uptime": 3600,
  "peak_t_s": 12.5,
  "avg_t_s": 8.2,
  "low_t_s": 2.1,
  "response_avg_time": 450,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

#### PUT `/api/stats/node`

**Body:**
```json
{
  "node_id": "12345",
  "served_requests": 150,
  "tokens_generated": 5000,
  "self_requests": 10,
  "session_uptime": 3600,
  "peak_t_s": 12.5,
  "avg_t_s": 8.2,
  "low_t_s": 2.1,
  "response_avg_time": 450
}
```

**⚠️ Important:** Backend OVERWRITES all values (not incremental)

**Response:** Same as GET

## AsyncStorage Keys Summary

| Key | Type | Description |
|-----|------|-------------|
| `node_id` | string | Node UUID |
| `user_profile` | JSON | `{ displayName, gender, dateOfBirth }` |
| `node_settings` | JSON | Node settings object |
| `node_stats` | JSON | Node statistics object |
| `auth_access_token` | string | JWT access token |
| `auth_refresh_token` | string | JWT refresh token |
| `connected_wallet_address` | string | Solana wallet address |
| `wallet_auth_token` | string | MWA authorization token |

## Best Practices

### 1. Always Use appStore

❌ **Don't** call service functions directly from UI:
```typescript
// BAD
import { updateNodeSettings } from '../services/NodeSettingsService';
await updateNodeSettings({ worker_mode_enabled: true });
```

✅ **Do** use appStore actions:
```typescript
// GOOD
const { updateNodeSettings } = useAppStore.getState();
await updateNodeSettings({ worker_mode_enabled: true });
```

### 2. Settings Auto-Update Local State

When you update settings via `updateNodeSettings()`, the following local states are automatically updated:

- `worker_mode_enabled` → `imageWorkerEnabled`
- `provider_mode_enabled` → `providerModeEnabled`
- `battery_threshold` → `batteryThreshold`

### 3. Error Handling

Settings updates throw errors on failure:
```typescript
try {
  await updateNodeSettings({ worker_mode_enabled: true });
} catch (error) {
  Alert.alert('Error', 'Failed to update settings');
}
```

Stats sync failures are non-blocking:
```typescript
// This won't throw - failures are logged only
await syncNodeStats();
```

### 4. Offline Support

Both settings and stats are cached in AsyncStorage:
- On fetch failure, cached data is used automatically
- Updates queue locally and retry when online (future enhancement)

### 5. Stats Mapping

Local `NodeStatistics` differs from backend `NodeStats`. Use `syncNodeStats()` which handles mapping:

```typescript
// syncNodeStats() automatically maps:
nodeStats.totalRequestsServed → served_requests
nodeStats.totalTokensGenerated → tokens_generated
nodeStats.totalSelfRequests → self_requests
// ... etc
```

## Migration Guide

If you have existing code using local storage for settings:

### Before (Old Way)
```typescript
// Old: Local AsyncStorage only
const workerMode = await AsyncStorage.getItem('imageWorkerEnabled');
await AsyncStorage.setItem('imageWorkerEnabled', 'true');
```

### After (New Way)
```typescript
// New: Backend-synced via appStore
const nodeSettings = useAppStore(s => s.nodeSettings);
const isWorkerEnabled = nodeSettings?.worker_mode_enabled;

await updateNodeSettings({ worker_mode_enabled: true });
```

## Testing

### Test 1: Settings Load on Login
1. Login to app
2. Check console: `[AppStore] Node settings loaded: {...}`
3. Check `useAppStore.getState().nodeSettings` is populated

### Test 2: Settings Update
1. Call `updateNodeSettings({ battery_threshold: 50 })`
2. Check console: `[NodeSettings] Settings updated and saved`
3. Verify `nodeSettings.battery_threshold === 50`
4. Verify `batteryThreshold === 50` (auto-synced)
5. Check AsyncStorage key `node_settings` contains new value

### Test 3: Stats Sync
1. Ensure app is logged in
2. Wait 5 minutes
3. Check console: `[NodeStats] Periodic sync triggered`
4. Verify backend receives PUT request
5. Check `backendNodeStats` is updated

### Test 4: Offline Resilience
1. Turn off network
2. Try to load settings
3. Should see: `[NodeSettings] Using cached settings`
4. Settings should still display correctly

## Next Steps

1. **Update UI Screens** - Replace local storage reads with appStore selectors
2. **Add Stats Sync UI** - Show "Last synced" timestamp
3. **Implement Retry Logic** - Queue failed updates for retry when online
4. **Add Loading States** - Show spinners during settings updates
5. **Create Settings Screen** - Dedicated screen for all node configuration

## Questions & Troubleshooting

**Q: Settings not loading after login?**
Check console for `[AppStore] Loading node settings and stats...`. If missing, `handleAuthSuccess()` might not be called.

**Q: Stats not syncing?**
Verify `startPeriodicSync()` is called and `stopPeriodicSync()` isn't called prematurely.

**Q: Settings update not reflected in UI?**
Make sure you're using `useAppStore(s => s.nodeSettings)` with proper selector.

**Q: Want to sync stats immediately instead of waiting 5 minutes?**
Call `forceSyncNow(stats)` or `syncNodeStats()` directly.
