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
} from './PeerProtocol';
import { WebRTCClient } from './WebRTCClient';

// ── Config ────────────────────────────────────────────────────────────────────
// Replace with your relay server URL (use your local IP or deployed server)
// Example for local testing: ws://192.168.1.100:8080
// Example for deployed: ws://your-server.com:8080
export const RELAY_URL = 'ws://192.168.0.66:8080'; // Android emulator localhost

// ── Callback types ────────────────────────────────────────────────────────────
export type OnProvidersUpdated = (providers: ProviderInfo[]) => void;
export type OnStreamToken = (requestId: string, token: string) => void;
export type OnStreamDone = (requestId: string, tokensGenerated: number, durationMs: number) => void;
export type OnResponse = (requestId: string, response: string, tokensGenerated: number, durationMs: number) => void;
export type OnInferenceRequest = (msg: InferenceRequestMessage) => void;
export type OnCancelRequest = (requestId: string) => void;
export type OnConnectionChange = (connected: boolean) => void;

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

  // Callbacks
  onProvidersUpdated: OnProvidersUpdated | null = null;
  onStreamToken: OnStreamToken | null = null;
  onStreamDone: OnStreamDone | null = null;
  onResponse: OnResponse | null = null;
  onInferenceRequest: OnInferenceRequest | null = null;
  onCancelRequest: OnCancelRequest | null = null;
  onConnectionChange: OnConnectionChange | null = null;

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
    console.log(`[RelayClient] Connecting to ${RELAY_URL} as ${this.role}...`);
    this.ws = new WebSocket(RELAY_URL);

    this.ws.onopen = () => {
      console.log('[RelayClient] ✅ Connected');
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
      console.log(`[RelayClient] Disconnected — Code: ${event.code}, Reason: ${event.reason}`);
      this.connected = false;
      this.onConnectionChange?.(false);
      this.stopPing();

      // Only reconnect if it wasn't intentional
      if (!this.intentionalDisconnect) {
        console.log('[RelayClient] Reconnecting in 3s...');
        this.scheduleReconnect(deviceInfo);
      }
    };
  }

  private handleMessage(msg: GPTeeMessage) {
    switch (msg.type) {
      case 'provider_list': {
        const pl = msg as ProviderListMessage;
        console.log(`[RelayClient] Providers: ${pl.providers.length}`);
        this.onProvidersUpdated?.(pl.providers);
        break;
      }

      case 'inference_request': {
        const req = msg as InferenceRequestMessage;
        console.log(`[RelayClient] Inference request from ${req.from} — "${req.prompt.slice(0, 40)}..."`);
        this.onInferenceRequest?.(req);
        break;
      }

      case 'inference_response': {
        const res = msg as InferenceResponseMessage;
        this.onResponse?.(res.requestId, res.response, res.tokensGenerated, res.durationMs);
        break;
      }

      case 'inference_stream': {
        const stream = msg as InferenceStreamMessage;
        this.onStreamToken?.(stream.requestId, stream.token);
        break;
      }

      case 'inference_done': {
        const done = msg as InferenceDoneMessage;
        this.onStreamDone?.(done.requestId, done.tokensGenerated, done.durationMs);
        break;
      }

      case 'inference_cancel': {
        const cancel = msg as InferenceCancelMessage;
        console.log(`[RelayClient] Cancel request for ${cancel.requestId} from ${cancel.from}`);
        this.onCancelRequest?.(cancel.requestId);
        break;
      }

      case 'error': {
        console.error(`[RelayClient] Server error: ${msg.code} — ${msg.message}`);
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
        console.log('[RelayClient] Initializing WebRTC as answerer');
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
      console.log(`[RelayClient] WebRTC message received: ${msg.type}`);
      // Route decrypted messages back through normal handlers
      this.handleMessage(msg);
    };

    this.webrtcClient.onConnectionStateChange = (state) => {
      console.log(`[RelayClient] WebRTC connection state: ${state}`);

      if (state === 'connected') {
        // WebRTC connected, flush queued messages
        this.flushMessageQueue();
      } else if (state === 'failed' || state === 'disconnected') {
        // WebRTC failed, flush queue via relay
        this.flushMessageQueueViaRelay();
      }
    };

    this.webrtcClient.onEncryptionReady = () => {
      console.log('[RelayClient] ✅ WebRTC encryption ready');
      this.webrtcInitializing = false;
      // Flush any queued messages now that encryption is ready
      this.flushMessageQueue();
    };
  }

  // ── Initiate WebRTC connection ────────────────────────────────────────────────
  async initiateWebRTC(providerId: string) {
    if (this.webrtcClient) {
      console.log('[RelayClient] WebRTC already initialized');
      return;
    }

    if (this.webrtcInitializing) {
      console.log('[RelayClient] WebRTC already initializing');
      return;
    }

    console.log(`[RelayClient] Initiating WebRTC to provider ${providerId}`);
    this.webrtcInitializing = true;
    this.initializeWebRTC(providerId);

    try {
      await this.webrtcClient!.initiateConnection(providerId, (msg) => {
        // Send signaling messages via relay
        this.sendRaw(msg);
      });
      console.log('[RelayClient] WebRTC initiation complete');
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
    params?: InferenceRequestMessage['params'],
  ): string {
    const requestId = uuidv4();
    const msg: InferenceRequestMessage = {
      type: 'inference_request',
      id: uuidv4(),
      from: this.peerId,
      to: providerId,
      timestamp: Date.now(),
      requestId,
      prompt,
      params: params ?? { maxTokens: 2048, temperature: 0.7 },
    };

    // If WebRTC is enabled and this is to a provider, initiate WebRTC connection
    if (this.useWebRTC && this.role === 'user' && !this.webrtcClient && !this.webrtcInitializing) {
      console.log('[RelayClient] Starting WebRTC connection for provider');
      this.initiateWebRTC(providerId).catch(err => {
        console.error('[RelayClient] ❌ WebRTC initiation failed:', err);
        throw new Error('Failed to establish P2P connection. WebRTC is required for inference.');
      });
    }

    // If WebRTC is initializing, queue the message
    if (this.webrtcInitializing) {
      console.log('[RelayClient] Queueing message until WebRTC ready');
      this.messageQueue.push({ msg, resolve: () => {} });
      return requestId;
    }

    // Send via WebRTC only - no relay fallback
    if (this.webrtcClient?.isConnected()) {
      console.log('[RelayClient] ✅ Sending request via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = '❌ WebRTC not connected. Cannot send inference request via relay (P2P-only mode).';
      console.error('[RelayClient]', error);
      throw new Error(error);
    }

    return requestId;
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
    const isCorrectPeer = this.activeProviderId === userPeerId;
    console.log(`[RelayClient] sendStreamToken: WebRTC=${isWebRTCConnected}, correctPeer=${isCorrectPeer}, activeProvider=${this.activeProviderId}, userPeer=${userPeerId}`);

    if (isWebRTCConnected && isCorrectPeer) {
      console.log('[RelayClient] ✅ Sending stream token via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = `❌ Cannot send stream token: WebRTC not connected or peer mismatch (P2P-only mode)`;
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
    console.log(`[RelayClient] sendStreamDone: WebRTC=${isWebRTCConnected}, correctPeer=${isCorrectPeer}`);

    if (isWebRTCConnected && isCorrectPeer) {
      console.log('[RelayClient] ✅ Sending done via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = `❌ Cannot send stream done: WebRTC not connected or peer mismatch (P2P-only mode)`;
      console.error('[RelayClient]', error);
      throw new Error(error);
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
    if (this.webrtcClient?.isConnected() && this.activeProviderId === providerPeerId) {
      console.log('[RelayClient] ✅ Sending cancel via WebRTC');
      this.webrtcClient.sendMessage(msg);
    } else {
      const error = `❌ Cannot send cancel request: WebRTC not connected or peer mismatch (P2P-only mode)`;
      console.error('[RelayClient]', error);
      throw new Error(error);
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

  disconnect() {
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
      this.webrtcClient.close();
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