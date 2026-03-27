/**
 * Solana Wallet Service
 *
 * Handles integration with Solana Mobile Wallet Adapter
 * for connecting to external wallets (Phantom, Solflare, etc.)
 * and signing authentication messages.
 */

import {transact} from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import {PublicKey} from '@solana/web3.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import bs58 from 'bs58';

const CONNECTED_WALLET_KEY = 'connected_wallet_address';
const WALLET_AUTH_TOKEN_KEY = 'wallet_auth_token';

export interface WalletConnection {
  address: string;
  publicKey: PublicKey;
  authToken?: string;
}

/**
 * Connect to a Solana mobile wallet
 * Opens the wallet selector UI and requests authorization
 */
export const connectWallet = async (): Promise<WalletConnection> => {
  try {
    console.log('[WalletService] Starting transact...');

    const connection = await transact(async (wallet: any) => {
      console.log('[WalletService] Inside transact, calling authorize...');

      // Request authorization from the wallet
      const authResult = await wallet.authorize({
        cluster: 'mainnet-beta', // Use mainnet-beta for production
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network', // Must be a valid HTTPS URL
          icon: 'icon.png', // Relative path - Mobile Wallet Adapter requires relative URI
        },
      });

      console.log('[WalletService] Authorization successful');

      // Get the wallet's public key (may be base64 encoded)
      const base64Address = authResult.accounts[0]?.address;
      if (!base64Address) {
        throw new Error('No wallet address returned');
      }

      // Convert to base58 format
      let address: string;
      try {
        // Try to create PublicKey - if it's already base58, this will work
        address = new PublicKey(base64Address).toBase58();
      } catch {
        // If it fails, it might be base64 - decode it first
        const decoded = Buffer.from(base64Address, 'base64');
        address = new PublicKey(decoded).toBase58();
      }

      const publicKey = new PublicKey(address);
      console.log('[WalletService] Wallet address:', address);

      // Store connection info
      await AsyncStorage.setItem(CONNECTED_WALLET_KEY, address);
      if (authResult.auth_token) {
        await AsyncStorage.setItem(WALLET_AUTH_TOKEN_KEY, authResult.auth_token);
      }

      return {
        address,
        publicKey,
        authToken: authResult.auth_token,
      };
    });

    console.log('[WalletService] Connection complete');
    return connection;
  } catch (error: any) {
    console.error('[WalletService] Failed to connect wallet:', error);
    console.error('[WalletService] Error details:', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
    });

    // Provide more specific error messages
    if (error?.message?.includes('secure context')) {
      throw new Error('Wallet adapter requires a secure context. Make sure you have a compatible wallet app installed (Phantom or Solflare).');
    }

    if (error?.code === 'ERROR_WALLET_NOT_FOUND') {
      throw new Error('No compatible wallet found. Please install Phantom or Solflare wallet.');
    }

    throw new Error(`Wallet connection failed: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Sign a message using stored auth_token (reauthorize)
 * This allows signing without showing the wallet selector again
 */
export const signMessageWithToken = async (
  message: string,
  authToken?: string,
): Promise<string> => {
  try {
    const storedToken = authToken || (await AsyncStorage.getItem(WALLET_AUTH_TOKEN_KEY));
    const storedAddress = await AsyncStorage.getItem(CONNECTED_WALLET_KEY);

    console.log('[WalletService] Signing with token - has token:', !!storedToken, 'has address:', !!storedAddress);

    if (!storedToken || !storedAddress) {
      throw new Error('No active wallet session. Please reconnect.');
    }

    console.log('[WalletService] Starting transact for reauthorize...');
    const signature = await transact(async (wallet: any) => {
      // Reauthorize with stored token - should open directly to signature screen
      console.log('[WalletService] Calling reauthorize with auth_token...');
      const authResult = await wallet.reauthorize({
        auth_token: storedToken,
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network',
          icon: 'icon.png',
        },
      });

      console.log('[WalletService] Reauthorize successful');

      const address = authResult.accounts[0].address;

      // Sign the message
      const messageBytes = new TextEncoder().encode(message);
      const signedMessages = await wallet.signMessages({
        addresses: [address],
        payloads: [messageBytes],
      });

      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert to base58
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

      return signatureBase58;
    });

    return signature;
  } catch (error: any) {
    console.error('[WalletService] Failed to sign with token:', error);
    throw new Error(`Signature failed: ${error?.message || 'Unknown error'}`);
  }
};

/**
 * Connect wallet and sign a message in a single transaction
 * This avoids the headless task error from calling transact() twice
 */
export const connectAndSignMessage = async (
  message: string,
): Promise<{address: string; signature: string}> => {
  try {
    const result = await transact(async (wallet: any) => {
      // Step 1: Authorize
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

      // Convert to base58 format
      let address: string;
      try {
        address = new PublicKey(base64Address).toBase58();
      } catch {
        const decoded = Buffer.from(base64Address, 'base64');
        address = new PublicKey(decoded).toBase58();
      }

      console.log('[WalletService] Wallet authorized:', address);

      // Step 2: Sign message immediately in the same session
      console.log('[WalletService] Signing message in same session...');
      const messageBytes = new TextEncoder().encode(message);
      const signedMessages = await wallet.signMessages({
        addresses: [base64Address],
        payloads: [messageBytes],
      });

      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert to base58
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

      // Store wallet info
      await AsyncStorage.setItem(CONNECTED_WALLET_KEY, address);
      if (authResult.auth_token) {
        await AsyncStorage.setItem(WALLET_AUTH_TOKEN_KEY, authResult.auth_token);
      }

      return {address, signature: signatureBase58};
    });

    return result;
  } catch (error: any) {
    console.error('[WalletService] Failed to connect and sign:', error);
    throw new Error(
      `Wallet connection failed: ${error?.message || 'Unknown error'}`,
    );
  }
};

/**
 * Sign a message using the connected wallet
 * Used for authentication challenge signing
 */
export const signMessage = async (message: string): Promise<string> => {
  try {
    const signature = await transact(async (wallet: any) => {
      // Get stored auth token for this session
      const authToken = await AsyncStorage.getItem(WALLET_AUTH_TOKEN_KEY);
      const storedAddress = await AsyncStorage.getItem(CONNECTED_WALLET_KEY);

      if (!authToken || !storedAddress) {
        throw new Error('No active wallet session. Please reconnect.');
      }

      // Re-authorize with stored token
      const authResult = await wallet.reauthorize({
        auth_token: authToken,
        identity: {
          name: 'GPTee',
          uri: 'https://gptee.network',
          icon: 'icon.png',
        },
      });

      // Get the address to sign with
      const address = authResult.accounts[0].address;

      // Sign the message
      const messageBytes = new TextEncoder().encode(message);
      const signedMessages = await wallet.signMessages({
        addresses: [address],
        payloads: [messageBytes],
      });

      // Get the raw signature
      const rawSignature = signedMessages[0] as any;
      if (!rawSignature) {
        throw new Error('No signature returned from wallet');
      }

      // Convert to base58 (handle different formats)
      let signatureBase58: string;
      if (rawSignature instanceof Uint8Array) {
        signatureBase58 = bs58.encode(rawSignature);
      } else if (typeof rawSignature === 'string') {
        // If it contains base64 chars, decode first
        if (/[+/=]/.test(rawSignature)) {
          const bytes = Buffer.from(rawSignature, 'base64');
          signatureBase58 = bs58.encode(bytes);
        } else {
          // Already base58
          signatureBase58 = rawSignature;
        }
      } else {
        throw new Error('Unknown signature format from wallet');
      }

      return signatureBase58;
    });

    return signature;
  } catch (error) {
    console.error('Failed to sign message:', error);
    throw new Error('Message signing failed. Please try again.');
  }
};

/**
 * Get the currently connected wallet address
 */
export const getConnectedWallet = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(CONNECTED_WALLET_KEY);
};

/**
 * Alias for getConnectedWallet (for compatibility)
 */
export const getWalletAddress = getConnectedWallet;

/**
 * Disconnect the current wallet
 */
export const disconnectWallet = async (): Promise<void> => {
  try {
    await transact(async (wallet: any) => {
      const authToken = await AsyncStorage.getItem(WALLET_AUTH_TOKEN_KEY);
      if (authToken) {
        await wallet.deauthorize({auth_token: authToken});
      }
    });
  } catch (error) {
    console.error('Error during wallet deauthorization:', error);
    // Continue with cleanup even if deauthorization fails
  }

  // Clear stored wallet data
  await Promise.all([
    AsyncStorage.removeItem(CONNECTED_WALLET_KEY),
    AsyncStorage.removeItem(WALLET_AUTH_TOKEN_KEY),
  ]);
};

/**
 * Check if a wallet is currently connected
 */
export const isWalletConnected = async (): Promise<boolean> => {
  const address = await getConnectedWallet();
  const authToken = await AsyncStorage.getItem(WALLET_AUTH_TOKEN_KEY);
  return address !== null && authToken !== null;
};

/**
 * Derive peer ID from wallet address
 * Format: peer_<first 8 chars of address>
 */
export const derivePeerId = (walletAddress: string | null): string | null => {
  if (!walletAddress) {
    return null;
  }
  return `peer_${walletAddress.slice(0, 8)}`;
};
