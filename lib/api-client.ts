import axios, { AxiosError } from 'axios';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, getRefreshToken, storeTokens, clearTokens } from './auth-tokens';
import { CLIENT_INFO_HEADERS } from './client-info';

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

// ─── Request interceptor: attach stored access token + client telemetry ───
// Client-info headers (app version, build number, runtime, OTA update id,
// channel, platform) are attached to EVERY request so the backend can
// answer "which version is this user on?" for support + rollout tracking.
// Captured once at module load — these don't change during a launch.
apiClient.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  for (const [k, v] of Object.entries(CLIENT_INFO_HEADERS)) {
    config.headers[k] = v;
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

        // Check if this is a social auth token (app-signed JWT, not Cognito).
        // Social tokens have tokenType: 'social' in the payload.
        const currentToken = await getAccessToken();
        let isSocialToken = false;
        if (currentToken) {
          try {
            const payload = JSON.parse(atob(currentToken.split('.')[1]));
            isSocialToken = payload.tokenType === 'social';
          } catch {
            // Not a valid JWT — treat as Cognito
          }
        }

        let newAccess: string;
        let newRefresh: string;
        let newId: string;

        if (isSocialToken) {
          // SCRUM-260: social tokens are app-signed JWTs (Apple / Google
          // sign-in). The backend's POST /v1/auth/refresh accepts the
          // refresh token in the request body and returns new access/id/
          // refresh tokens in the response body. Use a separate axios
          // instance with no auth interceptor so this call can't loop on
          // its own 401.
          const publicHttp = axios.create({
            baseURL: API_BASE,
            timeout: 30_000,
            headers: { 'Content-Type': 'application/json' },
          });
          const refreshRes = await publicHttp.post<{
            success: boolean;
            data?: { accessToken?: string; idToken?: string; refreshToken?: string };
          }>('/v1/auth/refresh', { refreshToken });
          const data = refreshRes.data?.data;
          if (!data?.accessToken || !data.refreshToken || !data.idToken) {
            throw new Error('Refresh response missing tokens');
          }
          newAccess = data.accessToken;
          newRefresh = data.refreshToken;
          newId = data.idToken;
        } else {
          // Cognito email/password path — refresh via amazon-cognito-identity-js
          // directly, no backend round-trip. Dynamic import avoids circular dep.
          const { refreshCognitoTokens } = await import('./cognito');
          const storedUsername = await import('expo-secure-store').then((m) =>
            m.getItemAsync('cos_username'),
          );
          const newTokens = await refreshCognitoTokens(storedUsername ?? '', refreshToken);
          newAccess = newTokens.accessToken;
          newRefresh = refreshToken; // Cognito doesn't rotate the refresh token
          newId = newTokens.idToken;
        }

        await storeTokens(newAccess, newRefresh, newId);

        pendingRequests.forEach((cb) => cb(newAccess));
        pendingRequests = [];

        if (originalRequest) {
          originalRequest.headers = originalRequest.headers ?? {};
          originalRequest.headers.Authorization = `Bearer ${newAccess}`;
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
