import { v4 as uuidv4 } from 'uuid';
import {
  GPTeeMessage,
  RegisterMessage,
  InferenceRequestMessage,
  InferenceResponseMessage,
  InferenceStreamMessage,
  InferenceDoneMessage,
  InferenceCancelMessage,
  ProviderListMessage,
  ProviderInfo,
  PeerRole,
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
  ProviderFailoverMessage,
  InferenceErrorMessage,
  QueueStatusMessage,
  ReadyToProcessMessage,
  ChatMessage,
} from './PeerProtocol';
import { WebRTCClient } from './WebRTCClient';
import { RELAY_SERVER_URL } from '../config';

// ── Config ────────────────────────────────────────────────────────────────────
export const RELAY_URL = RELAY_SERVER_URL;

// ── Callback types ────────────────────────────────────────────────────────────
export type OnProvidersUpdated = (providers: ProviderInfo[]) => void;
export type OnStreamToken = (requestId: string, token: string) => void;
export type OnStreamDone = (requestId: string, tokensGenerated: number, durationMs: number, providerName: string) => void;
export type OnResponse = (requestId: string, response: string, tokensGenerated: number, durationMs: number, providerName: string) => void;
export type OnInferenceRequest = (msg: InferenceRequestMessage) => void;
export type OnCancelRequest = (requestId: string) => void;
export type OnConnectionChange = (connected: boolean) => void;
export type OnProviderFailover = (requestId: string, newProviderName: string, tokensReceived: number) => void;
export type OnInferenceError = (requestId: string, code: string, message: string) => void;

// ── RelayClient ───────────────────────────────────────────────────────────────
class RelayClient {
  private ws: WebSocket | null = null;
  private peerId: string;
  private role: PeerRole = 'user';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connected = false;
  private intentionalDisconnect = false;

  // WebRTC
  private webrtcClient: WebRTCClient | null = null;
  private activeProviderId: string | null = null;
  private useWebRTC = true; // Enable WebRTC by default
  private webrtcInitializing = false; // Track if WebRTC is being initialized
  private messageQueue: Array<{ msg: GPTeeMessage; resolve: () => void }> = []; // Queue messages during WebRTC setup

  // Request tracking for client-side failover
  private pendingRequests = new Map<string, {
    requestId: string;
    providerId: string;
    prompt: string;
    conversationHistory: ChatMessage[];
    startTime: number;
    timeoutTimer: ReturnType<typeof setTimeout> | null;
  }>();
  private providers: ProviderInfo[] = [];

  // Callbacks
  onProvidersUpdated: OnProvidersUpdated | null = null;
  onStreamToken: OnStreamToken | null = null;
  onStreamDone: OnStreamDone | null = null;
  onResponse: OnResponse | null = null;
  onInferenceRequest: OnInferenceRequest | null = null;
  onCancelRequest: OnCancelRequest | null = null;
  onConnectionChange: OnConnectionChange | null = null;
  onProviderFailover: OnProviderFailover | null = null;
  onInferenceError: OnInferenceError | null = null;

  constructor() {
    this.peerId = this.getOrCreatePeerId();
  }

  // ── Peer ID persistence ─────────────────────────────────────────────────────
  private getOrCreatePeerId(): string {
    // In production use AsyncStorage — for now generate per session
    return `peer_${uuidv4()}`;
  }

  getPeerId(): string {
    return this.peerId;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // Check if WebRTC is connected
  isWebRTCConnected(): boolean {
    return this.webrtcClient?.isConnected() || false;
  }

  // Get the active provider ID (peer currently connected via WebRTC)
  getActiveProviderId(): string | null {
    return this.activeProviderId;
  }

  // Get the provider currently handling a request (for accurate provider name in UI)
  getProviderForRequest(requestId: string): ProviderInfo | null {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return null;

    return this.providers.find(p => p.peerId === pending.providerId) || null;
  }


  // Close WebRTC if connected to wrong peer (prevents cross-contamination)
  ensureCorrectPeer(expectedPeerId: string) {
    if (this.webrtcClient && this.activeProviderId !== expectedPeerId) {
      console.log(`[RelayClient] ⚠️ Closing WebRTC with wrong peer (expected ${expectedPeerId}, got ${this.activeProviderId})`);
      this.webrtcClient.close();
      this.webrtcClient = null;
      this.activeProviderId = null;
    }
  }

  // Close current WebRTC connection (for cleanup after request completes)
  closeWebRTC() {
    if (this.webrtcClient) {
      console.log(`[RelayClient] 🔌 Closing WebRTC connection with ${this.activeProviderId?.slice(0, 8)}`);
      this.webrtcClient.close();
      this.webrtcClient = null;
      this.activeProviderId = null;
      this.webrtcInitializing = false;
    }
  }

  // ── Connect ─────────────────────────────────────────────────────────────────
  connect(role: PeerRole, deviceInfo: RegisterMessage['deviceInfo']) {
    this.role = role;
    this.openSocket(deviceInfo);
  }

  // ── Update registration without reconnecting ──────────────────────────────
  updateRegistration(deviceInfo: RegisterMessage['deviceInfo']) {
    if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[RelayClient] Cannot update registration - not connected');
      return;
    }

    const reg: RegisterMessage = {
      type: 'register',
      id: uuidv4(),
      from: this.peerId,
      timestamp: Date.now(),
      role: this.role,
      deviceInfo,
    };
    this.sendRaw(reg);
    console.log('[RelayClient] Updated registration');
  }

  private openSocket(deviceInfo: RegisterMessage['deviceInfo']) {
    // Cancel any pending reconnect timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clean up existing socket if any
    if (this.ws) {
      // Mark as intentional disconnect to prevent reconnect logic
      this.intentionalDisconnect = true;

      // Remove event handlers to prevent them from firing
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
    }

    // Now reset for new connection
    this.intentionalDisconnect = false;
    // console.log(`[RelayClient] Connecting to ${RELAY_URL} as ${this.role}...`);
    this.ws = new WebSocket(RELAY_URL);

    this.ws.onopen = () => {
      // console.log('[RelayClient] ✅ Connected');
      this.connected = true;
      this.onConnectionChange?.(true);

      // Register with relay
      const reg: RegisterMessage = {
        type: 'register',
        id: uuidv4(),
        from: this.peerId,
        timestamp: Date.now(),
        role: this.role,
        deviceInfo,
      };
      this.sendRaw(reg);

      // Start ping keepalive
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as GPTeeMessage;
        this.handleMessage(msg);
      } catch (e) {
        console.error('[RelayClient] Failed to parse message', e);
      }
    };

    this.ws.onerror = (err) => {
      console.error('[RelayClient] Socket error', err);
    };

    this.ws.onclose = (event) => {
      // console.log(`[RelayClient] Disconnected — Code: ${event.code}, Reason: ${event.reason}`);
      this.connected = false;
      this.onConnectionChange?.(false);
      this.stopPing();

      // Only reconnect if it wasn't intentional
      if (!this.intentionalDisconnect) {
        // console.log('[RelayClient] Reconnecting in 3s...');
        this.scheduleReconnect(deviceInfo);
      }
    };
  }

  private handleMessage(msg: GPTeeMessage) {
    switch (msg.type) {
      case 'provider_list': {
        const pl = msg as ProviderListMessage;
        console.log(`[RelayClient] 📋 Provider list updated: ${pl.providers.length} providers`);
        console.log(`[RelayClient] 🔍 Current peerId: ${this.peerId}`);
        console.log(`[RelayClient] 🔍 onProvidersUpdated callback exists: ${!!this.onProvidersUpdated}`);
        pl.providers.forEach((p, i) => {
          const isSelf = p.peerId === this.peerId;
          console.log(`[RelayClient]   ${i + 1}. ${p.displayName} (${p.peerId.substring(0, 8)}...)${isSelf ? ' ← THIS NODE' : ''}`);
        });
        this.providers = pl.providers; // Store for failover
        console.log(`[RelayClient] 📤 Calling onProvidersUpdated with ${pl.providers.length} providers`);
        this.onProvidersUpdated?.(pl.providers);
        break;
      }

      case 'inference_request': {
        const req = msg as InferenceRequestMessage;
        // console.log(`[RelayClient] Inference request from ${req.from} — "${req.prompt.slice(0, 40)}..."`);
        this.onInferenceRequest?.(req);
        break;
      }

      case 'inference_response': {
        const res = msg as InferenceResponseMessage;

        // Get provider info for this request
        const pending = this.pendingRequests.get(res.requestId);
        const providerInfo = pending ? this.providers.find(p => p.peerId === pending.providerId) : null;
        const providerName = providerInfo?.displayName || 'Unknown Provider';

        this.onResponse?.(res.requestId, res.response, res.tokensGenerated, res.durationMs, providerName);
        break;
      }

      case 'inference_stream': {
        const stream = msg as InferenceStreamMessage;

        // Reset timeout on each token - this is activity, not a stall
        this.resetRequestTimeout(stream.requestId);

        this.onStreamToken?.(stream.requestId, stream.token);
        break;
      }

      case 'inference_done': {
        const done = msg as InferenceDoneMessage;

        // Get provider info BEFORE deleting from pending requests
        const pending = this.pendingRequests.get(done.requestId);
        const providerInfo = pending ? this.providers.find(p => p.peerId === pending.providerId) : null;

        // Clear timeout and remove from pending requests
        if (pending?.timeoutTimer) {
          clearTimeout(pending.timeoutTimer);
        }
        this.pendingRequests.delete(done.requestId);

        // Pass provider name directly to callback
        const providerName = providerInfo?.displayName || 'Unknown Provider';
        this.onStreamDone?.(done.requestId, done.tokensGenerated, done.durationMs, providerName);
        break;
      }

      case 'inference_cancel': {
        const cancel = msg as InferenceCancelMessage;
        // console.log(`[RelayClient] Cancel request for ${cancel.requestId} from ${cancel.from}`);
        this.onCancelRequest?.(cancel.requestId);
        break;
      }

      case 'error': {
        console.error(`[RelayClient] Server error: ${msg.code} — ${msg.message}`);
        break;
      }

      case 'provider_failover': {
        const failover = msg as ProviderFailoverMessage;
        console.log(`[RelayClient] ♻️  Provider failed over for request ${failover.requestId}`);
        console.log(`[RelayClient] New provider: ${failover.newProviderName} (${failover.tokensReceived} tokens preserved)`);

        // Update active provider ID
        this.activeProviderId = failover.newProviderId;

        // Notify UI about seamless failover
        this.onProviderFailover?.(failover.requestId, failover.newProviderName, failover.tokensReceived);
        break;
      }

      case 'inference_error': {
        const error = msg as InferenceErrorMessage;
        console.log(`[RelayClient] ❌ Inference error: ${error.code} - ${error.message}`);

        // For errors, notify UI
        this.onInferenceError?.(error.requestId, error.code, error.message);
        break;
      }


      case 'pong': {
        // keepalive ack
        break;
      }

      // WebRTC signaling messages
      case 'webrtc_offer':
      case 'webrtc_answer':
      case 'webrtc_ice_candidate': {
        this.handleWebRTCSignaling(msg as any);
        break;
      }
    }
  }

  // ── Handle WebRTC signaling ───────────────────────────────────────────────────
  private async handleWebRTCSignaling(msg: WebRTCOfferMessage | WebRTCAnswerMessage | WebRTCIceCandidateMessage) {
    if (!this.webrtcClient) {
      // Initialize WebRTC client if we receive an offer (we're the answerer)
      if (msg.type === 'webrtc_offer') {
        // console.log('[RelayClient] Initializing WebRTC as answerer');
        this.webrtcInitializing = true;
        this.initializeWebRTC(msg.from);

        // Set signaling callback for answerer
        this.webrtcClient!['sendSignalingMessage'] = (sigMsg: any) => {
          this.sendRaw(sigMsg);
        };
      } else {
        console.warn('[RelayClient] Received WebRTC message but no client initialized');
        return;
      }
    }

    await this.webrtcClient!.handleSignalingMessage(msg);
  }

  // ── Initialize WebRTC ─────────────────────────────────────────────────────────
  private initializeWebRTC(remotePeerId: string) {
    this.webrtcClient = new WebRTCClient(this.peerId);
    this.activeProviderId = remotePeerId;

    // Setup callbacks
    this.webrtcClient.onDataChannelMessage = (msg: GPTeeMessage) => {
      // console.log(`[RelayClient] WebRTC message received: ${msg.type}`);
      // Route decrypted messages back through normal handlers
      this.handleMessage(msg);
    };

    this.webrtcClient.onConnectionStateChange = (state) => {
      console.log(`[RelayClient] WebRTC connection state: ${state}`);

      if (state === 'failed' || state === 'disconnected') {
        // Get all pending requests for this provider
        const failedProviderId = this.activeProviderId;
        const pendingRequestIds: string[] = [];

        this.pendingRequests.forEach((pending, requestId) => {
          if (pending.providerId === failedProviderId) {
            pendingRequestIds.push(requestId);
          }
        });

        // Only trigger failover if there are actually pending requests
        if (pendingRequestIds.length > 0) {
          console.log(`[RelayClient] 💔 WebRTC connection lost - triggering immediate failover for ${pendingRequestIds.length} pending request(s)`);

          // Trigger failover for each pending request
          pendingRequestIds.forEach(requestId => {
            console.log(`[RelayClient] ⚡ Immediate failover triggered for request ${requestId}`);
            this.retryWithNextProvider(requestId);
          });
        } else {
          console.log('[RelayClient] WebRTC disconnected but no pending requests to fail over');
        }

        // Flush any queued messages via relay
        this.flushMessageQueueViaRelay();
      }
      // Don't flush on 'connected' - wait for encryption ready to ensure data channel is open
    };

    this.webrtcClient.onEncryptionReady = () => {
      // console.log('[RelayClient] ✅ WebRTC encryption ready');  
      this.webrtcInitializing = false;
      // Flush any queued messages now that encryption AND data channel are ready
      this.flushMessageQueue();
    };
  }

  // ── Initiate WebRTC connection ────────────────────────────────────────────────
  async initiateWebRTC(providerId: string) {
    if (this.webrtcClient) {
      // console.log('[RelayClient] WebRTC already initialized');
      return;
    }

    if (this.webrtcInitializing) {
      // console.log('[RelayClient] WebRTC already initializing');
      return;
    }

    // console.log(`[RelayClient] Initiating WebRTC to provider ${providerId}`);
    this.webrtcInitializing = true;
    this.initializeWebRTC(providerId);

    try {
      await this.webrtcClient!.initiateConnection(providerId, (msg) => {
        // Send signaling messages via relay
        this.sendRaw(msg);
      });
      // console.log('[RelayClient] WebRTC initiation complete');
    } catch (err) {
      console.error('[RelayClient] WebRTC initiation error:', err);
      this.webrtcInitializing = false;
      // Flush queue via relay on error
      this.flushMessageQueueViaRelay();
    }
  }

  // ── Send inference request (User → Provider) ────────────────────────────────
  sendInferenceRequest(
    providerId: string,
    prompt: string,
    conversationHistory?: ChatMessage[],
    params?: InferenceRequestMessage['params'],
  ): string {
    const requestId = uuidv4();

    console.log(`[RelayClient] 📤 Sending request to provider: ${providerId}`);
    console.log(`[RelayClient] 📊 Available providers for failover: ${this.providers.length}`);
    this.providers.forEach((p, i) => {
      console.log(`[RelayClient]   ${i + 1}. ${p.displayName} (${p.peerId.substring(0, 8)}...) ${p.peerId === providerId ? '← SELECTED' : ''}`);
    });

    // Track this request for client-side failover
    // Use 60s idle timeout (resets on each token received)
    const timeoutTimer = setTimeout(() => {
      this.handleRequestTimeout(requestId);
    }, 60000); // 60 second idle timeout

    this.pendingRequests.set(requestId, {
      requestId,
      providerId,
      prompt,
      conversationHistory: conversationHistory || [],
      startTime: Date.now(),
      timeoutTimer,
    });

    const msg: InferenceRequestMessage = {
      type: 'inference_request',
      id: uuidv4(),
      from: this.peerId,
      to: providerId,
      timestamp: Date.now(),
      requestId,
      prompt,
      conversationHistory, // Include full conversation for failover
      params: params ?? { maxTokens: 2048, temperature: 0.7 },
    };

    // If WebRTC is enabled, initiate WebRTC connection (both users and providers can initiate)
    if (this.useWebRTC && !this.webrtcClient && !this.webrtcInitializing) {
      // console.log('[RelayClient] Starting WebRTC connection for provider');
      this.initiateWebRTC(providerId).catch(err => {
        console.error('[RelayClient] ❌ WebRTC initiation failed:', err);

        // Clear timeout and retry with next provider
        const pending = this.pendingRequests.get(requestId);
        if (pending?.timeoutTimer) {
          clearTimeout(pending.timeoutTimer);
        }
        this.retryWithNextProvider(requestId);
      });
    }

    // If WebRTC is initializing, queue the message
    if (this.webrtcInitializing) {
      // console.log('[RelayClient] Queueing message until WebRTC ready');
      this.messageQueue.push({ msg, resolve: () => {} });
      return requestId;
    }

    // Send via WebRTC only - no relay fallback
    if (this.webrtcClient?.isConnected()) {
      console.log('[RelayClient] ✅ Sending request via WebRTC to', providerId);
      // Update activeProviderId when reusing existing WebRTC connection
      this.activeProviderId = providerId;
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = '❌ WebRTC not connected. Cannot send inference request via relay (P2P-only mode).';
      console.error('[RelayClient]', error);

      // Clear timeout and retry
      const pending = this.pendingRequests.get(requestId);
      if (pending?.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.retryWithNextProvider(requestId);
    }

    return requestId;
  }

  // ── Handle request timeout (60s idle - no activity) ───────────────────────────
  private handleRequestTimeout(requestId: string) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    console.log(`[RelayClient] ⏰ Request ${requestId} timed out after 60s of inactivity`);

    // Retry with next provider
    this.retryWithNextProvider(requestId);
  }

  // ── Reset timeout timer (called on each token received) ───────────────────────
  private resetRequestTimeout(requestId: string) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    // Clear existing timeout
    if (pending.timeoutTimer) {
      clearTimeout(pending.timeoutTimer);
    }

    // Set new timeout - 60s of inactivity
    pending.timeoutTimer = setTimeout(() => {
      this.handleRequestTimeout(requestId);
    }, 60000); // 60 seconds idle timeout
  }

  // ── Retry with next available provider ────────────────────────────────────────
  private async retryWithNextProvider(requestId: string) {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.log(`[RelayClient] ⚠️ Timeout for request ${requestId} but it's no longer pending - ignoring`);
      return;
    }

    console.log(`[RelayClient] 🔍 Checking providers - Current list has ${this.providers.length} providers`);
    console.log(`[RelayClient] Failed provider: ${pending.providerId}`);

    // Find next available provider (excluding current failed one)
    const availableProviders = this.providers.filter(p => p.peerId !== pending.providerId);
    console.log(`[RelayClient] Available alternatives: ${availableProviders.length}`);

    if (availableProviders.length === 0) {
      console.log(`[RelayClient] ❌ No alternative providers available (Total: ${this.providers.length}, Failed: ${pending.providerId})`);

      // Check if the provider list might be stale
      if (this.providers.length > 0) {
        console.log(`[RelayClient] ⚠️ Provider list might be stale - only has the failed provider`);
      }

      // Clean up the pending request
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.pendingRequests.delete(requestId);

      // Only show error if this is still an active request (not a stale one)
      // Check if there are any tokens already received for this request
      if (pending.startTime && (Date.now() - pending.startTime) < 5000) {
        // Only show error for requests that failed quickly (< 5 seconds)
        // This filters out stale requests that timed out after user moved on
        this.onInferenceError?.(requestId, 'NO_PROVIDERS_AVAILABLE', 'No alternative providers available. Please try again.');
      } else {
        console.log(`[RelayClient] ℹ️ Silently dropping timeout for old request ${requestId}`);
      }
      return;
    }

    const nextProvider = availableProviders[0]; // Least loaded (already sorted by relay)
    console.log(`[RelayClient] ♻️  Switching from ${pending.providerId} to ${nextProvider.peerId}`);

    // Update pending request with new provider
    pending.providerId = nextProvider.peerId;
    pending.startTime = Date.now();

    // Reset timeout
    if (pending.timeoutTimer) {
      clearTimeout(pending.timeoutTimer);
    }
    pending.timeoutTimer = setTimeout(() => {
      this.handleRequestTimeout(requestId);
    }, 60000); // 60 second idle timeout

    // Notify UI about provider switch
    this.onProviderFailover?.(requestId, nextProvider.displayName || 'Unknown', 0);

    // Gracefully close old WebRTC connection before switching
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

    // Send request to new provider
    this.sendInferenceRequestInternal(nextProvider.peerId, pending.prompt, pending.conversationHistory, requestId);
  }


  // ── Internal send (for retries) ───────────────────────────────────────────────
  private async sendInferenceRequestInternal(
    providerId: string,
    prompt: string,
    conversationHistory: ChatMessage[],
    requestId: string
  ) {
    const msg: InferenceRequestMessage = {
      type: 'inference_request',
      id: uuidv4(),
      from: this.peerId,
      to: providerId,
      timestamp: Date.now(),
      requestId,
      prompt,
      conversationHistory,
      isFailoverRequest: true,
      params: { maxTokens: 2048, temperature: 0.7 },
    };

    // Initiate new WebRTC connection
    if (this.useWebRTC && !this.webrtcClient && !this.webrtcInitializing) {
      try {
        await this.initiateWebRTC(providerId);

        // Wait a moment for WebRTC to be ready
        setTimeout(() => {
          if (this.webrtcClient?.isConnected()) {
            console.log('[RelayClient] ✅ Sending retry request via WebRTC');
            this.webrtcClient.sendMessage(msg);
          } else {
            // Queue it
            this.messageQueue.push({ msg, resolve: () => {} });
          }
        }, 500);
      } catch (err) {
        console.error('[RelayClient] ❌ Retry WebRTC initiation failed:', err);

        // Try one more provider
        const pending = this.pendingRequests.get(requestId);
        if (pending?.timeoutTimer) {
          clearTimeout(pending.timeoutTimer);
        }
        this.retryWithNextProvider(requestId);
      }
    }
  }

  // ── Send stream token (Provider → User) ─────────────────────────────────────
  sendStreamToken(userPeerId: string, requestId: string, token: string) {
    const msg: InferenceStreamMessage = {
      type: 'inference_stream',
      id: uuidv4(),
      from: this.peerId,
      to: userPeerId,
      timestamp: Date.now(),
      requestId,
      token,
    };

    // Send via WebRTC only - no relay fallback
    const isWebRTCConnected = this.webrtcClient?.isConnected();
    // Check if we have an active connection with this peer (works for both initiator and answerer)
    const isCorrectPeer = this.activeProviderId === userPeerId;
    console.log(`[RelayClient] sendStreamToken: WebRTC=${isWebRTCConnected}, correctPeer=${isCorrectPeer}, activeProvider=${this.activeProviderId}, userPeer=${userPeerId}`);

    if (isWebRTCConnected && isCorrectPeer) {
      // Send via WebRTC if connected to correct peer
      console.log('[RelayClient] ✅ Sending stream token via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      // WebRTC not ready - throw error so consumer can retry
      const error = `❌ Cannot send stream token: WebRTC not ready (connected=${isWebRTCConnected}, correctPeer=${isCorrectPeer})`;
      console.error('[RelayClient]', error);
      throw new Error(error);
    }
  }

  // ── Send done signal (Provider → User) ──────────────────────────────────────
  sendStreamDone(userPeerId: string, requestId: string, tokensGenerated: number, durationMs: number) {
    const msg: InferenceDoneMessage = {
      type: 'inference_done',
      id: uuidv4(),
      from: this.peerId,
      to: userPeerId,
      timestamp: Date.now(),
      requestId,
      tokensGenerated,
      durationMs,
    };

    // Send via WebRTC only - no relay fallback
    const isWebRTCConnected = this.webrtcClient?.isConnected();
    const isCorrectPeer = this.activeProviderId === userPeerId;
    console.log(`[RelayClient] sendStreamDone: WebRTC=${isWebRTCConnected}, correctPeer=${isCorrectPeer}, activeProvider=${this.activeProviderId}, userPeer=${userPeerId}`);

    if (isWebRTCConnected && isCorrectPeer) {
      // Send via WebRTC if connected to correct peer
      console.log('[RelayClient] ✅ Sending done via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      // WebRTC not ready - throw error so consumer can retry
      const error = `❌ Cannot send stream done: WebRTC not ready (connected=${isWebRTCConnected}, correctPeer=${isCorrectPeer})`;
      console.error('[RelayClient]', error);
      throw new Error(error);
    }
  }

  // Send error response to consumer (provider → consumer)
  sendInferenceError(userPeerId: string, requestId: string, code: string, message: string) {
    const msg: InferenceErrorMessage = {
      type: 'inference_error',
      id: uuidv4(),
      from: this.peerId,
      to: userPeerId,
      timestamp: Date.now(),
      requestId,
      code,
      message,
    };

    // Send via WebRTC if available, fallback to relay
    const isWebRTCConnected = this.webrtcClient?.isConnected();

    if (isWebRTCConnected) {
      console.log('[RelayClient] ✅ Sending error via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      console.log('[RelayClient] Sending error via relay');
      this.send(msg);
    }
  }


  // ── Send full response (non-streaming fallback) ──────────────────────────────
  sendInferenceResponse(
    userPeerId: string,
    requestId: string,
    response: string,
    tokensGenerated: number,
    durationMs: number,
  ) {
    const msg: InferenceResponseMessage = {
      type: 'inference_response',
      id: uuidv4(),
      from: this.peerId,
      to: userPeerId,
      timestamp: Date.now(),
      requestId,
      response,
      tokensGenerated,
      durationMs,
    };
    this.sendRaw(msg);
  }

  // ── Send cancel request (User → Provider) ───────────────────────────────────
  sendCancelRequest(providerPeerId: string, requestId: string) {
    const msg: InferenceCancelMessage = {
      type: 'inference_cancel',
      id: uuidv4(),
      from: this.peerId,
      to: providerPeerId,
      timestamp: Date.now(),
      requestId,
    };

    // Send via WebRTC only - no relay fallback
    if (this.webrtcClient?.isConnected()) {
      console.log('[RelayClient] ✅ Sending cancel via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = `❌ Cannot send cancel request: WebRTC not connected (P2P-only mode)`;
      console.error('[RelayClient]', error);
      throw new Error(error);
    }

    // CRITICAL: Clean up pending request and timeout timer
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      console.log(`[RelayClient] 🧹 Cleaning up cancelled request ${requestId}`);
      if (pending.timeoutTimer) {
        clearTimeout(pending.timeoutTimer);
      }
      this.pendingRequests.delete(requestId);
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────────
  private sendRaw(msg: GPTeeMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[RelayClient] Cannot send — not connected');
    }
  }

  private startPing() {
    this.pingTimer = setInterval(() => {
      this.sendRaw({
        type: 'ping',
        id: uuidv4(),
        from: this.peerId,
        timestamp: Date.now(),
      });
    }, 20_000);
  }

  private stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(deviceInfo: RegisterMessage['deviceInfo']) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket(deviceInfo);
    }, 3000);
  }

  // ── Flush queued messages via WebRTC ──────────────────────────────────────────
  private flushMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log(`[RelayClient] Flushing ${this.messageQueue.length} queued messages via WebRTC`);

    while (this.messageQueue.length > 0) {
      const { msg, resolve } = this.messageQueue.shift()!;

      if (this.webrtcClient?.isConnected()) {
        this.webrtcClient.sendMessage(msg);
      } else {
        // WebRTC not connected - this should not happen during normal operation
        console.error('[RelayClient] ❌ Cannot flush message queue: WebRTC not connected (P2P-only mode)');
        console.error('[RelayClient] Dropped message:', msg.type);
      }

      resolve();
    }
  }

  // ── Flush queued messages via relay (fallback) ────────────────────────────────
  private flushMessageQueueViaRelay() {
    if (this.messageQueue.length === 0) return;

    console.log(`[RelayClient] Flushing ${this.messageQueue.length} queued messages via relay (WebRTC failed)`);

    while (this.messageQueue.length > 0) {
      const { msg, resolve } = this.messageQueue.shift()!;
      this.sendRaw(msg);
      resolve();
    }
  }

  async disconnect() {
    this.intentionalDisconnect = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

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

  // ── WebRTC status ─────────────────────────────────────────────────────────────
  isWebRTCConnected(): boolean {
    return this.webrtcClient?.isConnected() ?? false;
  }

  getWebRTCState(): string {
    return this.webrtcClient?.getConnectionState() ?? 'not initialized';
  }
}

// Singleton
export const relayClient = new RelayClient();