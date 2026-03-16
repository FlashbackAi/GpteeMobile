export type PeerRole = 'user' | 'provider';

export type MessageType =
  | 'register'
  | 'provider_list'
  | 'inference_request'
  | 'inference_response'
  | 'inference_stream'
  | 'inference_done'
  | 'inference_cancel'
  | 'error'
  | 'ping'
  | 'pong'
  | 'webrtc_offer'
  | 'webrtc_answer'
  | 'webrtc_ice_candidate';

export interface BaseMessage {
  type: MessageType;
  id: string;
  from: string;
  to?: string;
  timestamp: number;
}

export interface RegisterMessage extends BaseMessage {
  type: 'register';
  role: PeerRole;
  deviceInfo: {
    platform: string;
    modelLoaded: boolean;
    modelName?: string;
    acceptingJobs?: boolean; // Whether this peer is accepting inference requests from others
    displayName?: string; // User-friendly device name
  };
}

export interface ProviderInfo {
  peerId: string;
  modelName: string;
  platform: string;
  displayName?: string; // User-friendly device name
}

export interface ProviderListMessage extends BaseMessage {
  type: 'provider_list';
  providers: ProviderInfo[];
}

export interface InferenceRequestMessage extends BaseMessage {
  type: 'inference_request';
  to: string;
  requestId: string;
  prompt: string;
  params?: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
  };
}

export interface InferenceResponseMessage extends BaseMessage {
  type: 'inference_response';
  to: string;
  requestId: string;
  response: string;
  tokensGenerated: number;
  durationMs: number;
}

export interface InferenceStreamMessage extends BaseMessage {
  type: 'inference_stream';
  to: string;
  requestId: string;
  token: string;
}

export interface InferenceDoneMessage extends BaseMessage {
  type: 'inference_done';
  to: string;
  requestId: string;
  tokensGenerated: number;
  durationMs: number;
}

export interface InferenceCancelMessage extends BaseMessage {
  type: 'inference_cancel';
  to: string;
  requestId: string;
}

export interface ErrorMessage extends BaseMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface WebRTCOfferMessage extends BaseMessage {
  type: 'webrtc_offer';
  to: string;
  sdp: string;
  encryptionKeyOffer: string;
}

export interface WebRTCAnswerMessage extends BaseMessage {
  type: 'webrtc_answer';
  to: string;
  sdp: string;
  encryptionKeyAnswer: string;
}

export interface WebRTCIceCandidateMessage extends BaseMessage {
  type: 'webrtc_ice_candidate';
  to: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export type GPTeeMessage =
  | RegisterMessage
  | ProviderListMessage
  | InferenceRequestMessage
  | InferenceResponseMessage
  | InferenceStreamMessage
  | InferenceDoneMessage
  | InferenceCancelMessage
  | ErrorMessage
  | WebRTCOfferMessage
  | WebRTCAnswerMessage
  | WebRTCIceCandidateMessage;

// ── Chat UI types ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  streaming?: boolean;
  tokensGenerated?: number;
  durationMs?: number;
}