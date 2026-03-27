/**
 * HTTP Client for Backend API Communication
 *
 * Configured axios instance with:
 * - Token management (access/refresh tokens)
 * - Request interceptors for auth headers
 * - Response interceptors for token refresh on 401
 */

import axios, {AxiosInstance, InternalAxiosRequestConfig} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_BASE_URL} from '../config';

// Token storage keys
const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
const WALLET_ADDRESS_KEY = 'auth_wallet_address';

/**
 * Get stored access token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
};

/**
 * Get stored refresh token
 */
export const getRefreshToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
};

/**
 * Get stored wallet address
 */
export const getWalletAddress = async (): Promise<string | null> => {
  return await AsyncStorage.getItem(WALLET_ADDRESS_KEY);
};

/**
 * Store authentication tokens and wallet address
 */
export const storeAuthTokens = async (
  accessToken: string,
  refreshToken: string,
  walletAddress: string,
): Promise<void> => {
  await Promise.all([
    AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken),
    AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken),
    AsyncStorage.setItem(WALLET_ADDRESS_KEY, walletAddress),
  ]);
};

/**
 * Clear all stored auth tokens
 */
export const clearAuthTokens = async (): Promise<void> => {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(WALLET_ADDRESS_KEY),
  ]);
};

/**
 * Check if user is authenticated (has valid tokens)
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const accessToken = await getAccessToken();
  return accessToken !== null;
};

/**
 * Create axios instance with base configuration
 */
const createHttpClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // 30 seconds
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: Add access token to headers
  client.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const accessToken = await getAccessToken();
      if (accessToken && config.headers) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    error => {
      return Promise.reject(error);
    },
  );

  // Response interceptor: Handle 401 and token refresh
  // NOTE: Token refresh endpoint not implemented in backend yet
  // For now, 401 will just clear tokens and require re-login
  client.interceptors.response.use(
    response => response,
    async error => {
      const originalRequest = error.config;

      // If 401 and we haven't retried yet
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        // TODO: Implement token refresh when backend endpoint is ready
        // For now, clear tokens and force re-auth
        await clearAuthTokens();
        return Promise.reject(error);

        // Future implementation:
        // const refreshToken = await getRefreshToken();
        // if (refreshToken) {
        //   try {
        //     const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        //       refreshToken,
        //     });
        //     const { accessToken } = response.data;
        //     await storeAuthTokens(accessToken, refreshToken, walletAddress);
        //     originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        //     return client(originalRequest);
        //   } catch (refreshError) {
        //     await clearAuthTokens();
        //     return Promise.reject(refreshError);
        //   }
        // }
      }

      return Promise.reject(error);
    },
  );

  return client;
};

/**
 * Singleton HTTP client instance
 */
export const httpClient = createHttpClient();

export default httpClient;
