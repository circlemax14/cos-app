import axios, { AxiosError } from 'axios';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './auth-tokens';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';

export const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Clear all auth state and redirect to sign-in.
 * Called when token refresh fails — the session is unrecoverable.
 * Guarded against re-entry to prevent navigation loops.
 */
let isSigningOut = false;
async function forceSignOut(): Promise<void> {
  if (isSigningOut) return;
  isSigningOut = true;
  await clearTokens();
  await SecureStore.deleteItemAsync('cos_username');
  try {
    router.replace('/(auth)/sign-in' as never);
  } finally {
    // Reset after a short delay to allow navigation to settle
    setTimeout(() => { isSigningOut = false; }, 2000);
  }
}

// ─── Request interceptor: attach stored access token ───────────────────────
apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle 401 refresh + network errors ─────────────
let isRefreshing = false;
let pendingRequests: Array<(token: string) => void> = [];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    // No response at all → network error
    if (!error.response) {
      const networkErr = new Error('No internet connection') as Error & { code: string };
      networkErr.code = 'NETWORK_ERROR';
      throw networkErr;
    }

    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    // 401 → try token refresh once
    if (error.response.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve) => {
          pendingRequests.push((newToken: string) => {
            if (originalRequest) {
              originalRequest.headers = originalRequest.headers ?? {};
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(apiClient(originalRequest));
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          await forceSignOut();
          throw error;
        }

        // Dynamic import to avoid circular dependency
        const { refreshCognitoTokens } = await import('./cognito');
        // We need a username for refresh — stored separately or decoded from id token
        const storedUsername = await import('expo-secure-store').then((m) =>
          m.getItemAsync('cos_username'),
        );

        const newTokens = await refreshCognitoTokens(storedUsername ?? '', refreshToken);
        await storeTokens(
          newTokens.accessToken,
          refreshToken,
          newTokens.idToken,
        );

        pendingRequests.forEach((cb) => cb(newTokens.accessToken));
        pendingRequests = [];

        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
          return apiClient(originalRequest);
        }
      } catch {
        pendingRequests = [];
        await forceSignOut();
        throw error;
      } finally {
        isRefreshing = false;
      }
    }

    throw error;
  },
);
