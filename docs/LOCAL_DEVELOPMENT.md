# Local Development Guide

This guide will help you set up GPTee for local development and testing.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Setup (Relay Server)](#backend-setup-relay-server)
3. [Mobile App Setup](#mobile-app-setup)
4. [Network Configuration](#network-configuration)
5. [Running the Stack](#running-the-stack)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

- **Node.js** (v18 or higher)
- **npm** (v8 or higher)
- **Android Studio** (for Android development)
- **Java JDK 17** (required by React Native 0.75+)
- **Git**

### Optional (for production-like testing)

- **Redis** (for distributed state)
- **PostgreSQL** (for database)
- **AWS CLI** (if testing S3/DynamoDB features)

---

## Backend Setup (Relay Server)

The relay server handles WebSocket connections, peer discovery, and message routing.

### 1. Navigate to Backend Directory

```bash
cd E:\Data\Projects\gpteeRelay
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the relay server root (optional for local dev):

```env
# Local Development Configuration
PORT=9293
NODE_ENV=development

# Redis (optional - uses in-memory fallback if not configured)
# REDIS_HOST=localhost
# REDIS_PORT=6379

# Database (optional - uses mock data if not configured)
# DATABASE_URL=postgresql://user:password@localhost:5432/gptee

# AWS (optional - only needed for image worker features)
# AWS_REGION=us-east-1
# S3_BUCKET_NAME=gptee-images
# DYNAMODB_TABLE_NAME=gptee-tasks
# SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789/gptee-queue
```

### 4. Build TypeScript

```bash
npm run build
```

### 5. Start Development Server

```bash
npm run dev
```

You should see:
```
✅  GPTee Relay Server running on http/ws://0.0.0.0:9293
    Instance ID: <instance-id>
    Peers connected: 0
```

The server is now running at:
- **HTTP API**: `http://localhost:9293/api`
- **WebSocket**: `ws://localhost:9293`
- **Health Check**: `http://localhost:9293/health`

---

## Mobile App Setup

### 1. Navigate to Mobile Directory

```bash
cd E:\Data\Projects\GpteeMobile
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Install Android Dependencies

```bash
cd android
./gradlew clean
cd ..
```

### 4. Download LLM Model (Required for Provider Mode)

The app needs a GGUF format LLM model to run in provider mode. Recommended models:

- **Qwen2.5-0.5B-Instruct** (smallest, fastest)
- **Qwen2.5-1.5B-Instruct** (balanced)
- **Qwen2.5-3B-Instruct** (better quality)

Download from HuggingFace:
```
https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF
```

Place the `.gguf` file in your device's Downloads folder or use the in-app downloader.

---

## Network Configuration

### Understanding the Config

The app has different configurations for local vs production:

**Production (current config):**
```typescript
// src/config/index.ts
const SERVER_HOST = 'api.gptee.ai';  // Production domain
export const API_BASE_URL = `https://${SERVER_HOST}/api`;  // Via ALB
export const RELAY_SERVER_URL = `wss://${SERVER_HOST}`;    // Secure WebSocket
```

**Local Development:**
```typescript
// src/config/index.ts
const SERVER_HOST = '192.168.0.66';  // Your local machine's IP
export const API_BASE_URL = `http://${SERVER_HOST}:9293/api`;
export const RELAY_SERVER_URL = `ws://${SERVER_HOST}:9293`;
```

### Step 1: Find Your Local IP Address

**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter (e.g., `192.168.0.66`)

**Mac/Linux:**
```bash
ifconfig | grep "inet "
# or
ip addr show
```

**Important:** Do NOT use `localhost` or `127.0.0.1` - the Android emulator/device needs your machine's network IP.

### Step 2: Update Config for Local Development

Edit `src/config/index.ts`:

```typescript
/**
 * Base server hostname/IP
 * Change this value based on environment:
 * - Local Development: Your machine's local IP (e.g., '192.168.0.66')
 * - Production: 'api.gptee.ai'
 */
const SERVER_HOST = '192.168.0.66';  // ← Replace with YOUR local IP

/**
 * Relay Server WebSocket URL
 */
export const RELAY_SERVER_URL = `ws://${SERVER_HOST}:9293`;  // ← Note: ws:// not wss://

/**
 * Backend API Base URL
 */
export const API_BASE_URL = `http://${SERVER_HOST}:9293/api`;  // ← Note: http:// not https://

/**
 * Image Worker Coordinator WebSocket URL
 */
export const COORDINATOR_URL = `ws://${SERVER_HOST}:9293`;
```

### Step 3: Allow Cleartext Traffic (Android)

The app already has this configured in `android/app/src/main/AndroidManifest.xml`:

```xml
<application
  android:usesCleartextTraffic="true"
  android:networkSecurityConfig="@xml/network_security_config">
```

This allows HTTP connections for local development.

---

## Running the Stack

### Terminal 1: Backend (Relay Server)

```bash
cd E:\Data\Projects\gpteeRelay
npm run dev
```

Keep this running. You should see:
```
✅  GPTee Relay Server running on http/ws://0.0.0.0:9293
```

### Terminal 2: Mobile App (Metro Bundler)

```bash
cd E:\Data\Projects\GpteeMobile
npm start
```

This starts the Metro bundler. Keep it running.

### Terminal 3: Android App

**Option A: Using Android Emulator**
```bash
cd E:\Data\Projects\GpteeMobile
npm run android
```

**Option B: Using Physical Device**
1. Enable USB debugging on your Android device
2. Connect via USB
3. Run: `npm run android`

**Option C: Using ADB over WiFi**
```bash
# Connect device via USB first
adb tcpip 5555
adb connect <DEVICE_IP>:5555
# Now disconnect USB and run
npm run android
```

---

## Testing

### Test 1: Health Check

Verify backend is running:
```bash
curl http://localhost:9293/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-03-29T...",
  "uptime": 123.456,
  "peers": 0
}
```

### Test 2: WebSocket Connection

Open the mobile app and check logs:
```bash
# In Metro bundler terminal, filter logs:
adb logcat | grep -E "Relay|WebSocket|GPTee"
```

You should see:
```
[RelayClient] Connected to relay server
[RelayClient] Registration acknowledged
```

### Test 3: Provider Mode

1. Open the app
2. Go to **Profile Screen**
3. Download LLM model if not already downloaded
4. Go to **Home Screen**
5. Toggle **Provider Mode** ON
6. Check backend logs - you should see:
```
[Relay] Registered: <peer-id> as provider (android) - <device-name>
[Relay] Broadcasting 1 providers
```

### Test 4: Self-Request (Local Inference)

1. Enable **Provider Mode**
2. Go to **Chat Screen**
3. Toggle **Local Inference** ON (use your own device)
4. Send a message: "Hello"
5. You should get a response from your local LLM

### Test 5: P2P Request (Two Devices)

**Device 1 (Provider):**
1. Enable Provider Mode
2. Keep app open

**Device 2 (Consumer):**
1. Go to Chat Screen
2. Make sure Local Inference is OFF
3. Check that Device 1 appears in node info popup
4. Send a message
5. Device 1 should process it and respond

---

## Troubleshooting

### Issue: "Network Error" when connecting

**Symptoms:**
```
[NodeSettings] Failed to fetch settings: [AxiosError: Network Error]
[NodeStats] Failed to fetch stats: [AxiosError: Network Error]
```

**Solutions:**

1. **Check Backend is Running**
   ```bash
   curl http://localhost:9293/health
   ```
   If this fails, restart the backend.

2. **Verify IP Address**
   - Make sure `SERVER_HOST` in `src/config/index.ts` matches your machine's IP
   - Make sure both devices are on the same network
   - Try pinging from your phone: `ping 192.168.0.66`

3. **Check Firewall**
   - Windows: Allow port 9293 in Windows Firewall
   - Make sure your router isn't blocking connections

4. **Verify URLs**
   - Local dev should use `http://` and `ws://` (not `https://` or `wss://`)
   - Local dev must include port `:9293`

### Issue: "MissingForegroundServiceTypeException"

**Symptoms:**
```
android.app.MissingForegroundServiceTypeException: Starting FGS without a type
```

**Solution:**
The AndroidManifest.xml has been fixed with foreground service types. Run:
```bash
cd android
./gradlew clean
cd ..
npm run android
```

### Issue: WebSocket connection drops

**Symptoms:**
```
[RelayClient] WebSocket closed
[RelayClient] Disconnected from relay
```

**Solutions:**

1. **Check network stability** - WiFi might be unstable
2. **Backend might have crashed** - Check backend terminal for errors
3. **Phone might be sleeping** - Disable battery optimization for the app:
   - Settings → Apps → GPTee → Battery → Unrestricted

### Issue: Model not loading

**Symptoms:**
```
[LlamaEngine] Failed to load model
```

**Solutions:**

1. **Check model file exists** - Go to Profile → Download Models
2. **Check storage permissions** - Grant storage permission to the app
3. **Check model format** - Must be `.gguf` format
4. **Check available RAM** - Larger models need more RAM (close other apps)

### Issue: Can't see other providers

**Symptoms:**
- No providers showing in node info popup
- "No providers available" error

**Solutions:**

1. **Check both devices connected**
   - Backend logs should show both peers registered
   ```bash
   [Relay] Registered: <peer-1> as provider
   [Relay] Registered: <peer-2> as user
   [Relay] Broadcasting 1 providers
   ```

2. **Check provider mode enabled**
   - Provider device must have toggle ON in Home Screen
   - Provider must have model downloaded

3. **Check same backend**
   - Both devices must connect to same `SERVER_HOST`
   - Check backend shows: `peers=2` in health logs

---

## Production vs Development

### Switching to Production

To test against production backend:

**Edit `src/config/index.ts`:**
```typescript
const SERVER_HOST = 'api.gptee.ai';
export const API_BASE_URL = `https://${SERVER_HOST}/api`;
export const RELAY_SERVER_URL = `wss://${SERVER_HOST}`;
export const COORDINATOR_URL = `wss://${SERVER_HOST}`;
```

Rebuild the app:
```bash
npm run android
```

### Switching Back to Local

**Edit `src/config/index.ts`:**
```typescript
const SERVER_HOST = '192.168.0.66';  // Your local IP
export const API_BASE_URL = `http://${SERVER_HOST}:9293/api`;
export const RELAY_SERVER_URL = `ws://${SERVER_HOST}:9293`;
export const COORDINATOR_URL = `ws://${SERVER_HOST}:9293`;
```

Rebuild:
```bash
npm run android
```

---

## Environment-Based Config (Advanced)

For easier switching, you can use environment variables:

**Create `.env` file:**
```env
# .env.development
BACKEND_HOST=192.168.0.66
BACKEND_PORT=9293
USE_HTTPS=false

# .env.production
BACKEND_HOST=api.gptee.ai
BACKEND_PORT=443
USE_HTTPS=true
```

**Update `src/config/index.ts`:**
```typescript
const IS_DEV = __DEV__;
const SERVER_HOST = IS_DEV ? '192.168.0.66' : 'api.gptee.ai';
const USE_SECURE = !IS_DEV;
const PORT = IS_DEV ? ':9293' : '';

export const API_BASE_URL = `${USE_SECURE ? 'https' : 'http'}://${SERVER_HOST}${PORT}/api`;
export const RELAY_SERVER_URL = `${USE_SECURE ? 'wss' : 'ws'}://${SERVER_HOST}${PORT}`;
export const COORDINATOR_URL = `${USE_SECURE ? 'wss' : 'ws'}://${SERVER_HOST}${PORT}`;
```

This automatically uses local config in development and production config in release builds.

---

## Next Steps

- **[Architecture Overview](./ARCHITECTURE.md)** - Understand how components work together
- **[API Documentation](./API.md)** - Backend API endpoints and WebSocket protocol
- **[Deployment Guide](./DEPLOYMENT.md)** - Deploy to production (AWS, ALB, etc.)

---

## Getting Help

- **Issues**: Report bugs at https://github.com/yourorg/gptee/issues
- **Discord**: Join our community for support
- **Docs**: Check docs/ folder for more guides
