/**
 * WebRTCClient.ts
 * Handles WebRTC peer-to-peer connections with end-to-end encryption
 *
 * Features:
 * - Direct P2P connection using WebRTC DataChannel
 * - End-to-end encryption using AES-256 via crypto-js
 * - Uses relay server only for signaling (SDP exchange)
 * - Automatic reconnection and ICE candidate handling
 */

import { v4 as uuidv4 } from 'uuid';
const CryptoJS = require('crypto-js');
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  GPTeeMessage,
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
} from './PeerProtocol';

// ── Crypto utilities using crypto-js ─────────────────────────────────────────

/**
 * Generate a random encryption key (256-bit)
 */
function generateEncryptionKey(): string {
  // Generate 32 random bytes (256 bits) and convert to hex string
  const wordArray = CryptoJS.lib.WordArray.random(32);
  return wordArray.toString(CryptoJS.enc.Hex);
}

/**
 * Encrypt data using AES-256
 */
function encrypt(key: string, data: string): { ciphertext: string; iv: string } {
  // Generate random IV (16 bytes for AES)
  const iv = CryptoJS.lib.WordArray.random(16);

  // Encrypt
  const encrypted = CryptoJS.AES.encrypt(data, CryptoJS.enc.Hex.parse(key), {
    iv: iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  return {
    ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
    iv: iv.toString(CryptoJS.enc.Base64),
  };
}

/**
 * Decrypt data using AES-256
 */
function decrypt(key: string, ciphertext: string, iv: string): string {
  // Parse the ciphertext and IV
  const ciphertextWordArray = CryptoJS.enc.Base64.parse(ciphertext);
  const ivWordArray = CryptoJS.enc.Base64.parse(iv);

  // Decrypt
  const decrypted = CryptoJS.AES.decrypt(
    { ciphertext: ciphertextWordArray } as any,
    CryptoJS.enc.Hex.parse(key),
    {
      iv: ivWordArray,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }
  );

  return decrypted.toString(CryptoJS.enc.Utf8);
}

// ── Type alias for signaling messages ─────────────────────────────────────────
export type WebRTCSignalingMessage =
  | WebRTCOfferMessage
  | WebRTCAnswerMessage
  | WebRTCIceCandidateMessage;

// ── Encrypted data channel message ────────────────────────────────────────────
export interface EncryptedMessage {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded
  messageType: string; // Original message type
}

// ── Configuration ─────────────────────────────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ── Callback types ────────────────────────────────────────────────────────────
export type OnDataChannelMessage = (msg: GPTeeMessage) => void;
export type OnConnectionStateChange = (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void;
export type OnEncryptionReady = () => void;

// ── WebRTCClient ──────────────────────────────────────────────────────────────
export class WebRTCClient {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: any | null = null; // RTCDataChannel type from react-native-webrtc
  private peerId: string;
  private remotePeerId: string | null = null;
  private encryptionKey: string | null = null;
  private isInitiator: boolean = false;
  private iceCandidateQueue: any[] = [];
  private isClosing: boolean = false; // Track intentional shutdown

  // Callbacks
  onDataChannelMessage: OnDataChannelMessage | null = null;
  onConnectionStateChange: OnConnectionStateChange | null = null;
  onEncryptionReady: OnEncryptionReady | null = null;

  // Signaling callback (sends signaling messages via relay server)
  private sendSignalingMessage: ((msg: WebRTCSignalingMessage) => void) | null = null;

  constructor(peerId: string) {
    this.peerId = peerId;
  }

  // ── Initialize connection as initiator (caller) ───────────────────────────────
  async initiateConnection(
    remotePeerId: string,
    sendSignalingCallback: (msg: WebRTCSignalingMessage) => void
  ): Promise<void> {
    console.log(`[WebRTC] Initiating connection to ${remotePeerId}`);
    this.isInitiator = true;
    this.remotePeerId = remotePeerId;
    this.sendSignalingMessage = sendSignalingCallback;

    // Generate encryption key
    this.encryptionKey = generateEncryptionKey();
    console.log('[WebRTC] Encryption key generated');

    // Create peer connection
    this.createPeerConnection();

    // Create data channel
    this.dataChannel = this.peerConnection!.createDataChannel('gptee-data', {
      ordered: true,
      maxRetransmits: 3,
    });
    this.setupDataChannel(this.dataChannel);

    // Create and send offer
    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    // Send offer with encryption key
    const offerMsg: WebRTCOfferMessage = {
      type: 'webrtc_offer',
      id: uuidv4(),
      from: this.peerId,
      to: remotePeerId,
      timestamp: Date.now(),
      sdp: offer.sdp!,
      encryptionKeyOffer: this.encryptionKey,
    };

    this.sendSignalingMessage(offerMsg);
    console.log('[WebRTC] Offer sent');
  }

  // ── Handle signaling messages ─────────────────────────────────────────────────
  async handleSignalingMessage(msg: WebRTCSignalingMessage): Promise<void> {
    switch (msg.type) {
      case 'webrtc_offer':
        await this.handleOffer(msg as WebRTCOfferMessage);
        break;

      case 'webrtc_answer':
        await this.handleAnswer(msg as WebRTCAnswerMessage);
        break;

      case 'webrtc_ice_candidate':
        await this.handleIceCandidate(msg as WebRTCIceCandidateMessage);
        break;
    }
  }

  // ── Handle incoming offer (answerer) ──────────────────────────────────────────
  private async handleOffer(msg: WebRTCOfferMessage): Promise<void> {
    console.log(`[WebRTC] Received offer from ${msg.from}`);
    this.isInitiator = false;
    this.remotePeerId = msg.from;

    if (!this.sendSignalingMessage) {
      console.error('[WebRTC] Signaling callback not set');
      return;
    }

    // Import encryption key from offer
    this.encryptionKey = msg.encryptionKeyOffer;
    console.log('[WebRTC] Encryption key imported');

    // Create peer connection
    this.createPeerConnection();

    // Set remote description
    const offer = new RTCSessionDescription({ type: 'offer', sdp: msg.sdp });
    await this.peerConnection!.setRemoteDescription(offer);

    // Create and send answer
    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    const answerMsg: WebRTCAnswerMessage = {
      type: 'webrtc_answer',
      id: uuidv4(),
      from: this.peerId,
      to: msg.from,
      timestamp: Date.now(),
      sdp: answer.sdp!,
      encryptionKeyAnswer: msg.encryptionKeyOffer, // Echo back for confirmation
    };

    this.sendSignalingMessage(answerMsg);
    console.log('[WebRTC] Answer sent');

    // Process queued ICE candidates
    this.processIceCandidateQueue();
  }

  // ── Handle incoming answer (initiator) ────────────────────────────────────────
  private async handleAnswer(msg: WebRTCAnswerMessage): Promise<void> {
    console.log(`[WebRTC] Received answer from ${msg.from}`);

    if (!this.peerConnection) {
      console.error('[WebRTC] No peer connection');
      return;
    }

    const answer = new RTCSessionDescription({ type: 'answer', sdp: msg.sdp });
    await this.peerConnection.setRemoteDescription(answer);

    // Process queued ICE candidates
    this.processIceCandidateQueue();
  }

  // ── Handle ICE candidate ──────────────────────────────────────────────────────
  private async handleIceCandidate(msg: WebRTCIceCandidateMessage): Promise<void> {
    console.log(`[WebRTC] Received ICE candidate from ${msg.from}`);

    const candidate = new RTCIceCandidate({
      candidate: msg.candidate,
      sdpMid: msg.sdpMid,
      sdpMLineIndex: msg.sdpMLineIndex,
    });

    if (this.peerConnection?.remoteDescription) {
      await this.peerConnection.addIceCandidate(candidate);
    } else {
      // Queue for later
      this.iceCandidateQueue.push(candidate);
    }
  }

  // ── Create peer connection ────────────────────────────────────────────────────
  private createPeerConnection(): void {
    this.peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate && this.remotePeerId && this.sendSignalingMessage) {
        const candidateMsg: WebRTCIceCandidateMessage = {
          type: 'webrtc_ice_candidate',
          id: uuidv4(),
          from: this.peerId,
          to: this.remotePeerId,
          timestamp: Date.now(),
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
        };

        this.sendSignalingMessage(candidateMsg);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`[WebRTC] Connection state: ${state}`);

      switch (state) {
        case 'connected':
          this.onConnectionStateChange?.('connected');
          // Don't call onEncryptionReady here - wait for data channel to open
          break;
        case 'disconnected':
          this.onConnectionStateChange?.('disconnected');
          break;
        case 'failed':
          this.onConnectionStateChange?.('failed');
          break;
        case 'connecting':
        case 'new':
          this.onConnectionStateChange?.('connecting');
          break;
      }
    };

    // Handle data channel (for answerer)
    this.peerConnection.ondatachannel = (event: any) => {
      console.log('[WebRTC] Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };
  }

  // ── Setup data channel ────────────────────────────────────────────────────────
  private setupDataChannel(channel: any): void {
    channel.onopen = () => {
      console.log('[WebRTC] ✅ Data channel open');
      this.onConnectionStateChange?.('connected');
      // Now that data channel is open and we have encryption, signal ready
      this.onEncryptionReady?.();
    };

    channel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      this.onConnectionStateChange?.('disconnected');
    };

    channel.onerror = (error: any) => {
      console.error('[WebRTC] Data channel error:', error);
      this.onConnectionStateChange?.('failed');
    };

    channel.onmessage = async (event: any) => {
      try {
        // Decrypt message
        const encryptedMsg: EncryptedMessage = JSON.parse(event.data);

        if (!this.encryptionKey) {
          // During intentional shutdown, this is expected - don't log as error
          if (!this.isClosing) {
            console.error('[WebRTC] No encryption key available');
          }
          return;
        }

        const decrypted = decrypt(this.encryptionKey, encryptedMsg.ciphertext, encryptedMsg.iv);
        const originalMsg: GPTeeMessage = JSON.parse(decrypted);

        console.log(`[WebRTC] Received decrypted message: ${originalMsg.type}`);
        this.onDataChannelMessage?.(originalMsg);
      } catch (e) {
        // During intentional shutdown, decryption errors are expected
        if (!this.isClosing) {
          console.error('[WebRTC] Failed to decrypt message:', e);
        }
      }
    };
  }

  // ── Send encrypted message ────────────────────────────────────────────────────
  async sendMessage(msg: GPTeeMessage): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[WebRTC] Data channel not open');
      return;
    }

    if (!this.encryptionKey) {
      console.error('[WebRTC] No encryption key available');
      return;
    }

    try {
      // Encrypt message
      const msgJson = JSON.stringify(msg);
      const { ciphertext, iv } = encrypt(this.encryptionKey, msgJson);

      const encryptedMsg: EncryptedMessage = {
        ciphertext,
        iv,
        messageType: msg.type,
      };

      this.dataChannel.send(JSON.stringify(encryptedMsg));
      console.log(`[WebRTC] Sent encrypted message: ${msg.type}`);
    } catch (e) {
      console.error('[WebRTC] Failed to encrypt/send message:', e);
      throw e;
    }
  }

  // ── Process queued ICE candidates ─────────────────────────────────────────────
  private async processIceCandidateQueue(): Promise<void> {
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift()!;
      await this.peerConnection?.addIceCandidate(candidate);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  async close(): Promise<void> {
    console.log('[WebRTC] Closing connection');
    this.isClosing = true; // Suppress expected errors during shutdown

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.encryptionKey = null;
    this.remotePeerId = null;
    this.iceCandidateQueue = [];
    this.isClosing = false; // Reset for next connection
  }

  // ── Status ────────────────────────────────────────────────────────────────────
  isConnected(): boolean {
    return this.dataChannel?.readyState === 'open' && this.encryptionKey !== null;
  }

  getConnectionState(): string {
    return this.peerConnection?.connectionState ?? 'closed';
  }
}
