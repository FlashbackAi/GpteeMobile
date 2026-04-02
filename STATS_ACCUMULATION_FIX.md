# Stats Accumulation Fix - Preventing Data Loss

## The Problem 🚨

### Original Flawed Design

The initial implementation had a **critical flaw** with stats tracking when switching devices or reinstalling the app:

```
Device A:
  User serves 100 requests
  Backend stores: served_requests = 100

Device B (or fresh install):
  nodeStats initializes to: 0 ❌
  User serves 50 requests
  nodeStats = 0 + 50 = 50
  Sync to backend: served_requests = 50

  Result: LOST 100 requests from Device A! ❌
```

### Why This Happened

1. **Local stats started at 0** on every fresh install
2. **We send absolute values** (not deltas) to backend
3. **Backend OVERWRITES** (doesn't accumulate)
4. **Result**: Previous work gets erased

## The Solution ✅

### Initialize Local Stats FROM Backend

```
Device A:
  User serves 100 requests
  Backend stores: served_requests = 100

Device B (or fresh install):
  1. Load from backend: served_requests = 100
  2. Initialize nodeStats with backend value: 100 ✅
  3. User serves 50 requests
  4. nodeStats = 100 + 50 = 150
  5. Sync to backend: served_requests = 150

  Result: Correct total! ✅
```

## Implementation Details

### Before (Broken)

```typescript
loadNodeStats: async () => {
  const backendStats = await fetchNodeStats(nodeId);

  // ❌ Only saved to backendNodeStats
  set({ backendNodeStats: backendStats });

  // nodeStats remains at default (0 values) ❌
  // When user processes requests, counting starts from 0 ❌
}
```

### After (Fixed)

```typescript
loadNodeStats: async () => {
  const backendStats = await fetchNodeStats(nodeId);

  set({
    backendNodeStats: backendStats,

    // ✅ CRITICAL: Initialize local nodeStats FROM backend
    nodeStats: {
      totalRequestsServed: backendStats.served_requests || 0,
      totalTokensGenerated: backendStats.tokens_generated || 0,
      totalSelfRequests: backendStats.self_requests || 0,
      peakTokensPerSecond: backendStats.peak_t_s || 0,
      lowestTokensPerSecond: backendStats.low_t_s === 0 ? Infinity : backendStats.low_t_s,
      // Session-specific values reset
      totalProviderTimeMs: 0,
      totalSelfTokensReceived: 0,
      totalSelfTimeMs: 0,
      sessionStartTime: currentSessionStart,
      lastActivityTime: Date.now(),
    }
  });
}
```

## Complete Flow Examples

### Example 1: Normal Usage (Single Device)

```
Day 1:
  Login → Backend: 0
  Initialize: nodeStats.totalRequestsServed = 0
  Serve 100 requests: nodeStats = 0 + 100 = 100
  Sync: Backend = 100 ✅

Day 2 (App reload):
  Login → Backend: 100
  Initialize: nodeStats.totalRequestsServed = 100 ✅
  Serve 50 requests: nodeStats = 100 + 50 = 150
  Sync: Backend = 150 ✅
```

### Example 2: Device Switch

```
Phone A:
  Login → Backend: 0
  Initialize: nodeStats = 0
  Serve 500 requests: nodeStats = 500
  Sync: Backend = 500 ✅

Phone B (same account):
  Login → Backend: 500
  Initialize: nodeStats = 500 ✅ (loads from backend)
  Serve 200 requests: nodeStats = 500 + 200 = 700
  Sync: Backend = 700 ✅

Back to Phone A:
  Login → Backend: 700
  Initialize: nodeStats = 700 ✅ (loads from backend)
  Serve 100 requests: nodeStats = 700 + 100 = 800
  Sync: Backend = 800 ✅
```

### Example 3: App Reinstall

```
Before Reinstall:
  Backend: served_requests = 1000

After Reinstall:
  Login → Backend: 1000
  Initialize: nodeStats.totalRequestsServed = 1000 ✅
  Serve 50 requests: nodeStats = 1000 + 50 = 1050
  Sync: Backend = 1050 ✅

  No data lost! ✅
```

### Example 4: Offline → Online

```
Offline Period:
  Can't sync to backend
  Local: nodeStats = 200
  Backend: served_requests = 150 (stale)

Come Online:
  Login → Backend: 150
  Initialize: nodeStats = 150 ❌ (Wrong! Local had 200)

  Problem: Lost 50 requests tracked offline
```

**Solution for Offline**: Save to AsyncStorage before going offline, restore on reload:

```typescript
// Save current stats before offline
await saveCachedStats({
  node_id: nodeId,
  served_requests: nodeStats.totalRequestsServed, // 200
  // ...
});

// On next login, if cached is newer than backend
const cached = await loadCachedStats();
if (cached && cached.served_requests > backendStats.served_requests) {
  // Use cached (200) instead of backend (150)
  nodeStats.totalRequestsServed = cached.served_requests;
}
```

## Data Mapping

### Backend Stats → Local Stats

| Backend Field | Local Field | Notes |
|---------------|-------------|-------|
| `served_requests` | `totalRequestsServed` | ✅ Restored |
| `tokens_generated` | `totalTokensGenerated` | ✅ Restored |
| `self_requests` | `totalSelfRequests` | ✅ Restored |
| `peak_t_s` | `peakTokensPerSecond` | ✅ Restored |
| `low_t_s` | `lowestTokensPerSecond` | ✅ Restored (handle Infinity) |
| `session_uptime` | N/A | ❌ Not restored (session-specific) |
| `response_avg_time` | Derived from `totalProviderTimeMs` | ❌ Not restored |

### Session-Specific vs Lifetime Stats

**Lifetime Stats** (cumulative across sessions):
- `totalRequestsServed` ✅ Initialize from backend
- `totalTokensGenerated` ✅ Initialize from backend
- `totalSelfRequests` ✅ Initialize from backend
- `peakTokensPerSecond` ✅ Initialize from backend (can be improved this session)
- `lowestTokensPerSecond` ✅ Initialize from backend (can be improved this session)

**Session-Specific Stats** (reset each session):
- `totalProviderTimeMs` ❌ Reset to 0 (can't restore time accurately)
- `totalSelfTimeMs` ❌ Reset to 0
- `sessionStartTime` ❌ Set to current time
- `lastActivityTime` ❌ Set to current time

## Edge Cases Handled

### 1. First Time User
```typescript
Backend: { served_requests: null } or doesn't exist
Initialize: nodeStats.totalRequestsServed = 0
Serve 10: nodeStats = 10
Sync: Backend = 10 ✅
```

### 2. Backend Has Higher Value Than Expected
```typescript
// Possible if user used another device recently
Backend: 1000
Local before sync: 800 (stale)
After sync: Initialize from backend = 1000 ✅
Correct behavior: Use backend (source of truth)
```

### 3. Network Failure During Sync
```typescript
Local: nodeStats = 150
Backend: 100 (last successful sync)

Sync fails (network error)
Local remains: 150 (correct)
Cached in AsyncStorage: 150
Backend still: 100 (will update on next successful sync)

Next sync success:
Sends: 150
Backend: 100 → 150 ✅
```

### 4. Concurrent Devices (Race Condition)
```typescript
Phone A: nodeStats = 100, syncs → Backend = 100
Phone B: nodeStats = 80, syncs → Backend = 80 ❌ (overwrites!)

Problem: Last write wins
Solution: Backend should track per-device or use timestamps
```

## Console Logs to Verify

After the fix, on login you should see:

```
[AppStore] Loading node settings and stats...
[NodeStats] Fetching stats for node: d4d0f588-...
[NodeStats] Stats fetched and saved: {
  node_id: "d4d0f588-...",
  served_requests: 500,
  tokens_generated: 15000,
  ...
}
[AppStore] ✅ Node stats loaded and local stats initialized from backend: {...}
```

Key phrase: **"initialized from backend"** - confirms local stats were set from backend values.

## Testing Checklist

### Test 1: Fresh Install
- [ ] Uninstall app
- [ ] Backend has `served_requests: 1000`
- [ ] Install app, login
- [ ] Check `nodeStats.totalRequestsServed === 1000`
- [ ] Serve 10 requests
- [ ] Check `nodeStats.totalRequestsServed === 1010`
- [ ] Sync
- [ ] Check backend has `1010`

### Test 2: Device Switch
- [ ] Phone A: Serve 100 requests, sync
- [ ] Backend has `served_requests: 100`
- [ ] Phone B: Login (same account)
- [ ] Check `nodeStats.totalRequestsServed === 100`
- [ ] Serve 50 requests
- [ ] Check `nodeStats.totalRequestsServed === 150`
- [ ] Sync
- [ ] Check backend has `150`

### Test 3: Multiple Sessions Same Device
- [ ] Login, serve 50 requests, sync
- [ ] Backend: `50`
- [ ] Reload app (don't logout)
- [ ] Check `nodeStats === 50` (restored from backend)
- [ ] Serve 25 more
- [ ] Check `nodeStats === 75`

### Test 4: Offline Sync
- [ ] Go offline
- [ ] Serve 100 requests (local only)
- [ ] Sync fails (expected)
- [ ] Go online
- [ ] Sync succeeds
- [ ] Backend has correct total

## Migration for Existing Users

If you already have users with incorrect stats:

1. **One-time sync fix**: When loading stats, compare cached vs backend:
   ```typescript
   const cached = await loadCachedStats();
   const backend = await fetchNodeStats(nodeId);

   // Use whichever is higher (assume it's more accurate)
   const mergedStats = {
     served_requests: Math.max(
       cached?.served_requests || 0,
       backend.served_requests || 0
     ),
     // ... same for other fields
   };

   // Update backend with merged values
   await updateNodeStats(mergedStats);
   ```

2. **Or**: Accept the loss, start fresh from backend values going forward

## Summary

✅ **Fix Applied**: Local stats now initialize from backend on login
✅ **Data Preserved**: Switching devices or reinstalling app won't lose stats
✅ **Accumulation Works**: Stats accumulate correctly across sessions/devices
⚠️ **Limitation**: Session-specific metrics (time, avg response) reset each session
⚠️ **Multi-Device**: Concurrent usage may have race conditions (backend design issue)

The key change: **Always load backend stats first, then ADD new work to those values**.
