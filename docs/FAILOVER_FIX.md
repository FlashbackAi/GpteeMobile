# WebRTC Failover Encryption Key Fix

## Problem

During provider failover, the system was experiencing critical errors:
```
ERROR  [WebRTC] Failed to decrypt message: [Error: Text strings must be rendered within a <Text> component.]
ERROR  [WebRTC] No encryption key available
```

**Root Cause**: When switching providers during failover, the WebRTC connection was immediately nullified without proper cleanup:

```typescript
// OLD CODE (line 517-520)
this.webrtcClient = null;
this.activeProviderId = null;
this.webrtcInitializing = false;
```

This caused:
1. Old WebRTC connection's encryption key was lost immediately
2. In-flight messages still being received tried to decrypt with missing key
3. Decryption failures cascaded into React Native rendering errors
4. Failover ultimately failed instead of succeeding smoothly

## Solution

Implemented graceful WebRTC connection transition:

### Changes Made

**1. In `retryWithNextProvider()` method (RelayClient.ts:475-537)**

```typescript
// NEW CODE - Graceful WebRTC cleanup before failover
if (this.webrtcClient) {
  console.log('[RelayClient] 🔌 Closing old WebRTC connection before failover');
  try {
    await this.webrtcClient.close(); // Properly cleanup encryption keys and channels
  } catch (e) {
    console.error('[RelayClient] Error closing WebRTC:', e);
  }
}

// Clear message queue to prevent decryption attempts with stale keys
this.messageQueue = [];

// Reset WebRTC state
this.webrtcClient = null;
this.activeProviderId = null;
this.webrtcInitializing = false;
```

**2. Made `retryWithNextProvider()` async** (line 475)
```typescript
private async retryWithNextProvider(requestId: string) {
```

**3. Improved `disconnect()` method** (RelayClient.ts:757-783)

Also added proper async/await and error handling to the disconnect method:

```typescript
async disconnect() {
  // ... other cleanup ...

  // Cleanup WebRTC
  if (this.webrtcClient) {
    try {
      await this.webrtcClient.close();
    } catch (e) {
      console.error('[RelayClient] Error closing WebRTC:', e);
    }
    this.webrtcClient = null;
    this.activeProviderId = null;
  }

  // Clear state
  this.webrtcInitializing = false;
  this.messageQueue = [];
}
```

## What the Fix Does

1. **Graceful Shutdown**: Calls `WebRTCClient.close()` which properly:
   - Closes the data channel
   - Closes the peer connection
   - Clears the encryption key
   - Resets remote peer ID
   - Clears ICE candidate queue

2. **Prevents Decryption Errors**: By awaiting the close operation, ensures all cleanup completes before establishing new connection

3. **Clears Message Queue**: Prevents any queued messages from attempting to use the old encryption key

4. **Error Handling**: Wraps close operations in try-catch to handle any edge cases

## Test Scenario

**Before Fix**:
```
User: Sends message to Provider 1
Provider 1: Starts streaming response
User: Turns off Provider 1 mid-stream
System: Detects timeout, attempts failover to Provider 2
ERROR: [WebRTC] No encryption key available
ERROR: Failed to decrypt message
Result: Failover FAILS with "inference failed" toast
```

**After Fix**:
```
User: Sends message to Provider 1
Provider 1: Starts streaming response
User: Turns off Provider 1 mid-stream
System: Detects timeout
System: Gracefully closes WebRTC connection to Provider 1
System: Clears message queue and encryption state
System: Establishes new WebRTC connection to Provider 2
Provider 2: Receives request with full conversation history
Provider 2: Continues streaming response
Result: Seamless failover with context preserved ✅
```

## Files Modified

1. `src/network/RelayClient.ts`
   - Line 475: Made `retryWithNextProvider()` async
   - Lines 517-536: Added graceful WebRTC cleanup before failover
   - Line 757: Made `disconnect()` async
   - Lines 770-778: Added proper async/await and error handling

## Related Files

- `src/network/WebRTCClient.ts`: Contains the `close()` method that performs actual cleanup
- `src/screens/ChatScreen.tsx`: Error callback already handles missing messages gracefully

## Testing Recommendations

1. **Timeout Failover**: Start inference, turn off provider mid-stream, verify seamless switch
2. **Multiple Failovers**: Chain multiple provider failures, ensure each transition is clean
3. **Connection States**: Monitor WebRTC connection states during failover
4. **Encryption Keys**: Verify no "No encryption key available" errors in logs
5. **Message Integrity**: Confirm full conversation context is preserved through failover
6. **Performance**: Check that WebRTC close operation doesn't cause UI lag (should be fast)

## Technical Notes

- `WebRTCClient.close()` is marked async for future flexibility but current operations are synchronous
- React Native useEffect cleanup doesn't await async operations, but this is acceptable for unmount scenarios
- Message queue clearing prevents race conditions with queued messages
- Error handling ensures failover continues even if close operation fails
