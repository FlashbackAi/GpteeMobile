# AsyncStorage Keys Reference

## All keys used in GPTee Mobile app

### Identity & Authentication
| Key | Type | Managed By | Syncs To Backend |
|-----|------|------------|------------------|
| `connected_wallet_address` | string | WalletService | No (local wallet) |
| `wallet_auth_token` | string | WalletService | No (local wallet) |
| `auth_access_token` | string | httpClient | No (session token) |
| `auth_refresh_token` | string | httpClient | No (session token) |
| `node_id` | string | appStore | No (derived from backend) |
| `user_profile` | JSON `{displayName, gender, dateOfBirth}` | appStore | Backend returns displayName |

### Node Settings (Backend-synced)
| Key | Type | Managed By | Syncs To Backend |
|-----|------|------------|------------------|
| `node_settings` | JSON `NodeSettings` | NodeSettingsService | ✅ YES (PUT /api/node/settings) |
| `providerModeEnabled` | 'true'/'false' | appStore | ✅ YES (via updateNodeSettings) |
| `imageWorkerEnabled` | 'true'/'false' | appStore | ✅ YES (via updateNodeSettings) |
| `batteryThreshold` | string (number) | appStore | ✅ YES (via updateNodeSettings) |

### Node Statistics (Backend-synced)
| Key | Type | Managed By | Syncs To Backend |
|-----|------|------------|------------------|
| `node_stats` | JSON `NodeStats` | NodeStatsService | ✅ YES (PUT /api/stats/node every 5min) |

### App Preferences (Local only)
| Key | Type | Managed By | Syncs To Backend |
|-----|------|------------|------------------|
| `localInferenceMode` | 'true'/'false' | appStore | No (UI preference) |
| `activity_logs` | JSON `string[]` | appStore | No (local logs) |
| `coordinatorUrl` | string | appStore | No (worker config) |

## Key Details

### `node_settings`
```json
{
  "node_id": "uuid",
  "worker_mode_enabled": boolean,
  "provider_mode_enabled": boolean,
  "battery_threshold": number,
  "created_at": "ISO date",
  "updated_at": "ISO date"
}
```
- **Saved by:** NodeSettingsService
- **Loaded on:** Login (loadNodeSettings)
- **Updated on:** Settings change (updateNodeSettings)
- **Backend table:** `node_settings_v1`

### `node_stats`
```json
{
  "node_id": "uuid",
  "served_requests": number,
  "tokens_generated": number,
  "self_requests": number,
  "session_uptime": number,
  "peak_t_s": number,
  "avg_t_s": number,
  "low_t_s": number,
  "response_avg_time": number
}
```
- **Saved by:** NodeStatsService (via saveCachedStats)
- **Loaded on:** Login (loadNodeStats)
- **Updated on:** Every request (provider or consumer)
- **Synced:** Every 5 minutes to backend
- **Backend table:** `node_statistics_v1`

### Deprecated Keys (Removed)
- ~~`nodeStats`~~ - OLD local-only stats (replaced by `node_stats`)

## Data Flow

### Settings Update Flow
```
User changes setting
  ↓
appStore.setBatteryThreshold(30)
  ↓
├─ set({ batteryThreshold: 30 })
├─ AsyncStorage.setItem('batteryThreshold', '30')
└─ updateNodeSettings({ battery_threshold: 30 })
     ↓
   ├─ PUT /api/node/settings
   ├─ Backend saves to node_settings_v1
   ├─ AsyncStorage.setItem('node_settings', {...})
   └─ set({ nodeSettings: {...} })
```

### Stats Update Flow
```
Provider serves request
  ↓
appStore.updateProviderStats(100, 5000)
  ↓
├─ Calculate new totals
├─ set({ nodeStats: {...} })
└─ saveCachedStats({ served_requests: X, ... })
     ↓
   AsyncStorage.setItem('node_stats', {...})

Every 5 minutes:
  ↓
syncNodeStats()
  ↓
PUT /api/stats/node (sends current totals)
  ↓
Backend overwrites node_statistics_v1
```

### Login Flow
```
handleAuthSuccess()
  ↓
├─ Save: node_id, user_profile
├─ loadNodeSettings()
│    ↓
│  ├─ GET /api/node/settings
│  ├─ AsyncStorage.setItem('node_settings', ...)
│  └─ set({ nodeSettings, providerModeEnabled, batteryThreshold, imageWorkerEnabled })
│
└─ loadNodeStats()
     ↓
   ├─ GET /api/stats/node
   ├─ AsyncStorage.setItem('node_stats', ...)
   └─ set({ nodeStats: { totalRequestsServed: X, ... }, backendNodeStats })
```

## Consistency Rules

✅ **Single Source of Truth:**
- Settings: `nodeSettings` object in appStore
- Stats: `nodeStats` object in appStore (local tracking) + `backendNodeStats` (last synced)

✅ **Naming Convention:**
- Backend uses snake_case: `worker_mode_enabled`, `served_requests`
- Frontend uses camelCase: `workerModeEnabled`, `totalRequestsServed`
- Mapping happens in services

✅ **Cache Strategy:**
- Settings: Update backend immediately, cache as side effect
- Stats: Cache immediately (crash resilience), sync to backend every 5 min

✅ **No Duplication:**
- All settings/stats updates go through appStore actions
- No direct AsyncStorage writes from screens
- Services handle backend sync and caching
