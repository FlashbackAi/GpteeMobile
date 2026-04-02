/**
 * Authentication Service
 *
 * Handles the complete authentication flow with backend:
 * 1. Check if node exists
 * 2. Get challenge message
 * 3. Sign challenge with wallet
 * 4. Register or login with signed message
 */

import {httpClient, storeAuthTokens, clearAuthTokens} from '../api/httpClient';
import {
  connectWallet,
  signMessage,
  signMessageWithToken,
  connectAndSignMessage,
  disconnectWallet,
  derivePeerId,
} from './WalletService';
import {transact} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {PublicKey} from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bs58 from 'bs58';
import {v4 as uuidv4} from 'uuid';
import {generateGameName} from '../utils/nameGenerator';
import {API_BASE_URL} from '../config';

const CONNECTED_WALLET_KEY = 'connected_wallet_address';
const WALLET_AUTH_TOKEN_KEY = 'wallet_auth_token';

export interface AuthResult {
  success: boolean;
  nodeId?: string;
  walletAddress?: string;
  peerId?: string;
  displayName?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  exists?: boolean;
  authToken?: string;
}

export interface CheckNodeResponse {
  exists: boolean;
  node_id?: string;
  name?: string;
}

export interface ChallengeResponse {
  message: string;
  nonce: string;
  issued_at: string;
  expires_at: string;
}

export interface CreateNodeResponse {
  ok: boolean;
  node_id: string;
  name?: string; // Backend may return the node name
  accessToken: string;
  refreshToken: string;
}

export interface VerifyNodeResponse {
  ok: boolean;
  node_id: string;
  name?: string; // Backend should return the node name for existing users
  accessToken: string;
  refreshToken: string;
}

/**
 * Step 1: Connect wallet and check if user exists
 * Returns wallet address and whether user exists
 * Wallet opens once to get address, then checks backend
 */
export const checkUserExists = async (): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 1: Connecting to wallet...');
    const {address, authToken} = await connectWallet();
    console.log('[Auth] ✓ Wallet connected successfully');
    console.log('[Auth] Address:', address);
    console.log('[Auth] Auth token received:', !!authToken);

    console.log('[Auth] → Making HTTP request to check if node exists...');
    const checkResponse = await httpClient.post<CheckNodeResponse>(
      '/auth/solana/check-node',
      {address},
    );
    console.log('[Auth] ✓ Received response from check-node');

    const nodeExists = checkResponse.data.exists;
    const nodeName = checkResponse.data.name;
    console.log('[Auth] Node exists:', nodeExists, 'name:', nodeName);

    return {
      success: true,
      walletAddress: address,
      authToken,
      exists: nodeExists,
      displayName: nodeName,
    };
  } catch (error: any) {
    console.error('[Auth] ✗ Step 1 failed with error');
    console.error('[Auth] Error type:', error?.name);
    console.error('[Auth] Error message:', error?.message);
    console.error('[Auth] Error stack:', error?.stack);
    console.error('[Auth] Full error:', JSON.stringify(error, null, 2));
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to check user',
    };
  }
};

/**
 * Step 2a: Login existing user (SINGLE WALLET SESSION)
 * Wallet opens ONCE - authorize, get challenge, sign, verify all in one transact() call
 * This matches the Flashback pattern for optimal UX
 */
export const loginExistingUser = async (
  walletAddress: string,
  authToken: string,
): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 2a: Logging in existing user with single wallet session...');

    // Everything happens in ONE transact() call
    const result = await transact(async (wallet: any) => {
      // Step 1: Reauthorize with stored auth token
      console.log('[Auth] Reauthorizing wallet...');
      const authResult = await wallet.reauthorize({
        auth_token: authToken,
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network',
          icon: 'icon.png',
        },
      });

      const base64Address = authResult.accounts[0]?.address;
      if (!base64Address) {
        throw new Error('No wallet address returned');
      }

      // Convert to base58
      let address: string;
      try {
        address = new PublicKey(base64Address).toBase58();
      } catch {
        const decoded = Buffer.from(base64Address, 'base64');
        address = new PublicKey(decoded).toBase58();
      }

      console.log('[Auth] Wallet reauthorized:', address);

      // Step 2: Get challenge from backend (using native fetch - axios fails when backgrounded)
      console.log('[Auth] Requesting challenge...');
      console.log('[Auth] DEBUG: fetch URL =', `${API_BASE_URL}/auth/solana/challenge-node`);

      const fetchPromise = fetch(`${API_BASE_URL}/auth/solana/challenge-node`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({address, platform: 'mobile'}),
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Fetch timeout after 10s')), 10000)
      );

      const challengeRes = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      console.log('[Auth] DEBUG: fetch completed with status', challengeRes.status);

      if (!challengeRes.ok) {
        const errorText = await challengeRes.text().catch(() => '');
        throw new Error(errorText || `Failed to get challenge (${challengeRes.status})`);
      }

      const challengeData: ChallengeResponse = await challengeRes.json();
      const challengeMessage = challengeData.message;
      console.log('[Auth] Challenge received');

      // Step 3: Sign message in same wallet session
      console.log('[Auth] Signing challenge...');
      const messageBytes = new TextEncoder().encode(challengeMessage);
      const signedMessages = await wallet.signMessages({
        addresses: [base64Address],
        payloads: [messageBytes],
      });

      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert signature to base58
      let signatureBase58: string;
      if (rawSignature instanceof Uint8Array) {
        signatureBase58 = bs58.encode(rawSignature);
      } else if (typeof rawSignature === 'string') {
        if (/[+/=]/.test(rawSignature)) {
          const bytes = Buffer.from(rawSignature, 'base64');
          signatureBase58 = bs58.encode(bytes);
        } else {
          signatureBase58 = rawSignature;
        }
      } else {
        throw new Error('Unknown signature format from wallet');
      }

      console.log('[Auth] Challenge signed');

      // Step 4: Verify and login (using native fetch - axios fails when backgrounded)
      console.log('[Auth] Verifying signature...');
      const verifyRes = await fetch(`${API_BASE_URL}/auth/solana/verify-node`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({address, message: challengeMessage, signature: signatureBase58}),
      });

      if (!verifyRes.ok) {
        const errorText = await verifyRes.text().catch(() => '');
        throw new Error(errorText || `Failed to verify signature (${verifyRes.status})`);
      }

      const verifyData: VerifyNodeResponse = await verifyRes.json();
      const {node_id, name, accessToken, refreshToken} = verifyData;

      // Store tokens
      await storeAuthTokens(accessToken, refreshToken, address);
      console.log('[Auth] Tokens stored');

      return {
        address,
        node_id,
        name,
        accessToken,
        refreshToken,
      };
    });

    // Derive peer ID
    const peerId = derivePeerId(result.address);

    console.log('[Auth] ✅ Login complete - displayName:', result.name, 'peerId:', peerId);

    return {
      success: true,
      nodeId: result.node_id,
      walletAddress: result.address,
      peerId,
      displayName: result.name,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } catch (error: any) {
    console.error('[Auth] Step 2a failed:', error);

    // Clean up on error
    try {
      await disconnectWallet();
      await clearAuthTokens();
    } catch (cleanupError) {
      console.error('[Auth] Cleanup failed:', cleanupError);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Login failed',
    };
  }
};

/**
 * Step 2b: Create new user account (SINGLE WALLET SESSION)
 * Wallet opens ONCE - authorize, get challenge, sign, create all in one transact() call
 * This matches the Flashback pattern for optimal UX
 */
export const createNewUser = async (
  walletAddress: string,
  authToken: string,
  displayName: string,
): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 2b: Creating new user with single wallet session...');

    // Everything happens in ONE transact() call
    const result = await transact(async (wallet: any) => {
      // Step 1: Reauthorize with stored auth token
      console.log('[Auth] Reauthorizing wallet...');
      const authResult = await wallet.reauthorize({
        auth_token: authToken,
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network',
          icon: 'icon.png',
        },
      });

      const base64Address = authResult.accounts[0]?.address;
      if (!base64Address) {
        throw new Error('No wallet address returned');
      }

      // Convert to base58
      let address: string;
      try {
        address = new PublicKey(base64Address).toBase58();
      } catch {
        const decoded = Buffer.from(base64Address, 'base64');
        address = new PublicKey(decoded).toBase58();
      }

      console.log('[Auth] Wallet reauthorized:', address);

      // Step 2: Get challenge from backend (using native fetch - axios fails when backgrounded)
      console.log('[Auth] Requesting challenge...');
      const challengeRes = await fetch(`${API_BASE_URL}/auth/solana/challenge-node`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({address, platform: 'mobile'}),
      });

      if (!challengeRes.ok) {
        const errorText = await challengeRes.text().catch(() => '');
        throw new Error(errorText || `Failed to get challenge (${challengeRes.status})`);
      }

      const challengeData: ChallengeResponse = await challengeRes.json();
      const challengeMessage = challengeData.message;
      console.log('[Auth] Challenge received');

      // Step 3: Sign message in same wallet session
      console.log('[Auth] Signing challenge...');
      const messageBytes = new TextEncoder().encode(challengeMessage);
      const signedMessages = await wallet.signMessages({
        addresses: [base64Address],
        payloads: [messageBytes],
      });

      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert signature to base58
      let signatureBase58: string;
      if (rawSignature instanceof Uint8Array) {
        signatureBase58 = bs58.encode(rawSignature);
      } else if (typeof rawSignature === 'string') {
        if (/[+/=]/.test(rawSignature)) {
          const bytes = Buffer.from(rawSignature, 'base64');
          signatureBase58 = bs58.encode(bytes);
        } else {
          signatureBase58 = rawSignature;
        }
      } else {
        throw new Error('Unknown signature format from wallet');
      }

      console.log('[Auth] Challenge signed');

      // Step 4: Create node (using native fetch - axios fails when backgrounded)
      console.log('[Auth] Creating node with name:', displayName);
      const nodeId = uuidv4();
      const createRes = await fetch(`${API_BASE_URL}/auth/solana/create-node`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          id: nodeId,
          name: displayName,
          address,
          message: challengeMessage,
          signature: signatureBase58,
        }),
      });

      if (!createRes.ok) {
        const errorText = await createRes.text().catch(() => '');
        throw new Error(errorText || `Failed to create node (${createRes.status})`);
      }

      const createData: CreateNodeResponse = await createRes.json();
      const {node_id, accessToken, refreshToken} = createData;

      // Store tokens
      await storeAuthTokens(accessToken, refreshToken, address);
      console.log('[Auth] Tokens stored');

      return {
        address,
        node_id,
        accessToken,
        refreshToken,
      };
    });

    // Derive peer ID
    const peerId = derivePeerId(result.address);

    console.log('[Auth] ✅ Account created - displayName:', displayName, 'peerId:', peerId);

    return {
      success: true,
      nodeId: result.node_id,
      walletAddress: result.address,
      peerId,
      displayName,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } catch (error: any) {
    console.error('[Auth] Step 2b failed:', error);

    // Clean up on error
    try {
      await disconnectWallet();
      await clearAuthTokens();
    } catch (cleanupError) {
      console.error('[Auth] Cleanup failed:', cleanupError);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Account creation failed',
    };
  }
};

/**
 * Main authentication flow (LEGACY - kept for backward compatibility)
 * Connects wallet, checks if node exists, and either registers or logs in
 * IMPROVED: Uses single wallet session for authorize + sign (better UX)
 */
export const authenticate = async (
  displayName?: string,
): Promise<AuthResult> => {
  try {
    // Step 1: Connect to wallet to get address
    console.log('[Auth] Connecting to wallet...');
    const {address, authToken} = await connectWallet();
    console.log('[Auth] Wallet connected:', address);

    // Step 2: Check if node exists
    console.log('[Auth] Checking if node exists...');
    const checkResponse = await httpClient.post<CheckNodeResponse>(
      '/auth/solana/check-node',
      {address},
    );

    const nodeExists = checkResponse.data.exists;
    console.log('[Auth] Node exists:', nodeExists);

    // Step 3: Get challenge from backend
    console.log('[Auth] Requesting challenge from backend...');
    const challengeResponse = await httpClient.post<ChallengeResponse>(
      '/auth/solana/challenge-node',
      {
        address,
        platform: 'mobile',
      },
    );

    const challengeMessage = challengeResponse.data.message;
    console.log('[Auth] Challenge received');

    // Step 4: Sign challenge using reauthorize (faster - goes directly to signature screen)
    console.log('[Auth] Signing challenge with stored auth token...');
    const signature = await signMessageWithToken(challengeMessage, authToken);
    console.log('[Auth] Challenge signed');

    // Step 5: Register or login based on node existence
    let authResponse: CreateNodeResponse | VerifyNodeResponse;
    let nodeName: string;

    if (!nodeExists) {
      // Register new node
      console.log('[Auth] Registering new node...');
      const nodeId = uuidv4();
      nodeName = displayName || generateGameName();
      console.log('[Auth] Creating node with name:', nodeName);

      const createResponse = await httpClient.post<CreateNodeResponse>(
        '/auth/solana/create-node',
        {
          id: nodeId,
          name: nodeName,
          address,
          message: challengeMessage,
          signature,
        },
      );

      authResponse = createResponse.data;
      console.log('[Auth] Node registered successfully');
    } else {
      // Login existing node
      console.log('[Auth] Logging in existing node...');
      const verifyResponse = await httpClient.post<VerifyNodeResponse>(
        '/auth/solana/verify-node',
        {
          address,
          message: challengeMessage,
          signature,
        },
      );

      authResponse = verifyResponse.data;
      console.log('[Auth] Login successful');

      // For existing users, backend returns the node name
      if (authResponse.name) {
        nodeName = authResponse.name;
        console.log('[Auth] Retrieved display name from backend:', nodeName);
      } else {
        // Fallback: use provided or generate
        nodeName = displayName || generateGameName();
        console.warn('[Auth] Backend did not return name, using fallback:', nodeName);
      }
    }

    // Step 6: Store tokens
    const {accessToken, refreshToken, node_id} = authResponse;
    await storeAuthTokens(accessToken, refreshToken, address);
    console.log('[Auth] Tokens stored');

    // Step 7: Derive peer ID from wallet
    const peerId = derivePeerId(address);

    console.log('[Auth] ✅ Authentication complete - displayName:', nodeName, 'peerId:', peerId);

    return {
      success: true,
      nodeId: node_id,
      walletAddress: address,
      peerId,
      displayName: nodeName,
      accessToken,
      refreshToken,
    };
  } catch (error: any) {
    console.error('[Auth] Authentication failed:', error);

    // Clean up on error
    try {
      await disconnectWallet();
      await clearAuthTokens();
    } catch (cleanupError) {
      console.error('[Auth] Cleanup failed:', cleanupError);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Authentication failed',
    };
  }
};

/**
 * Complete authentication flow with single wallet interaction
 * Handles both new user registration and existing user login
 * Wallet opens only once for optimal UX
 */
export const authenticateWithWallet = async (
  displayName?: string,
): Promise<AuthResult> => {
  try {
    console.log('[Auth] Starting wallet authentication...');

    // Everything happens in ONE transact() call - wallet opens ONLY ONCE
    const result = await transact(async (wallet: any) => {
      // Step 1: Authorize wallet
      console.log('[Auth] Authorizing wallet...');
      const authResult = await wallet.authorize({
        cluster: 'mainnet-beta',
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network',
          icon: 'icon.png',
        },
      });

      const base64Address = authResult.accounts[0]?.address;
      if (!base64Address) {
        throw new Error('No wallet address returned');
      }

      // Convert to base58
      let address: string;
      try {
        address = new PublicKey(base64Address).toBase58();
      } catch {
        const decoded = Buffer.from(base64Address, 'base64');
        address = new PublicKey(decoded).toBase58();
      }

      console.log('[Auth] Wallet authorized:', address);

      // Store wallet info
      await AsyncStorage.setItem(CONNECTED_WALLET_KEY, address);
      if (authResult.auth_token) {
        await AsyncStorage.setItem(WALLET_AUTH_TOKEN_KEY, authResult.auth_token);
      }

      // Step 2: Check if node exists (network call INSIDE transact)
      console.log('[Auth] Checking if node exists...');
      const checkResponse = await httpClient.post<CheckNodeResponse>(
        '/auth/solana/check-node',
        {address},
      );

      const nodeExists = checkResponse.data.exists;
      const existingName = checkResponse.data.name;
      console.log('[Auth] Node exists:', nodeExists, 'name:', existingName);

      // Step 3: Get challenge (network call INSIDE transact)
      console.log('[Auth] Requesting challenge...');
      const challengeResponse = await httpClient.post<ChallengeResponse>(
        '/auth/solana/challenge-node',
        {
          address,
          platform: 'mobile',
        },
      );

      const challengeMessage = challengeResponse.data.message;
      console.log('[Auth] Challenge received');

      // Step 4: Sign message in same wallet session
      console.log('[Auth] Signing challenge...');
      const messageBytes = new TextEncoder().encode(challengeMessage);
      const signedMessages = await wallet.signMessages({
        addresses: [base64Address],
        payloads: [messageBytes],
      });

      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert signature to base58
      let signatureBase58: string;
      if (rawSignature instanceof Uint8Array) {
        signatureBase58 = bs58.encode(rawSignature);
      } else if (typeof rawSignature === 'string') {
        if (/[+/=]/.test(rawSignature)) {
          const bytes = Buffer.from(rawSignature, 'base64');
          signatureBase58 = bs58.encode(bytes);
        } else {
          signatureBase58 = rawSignature;
        }
      } else {
        throw new Error('Unknown signature format from wallet');
      }

      console.log('[Auth] Challenge signed');

      // Step 5: Either create or verify node (network call INSIDE transact)
      let authResponse: CreateNodeResponse | VerifyNodeResponse;
      let nodeName: string;

      if (!nodeExists) {
        // Create new node
        console.log('[Auth] Creating new node...');
        const nodeId = uuidv4();
        nodeName = displayName || generateGameName();
        console.log('[Auth] Creating node with name:', nodeName);

        const createResponse = await httpClient.post<CreateNodeResponse>(
          '/auth/solana/create-node',
          {
            id: nodeId,
            name: nodeName,
            address,
            message: challengeMessage,
            signature: signatureBase58,
          },
        );

        authResponse = createResponse.data;
        console.log('[Auth] Node created successfully');
      } else {
        // Login existing node
        console.log('[Auth] Logging in existing node...');
        const verifyResponse = await httpClient.post<VerifyNodeResponse>(
          '/auth/solana/verify-node',
          {
            address,
            message: challengeMessage,
            signature: signatureBase58,
          },
        );

        authResponse = verifyResponse.data;
        nodeName = authResponse.name || existingName || displayName || generateGameName();
        console.log('[Auth] Login successful');
      }

      // Step 6: Store tokens
      const {accessToken, refreshToken, node_id} = authResponse;
      await storeAuthTokens(accessToken, refreshToken, address);
      console.log('[Auth] Tokens stored');

      return {
        address,
        node_id,
        nodeName,
        accessToken,
        refreshToken,
      };
    });

    // Derive peer ID
    const peerId = derivePeerId(result.address);

    console.log('[Auth] ✅ Wallet authentication complete - displayName:', result.nodeName, 'peerId:', peerId);

    return {
      success: true,
      nodeId: result.node_id,
      walletAddress: result.address,
      peerId,
      displayName: result.nodeName,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } catch (error: any) {
    console.error('[Auth] Wallet authentication failed:', error);

    // Clean up on error
    try {
      await disconnectWallet();
      await clearAuthTokens();
    } catch (cleanupError) {
      console.error('[Auth] Cleanup failed:', cleanupError);
    }

    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Authentication failed',
    };
  }
};

/**
 * Logout and clear all auth data
 */
export const logout = async (): Promise<void> => {
  try {
    await Promise.all([disconnectWallet(), clearAuthTokens()]);
    console.log('[Auth] Logged out successfully');
  } catch (error) {
    console.error('[Auth] Logout error:', error);
    throw error;
  }
};

/**
 * Check if user has an existing auth session
 */
export const checkAuthSession = async (): Promise<boolean> => {
  try {
    const {isAuthenticated} = await import('../api/httpClient');
    return await isAuthenticated();
  } catch (error) {
    console.error('[Auth] Session check failed:', error);
    return false;
  }
};
