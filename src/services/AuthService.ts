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
 * Returns wallet address, auth token, and whether user exists
 */
export const checkUserExists = async (): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 1: Connecting to wallet...');
    const {address, authToken} = await connectWallet();
    console.log('[Auth] Wallet connected:', address);

    console.log('[Auth] Checking if node exists...');
    const checkResponse = await httpClient.post<CheckNodeResponse>(
      '/auth/solana/check-node',
      {address},
    );

    const nodeExists = checkResponse.data.exists;
    const nodeName = checkResponse.data.name;
    console.log('[Auth] Node exists:', nodeExists, 'name:', nodeName);

    return {
      success: true,
      walletAddress: address,
      authToken,
      exists: nodeExists,
      displayName: nodeName, // Backend now returns the name in check-node
    };
  } catch (error: any) {
    console.error('[Auth] Step 1 failed:', error);
    return {
      success: false,
      error: error.response?.data?.message || error.message || 'Failed to check user',
    };
  }
};

/**
 * Step 2a: Login existing user
 * Uses stored wallet address and auth token from Step 1
 */
export const loginExistingUser = async (
  walletAddress: string,
  authToken: string,
): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 2a: Logging in existing user...');

    // Get challenge from backend
    console.log('[Auth] Requesting challenge...');
    const challengeResponse = await httpClient.post<ChallengeResponse>(
      '/auth/solana/challenge-node',
      {
        address: walletAddress,
        platform: 'mobile',
      },
    );

    const challengeMessage = challengeResponse.data.message;
    console.log('[Auth] Challenge received');

    // Sign challenge with stored auth token
    console.log('[Auth] Signing challenge...');
    const signature = await signMessageWithToken(challengeMessage, authToken);
    console.log('[Auth] Challenge signed');

    // Verify and login
    console.log('[Auth] Verifying signature...');
    const verifyResponse = await httpClient.post<VerifyNodeResponse>(
      '/auth/solana/verify-node',
      {
        address: walletAddress,
        message: challengeMessage,
        signature,
      },
    );

    const {node_id, name, accessToken, refreshToken} = verifyResponse.data;

    // Store tokens
    await storeAuthTokens(accessToken, refreshToken, walletAddress);
    console.log('[Auth] Tokens stored');

    // Derive peer ID
    const peerId = derivePeerId(walletAddress);

    console.log('[Auth] ✅ Login complete - displayName:', name, 'peerId:', peerId);

    return {
      success: true,
      nodeId: node_id,
      walletAddress,
      peerId,
      displayName: name,
      accessToken,
      refreshToken,
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
 * Step 2b: Create new user account
 * Uses stored wallet address and auth token from Step 1
 */
export const createNewUser = async (
  walletAddress: string,
  authToken: string,
  displayName: string,
): Promise<AuthResult> => {
  try {
    console.log('[Auth] Step 2b: Creating new user...');

    // Get challenge from backend
    console.log('[Auth] Requesting challenge...');
    const challengeResponse = await httpClient.post<ChallengeResponse>(
      '/auth/solana/challenge-node',
      {
        address: walletAddress,
        platform: 'mobile',
      },
    );

    const challengeMessage = challengeResponse.data.message;
    console.log('[Auth] Challenge received');

    // Sign challenge with stored auth token
    console.log('[Auth] Signing challenge...');
    const signature = await signMessageWithToken(challengeMessage, authToken);
    console.log('[Auth] Challenge signed');

    // Create node
    console.log('[Auth] Creating node with name:', displayName);
    const nodeId = uuidv4();
    const createResponse = await httpClient.post<CreateNodeResponse>(
      '/auth/solana/create-node',
      {
        id: nodeId,
        name: displayName,
        address: walletAddress,
        message: challengeMessage,
        signature,
      },
    );

    const {node_id, accessToken, refreshToken} = createResponse.data;

    // Store tokens
    await storeAuthTokens(accessToken, refreshToken, walletAddress);
    console.log('[Auth] Tokens stored');

    // Derive peer ID
    const peerId = derivePeerId(walletAddress);

    console.log('[Auth] ✅ Account created - displayName:', displayName, 'peerId:', peerId);

    return {
      success: true,
      nodeId: node_id,
      walletAddress,
      peerId,
      displayName,
      accessToken,
      refreshToken,
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
 */
export const authenticate = async (
  displayName?: string,
): Promise<AuthResult> => {
  try {
    // Step 1: Quick wallet open to get address and auth_token
    console.log('[Auth] Connecting to wallet...');
    const {address, authToken} = await connectWallet();
    console.log('[Auth] Wallet connected:', address);

    // Step 2: Get challenge from backend (wallet is closed, network works)
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

    // Step 3: Reopen wallet with auth_token to sign (instant, no wallet selector)
    console.log('[Auth] Signing challenge...');
    const signature = await signMessageWithToken(challengeMessage, authToken);
    console.log('[Auth] Challenge signed');

    // Step 4: Check if node exists
    console.log('[Auth] Checking if node exists...');
    const checkResponse = await httpClient.post<CheckNodeResponse>(
      '/auth/solana/check-node',
      {
        address,
      },
    );

    const nodeExists = checkResponse.data.exists;
    console.log('[Auth] Node exists:', nodeExists);

    // Step 5: Register or login based on node existence
    let authResponse: CreateNodeResponse | VerifyNodeResponse;
    let nodeName: string;

    if (!nodeExists) {
      // Register new node
      console.log('[Auth] Registering new node...');
      const nodeId = uuidv4();
      // Use provided displayName or generate one
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
        // Fallback: use provided or generate (shouldn't happen if backend works correctly)
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
