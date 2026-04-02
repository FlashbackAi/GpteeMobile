# Background Service & Enhanced Logs Implementation

## Overview

Implemented comprehensive background service support with foreground notifications and battery optimization prompts, plus a completely redesigned logs system with terminal-style UI and tab-based filtering.

---

## Part 1: Background Service & Battery Optimization

### Features Implemented

1. **Foreground Service**
   - Keeps app running when provider/worker modes are active
   - Shows persistent notification with real-time stats
   - Updates every 2 seconds with current metrics
   - Automatic start/stop based on mode toggles

2. **Battery Optimization Prompt**
   - Educational dialog explaining why it's needed
   - Direct link to Android battery settings
   - Prompts user before enabling modes
   - Optional "Later" button

3. **Real-time Notification Updates**
   - Provider mode: Shows requests served, tokens generated, uptime
   - Worker mode: Shows tasks processed, detections, uptime
   - Both modes: Combined stats display
   - Fluent updates (no lag or stutter)

### Files Created/Modified

#### New Files:
1. **`src/services/ForegroundService.ts`**
   - Core foreground service management
   - Notification update logic
   - Background task runner
   - Stats formatting utilities

2. **`src/services/BatteryOptimization.ts`**
   - Battery optimization checks
   - Settings page launcher
   - Educational dialogs
   - Platform-specific handling

#### Modified Files:
1. **`src/screens/HomeScreen.tsx`**
   - Added imports for ForegroundService and BatteryOptimization
   - Wrapped provider toggle with battery optimization prompt
   - Wrapped worker toggle with battery optimization prompt
   - Added foreground service start on mode enable
   - Added foreground service stop when both modes disabled

### Package Dependencies

```json
{
  "react-native-background-actions": "^3.0.0"
}
```

**Installation:**
```bash
npm install react-native-background-actions --legacy-peer-deps
```

### Android Permissions

Already configured in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

### Usage Example

**Provider Mode Toggle:**
```typescript
// User enables provider mode
handleProviderToggle(true)
  ↓
Battery optimization prompt shown
  ↓ [User taps "open settings"]
Android settings opened
  ↓ [User disables optimization]
Returns to app
  ↓
Model loads
  ↓
setProviderModeEnabled(true)
  ↓
startForegroundService()
  ↓
Notification appears: "GPTee: Provider Mode Active"
  ↓
Stats update every 2 seconds
```

**Notification Content:**
```
Provider Mode:
├─ Title: "GPTee: Provider Mode Active"
└─ Description:
   "12 requests served
    1,234 tokens generated
    Uptime: 1h 23m 45s"

Worker Mode:
├─ Title: "GPTee: Worker Mode Active"
└─ Description:
   "8 tasks processed
    24 detections
    Uptime: 45m 12s"

Both Modes:
├─ Title: "GPTee: Provider + Worker Active"
└─ Description:
   "Provider: 12 requests, 1,234 tokens
    Worker: 8 tasks, 24 detections
    Uptime: 1h 23m 45s"
```

### Key Functions

#### ForegroundService.ts

```typescript
// Start service
await startForegroundService();

// Stop service
await stopForegroundService();

// Check if running
const running = isServiceRunning();

// Force update notification
await updateServiceNotification();
```

#### BatteryOptimization.ts

```typescript
// Check if disabled
const disabled = await isBatteryOptimizationDisabled();

// Open settings
await openBatteryOptimizationSettings();

// Show prompt
promptBatteryOptimization(
  () => {
    // User confirmed - enable mode
  },
  () => {
    // User cancelled
  }
);

// Show info dialog
showBatteryOptimizationInfo();
```

---

## Part 2: Enhanced Logs with Tabs

### Features Implemented

1. **Tab-Based Filtering**
   - "all" tab: Shows all logs
   - "provider" tab: Only provider mode logs
   - "worker" tab: Only worker mode logs
   - Visual active tab indicator

2. **Terminal-Style UI**
   - Monospace font
   - Color-coded by type (green=provider, blue=worker, yellow=system)
   - Timestamps for each entry
   - Category badges
   - Animated cursor
   - macOS-style terminal buttons (red, yellow, green)

3. **Enhanced Log Service**
   - Structured log entries with timestamps
   - Category auto-detection (provider/worker/system)
   - Level detection (info/success/warning/error)
   - Persistent storage (AsyncStorage)
   - Real-time updates
   - Max 500 entries (auto-pruning)

4. **Footer Actions**
   - Clear logs button
   - Export logs button (placeholder)
   - Entry count display

### Files Created/Modified

#### New Files:
1. **`src/services/LogService.ts`**
   - Structured logging system
   - Category and level detection
   - AsyncStorage persistence
   - Subscription system for real-time updates
   - Helper utilities (formatTimestamp, getColorForLevel, etc.)

2. **`src/components/LogsPopupEnhanced.tsx`**
   - Terminal-style UI
   - Tab navigation
   - Real-time log updates
   - Auto-scroll to bottom
   - Export/clear actions

#### Modified Files:
1. **`src/store/appStore.ts`**
   - Updated `addLog()` to use LogService
   - Auto-categorization logic
   - Auto-level detection
   - Backward compatibility maintained

2. **`src/screens/HomeScreen.tsx`**
   - Switched from `LogsPopup` to `LogsPopupEnhanced`
   - Removed `logs` and `clearLogs` props (handled internally)

### Log Entry Structure

```typescript
interface LogEntry {
  timestamp: number;        // Unix timestamp
  category: LogCategory;    // 'provider' | 'worker' | 'system'
  message: string;          // The log message
  level: 'info' | 'success' | 'warning' | 'error';
}
```

### Auto-Categorization Logic

**Category Detection:**
```typescript
// Provider mode
if (msg.includes('provider') || msg.includes('llm') || msg.includes('model'))
  → category = 'provider'

// Worker mode
if (msg.includes('worker') || msg.includes('vision') || msg.includes('task'))
  → category = 'worker'

// Default
else → category = 'system'
```

**Level Detection:**
```typescript
// Success
if (msg.includes('✅') || msg.includes('success'))
  → level = 'success'

// Warning
if (msg.includes('⚠️') || msg.includes('warning'))
  → level = 'warning'

// Error
if (msg.includes('❌') || msg.includes('error'))
  → level = 'error'

// Info
else → level = 'info'
```

### Color Scheme

| Element | Color | Hex |
|---------|-------|-----|
| Provider logs | Green | `#27c93f` |
| Worker logs | Blue | `#00bfff` |
| System logs | Yellow | `#ffbd2e` |
| Success | Green | `#27c93f` |
| Warning | Yellow | `#ffbd2e` |
| Error | Red | `#ff5f56` |
| Info | Light gray | `#e0e0e0` |
| Timestamps | Dark gray | `#666` |

### UI Layout

```
┌──────────────────────────────────────┐
│ ●●● gptee logs                  [×] │ ← Header with macOS buttons
├─────┬────────┬──────────────────────┤
│ all │provider│ worker               │ ← Tabs
│─────┴────────┴──────────────────────│
│ $ gptee logs --follow               │ ← Terminal prompt
│ ─────────────────────────────────── │
│ [12:34:56] [provider] ✅ LLM loaded │ ← Log entries
│ [12:35:12] [worker] 📥 task received│
│ [12:35:14] [worker] ✅ task complete│
│ [12:35:20] [provider] 📥 request... │
│ $ ▮                                  │ ← Cursor
├──────────────────────────────────────┤
│ [clear] [export]        12 entries  │ ← Footer
└──────────────────────────────────────┘
```

### Usage Example

**Adding Logs:**
```typescript
// Using appStore (auto-categorizes)
addLog('✅ LLM model loaded successfully');
// → category: 'provider', level: 'success'

addLog('⚠️ Worker mode disabled - provider mode enabled');
// → category: 'worker', level: 'warning'

// Direct LogService usage
import { logService } from '../services/LogService';
logService.addLog('Custom message', 'provider', 'info');
```

**Viewing Logs:**
```typescript
// Logs popup opens automatically when logs icon tapped
// Tabs allow filtering by category
// Auto-scrolls to bottom on new entries
```

**Subscribing to Updates:**
```typescript
const unsubscribe = logService.subscribe((logs) => {
  console.log('Logs updated:', logs.length);
});

// Later...
unsubscribe();
```

---

## Testing Checklist

### Background Service
- [ ] Enable provider mode → battery prompt shows
- [ ] Tap "open settings" → Android settings open
- [ ] Disable battery optimization → return to app
- [ ] Provider mode enables → notification appears
- [ ] Serve a request → notification updates with new count
- [ ] Check notification shows tokens generated
- [ ] Check uptime increments
- [ ] Disable provider mode → notification disappears
- [ ] Enable worker mode → battery prompt shows
- [ ] Worker mode enables → notification appears
- [ ] Process a task → notification updates
- [ ] Enable both modes → notification shows combined stats
- [ ] Lock phone → notification persists
- [ ] Unlock phone → app still running
- [ ] Kill app → notification disappears

### Enhanced Logs
- [ ] Open logs → terminal UI shows
- [ ] Tap "all" tab → shows all logs
- [ ] Tap "provider" tab → shows only provider logs
- [ ] Tap "worker" tab → shows only worker logs
- [ ] Active tab has green underline
- [ ] Timestamps are correct
- [ ] Category badges color-coded correctly
- [ ] Success logs are green
- [ ] Error logs are red
- [ ] Warning logs are yellow
- [ ] Auto-scrolls to bottom on new log
- [ ] Tap "clear" → logs cleared
- [ ] Close and reopen → logs persisted
- [ ] Add 500+ logs → auto-prunes old entries

---

## Known Limitations

1. **Battery Optimization Check**
   - Currently simplified implementation
   - Cannot detect if optimization is actually disabled
   - Relies on user completing the flow

2. **Export Logs**
   - Placeholder implementation
   - Needs file system write and share functionality

3. **Notification Icons**
   - Uses default app icon
   - Could add custom icons for provider/worker modes

4. **Log Persistence**
   - Limited to 500 entries
   - No log rotation or archiving
   - No remote logging

---

## Future Enhancements

### Background Service
1. Auto-start on device boot
2. Wake lock optimization (partial wake lock)
3. Custom notification actions (pause/resume)
4. Battery usage optimization
5. Network-aware service (pause on mobile data)

### Enhanced Logs
1. Full-text search
2. Log level filtering
3. Date range filtering
4. Export to file (CSV/JSON/TXT)
5. Share logs via share sheet
6. Remote logging to backend
7. Log analytics dashboard
8. Performance metrics view

---

## Migration Notes

### For Existing Users

**Old Logs:**
- Old `activity_logs` in AsyncStorage will continue to work
- New LogService uses `app_logs_v2` key
- Both systems run in parallel for backward compatibility
- Old logs will not be migrated automatically

**State Management:**
- `logs` array in appStore still maintained
- New LogService manages its own state independently
- No breaking changes to existing code

### For Developers

**Adding New Logs:**
```typescript
// Old way (still works)
addLog('✅ Something succeeded');

// New way (more control)
import { logService } from '../services/LogService';
logService.addLog('Something succeeded', 'provider', 'success');
```

**Accessing Logs:**
```typescript
// Old way (from appStore)
const logs = useAppStore(state => state.logs);

// New way (from LogService)
import { logService } from '../services/LogService';
const logs = logService.getLogs();
const providerLogs = logService.getLogsByCategory('provider');
```

---

## Summary

This implementation provides:
- ✅ Full background operation for provider/worker modes
- ✅ Persistent foreground notifications with real-time updates
- ✅ User-friendly battery optimization prompts
- ✅ Professional terminal-style log viewer
- ✅ Tab-based log filtering
- ✅ Automatic categorization and color coding
- ✅ Persistent log storage with auto-pruning
- ✅ Backward compatibility with existing code

The app can now run reliably in the background, serving inference requests and processing tasks even when the screen is off, with users kept informed through persistent notifications.
